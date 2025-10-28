# Prompting & Conversation Policy API

This document describes the REST API endpoints for managing conversation sessions with slot-filling and CRM integration.

## Base URL

```
http://localhost:8000
```

## Endpoints

### 1. List All HCPs

Get a list of all valid Healthcare Professional names and IDs.

**Endpoint:** `GET /hcp/list`

**Response:**
```json
{
  "total": 16,
  "hcps": [
    {
      "name": "Dr. William Harper",
      "id": "0013K000013ez2RQAQ"
    },
    {
      "name": "Dr. Susan Carter",
      "id": "0013K000013ez2SQAQ"
    }
    // ... more HCPs
  ]
}
```

**Example:**
```bash
curl http://localhost:8000/hcp/list
```

---

### 2. Lookup HCP by Name

Look up an HCP ID by name. Supports partial and case-insensitive matching.

**Endpoint:** `GET /hcp/lookup`

**Query Parameters:**
- `name` (required): HCP name or partial name

**Response (Found):**
```json
{
  "found": true,
  "name": "Dr. William Harper",
  "id": "0013K000013ez2RQAQ"
}
```

**Response (Not Found):**
```json
{
  "found": false,
  "name": "Dr. Unknown",
  "suggestions": [
    "Dr. William Harper",
    "Dr. Sarah Phillips"
  ]
}
```

**Examples:**
```bash
# Exact match
curl "http://localhost:8000/hcp/lookup?name=Dr.%20William%20Harper"

# Partial match
curl "http://localhost:8000/hcp/lookup?name=Harper"

# Case-insensitive
curl "http://localhost:8000/hcp/lookup?name=dr.%20susan%20carter"
```

---

### 3. Get Conversation State

Get the current state of a conversation session, including slots, transcript, and completion status.

**Endpoint:** `GET /conversation/{session_id}/state`

**Response:**
```json
{
  "session_id": "test-session-123",
  "slots": {
    "hcp_name": "Dr. William Harper",
    "hcp_id": "0013K000013ez2RQAQ",
    "date": "2025-10-28",
    "time": "14:30",
    "product": "Medication XYZ",
    "call_notes": "Discussed efficacy data",
    "discussion_topic": "",
    "call_follow_up_task": {
      "task_type": "",
      "description": "",
      "due_date": "",
      "assigned_to": ""
    },
    "adverse_event": false,
    "adverse_event_details": null,
    "noncompliance_event": false,
    "noncompliance_description": ""
  },
  "transcript": [
    {
      "role": "USER",
      "content": "I met with Dr. Harper",
      "timestamp": "2025-10-28T14:30:00.000Z"
    }
  ],
  "guardrail_flags": {
    "adverse_event_detected": false,
    "noncompliance_detected": false,
    "profanity_detected": false
  },
  "confirmed_slots": ["hcp_name", "date"],
  "summary_read_back": false,
  "missing_slots": ["time", "product"],
  "all_slots_filled": false,
  "output_json": null
}
```

**Example:**
```bash
curl http://localhost:8000/conversation/test-session-123/state
```

---

### 4. Set Conversation Slot

Set a slot value in the conversation session. Automatically creates session if it doesn't exist.

**Endpoint:** `POST /conversation/{session_id}/slot`

**Query Parameters:**
- `slot_name` (required): Name of the slot to set
- `value` (required): Value to set

**Available Slots:**
- `hcp_name` - HCP name (automatically looks up ID)
- `date` - Meeting date (e.g., "2025-10-28")
- `time` - Meeting time (e.g., "14:30")
- `product` - Product discussed
- `call_notes` - Additional call notes
- `discussion_topic` - Discussion topic
- `adverse_event` - Boolean for adverse event
- `noncompliance_event` - Boolean for noncompliance

**Response:**
```json
{
  "status": "success",
  "slot": "hcp_name",
  "value": "Dr. William Harper",
  "hcp_id": "0013K000013ez2RQAQ",
  "missing_slots": ["date", "time", "product"]
}
```

**Examples:**
```bash
# Set HCP name (automatically looks up ID)
curl -X POST "http://localhost:8000/conversation/test-123/slot?slot_name=hcp_name&value=Dr.%20William%20Harper"

# Set date
curl -X POST "http://localhost:8000/conversation/test-123/slot?slot_name=date&value=2025-10-28"

# Set time
curl -X POST "http://localhost:8000/conversation/test-123/slot?slot_name=time&value=14:30"

# Set product
curl -X POST "http://localhost:8000/conversation/test-123/slot?slot_name=product&value=Medication%20XYZ"

# Set call notes
curl -X POST "http://localhost:8000/conversation/test-123/slot?slot_name=call_notes&value=Discussed%20efficacy%20and%20safety"
```

---

### 5. Get Conversation Summary

Generate a human-readable summary of the conversation for confirmation.

**Endpoint:** `GET /conversation/{session_id}/summary`

**Response (Complete):**
```json
{
  "status": "complete",
  "summary": "Let me confirm the details of your call recording. You met with Dr. William Harper, whose ID is 0013K000013ez2RQAQ. The meeting was on 2025-10-28 at 14:30. You discussed Medication XYZ. Your call notes mention: Discussed efficacy data. Is this correct?",
  "missing_slots": []
}
```

**Response (Incomplete):**
```json
{
  "status": "incomplete",
  "missing_slots": ["time", "product"],
  "summary": null
}
```

**Example:**
```bash
curl http://localhost:8000/conversation/test-session-123/summary
```

---

### 6. Get Final JSON Output

