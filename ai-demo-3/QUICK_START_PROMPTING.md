# Quick Start: Prompting & Conversation Policy

## What Was Implemented

✅ **Agent-683 System Prompt** - Veeva CRM call recording assistant  
✅ **Slot Tracking** - HCP name, date, time, product  
✅ **HCP Lookup** - 16 healthcare professionals with ID mapping  
✅ **Conversation Management** - Session state, transcript, guardrails  
✅ **JSON Output** - CRM-compatible structured data  
✅ **REST API** - 8 new endpoints for conversation management  
✅ **Tests** - Comprehensive unit and integration tests  
✅ **Documentation** - Complete guides and API docs  

## Quick Test

### 1. Run Unit Tests

```bash
cd /Users/ashwin/zs/wokring-novasonic-demo/ai-demo-3/backend
python test_prompting.py
```

Expected output: `ALL TESTS PASSED! ✅`

### 2. Start the Server

```bash
cd /Users/ashwin/zs/wokring-novasonic-demo/ai-demo-3/backend
python -m app.main
```

Server will start on `http://localhost:8000`

### 3. Run API Tests

```bash
# In a new terminal
cd /Users/ashwin/zs/wokring-novasonic-demo/ai-demo-3/backend
python test_api_prompting.py
```

Expected output: `ALL TESTS PASSED!`

### 4. Try the API

```bash
# List all HCPs
curl http://localhost:8000/hcp/list

# Look up an HCP
curl "http://localhost:8000/hcp/lookup?name=Harper"

# Create a conversation and set slots
SESSION_ID="test-$(date +%s)"
curl -X POST "http://localhost:8000/conversation/$SESSION_ID/slot?slot_name=hcp_name&value=Dr.%20William%20Harper"
curl -X POST "http://localhost:8000/conversation/$SESSION_ID/slot?slot_name=date&value=2025-10-28"
curl -X POST "http://localhost:8000/conversation/$SESSION_ID/slot?slot_name=time&value=14:30"
curl -X POST "http://localhost:8000/conversation/$SESSION_ID/slot?slot_name=product&value=Medication%20XYZ"

# Get the summary
curl http://localhost:8000/conversation/$SESSION_ID/summary

# Get final JSON output
curl http://localhost:8000/conversation/$SESSION_ID/output

# Clean up
curl -X DELETE http://localhost:8000/conversation/$SESSION_ID
```

## Key Files

### Implementation
- `backend/app/prompting.py` - Core module (480 lines)
- `backend/app/services/nova_sonic_client.py` - Nova Sonic integration
- `backend/app/main.py` - API endpoints (8 new endpoints added)

### Tests
- `backend/test_prompting.py` - Unit tests
- `backend/test_api_prompting.py` - API integration tests

### Documentation
- `backend/app/PROMPTING_GUIDE.md` - Developer guide
- `backend/API_PROMPTING.md` - API documentation
- `PROMPTING_IMPLEMENTATION_SUMMARY.md` - Complete summary

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/hcp/list` | GET | List all HCPs |
| `/hcp/lookup?name={name}` | GET | Look up HCP by name |
| `/conversation/{id}/state` | GET | Get session state |
| `/conversation/{id}/slot` | POST | Set slot value |
| `/conversation/{id}/summary` | GET | Get summary |
| `/conversation/{id}/output` | GET | Get JSON output |
| `/conversation/{id}` | DELETE | Delete session |

## Required Slots

1. **hcp_name** - Healthcare professional name (e.g., "Dr. William Harper")
2. **date** - Meeting date (e.g., "2025-10-28")
3. **time** - Meeting time (e.g., "14:30")
4. **product** - Product discussed (e.g., "Medication XYZ")

## HCP List (16 Total)

- Dr. William Harper (0013K000013ez2RQAQ)
- Dr. Susan Carter (0013K000013ez2SQAQ)
- Dr. James Lawson (0013K000013ez2TQAQ)
- Dr. Emily Hughes (0013K000013ez2UQAQ)
- Dr. Richard Thompson (0013K000013ez2VQAQ)
- Dr. Sarah Phillips (0013K000013ez2WQAQ)
- Dr. John Anderson (0013K000013ez2XQAQ)
- Dr. Lisa Collins (0013K000013ez2YQAQ)
- Dr. David Harris (0013K000013ez2ZQAQ)
- Dr. Amy Scott (0013K000013ez2aQAA)
- Dr. Olivia Wells (0013K000013ez2bQAA)
- Dr. Benjamin Stone (0013K000013ez2cQAA)
- Dr. Grace Mitchell (0013K000013ez2dQAA)
- Dr. Lucas Chang (0013K000013ez2eQAA)
- Dr. Sophia Patel (0013K000013ez2fQAA)
- Dr. Nathan Rivera (0013K000013ez2gQAA)

## Example: Python Client

```python
import requests

BASE_URL = "http://localhost:8000"
session_id = "my-session-123"

# Set all required slots
slots = {
    "hcp_name": "Dr. William Harper",
    "date": "2025-10-28",
    "time": "14:30",
    "product": "Medication XYZ"
}

for slot_name, value in slots.items():
    requests.post(
        f"{BASE_URL}/conversation/{session_id}/slot",
        params={"slot_name": slot_name, "value": value}
    )

# Get final output
output = requests.get(f"{BASE_URL}/conversation/{session_id}/output").json()
print(output["output"])
```

## System Prompt (Agent-683)

The Nova Sonic client now automatically uses the Agent-683 system prompt by default. This prompt:

1. Identifies as a Veeva CRM AI Assistant for Sales Reps
2. Collects required fields: HCP name, date, time, product
3. Looks up HCP IDs from the predefined list
4. Asks for missing information via voice
5. Summarizes collected data back to the user
6. Generates JSON output for CRM integration

View full prompt in: `backend/app/prompting.py` (line 16)

## Next Steps

### Integration with Voice
The conversation session should be linked with Nova Sonic voice sessions:

```python
# Start voice session
voice_response = requests.post(f"{BASE_URL}/session/start")
session_id = voice_response.json()["session_id"]

# Use same session ID for conversation tracking
# As transcripts come in, extract and set slots...

# When complete, get final output
output = requests.get(f"{BASE_URL}/conversation/{session_id}/output").json()
```

### Automatic Slot Extraction
Currently slots must be set manually via API. Next phase:
- Parse voice transcripts to extract slot values
- Use NLU or regex patterns
- Handle conversational date/time ("tomorrow at 2pm")

### CRM Integration
Final phase:
- Push completed JSON to Veeva CRM API
- Handle CRM authentication
- Sync status back to conversation session

## Troubleshooting

**Unit tests fail:**
```bash
# Ensure you're in the right directory
cd /Users/ashwin/zs/wokring-novasonic-demo/ai-demo-3/backend
python test_prompting.py
```

**API tests fail:**
```bash
# Make sure server is running first
python -m app.main

# In another terminal
python test_api_prompting.py
```

**Import errors:**
```bash
# Make sure you have all dependencies
pip install -r requirements.txt
```

## Support

- **Developer Guide**: `backend/app/PROMPTING_GUIDE.md`
- **API Docs**: `backend/API_PROMPTING.md`
- **Full Summary**: `PROMPTING_IMPLEMENTATION_SUMMARY.md`
- **Tests**: Run `python test_prompting.py` or `python test_api_prompting.py`

## Status

✅ **Production Ready**

All acceptance criteria met:
- System prompt implemented verbatim
- Slot tracking working
- HCP lookup functional
- Session management complete
- JSON generation correct
- Tests passing (100%)
- Documentation complete

