# Prompting & Conversation Policy Guide

This guide explains how to use the `prompting.py` module for slot-filling conversations and CRM call recording.

## Overview

The prompting module implements the **Agent-683 specification** for Veeva CRM integration. It provides:

1. **System Prompt**: Pre-defined prompt for CRM call recording assistant
2. **Slot Tracking**: Manages required fields (HCP name, date, time, product)
3. **HCP Lookup**: Maps healthcare professional names to IDs
4. **Session Management**: Tracks conversation state and transcript
5. **JSON Generation**: Produces structured output in required format

## Quick Start

### 1. Import the Module

```python
from app.prompting import (
    AGENT_683_SYSTEM_PROMPT,
    ConversationSession,
    lookup_hcp_id,
    validate_hcp_name,
    get_next_question,
    get_or_create_session
)
```

### 2. Create a Session

```python
# Create or retrieve a conversation session
session = get_or_create_session(session_id="user-123")
```

### 3. Process User Input

```python
# Add user turn to transcript
session.add_turn("USER", "I met with Dr. William Harper")

# Extract and set slots from the conversation
# (This would typically be done by parsing the conversation or using NLU)
session.set_slot("hcp_name", "Dr. William Harper")

# Look up HCP ID
hcp_id = lookup_hcp_id("Dr. William Harper")
if hcp_id:
    session.set_slot("hcp_id", hcp_id)
```

### 4. Check for Missing Slots

```python
# Check what's still needed
missing_slots = session.get_missing_required_slots()
if missing_slots:
    # Generate next question
    next_question = get_next_question(session)
    session.add_turn("ASSISTANT", next_question)
    # Send next_question to user via voice/text
```

### 5. Generate Final Output

```python
# Once all required slots are filled
if session.all_required_slots_filled():
    # Generate summary and read back to user
    summary = session.generate_summary()
    session.add_turn("ASSISTANT", summary)
    
    # Generate final JSON output
    output_json = session.generate_output_json()
    
    # Send to CRM or save to database
    print(json.dumps(output_json, indent=2))
```

## API Integration Example

### WebSocket Handler with Slot Filling

```python
from fastapi import WebSocket
from app.prompting import get_or_create_session, lookup_hcp_id
from app.services.nova_sonic_client import NovaSonicClient

async def handle_voice_conversation(websocket: WebSocket, session_id: str):
    # Get conversation session for slot tracking
    conv_session = get_or_create_session(session_id)
    
    # Initialize Nova Sonic client with Agent-683 prompt
    client = NovaSonicClient()
    await client.initialize_stream()
    
    # Subscribe to Nova Sonic responses
    async for event in client.get_events_stream():
        if 'event' in event:
            # Handle text output (user transcription or assistant response)
            if 'textOutput' in event['event']:
                text = event['event']['textOutput']['content']
                role = event['event']['textOutput'].get('role', 'ASSISTANT')
                
                # Add to transcript
                conv_session.add_turn(role, text)
                
                # TODO: Parse text to extract slot values
                # This could use regex, NLU, or rely on the LLM's structured output
                
            # Handle audio output
            elif 'audioOutput' in event['event']:
                audio_data = event['event']['audioOutput']['content']
                # Send audio to client
                await websocket.send_bytes(audio_data)
        
        # Check if all slots are filled
        if conv_session.all_required_slots_filled() and not conv_session.summary_read_back:
            # Generate and send summary
            summary = conv_session.generate_summary()
            # TODO: Send summary to user for confirmation
            conv_session.summary_read_back = True
```

## Required Slots

The system requires these four slots to be filled:

1. **hcp_name**: Healthcare professional name (e.g., "Dr. William Harper")
2. **date**: Meeting date (e.g., "2025-10-28")
3. **time**: Meeting time (e.g., "14:30")
4. **product**: Product discussed (e.g., "Medication ABC")

## HCP Name Lookup

The module includes 16 pre-configured HCP mappings:

```python
from app.prompting import get_all_hcp_names, lookup_hcp_id

# List all valid HCPs
hcp_names = get_all_hcp_names()

# Look up HCP ID (supports partial matching and case-insensitive)
hcp_id = lookup_hcp_id("Harper")  # Returns "0013K000013ez2RQAQ"
hcp_id = lookup_hcp_id("dr. william harper")  # Same result

# Validate HCP name
is_valid, full_name, hcp_id = validate_hcp_name("Dr. Susan Carter")
if is_valid:
    print(f"Valid HCP: {full_name} ({hcp_id})")
else:
    print("HCP not found - ask user to confirm spelling")
```

