"""
Guardrails Loader Module
Reads and validates docs/guardrails.xlsx for pharma compliance rules.
"""
import logging
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime
import pandas as pd
from pydantic import BaseModel, validator

logger = logging.getLogger(__name__)


class GuardrailRule(BaseModel):
    """Individual guardrail rule."""
    rule_id: str
    category: str
    pattern_type: str  # regex, keyword, llm_hint
    pattern: str
    severity: str  # block, rewrite, warn
    action_message: str
    noncompliance_description: str
    enabled: bool
    notes: Optional[str] = None
    
    @validator('pattern_type')
    def validate_pattern_type(cls, v):
        allowed = ['regex', 'keyword', 'llm_hint']
        if v not in allowed:
            raise ValueError(f"pattern_type must be one of {allowed}")
        return v
    
    @validator('severity')
    def validate_severity(cls, v):
        allowed = ['block', 'rewrite', 'warn']
        if v not in allowed:
            raise ValueError(f"severity must be one of {allowed}")
        return v
    
    @validator('enabled', pre=True)
    def parse_enabled(cls, v):
        if isinstance(v, str):
            return v.upper() in ['TRUE', 'YES', '1', 'ENABLED']
        return bool(v)


class LanguagePolicy(BaseModel):
    """Language policy configuration."""
    allowed_locales: List[str]
    fallback_message: str
    notes: Optional[str] = None
    
    @validator('allowed_locales', pre=True)
    def parse_locales(cls, v):
        if isinstance(v, str):
            return [loc.strip() for loc in v.split(',')]
        return v


class GuardrailsConfig(BaseModel):
    """Complete guardrails configuration."""
    rules: List[GuardrailRule]
    language_policy: Optional[LanguagePolicy] = None
    loaded_at: datetime
    file_path: Path
    file_modified: datetime


