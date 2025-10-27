#!/usr/bin/env python3
"""
Create test fixture Excel file for guardrails unit tests.
"""
import pandas as pd
from pathlib import Path

# Test rules - one per category, including edge cases
test_rules = [
    # PHI/HIPAA
    {
        "rule_id": "TEST_PHI_001",
        "category": "PHI_HIPAA",
        "pattern_type": "regex",
        "pattern": r"\bSSN\b|\bsocial security\b",
        "severity": "block",
        "action_message": "Cannot discuss patient identifiers.",
        "noncompliance_description": "PHI reference detected",
        "enabled": "TRUE",
        "notes": "Test PHI blocking"
    },
    # Off-label
    {
        "rule_id": "TEST_OFFLABEL_001",
        "category": "OFF_LABEL",
        "pattern_type": "keyword",
        "pattern": "off-label,unapproved use",
        "severity": "block",
        "action_message": "This medication is only approved for labeled indications.",
        "noncompliance_description": "Off-label promotion",
        "enabled": "TRUE",
        "notes": "Test off-label blocking"
    },
    # Adverse events
    {
        "rule_id": "TEST_AE_001",
        "category": "AE_DETECTION",
        "pattern_type": "keyword",
        "pattern": "side effect,adverse event,harm",
        "severity": "warn",
        "action_message": "Thank you for reporting. Please contact medical safety.",
        "noncompliance_description": "AE reported",
        "enabled": "TRUE",
        "notes": "Test AE warning"
    },
    # Comparative claims
    {
        "rule_id": "TEST_COMP_001",
        "category": "COMPARATIVE_CLAIM",
        "pattern_type": "keyword",
        "pattern": "better than,superior to",
        "severity": "rewrite",
        "action_message": "Each treatment has its own profile. Please review full prescribing information.",
        "noncompliance_description": "Unsubstantiated comparative claim",
        "enabled": "TRUE",
        "notes": "Test comparative claim rewrite"
    },
    # Pricing
    {
        "rule_id": "TEST_PRICE_001",
        "category": "PRICING_REBATE",
        "pattern_type": "keyword",
        "pattern": "cost,price,rebate",
        "severity": "block",
        "action_message": "Cannot discuss pricing. Contact patient assistance.",
        "noncompliance_description": "Pricing discussion",
        "enabled": "TRUE",
        "notes": "Test pricing block"
    },
    # Unapproved indication
    {
        "rule_id": "TEST_UNAPPROVED_001",
        "category": "UNAPPROVED_INDICATION",
        "pattern_type": "keyword",
        "pattern": "diabetes,cancer",
        "severity": "block",
        "action_message": "Please refer to approved indications only.",
        "noncompliance_description": "Unapproved indication query",
        "enabled": "TRUE",
        "notes": "Test unapproved indication"
    },
    # Guarantees
    {
        "rule_id": "TEST_GUARANTEE_001",
        "category": "GUARANTEE",
        "pattern_type": "keyword",
        "pattern": "guarantee,guaranteed,will cure",
        "severity": "rewrite",
        "action_message": "Treatment outcomes vary. Review clinical data.",
        "noncompliance_description": "Guarantee claim",
        "enabled": "TRUE",
        "notes": "Test guarantee rewrite"
    },
    # Clinical guidance
    {
        "rule_id": "TEST_CLINICAL_001",
        "category": "CLINICAL_GUIDANCE",
        "pattern_type": "keyword",
        "pattern": "you should take,I recommend",
        "severity": "rewrite",
        "action_message": "Consult healthcare provider for guidance.",
        "noncompliance_description": "Clinical advice beyond materials",
        "enabled": "TRUE",
        "notes": "Test clinical guidance"
    },
    # Language
    {
        "rule_id": "TEST_LANG_001",
        "category": "LANGUAGE_EN_ONLY",
        "pattern_type": "llm_hint",
        "pattern": "non-english",
        "severity": "block",
        "action_message": "Please continue in English.",
        "noncompliance_description": "Non-English detected",
        "enabled": "TRUE",
        "notes": "Test language policy"
    },
    # PII
    {
        "rule_id": "TEST_PII_001",
        "category": "PII_PROMPT",
        "pattern_type": "keyword",
        "pattern": "your name,your address",
        "severity": "block",
        "action_message": "Cannot collect personal information.",
        "noncompliance_description": "PII collection attempt",
        "enabled": "TRUE",
        "notes": "Test PII blocking"
    },
    # Disabled rule (should never match)
    {
        "rule_id": "TEST_DISABLED_001",
        "category": "PHI_HIPAA",
        "pattern_type": "keyword",
        "pattern": "test disabled",
        "severity": "block",
        "action_message": "This should never show",
        "noncompliance_description": "Disabled rule triggered",
        "enabled": "FALSE",
        "notes": "Test that disabled rules don't match"
    }
]

# Language policy
language_policy = [{
    "allowed_locales": "en-US,en-GB",
    "fallback_message": "Please continue in English for testing.",
    "notes": "Test language policy"
}]

# Create DataFrames
df_rules = pd.DataFrame(test_rules)
df_lang = pd.DataFrame(language_policy)

# Write test fixture
output_path = Path(__file__).parent / "guardrails.xlsx"
with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
    df_rules.to_excel(writer, sheet_name='rules_v1', index=False)
    df_lang.to_excel(writer, sheet_name='language_policies', index=False)

print(f"✅ Created test fixture: {output_path}")
print(f"   Rules: {len(test_rules)}")
print(f"   Enabled: {sum(1 for r in test_rules if r['enabled'] == 'TRUE')}")