## Session State

Each `ConversationSession` maintains:

- **slots**: Dictionary of slot values
- **transcript**: List of conversation turns with timestamps
- **guardrail_flags**: Flags for adverse events, compliance issues
- **confirmed_slots**: Set of slots user has confirmed
- **output_json**: Final JSON output once generated

### Accessing Session State

```python
# Get session state as dictionary
state = session.to_dict()

# Check specific slot
hcp_name = session.get_slot("hcp_name")

# Set guardrail flag
session.set_guardrail_flag("adverse_event_detected", True)
session.set_slot("adverse_event", True)
session.set_slot("adverse_event_details", "Patient reported headache")
```

## Output JSON Format

The final output follows this structure:

```json
{
  "call_channel": "In-person",
  "discussion_topic": "",
  "status": "Saved_vod",
  "account": "Dr. William Harper",
  "id": "0013K000013ez2RQAQ",
  "adverse_event": false,
  "adverse_event_details": null,
  "noncompliance_event": false,
  "noncompliance_description": "",
  "call_notes": "",
  "call_date": "2025-10-28",
  "call_time": "14:30",
  "product": "Medication ABC",
  "call_follow_up_task": {
    "task_type": "",
    "description": "",
    "due_date": "",
    "assigned_to": ""
  }
}
```

## Conversation Flow

1. **Greeting**: Agent introduces itself and asks for first missing slot
2. **Slot Collection**: Agent asks for each missing required slot
3. **Validation**: Agent validates HCP name against known list
4. **Optional Fields**: Agent may ask about call notes, follow-up tasks, etc.
5. **Summary**: Agent reads back collected information for confirmation
6. **JSON Output**: Agent generates final JSON for CRM integration

## Best Practices

### 1. Error Handling

```python
try:
    hcp_id = lookup_hcp_id(user_input)
    if hcp_id is None:
        # Ask user to confirm spelling or choose from list
        available_hcps = get_all_hcp_names()
        # Present options to user
except Exception as e:
    logger.error(f"Error processing HCP lookup: {e}")
```

### 2. Session Cleanup

```python
from app.prompting import delete_session

# After conversation is complete and JSON is sent to CRM
delete_session(session_id)
```

### 3. Partial Slot Updates

```python
# Update additional fields as conversation progresses
session.set_slot("call_notes", "Discussed clinical trial results and efficacy data")
session.set_slot("discussion_topic", "Clinical Research")

# Add follow-up task
session.set_slot("call_follow_up_task", {
    "task_type": "Send Literature",
    "description": "Email clinical study results",
    "due_date": "2025-11-01",
    "assigned_to": "sales_rep@company.com"
})
```

### 4. Guardrails

```python
# If adverse event is mentioned
if "adverse" in user_text.lower() or "side effect" in user_text.lower():
    session.set_guardrail_flag("adverse_event_detected", True)
    session.set_slot("adverse_event", True)
    # Prompt agent to collect details
    next_question = "Can you please provide more details about the adverse event?"
```

## Testing

Run the test suite to verify functionality:

```bash
cd backend
python test_prompting.py
```

This validates:
- HCP lookup (exact, partial, case-insensitive)
- Slot tracking and completion detection
- JSON generation
- Next question logic
- Summary generation

## Integration with Nova Sonic

The `nova_sonic_client.py` automatically uses `AGENT_683_SYSTEM_PROMPT` by default:

```python
from app.services.nova_sonic_client import NovaSonicClient

# Client will use Agent-683 prompt automatically
client = NovaSonicClient()
await client.initialize_stream()

# Or override with custom prompt
client = NovaSonicClient(system_prompt="Custom prompt here")
```

## Future Enhancements

1. **NLU Integration**: Automatically extract slot values from conversation
2. **Entity Recognition**: Detect dates, times, product names from free-form text
3. **Confirmation Strategies**: Implement explicit vs. implicit confirmation
4. **Multi-turn Clarification**: Handle ambiguous inputs better
5. **Database Persistence**: Store sessions in Redis or PostgreSQL
6. **CRM API Integration**: Automatically push completed records to Veeva CRM

## References

- Agent-683 Specification
- amazon-nova-samples/speech-to-speech patterns
- Veeva CRM API Documentation

