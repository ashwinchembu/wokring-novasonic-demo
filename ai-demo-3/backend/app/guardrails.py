"""
Guardrails Module
Evaluates text against pharma compliance rules loaded from Excel.
"""
import re
import logging
from typing import List, Optional, Dict, Any
from enum import Enum

from app.guardrails_loader import (
    load_guardrails, get_enabled_rules, get_language_policy,
    GuardrailRule, LanguagePolicy
)

logger = logging.getLogger(__name__)


class ViolationDecision(Enum):
    """Types of violation decisions."""
    BLOCK = "block"        # Completely block the content
    REWRITE = "rewrite"    # Replace with compliant message
    WARN = "warn"          # Log but allow through
    PASS = "pass"          # No violations


class GuardrailViolation:
    """Result of a guardrail check."""
    
    def __init__(
        self,
        violated: bool,
        rule_id: Optional[str] = None,
        category: Optional[str] = None,
        severity: Optional[str] = None,
        action_message: Optional[str] = None,
        noncompliance_description: Optional[str] = None,
        matched_text: Optional[str] = None
    ):
        self.violated = violated
        self.rule_id = rule_id
        self.category = category
        self.severity = severity
        self.action_message = action_message
        self.noncompliance_description = noncompliance_description
        self.matched_text = matched_text
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for logging/API."""
        return {
            "violated": self.violated,
            "rule_id": self.rule_id,
            "category": self.category,
            "severity": self.severity,
            "action_message": self.action_message,
            "noncompliance_description": self.noncompliance_description,
            "matched_text": self.matched_text
        }
    
    @property
    def should_block(self) -> bool:
        """Whether this violation should block content."""
        return self.violated and self.severity == "block"
    
    @property
    def should_rewrite(self) -> bool:
        """Whether this violation should rewrite content."""
        return self.violated and self.severity == "rewrite"
    
    @property
    def should_warn(self) -> bool:
        """Whether this violation should only warn."""
        return self.violated and self.severity == "warn"


class GuardrailCheckResult:
    """Result of checking text against all guardrails."""
    
    def __init__(self):
        self.violations: List[GuardrailViolation] = []
        self.all_matched_rules: List[str] = []
    
    def add_violation(self, violation: GuardrailViolation):
        """Add a violation to the result."""
        self.violations.append(violation)
        if violation.rule_id:
            self.all_matched_rules.append(violation.rule_id)
    
    @property
    def has_violations(self) -> bool:
        """Whether any violations were found."""
        return len(self.violations) > 0
    
    @property
    def highest_severity_violation(self) -> Optional[GuardrailViolation]:
        """Get the highest severity violation (block > rewrite > warn)."""
        if not self.violations:
            return None
        
        severity_order = {"block": 0, "rewrite": 1, "warn": 2}
        return min(
            self.violations,
            key=lambda v: severity_order.get(v.severity, 999)
        )
    
    @property
    def should_block(self) -> bool:
        """Whether content should be blocked."""
        return any(v.should_block for v in self.violations)
    
    @property
    def should_rewrite(self) -> bool:
        """Whether content should be rewritten (and not blocked)."""
        if self.should_block:
            return False
        return any(v.should_rewrite for v in self.violations)
    
    @property
    def action_message(self) -> Optional[str]:
        """Get the action message from highest severity violation."""
        violation = self.highest_severity_violation
        return violation.action_message if violation else None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for logging."""
        return {
            "has_violations": self.has_violations,
            "should_block": self.should_block,
            "should_rewrite": self.should_rewrite,
            "action_message": self.action_message,
            "all_matched_rules": self.all_matched_rules,
            "violations": [v.to_dict() for v in self.violations]
        }


