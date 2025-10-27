# Guardrails System Documentation

## Overview

The guardrails system provides pharma compliance enforcement for the Nova Sonic voice assistant. It checks all assistant responses against configurable rules before emitting text/audio to users.

## Architecture

### Components

1. **`docs/guardrails.xlsx`** - Source of truth for all compliance rules
2. **`app/guardrails_loader.py`** - Loads and validates Excel configuration
3. **`app/guardrails.py`** - Main checking engine with pattern matching
4. **`app/guardrails_audit.py`** - Compliance audit logging (NDJSON format)
5. **`app/main.py`** - Integration into streaming pipeline

### Data Flow

```
User speaks → Nova Sonic → Assistant text generated
                              ↓
                         Guardrails check()
                              ↓
                   ┌─────────┴──────────┐
                   ↓                    ↓
             Violation?              Clean?
                   ↓                    ↓
        Replace with action_message   Pass through
        Suppress audio                Normal audio
        Log to audit                  Log to audit
                   ↓                    ↓
                   └─────────┬──────────┘
                             ↓
                    Frontend (transcript + audio)
```

## Configuration

### Excel Schema

**Sheet: `rules_v1`**

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| rule_id | string | ✅ | Unique identifier (e.g., "PHI_001") |
| category | string | ✅ | Compliance category |
| pattern_type | enum | ✅ | `regex`, `keyword`, or `llm_hint` |
| pattern | string | ✅ | Pattern to match |
| severity | enum | ✅ | `block`, `rewrite`, or `warn` |
| action_message | string | ✅ | Compliant message to show user |
| noncompliance_description | string | ✅ | Audit log description |
| enabled | boolean | ✅ | `TRUE` or `FALSE` |
| notes | string | ❌ | Optional documentation |

**Sheet: `language_policies`** (optional)

| Column | Type | Description |
|--------|------|-------------|
| allowed_locales | string | Comma-separated (e.g., "en-US,en-GB") |
| fallback_message | string | Message for non-English users |

### Required Categories

All categories must have at least one enabled rule:

- **PHI_HIPAA** - Patient identifiers (HIPAA compliance)
- **OFF_LABEL** - Off-label promotion
- **AE_DETECTION** - Adverse event mentions (pharmacovigilance)
- **COMPARATIVE_CLAIM** - Unsubstantiated comparisons
- **PRICING_REBATE** - Pricing/rebate discussions
- **UNAPPROVED_INDICATION** - Non-approved uses
- **GUARANTEE** - Outcome promises
- **CLINICAL_GUIDANCE** - Medical advice beyond materials
- **LANGUAGE_EN_ONLY** - Non-English content
- **PII_PROMPT** - Personal information collection

## Usage

### Basic Check

```python
from app import guardrails

result = guardrails.check(
    text_segment="This medication costs $100",
    locale="en-US",
    role="assistant"
)

if result.should_block:
    # Replace text with compliant message
    compliant_text = result.action_message
    # Suppress corresponding audio
elif result.should_rewrite:
    # Similar handling
    pass
```

### Check Result Properties

```python
result.has_violations          # bool: Any violations?
result.should_block            # bool: Block content entirely?
result.should_rewrite          # bool: Rewrite with action_message?
result.action_message          # str: Compliant replacement text
result.all_matched_rules       # List[str]: All triggered rule IDs
result.highest_severity_violation  # GuardrailViolation: Most severe
```

### Audit Logging

```python
from app.guardrails_audit import log_guardrail_check

log_guardrail_check(
    session_id="abc-123",
    role="assistant",
    text=original_text,
    result=check_result,
    locale="en-US"
)
```

Logs are stored in NDJSON format:
- Location: `/var/log/guardrails/` or `backend/logs/guardrails/`
- Format: `guardrails_audit_YYYY-MM-DD.ndjson`
- Rotation: Daily
- Redaction: PHI/PII patterns automatically redacted

## Admin Endpoints

### Check Status

```bash
GET /admin/guardrails/status
```

Returns:
```json
{
  "loaded_at": "2025-10-27T12:00:00",
  "file_path": "/path/to/guardrails.xlsx",
  "file_modified": "2025-10-27T11:00:00",
  "total_rules": 11,
  "enabled_rules": 10,
  "categories": ["PHI_HIPAA", "OFF_LABEL", ...]
}
```

### Reload Rules

```bash
POST /admin/guardrails/reload
```

Hot-reloads rules from Excel without restarting the server.

### Audit Logs

```bash
GET /admin/audit/session/{session_id}?include_text=false
```

Returns audit logs for a specific session (redacted by default).

## Testing

### Run Unit Tests

```bash
cd backend
source .venv312/bin/activate
pytest tests/test_guardrails.py -v
```

### Test Coverage

✅ All 24 tests passing:
- Loader validation and schema checking
- All 10 required categories
- Block, rewrite, and warn severity levels
- Language policy enforcement
- Audit logging with PII redaction
- Multiple violation handling (highest severity wins)
- Disabled rules verification
- Integration scenarios

### Test Fixture

Located at `tests/fixtures/guardrails.xlsx` with one rule per category.

## Severity Levels

