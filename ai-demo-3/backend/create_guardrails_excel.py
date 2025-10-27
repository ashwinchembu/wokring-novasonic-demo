#!/usr/bin/env python3
"""
Script to create the guardrails.xlsx file with all required pharma compliance rules.
Run this once to generate the Excel file.
"""
import pandas as pd
from pathlib import Path

# Define the rules with all required categories
rules_data = [
    {
        "rule_id": "PHI_001",
        "category": "PHI_HIPAA",
        "pattern_type": "regex",
        "pattern": r"\b(SSN|social security|medical record number|MRN|patient id|date of birth|DOB)\b",
        "severity": "block",
        "action_message": "I cannot discuss specific patient identifiers. Please keep our conversation general.",
        "noncompliance_description": "Attempted to reference patient identifiers (HIPAA violation)",
        "enabled": "TRUE",
        "notes": "Blocks explicit patient identifiers per HIPAA"
    },
    {
        "rule_id": "PHI_002",
        "category": "PHI_HIPAA",
        "pattern_type": "regex",
        "pattern": r"\b\d{3}-\d{2}-\d{4}\b",
        "severity": "block",
        "action_message": "I cannot discuss specific patient identifiers. Please keep our conversation general.",
        "noncompliance_description": "SSN-like pattern detected",
        "enabled": "TRUE",
        "notes": "Detects SSN patterns"
    },
    {
        "rule_id": "OFF_LABEL_001",
        "category": "OFF_LABEL",
        "pattern_type": "keyword",
        "pattern": "off-label,unapproved use,not approved for,outside indication",
        "severity": "block",
        "action_message": "This medication is only approved for the indications in the prescribing information. Please consult the official label.",
        "noncompliance_description": "Off-label promotion attempt",
        "enabled": "TRUE",
        "notes": "Blocks off-label promotion"
    },
    {
        "rule_id": "AE_001",
        "category": "AE_DETECTION",
        "pattern_type": "keyword",
        "pattern": "side effect,adverse event,reaction,adverse reaction,harm,injury,death,hospitalization",
        "severity": "warn",
        "action_message": "Thank you for reporting this. A medical information specialist will follow up with you. Please provide your contact information to our safety team.",
        "noncompliance_description": "Adverse event mentioned - requires pharmacovigilance handoff",
        "enabled": "TRUE",
        "notes": "Flags adverse events for mandatory reporting"
    },
    {
        "rule_id": "COMPARATIVE_001",
        "category": "COMPARATIVE_CLAIM",
        "pattern_type": "keyword",
        "pattern": "better than,superior to,more effective than,outperforms,beats",
        "severity": "rewrite",
        "action_message": "Each treatment option has its own profile. Please review the complete prescribing information and discuss with the healthcare provider.",
        "noncompliance_description": "Unsubstantiated comparative claim",
        "enabled": "TRUE",
        "notes": "Rewrites comparative claims without head-to-head data"
    },
    {
        "rule_id": "PRICING_001",
        "category": "PRICING_REBATE",
        "pattern_type": "keyword",
        "pattern": "cost,price,copay,rebate,discount,savings,cheaper,expensive,reimbursement",
        "severity": "block",
        "action_message": "I cannot discuss pricing details. Please contact our patient assistance program or speak with the pharmacy benefits manager.",
        "noncompliance_description": "Pricing/rebate discussion not permitted in field",
        "enabled": "TRUE",
        "notes": "Blocks all pricing discussions"
    },
    {
        "rule_id": "UNAPPROVED_001",
        "category": "UNAPPROVED_INDICATION",
        "pattern_type": "regex",
        "pattern": r"\b(can this treat|approved for|indicated for|works for)\b.*\b(diabetes|cancer|heart disease|pediatric|children)\b",
        "severity": "block",
        "action_message": "Please refer to the approved indications in the prescribing information. I can only discuss approved uses.",
        "noncompliance_description": "Query about unapproved indication",
        "enabled": "TRUE",
        "notes": "Blocks queries about non-approved indications"
    },
    {
        "rule_id": "GUARANTEE_001",
        "category": "GUARANTEE",
        "pattern_type": "keyword",
        "pattern": "guarantee,guaranteed,promise,will cure,will fix,eliminates,100% effective,always works",
        "severity": "rewrite",
        "action_message": "Treatment outcomes vary by individual. Please review the clinical data in the prescribing information and discuss with the healthcare provider.",
        "noncompliance_description": "Guarantee or outcome promise",
        "enabled": "TRUE",
        "notes": "Rewrites any guarantees or absolute claims"
    },
    {
        "rule_id": "CLINICAL_001",
        "category": "CLINICAL_GUIDANCE",
        "pattern_type": "keyword",
        "pattern": "you should take,I recommend,dosing schedule,how to take,when to take,medical advice",
        "severity": "rewrite",
        "action_message": "Please consult with the prescribing healthcare provider for dosing and administration guidance. I can only provide information from approved materials.",
        "noncompliance_description": "Clinical guidance beyond approved materials",
        "enabled": "TRUE",
        "notes": "Prevents providing clinical advice"
    },
    {
        "rule_id": "LANGUAGE_001",
        "category": "LANGUAGE_EN_ONLY",
        "pattern_type": "llm_hint",
        "pattern": "non-english detected",
        "severity": "block",
        "action_message": "Please continue in English. For assistance in other languages, please contact our multilingual support team.",
        "noncompliance_description": "Non-English content detected",
        "enabled": "TRUE",
        "notes": "Enforces English-only policy"
    },
    {
        "rule_id": "PII_001",
        "category": "PII_PROMPT",
        "pattern_type": "keyword",
        "pattern": "your name,your address,phone number,email address,credit card,personal information",
        "severity": "block",
        "action_message": "I cannot collect personal information. If you need to provide contact details, please use our secure portal or speak with a representative.",
        "noncompliance_description": "Attempted PII collection",
        "enabled": "TRUE",
        "notes": "Blocks attempts to collect PII"
    }
]

# Create language policies sheet
language_policies_data = [
    {
        "allowed_locales": "en-US,en-GB,en-CA,en-AU",
        "fallback_message": "Please continue in English. For assistance in other languages, please contact our multilingual support team at 1-800-XXX-XXXX.",
        "notes": "English variants only; escalate for other languages"
    }
]

# Create DataFrames
df_rules = pd.DataFrame(rules_data)
df_language = pd.DataFrame(language_policies_data)

# Write to Excel with multiple sheets
output_path = Path(__file__).parent.parent / "docs" / "guardrails.xlsx"
output_path.parent.mkdir(parents=True, exist_ok=True)

with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
    df_rules.to_excel(writer, sheet_name='rules_v1', index=False)
    df_language.to_excel(writer, sheet_name='language_policies', index=False)

print(f"✅ Created {output_path}")
print(f"   - rules_v1: {len(df_rules)} rules")
print(f"   - language_policies: {len(df_language)} policies")
print("\nCategories covered:")
for cat in df_rules['category'].unique():
    count = len(df_rules[df_rules['category'] == cat])
    print(f"   - {cat}: {count} rule(s)")