class GuardrailsEngine:
    """Main engine for evaluating text against guardrails."""
    
    def __init__(self):
        """Initialize the guardrails engine."""
        # Load configuration
        self.config = load_guardrails()
        logger.info("GuardrailsEngine initialized")
    
    def reload_rules(self):
        """Force reload rules from Excel file."""
        self.config = load_guardrails(force_reload=True)
        logger.info("GuardrailsEngine reloaded rules")
    
    def _match_regex(self, pattern: str, text: str) -> Optional[str]:
        """
        Match regex pattern against text.
        Case-insensitive, Unicode-safe.
        Returns matched text or None.
        """
        try:
            match = re.search(pattern, text, re.IGNORECASE | re.UNICODE)
            return match.group(0) if match else None
        except re.error as e:
            logger.error(f"Invalid regex pattern: {pattern} - {e}")
            return None
    
    def _match_keyword(self, pattern: str, text: str) -> Optional[str]:
        """
        Match keyword pattern against text.
        Supports comma-separated keywords, whole-word matching.
        Returns matched keyword or None.
        """
        keywords = [k.strip().lower() for k in pattern.split(',')]
        text_lower = text.lower()
        
        for keyword in keywords:
            # Whole-word matching using regex
            # Handle multi-word keywords
            keyword_pattern = r'\b' + re.escape(keyword) + r'\b'
            if re.search(keyword_pattern, text_lower, re.UNICODE):
                return keyword
        
        return None
    
    def _check_language(self, locale: Optional[str]) -> Optional[GuardrailViolation]:
        """
        Check if locale is allowed per language policy.
        Returns violation if locale is not allowed.
        """
        policy = get_language_policy()
        if not policy:
            return None  # No language policy configured
        
        if not locale:
            return None  # No locale specified, assume English
        
        # Normalize locale (e.g., en-US, en_US, en)
        locale_norm = locale.replace('_', '-').lower()
        allowed_norm = [loc.replace('_', '-').lower() for loc in policy.allowed_locales]
        
        # Check if locale or its base language is allowed
        locale_base = locale_norm.split('-')[0]
        
        is_allowed = any(
            locale_norm == allowed or locale_norm.startswith(allowed) or
            locale_base == allowed.split('-')[0]
            for allowed in allowed_norm
        )
        
        if not is_allowed:
            return GuardrailViolation(
                violated=True,
                rule_id="LANGUAGE_001",
                category="LANGUAGE_EN_ONLY",
                severity="block",
                action_message=policy.fallback_message,
                noncompliance_description=f"Non-English locale detected: {locale}",
                matched_text=locale
            )
        
        return None
    
    def check(
        self,
        text_segment: str,
        locale: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        role: str = "assistant"
    ) -> GuardrailCheckResult:
        """
        Evaluate text against all enabled guardrail rules.
        
        Args:
            text_segment: The text to check (assistant or user message)
            locale: Optional locale/language code (e.g., "en-US")
            context: Optional context dict for future use
            role: Role of the speaker ("assistant" or "user")
        
        Returns:
            GuardrailCheckResult with all violations found
        """
        result = GuardrailCheckResult()
        
        if not text_segment or not text_segment.strip():
            return result  # Empty text, no violations
        
        # Check language policy first
        lang_violation = self._check_language(locale)
        if lang_violation:
            result.add_violation(lang_violation)
            # If language is blocked, don't check other rules
            if lang_violation.should_block:
                return result
        
        # Get all enabled rules
        rules = get_enabled_rules()
        
        for rule in rules:
            violation = self._check_rule(rule, text_segment, role)
            if violation:
                result.add_violation(violation)
                logger.info(
                    f"Guardrail triggered: {rule.rule_id} ({rule.category}) "
                    f"- Severity: {rule.severity}"
                )
        
        return result
    
    def _check_rule(
        self,
        rule: GuardrailRule,
        text: str,
        role: str
    ) -> Optional[GuardrailViolation]:
        """
        Check a single rule against text.
        Returns violation if rule matches, None otherwise.
        """
        matched_text = None
        
        if rule.pattern_type == "regex":
            matched_text = self._match_regex(rule.pattern, text)
        
        elif rule.pattern_type == "keyword":
            matched_text = self._match_keyword(rule.pattern, text)
        
        elif rule.pattern_type == "llm_hint":
            # LLM hints are special markers, not pattern-matched
            # These would be triggered by separate LLM evaluation
            # For now, we skip these in direct pattern matching
            return None
        
        if matched_text:
            return GuardrailViolation(
                violated=True,
                rule_id=rule.rule_id,
                category=rule.category,
                severity=rule.severity,
                action_message=rule.action_message,
                noncompliance_description=rule.noncompliance_description,
                matched_text=matched_text
            )
        
        return None


# Global engine instance
_engine: Optional[GuardrailsEngine] = None


def get_engine() -> GuardrailsEngine:
    """Get or create the global guardrails engine."""
    global _engine
    if _engine is None:
        _engine = GuardrailsEngine()
    return _engine


def check(
    text_segment: str,
    locale: Optional[str] = None,
    context: Optional[Dict[str, Any]] = None,
    role: str = "assistant"
) -> GuardrailCheckResult:
    """
    Main entry point: Check text against all guardrails.
    
    Args:
        text_segment: Text to check
        locale: Optional locale code
        context: Optional context dictionary
        role: Speaker role ("assistant" or "user")
    
    Returns:
        GuardrailCheckResult with all violations
    """
    engine = get_engine()
    return engine.check(text_segment, locale, context, role)


def reload_rules():
    """Force reload guardrails from Excel file."""
    engine = get_engine()
    engine.reload_rules()