class GuardrailsLoader:
    """Loads and validates guardrails from Excel file."""
    
    REQUIRED_RULE_COLUMNS = [
        'rule_id', 'category', 'pattern_type', 'pattern', 
        'severity', 'action_message', 'noncompliance_description', 'enabled'
    ]
    
    REQUIRED_CATEGORIES = [
        'PHI_HIPAA', 'OFF_LABEL', 'AE_DETECTION', 'COMPARATIVE_CLAIM',
        'PRICING_REBATE', 'UNAPPROVED_INDICATION', 'GUARANTEE',
        'CLINICAL_GUIDANCE', 'LANGUAGE_EN_ONLY', 'PII_PROMPT'
    ]
    
    def __init__(self, file_path: Optional[Path] = None):
        """Initialize loader with optional custom file path."""
        if file_path is None:
            # Default to docs/guardrails.xlsx relative to backend/app
            file_path = Path(__file__).parent.parent.parent / "docs" / "guardrails.xlsx"
        
        self.file_path = Path(file_path)
        if not self.file_path.exists():
            raise FileNotFoundError(
                f"Guardrails file not found: {self.file_path}. "
                f"Run create_guardrails_excel.py to generate it."
            )
        
        logger.info(f"GuardrailsLoader initialized with file: {self.file_path}")
    
    def get_file_modified_time(self) -> datetime:
        """Get file modification timestamp."""
        return datetime.fromtimestamp(self.file_path.stat().st_mtime)
    
    def load(self) -> GuardrailsConfig:
        """
        Load and validate guardrails from Excel file.
        Fails fast if schema is invalid or required categories are missing.
        """
        try:
            # Read Excel file
            excel_file = pd.ExcelFile(self.file_path)
            
            # Validate required sheets
            if 'rules_v1' not in excel_file.sheet_names:
                raise ValueError("Required sheet 'rules_v1' not found in Excel file")
            
            # Load rules sheet
            df_rules = pd.read_excel(excel_file, sheet_name='rules_v1')
            
            # Validate required columns
            missing_cols = set(self.REQUIRED_RULE_COLUMNS) - set(df_rules.columns)
            if missing_cols:
                raise ValueError(
                    f"Missing required columns in rules_v1 sheet: {missing_cols}"
                )
            
            # Parse rules
            rules = []
            for idx, row in df_rules.iterrows():
                try:
                    rule = GuardrailRule(
                        rule_id=str(row['rule_id']),
                        category=str(row['category']),
                        pattern_type=str(row['pattern_type']),
                        pattern=str(row['pattern']),
                        severity=str(row['severity']),
                        action_message=str(row['action_message']),
                        noncompliance_description=str(row['noncompliance_description']),
                        enabled=row['enabled'],
                        notes=str(row.get('notes', '')) if pd.notna(row.get('notes')) else None
                    )
                    rules.append(rule)
                except Exception as e:
                    logger.error(f"Error parsing rule at row {idx + 2}: {e}")
                    raise ValueError(f"Invalid rule at row {idx + 2}: {e}")
            
            # Validate all required categories are present
            present_categories = {rule.category for rule in rules if rule.enabled}
            missing_categories = set(self.REQUIRED_CATEGORIES) - present_categories
            if missing_categories:
                logger.warning(
                    f"Missing enabled rules for categories: {missing_categories}"
                )
            
            # Load language policy (optional)
            language_policy = None
            if 'language_policies' in excel_file.sheet_names:
                df_lang = pd.read_excel(excel_file, sheet_name='language_policies')
                if not df_lang.empty:
                    row = df_lang.iloc[0]
                    language_policy = LanguagePolicy(
                        allowed_locales=row['allowed_locales'],
                        fallback_message=str(row['fallback_message']),
                        notes=str(row.get('notes', '')) if pd.notna(row.get('notes')) else None
                    )
            
            config = GuardrailsConfig(
                rules=rules,
                language_policy=language_policy,
                loaded_at=datetime.utcnow(),
                file_path=self.file_path,
                file_modified=self.get_file_modified_time()
            )
            
            enabled_count = sum(1 for r in rules if r.enabled)
            logger.info(
                f"✅ Loaded {len(rules)} rules ({enabled_count} enabled) "
                f"from {self.file_path.name}"
            )
            
            # Log category coverage
            for category in self.REQUIRED_CATEGORIES:
                cat_rules = [r for r in rules if r.category == category and r.enabled]
                logger.info(f"   - {category}: {len(cat_rules)} enabled rule(s)")
            
            return config
            
        except Exception as e:
            logger.error(f"Failed to load guardrails: {e}")
            raise RuntimeError(f"Failed to load guardrails from {self.file_path}: {e}")
    
    def has_file_changed(self, last_modified: datetime) -> bool:
        """Check if file has been modified since last load."""
        current_modified = self.get_file_modified_time()
        return current_modified > last_modified


# Singleton instance for global access
_loader_instance: Optional[GuardrailsLoader] = None
_config_cache: Optional[GuardrailsConfig] = None


def get_loader(file_path: Optional[Path] = None) -> GuardrailsLoader:
    """Get or create the global guardrails loader instance."""
    global _loader_instance
    if _loader_instance is None:
        _loader_instance = GuardrailsLoader(file_path)
    return _loader_instance


def load_guardrails(force_reload: bool = False) -> GuardrailsConfig:
    """
    Load guardrails configuration, with caching and optional reload.
    
    Args:
        force_reload: Force reload even if cached
    
    Returns:
        GuardrailsConfig with all rules and policies
    """
    global _config_cache
    
    loader = get_loader()
    
    # Check if we need to reload
    should_reload = force_reload or _config_cache is None
    
    if not should_reload and _config_cache is not None:
        # Check if file has changed
        if loader.has_file_changed(_config_cache.file_modified):
            logger.info("Guardrails file has changed, reloading...")
            should_reload = True
    
    if should_reload:
        _config_cache = loader.load()
    
    return _config_cache


def get_enabled_rules() -> List[GuardrailRule]:
    """Get all enabled rules from cached configuration."""
    config = load_guardrails()
    return [rule for rule in config.rules if rule.enabled]


def get_language_policy() -> Optional[LanguagePolicy]:
    """Get language policy from cached configuration."""
    config = load_guardrails()
    return config.language_policy