### `block` (Highest Priority)

- **Behavior**: Completely replaces content with `action_message`
- **Audio**: Suppressed (no audio emitted)
- **Use cases**: PHI, off-label, pricing, PII, unapproved indications

### `rewrite`

- **Behavior**: Replaces content with `action_message`
- **Audio**: Suppressed (could synthesize from action_message)
- **Use cases**: Comparative claims, guarantees, clinical guidance

### `warn`

- **Behavior**: Logs violation but allows content through
- **Audio**: Normal playback
- **Use cases**: Adverse event detection (for follow-up)

## Auto-Reload

The system automatically checks if `guardrails.xlsx` has been modified and reloads:

```python
from app.guardrails_loader import load_guardrails

# Force reload
config = load_guardrails(force_reload=True)

# Auto-reload if file timestamp changed
config = load_guardrails()  # Checks timestamp automatically
```

## Audit Log Schema

Each NDJSON line contains:

```json
{
  "timestamp": "2025-10-27T12:34:56.789Z",
  "session_id": "abc-123",
  "role": "assistant",
  "text_hash": "sha256...",
  "text_snippet": "First 20...Last 20 [REDACTED]",
  "matched_rule_ids": ["PHI_001", "PRICING_001"],
  "categories": ["PHI_HIPAA", "PRICING_REBATE"],
  "severities": ["block"],
  "action_taken": "blocked",
  "locale": "en-US",
  "violated": true,
  "noncompliance_descriptions": ["PHI detected", "Pricing discussion"]
}
```

## Pattern Types

### `regex`

- Case-insensitive, Unicode-safe
- Example: `r"\b(SSN|social security)\b"`

### `keyword`

- Comma-separated list
- Whole-word matching
- Example: `"off-label,unapproved use,outside indication"`

### `llm_hint`

- Special markers for future LLM-based evaluation
- Not pattern-matched currently
- Example: `"non-english detected"`

## Integration in Streaming Pipeline

The guardrails check is inserted in `app/main.py` before emitting SSE events:

```python
# In stream_events() generator
if 'textOutput' in event_data:
    text_content = event_data['textOutput']['content']
    
    if role == 'assistant':
        # Check guardrails
        check_result = guardrails.check(text_content, locale="en-US")
        
        if check_result.should_block or check_result.should_rewrite:
            # Replace with compliant message
            final_text = check_result.action_message
            # Flag audio for suppression
            client.suppress_next_audio = True
        
        # Log for compliance audit
        log_guardrail_check(session_id, "assistant", text_content, check_result)
```

## Acceptance Criteria ✅

- [x] Service reads guardrails exclusively from `docs/guardrails.xlsx`
- [x] Hot-reload via admin endpoint or automatic file change detection
- [x] Streaming pipeline never emits non-compliant assistant text/audio
- [x] Violations surface configured `action_message`
- [x] English-only rule prompts "Please continue in English"
- [x] Audit logs show accurate `rule_id`, `category`, and `action_taken`
- [x] Unit tests cover all categories and pass with fixture Excel
- [x] Highest severity rule wins when multiple match
- [x] `noncompliance_event` tracking in session
- [x] Disabled rules (`enabled=FALSE`) never match

## Example Rules

### PHI Blocking

```
rule_id: PHI_001
pattern: \b(SSN|social security|MRN)\b
severity: block
action_message: "I cannot discuss specific patient identifiers."
```

### Comparative Claim Rewrite

```
rule_id: COMP_001
pattern: better than,superior to,outperforms
severity: rewrite
action_message: "Each treatment has its own profile. Please review complete prescribing information."
```

### Adverse Event Warning

```
rule_id: AE_001
pattern: side effect,adverse event,harm
severity: warn
action_message: "Thank you for reporting. A medical specialist will follow up."
```

## Maintenance

### Adding New Rules

1. Edit `docs/guardrails.xlsx`
2. Add row with required columns
3. Set `enabled = TRUE`
4. Either:
   - Wait for auto-reload (checks file timestamp)
   - Call `POST /admin/guardrails/reload`
   - Restart server

### Disabling Rules

Set `enabled = FALSE` in Excel and reload.

### Updating Patterns

Modify `pattern` column and reload. Test with unit tests.

## Production Considerations

1. **Performance**: Rules are cached in memory; Excel only read at startup/reload
2. **Audit Storage**: Logs rotate daily; implement archival for long-term retention
3. **PII Redaction**: Text snippets automatically redacted; only hashes stored
4. **Monitoring**: Check `/admin/guardrails/status` for config freshness
5. **Testing**: Run full test suite after any rule changes

## Troubleshooting

### Rules Not Loading

```bash
# Check status
curl http://localhost:8000/admin/guardrails/status

# Check logs
tail -f backend/logs/guardrails/guardrails_audit_*.ndjson
```

### Force Reload

```bash
curl -X POST http://localhost:8000/admin/guardrails/reload
```

### Verify Rule Matches

```python
# In backend shell
from app import guardrails
result = guardrails.check("test pricing", role="assistant")
print(result.to_dict())
```

## License

Internal pharma compliance system. All rules must be validated by legal/regulatory teams.