Generate the final JSON output in CRM format. Requires all slots to be filled.

**Endpoint:** `GET /conversation/{session_id}/output`

**Response:**
```json
{
  "status": "success",
  "output": {
    "call_channel": "In-person",
    "discussion_topic": "",
    "status": "Saved_vod",
    "account": "Dr. William Harper",
    "id": "0013K000013ez2RQAQ",
    "adverse_event": false,
    "adverse_event_details": null,
    "noncompliance_event": false,
    "noncompliance_description": "",
    "call_notes": "Discussed efficacy and safety profile",
    "call_date": "2025-10-28",
    "call_time": "14:30",
    "product": "Medication XYZ",
    "call_follow_up_task": {
      "task_type": "",
      "description": "",
      "due_date": "",
      "assigned_to": ""
    }
  },
  "session_id": "test-session-123"
}
```

**Error Response (Missing Slots):**
```json
{
  "detail": "Cannot generate output - missing required slots: ['time', 'product']"
}
```

**Example:**
```bash
curl http://localhost:8000/conversation/test-session-123/output
```

---

### 7. Delete Conversation Session

Delete a conversation session and clean up resources.

**Endpoint:** `DELETE /conversation/{session_id}`

**Response:**
```json
{
  "status": "success",
  "message": "Conversation session test-session-123 deleted"
}
```

**Example:**
```bash
curl -X DELETE http://localhost:8000/conversation/test-session-123
```

---

## Complete Workflow Example

Here's a complete example of the conversation flow:

```bash
SESSION_ID="my-session-$(date +%s)"

# 1. List available HCPs
curl http://localhost:8000/hcp/list

# 2. Set HCP name
curl -X POST "http://localhost:8000/conversation/$SESSION_ID/slot?slot_name=hcp_name&value=Dr.%20William%20Harper"

# 3. Set date
curl -X POST "http://localhost:8000/conversation/$SESSION_ID/slot?slot_name=date&value=2025-10-28"

# 4. Set time
curl -X POST "http://localhost:8000/conversation/$SESSION_ID/slot?slot_name=time&value=14:30"

# 5. Set product
curl -X POST "http://localhost:8000/conversation/$SESSION_ID/slot?slot_name=product&value=Medication%20XYZ"

# 6. Add call notes
curl -X POST "http://localhost:8000/conversation/$SESSION_ID/slot?slot_name=call_notes&value=Discussed%20efficacy%20data"

# 7. Get summary
curl http://localhost:8000/conversation/$SESSION_ID/summary

# 8. Get final output
curl http://localhost:8000/conversation/$SESSION_ID/output

# 9. Clean up
curl -X DELETE http://localhost:8000/conversation/$SESSION_ID
```

---

## Python Client Example

```python
import requests
import json

BASE_URL = "http://localhost:8000"
session_id = "my-session-123"

# Set all required slots
slots = {
    "hcp_name": "Dr. William Harper",
    "date": "2025-10-28",
    "time": "14:30",
    "product": "Medication XYZ",
    "call_notes": "Discussed clinical trial results"
}

for slot_name, value in slots.items():
    response = requests.post(
        f"{BASE_URL}/conversation/{session_id}/slot",
        params={"slot_name": slot_name, "value": value}
    )
    print(f"Set {slot_name}: {response.json()}")

# Get summary
summary_response = requests.get(f"{BASE_URL}/conversation/{session_id}/summary")
print("\nSummary:", summary_response.json())

# Get final output
output_response = requests.get(f"{BASE_URL}/conversation/{session_id}/output")
output = output_response.json()
print("\nFinal Output:")
print(json.dumps(output, indent=2))

# Clean up
requests.delete(f"{BASE_URL}/conversation/{session_id}")
```

---

## Testing

Run the test suite to validate all endpoints:

```bash
cd backend
python test_api_prompting.py
```

This will:
1. Test health check
2. Test HCP listing
3. Test HCP lookup (exact, partial, case-insensitive, invalid)
4. Test complete conversation flow
5. Test missing slots handling
6. Test invalid HCP handling
7. Clean up test sessions

---

## Error Codes

| Code | Description |
|------|-------------|
| 200  | Success |
| 400  | Bad request (e.g., invalid HCP name, missing required slots) |
| 404  | Session not found |
| 500  | Internal server error |

---

## Integration with Voice Session

The conversation session should be linked with the Nova Sonic voice session:

```python
# 1. Start voice session
voice_response = requests.post(f"{BASE_URL}/session/start")
voice_session_id = voice_response.json()["session_id"]

# 2. Use same ID for conversation session
conv_session_id = voice_session_id

# 3. As voice transcripts come in, extract slot values
# (This would typically be done by the backend automatically)

# 4. Get final output when conversation is complete
output = requests.get(f"{BASE_URL}/conversation/{conv_session_id}/output")
```

---

## Next Steps

1. **Automatic Slot Extraction**: Integrate NLU to automatically extract slot values from conversation transcripts
2. **Confirmation Strategy**: Implement explicit confirmation for each slot
3. **Multi-turn Clarification**: Handle ambiguous inputs with follow-up questions
4. **CRM Integration**: Automatically push completed records to Veeva CRM
5. **Persistence**: Store sessions in Redis or database for durability
6. **Analytics**: Track completion rates, average conversation time, etc.

---

## References

- [PROMPTING_GUIDE.md](./app/PROMPTING_GUIDE.md) - Detailed guide on using the prompting module
- [Agent-683 Specification](#) - Original requirements specification
- [Veeva CRM API Documentation](#) - CRM integration details

