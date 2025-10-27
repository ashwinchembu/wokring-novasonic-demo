"""
Guardrails Audit Logging Module
Logs all guardrail checks for compliance tracking and QA.
Redacts PHI/PII, stores only hashes and necessary metadata.
"""
import json
import hashlib
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, asdict

from app.guardrails import GuardrailCheckResult

logger = logging.getLogger(__name__)


@dataclass
class GuardrailAuditEntry:
    """Single audit log entry for a guardrail check."""
    timestamp: str
    session_id: str
    role: str  # "user" or "assistant"
    text_hash: str  # SHA256 hash of text (for privacy)
    text_snippet: str  # First/last 20 chars only (redacted)
    matched_rule_ids: List[str]
    categories: List[str]
    severities: List[str]
    action_taken: str  # "passed", "blocked", "rewritten", "warned"
    locale: Optional[str]
    violated: bool
    noncompliance_descriptions: List[str]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)
    
    def to_ndjson(self) -> str:
        """Convert to NDJSON format (newline-delimited JSON)."""
        return json.dumps(self.to_dict())


class GuardrailsAuditLogger:
    """
    Audit logger for guardrail checks.
    Stores logs in NDJSON format for easy parsing and analysis.
    """
    
    def __init__(self, log_dir: Optional[Path] = None):
        """
        Initialize audit logger.
        
        Args:
            log_dir: Directory for audit logs. Defaults to /var/log/guardrails/
                     or backend/logs/guardrails/ if /var/log is not writable.
        """
        if log_dir is None:
            # Try /var/log first, fallback to local logs directory
            var_log = Path("/var/log/guardrails")
            local_log = Path(__file__).parent.parent / "logs" / "guardrails"
            
            if var_log.parent.exists() and var_log.parent.is_dir():
                try:
                    var_log.mkdir(parents=True, exist_ok=True)
                    # Test write permission
                    test_file = var_log / ".write_test"
                    test_file.touch()
                    test_file.unlink()
                    log_dir = var_log
                except (PermissionError, OSError):
                    log_dir = local_log
            else:
                log_dir = local_log
        
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        
        # Daily log file rotation
        self.current_log_file = self._get_current_log_file()
        
        logger.info(f"GuardrailsAuditLogger initialized: {self.log_dir}")
    
    def _get_current_log_file(self) -> Path:
        """Get current log file path (daily rotation)."""
        date_str = datetime.utcnow().strftime("%Y-%m-%d")
        return self.log_dir / f"guardrails_audit_{date_str}.ndjson"
    
    def _hash_text(self, text: str) -> str:
        """Create SHA256 hash of text for privacy."""
        return hashlib.sha256(text.encode('utf-8')).hexdigest()
    
    def _create_snippet(self, text: str, max_chars: int = 20) -> str:
        """
        Create safe snippet from text (redacted for PHI/PII).
        Only keeps first and last few characters.
        """
        if not text or len(text) <= max_chars * 2:
            return "[REDACTED]"
        
        # Take first and last chars only
        snippet = f"{text[:max_chars]}...{text[-max_chars:]}"
        
        # Further redact anything that looks like SSN, phone, email
        snippet = self._redact_pii_patterns(snippet)
        
        return snippet
    
    def _redact_pii_patterns(self, text: str) -> str:
        """Redact common PII patterns from text."""
        import re
        
        # Redact SSN-like patterns
        text = re.sub(r'\d{3}-\d{2}-\d{4}', '[SSN]', text)
        
        # Redact phone numbers
        text = re.sub(r'\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', '[PHONE]', text)
        
        # Redact email addresses
        text = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[EMAIL]', text)
        
        # Redact sequences of digits (potential IDs)
        text = re.sub(r'\b\d{6,}\b', '[ID]', text)
        
        return text
    
    def log_check(
        self,
        session_id: str,
        role: str,
        text: str,
        result: GuardrailCheckResult,
        locale: Optional[str] = None
    ):
        """
        Log a guardrail check result.
        
        Args:
            session_id: Session identifier
            role: "user" or "assistant"
            text: Original text that was checked
            result: GuardrailCheckResult from guardrails.check()
            locale: Optional locale code
        """
        try:
            # Determine action taken
            if not result.has_violations:
                action_taken = "passed"
            elif result.should_block:
                action_taken = "blocked"
            elif result.should_rewrite:
                action_taken = "rewritten"
            else:
                action_taken = "warned"
            
            # Extract violation details
            matched_rule_ids = result.all_matched_rules
            categories = list(set(v.category for v in result.violations if v.category))
            severities = list(set(v.severity for v in result.violations if v.severity))
            noncompliance_descriptions = [
                v.noncompliance_description 
                for v in result.violations 
                if v.noncompliance_description
            ]
            
            # Create audit entry
            entry = GuardrailAuditEntry(
                timestamp=datetime.utcnow().isoformat() + "Z",
                session_id=session_id,
                role=role,
                text_hash=self._hash_text(text),
                text_snippet=self._create_snippet(text),
                matched_rule_ids=matched_rule_ids,
                categories=categories,
                severities=severities,
                action_taken=action_taken,
                locale=locale,
                violated=result.has_violations,
                noncompliance_descriptions=noncompliance_descriptions
            )
            
            # Check if we need a new log file (daily rotation)
            current_file = self._get_current_log_file()
            if current_file != self.current_log_file:
                self.current_log_file = current_file
                logger.info(f"Rotated to new audit log file: {self.current_log_file}")
            
            # Write to NDJSON file
            with open(self.current_log_file, 'a', encoding='utf-8') as f:
                f.write(entry.to_ndjson() + '\n')
            
            # Also log summary to application log
            if result.has_violations:
                logger.warning(
                    f"Guardrail violation - Session: {session_id}, Role: {role}, "
                    f"Action: {action_taken}, Rules: {matched_rule_ids}, "
                    f"Categories: {categories}"
                )
        
        except Exception as e:
            logger.error(f"Error writing audit log: {e}", exc_info=True)
    
    def read_session_logs(
        self,
        session_id: str,
        include_text: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Read all audit logs for a specific session.
        
        Args:
            session_id: Session to query
            include_text: If False, redacts text_snippet (more secure)
        
        Returns:
            List of audit entries as dictionaries
        """
        entries = []
        
        # Search all log files in directory
        for log_file in sorted(self.log_dir.glob("guardrails_audit_*.ndjson")):
            try:
                with open(log_file, 'r', encoding='utf-8') as f:
                    for line in f:
                        try:
                            entry = json.loads(line)
                            if entry.get('session_id') == session_id:
                                if not include_text:
                                    entry['text_snippet'] = '[REDACTED]'
                                entries.append(entry)
                        except json.JSONDecodeError:
                            continue
            except Exception as e:
                logger.error(f"Error reading log file {log_file}: {e}")
        
        return entries
    
    def get_daily_stats(self, date: Optional[datetime] = None) -> Dict[str, Any]:
        """
        Get statistics for a specific date.
        
        Args:
            date: Date to query (defaults to today)
        
        Returns:
            Dictionary with statistics
        """
        if date is None:
            date = datetime.utcnow()
        
        date_str = date.strftime("%Y-%m-%d")
        log_file = self.log_dir / f"guardrails_audit_{date_str}.ndjson"
        
        if not log_file.exists():
            return {"date": date_str, "total_checks": 0}
        
        stats = {
            "date": date_str,
            "total_checks": 0,
            "violations": 0,
            "blocked": 0,
            "rewritten": 0,
            "warned": 0,
            "passed": 0,
            "categories": {},
            "rules": {}
        }
        
        try:
            with open(log_file, 'r', encoding='utf-8') as f:
                for line in f:
                    try:
                        entry = json.loads(line)
                        stats["total_checks"] += 1
                        
                        action = entry.get("action_taken", "passed")
                        stats[action] = stats.get(action, 0) + 1
                        
                        if entry.get("violated"):
                            stats["violations"] += 1
                        
                        # Count by category
                        for cat in entry.get("categories", []):
                            stats["categories"][cat] = stats["categories"].get(cat, 0) + 1
                        
                        # Count by rule
                        for rule_id in entry.get("matched_rule_ids", []):
                            stats["rules"][rule_id] = stats["rules"].get(rule_id, 0) + 1
                    
                    except json.JSONDecodeError:
                        continue
        
        except Exception as e:
            logger.error(f"Error reading stats from {log_file}: {e}")
        
        return stats


# Global audit logger instance
_audit_logger: Optional[GuardrailsAuditLogger] = None


def get_audit_logger(log_dir: Optional[Path] = None) -> GuardrailsAuditLogger:
    """Get or create the global audit logger instance."""
    global _audit_logger
    if _audit_logger is None:
        _audit_logger = GuardrailsAuditLogger(log_dir)
    return _audit_logger


def log_guardrail_check(
    session_id: str,
    role: str,
    text: str,
    result: GuardrailCheckResult,
    locale: Optional[str] = None
):
    """
    Convenience function to log a guardrail check.
    
    Args:
        session_id: Session identifier
        role: "user" or "assistant"
        text: Text that was checked
        result: GuardrailCheckResult
        locale: Optional locale code
    """
    logger_instance = get_audit_logger()
    logger_instance.log_check(session_id, role, text, result, locale)

