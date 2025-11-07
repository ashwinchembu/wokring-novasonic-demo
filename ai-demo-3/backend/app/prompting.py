"""
Prompting & Conversation Policy Module
Implements Agent-683 spec for CRM call recording and slot-filling.
"""
import json
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime

logger = logging.getLogger(__name__)

# ============================================================================
# Agent-683 System Prompt (Verbatim)
# ============================================================================

AGENT_683_SYSTEM_PROMPT = """You are an AI Assistant for a Sales Rep in their CRM platform which is Veeva CRM. You are helping the field sales person execute several tasks like summarizing the interaction with the HCPs or creating a follow-up task after the interaction. For an interaction to be recorded, the HCP name , a date and time , a Product is needed, any additional information is summarized into Call notes.

TOOL USAGE POLICY:
- When the user asks whether an HCP exists or mentions a doctor's name, FIRST invoke the lookupHcpTool with the provided name.
- If the tool returns found=true, use the returned hcp_id and name to populate the interaction record.
- If the tool returns found=false, politely inform the user that the HCP was not found and ask them to verify the name or provide additional details.
- When asked about the current date or time, use the getDateTool to provide accurate information.
- Always wait for tool results before proceeding with the conversation.

PERSISTENCE & EVENT WORKFLOW:
- After slot-filling is complete and you have read back the summary to the user for confirmation, proceed with the following workflow:
  1. Call insertCallTool with the final JSON record to persist the call to the database.
  2. If insertCallTool returns ok=true, immediately call emitN8nEventTool with eventType="call.saved" and include the saved call_pk in the payload.
  3. If the JSON includes a follow-up task (call_follow_up_task.task_type is present), call createFollowUpTaskTool after persistence.
  4. Always run assistant text through guardrails before emitting (this is handled automatically by the system).
- Only perform these tool calls AFTER the user confirms the summary. Do not persist incomplete or unconfirmed data.

When a user provides an HCP name, use the lookupHcpTool to verify the HCP exists and get their ID. In case any of the required information is missing please ask the user for that information using voice conversations until all of the information is complete. Once the user provides all information, summarize it back to them and format it as JSON.

Put all the information into JSON format like as below: { "call_channel": "In-person", "discussion_topic": "", "status": "Saved_vod", "account": "", "id": "", "adverse_event": false, "adverse_event_details": null, "noncompliance_event": false, "noncompliance_description": "", "call_notes": "", "call_date": null, "call_time": null, "product": "", "call_follow_up_task": { "task_type": "", "description": "", "due_date": "", "assigned_to": "" } }"""

# ============================================================================
# HCP Name to ID Mapping
# ============================================================================

HCP_NAME_TO_ID_MAP: Dict[str, str] = {
    "Dr. William Harper": "0013K000013ez2RQAQ",
    "Dr. Susan Carter": "0013K000013ez2SQAQ",
    "Dr. James Lawson": "0013K000013ez2TQAQ",
    "Dr. Emily Hughes": "0013K000013ez2UQAQ",
    "Dr. Richard Thompson": "0013K000013ez2VQAQ",
    "Dr. Sarah Phillips": "0013K000013ez2WQAQ",
    "Dr. John Anderson": "0013K000013ez2XQAQ",
    "Dr. Lisa Collins": "0013K000013ez2YQAQ",
    "Dr. David Harris": "0013K000013ez2ZQAQ",
    "Dr. Amy Scott": "0013K000013ez2aQAA",
    "Dr. Olivia Wells": "0013K000013ez2bQAA",
    "Dr. Benjamin Stone": "0013K000013ez2cQAA",
    "Dr. Grace Mitchell": "0013K000013ez2dQAA",
    "Dr. Lucas Chang": "0013K000013ez2eQAA",
    "Dr. Sophia Patel": "0013K000013ez2fQAA",
    "Dr. Nathan Rivera": "0013K000013ez2gQAA",
}

# Also support case-insensitive lookups
HCP_NAME_TO_ID_MAP_LOWER = {k.lower(): v for k, v in HCP_NAME_TO_ID_MAP.items()}

# ============================================================================
# JSON Schema Template
# ============================================================================

OUTPUT_JSON_SCHEMA = {
    "call_channel": "In-person",
    "discussion_topic": "",
    "status": "Saved_vod",
    "account": "",
    "id": "",
    "adverse_event": False,
    "adverse_event_details": None,
    "noncompliance_event": False,
    "noncompliance_description": "",
    "call_notes": "",
    "call_date": None,
    "call_time": None,
    "product": "",
    "call_follow_up_task": {
        "task_type": "",
        "description": "",
        "due_date": "",
        "assigned_to": ""
    }
}

# ============================================================================
# Required Slots
# ============================================================================

REQUIRED_SLOTS = ["hcp_name", "date", "time", "product"]

# ============================================================================
# Session State Class
# ============================================================================

class ConversationSession:
    """
    Manages conversation state for slot-filling and call recording.
    Tracks required slots, turn transcript, guardrail flags, and output JSON.
    """
    
    def __init__(self, session_id: str):
        """Initialize a new conversation session."""
        self.session_id = session_id
        self.slots: Dict[str, Any] = {
            "hcp_name": None,
            "hcp_id": None,
            "date": None,
            "time": None,
            "product": None,
            "call_notes": "",
            "discussion_topic": "",
            "call_follow_up_task": {
                "task_type": "",
                "description": "",
                "due_date": "",
                "assigned_to": ""
            },
            "adverse_event": False,
            "adverse_event_details": None,
            "noncompliance_event": False,
            "noncompliance_description": "",
        }
        
        # Track conversation turns
        self.transcript: List[Dict[str, str]] = []
        
        # Guardrail flags
        self.guardrail_flags: Dict[str, bool] = {
            "adverse_event_detected": False,
            "noncompliance_detected": False,
            "profanity_detected": False,
        }
        
        # Track which slots have been confirmed
        self.confirmed_slots: set = set()
        
        # Track if summary has been read back
        self.summary_read_back = False
        
        # Final output JSON
        self.output_json: Optional[Dict] = None
        
        logger.info(f"Initialized conversation session: {session_id}")
    
    def add_turn(self, role: str, content: str):
        """Add a conversation turn to the transcript."""
        turn = {
            "role": role,
            "content": content,
            "timestamp": datetime.utcnow().isoformat()
        }
        self.transcript.append(turn)
        logger.debug(f"Added turn: {role} - {content[:50]}...")
    
    def set_slot(self, slot_name: str, value: Any):
        """Set a slot value."""
        if slot_name in self.slots:
            self.slots[slot_name] = value
            logger.info(f"Set slot '{slot_name}': {value}")
        else:
            logger.warning(f"Attempted to set unknown slot: {slot_name}")
    
    def get_slot(self, slot_name: str) -> Any:
        """Get a slot value."""
        return self.slots.get(slot_name)
    
    def confirm_slot(self, slot_name: str):
        """Mark a slot as confirmed."""
        self.confirmed_slots.add(slot_name)
        logger.info(f"Confirmed slot: {slot_name}")
    
    def is_slot_filled(self, slot_name: str) -> bool:
        """Check if a slot has a value."""
        value = self.slots.get(slot_name)
        return value is not None and value != ""
    
    def get_missing_required_slots(self) -> List[str]:
        """Get list of required slots that are not yet filled."""
        missing = []
        for slot in REQUIRED_SLOTS:
            if not self.is_slot_filled(slot):
                missing.append(slot)
        return missing
    
    def all_required_slots_filled(self) -> bool:
        """Check if all required slots are filled."""
        return len(self.get_missing_required_slots()) == 0
    
    def set_guardrail_flag(self, flag_name: str, value: bool):
        """Set a guardrail flag."""
        if flag_name in self.guardrail_flags:
            self.guardrail_flags[flag_name] = value
            logger.warning(f"Guardrail flag set: {flag_name} = {value}")
    
    def generate_summary(self) -> str:
        """Generate a human-readable summary of the collected information."""
        hcp_name = self.slots.get("hcp_name", "Unknown")
        hcp_id = self.slots.get("hcp_id", "Unknown")
        date = self.slots.get("date", "Unknown")
        time = self.slots.get("time", "Unknown")
        product = self.slots.get("product", "Unknown")
        call_notes = self.slots.get("call_notes", "")
        
        summary = (
            f"Let me confirm the details of your call recording. "
            f"You met with {hcp_name}, whose ID is {hcp_id}. "
            f"The meeting was on {date} at {time}. "
            f"You discussed {product}. "
        )
        
        if call_notes:
            summary += f"Your call notes mention: {call_notes}. "
        
        # Add follow-up task if present
        task_type = self.slots.get("call_follow_up_task", {}).get("task_type")
        if task_type:
            task_desc = self.slots.get("call_follow_up_task", {}).get("description", "")
            summary += f"You have a follow-up task: {task_type}. {task_desc}. "
        
        summary += "Is this correct?"
        
        return summary
    
    def generate_output_json(self) -> Dict[str, Any]:
        """Generate the final JSON output in the required format."""
        output = OUTPUT_JSON_SCHEMA.copy()
        
        # Map slots to output JSON fields
        output["account"] = self.slots.get("hcp_name", "")
        output["id"] = self.slots.get("hcp_id", "")
        output["call_date"] = self.slots.get("date")
        output["call_time"] = self.slots.get("time")
        output["product"] = self.slots.get("product", "")
        output["call_notes"] = self.slots.get("call_notes", "")
        output["discussion_topic"] = self.slots.get("discussion_topic", "")
        
        # Guardrail flags
        output["adverse_event"] = self.slots.get("adverse_event", False)
        output["adverse_event_details"] = self.slots.get("adverse_event_details")
        output["noncompliance_event"] = self.slots.get("noncompliance_event", False)
        output["noncompliance_description"] = self.slots.get("noncompliance_description", "")
        
        # Follow-up task
        if self.slots.get("call_follow_up_task"):
            output["call_follow_up_task"] = self.slots["call_follow_up_task"]
        
        self.output_json = output
        logger.info(f"Generated output JSON for session {self.session_id}")
        return output
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert session state to dictionary for serialization."""
        return {
            "session_id": self.session_id,
            "slots": self.slots,
            "transcript": self.transcript,
            "guardrail_flags": self.guardrail_flags,
            "confirmed_slots": list(self.confirmed_slots),
            "summary_read_back": self.summary_read_back,
            "missing_slots": self.get_missing_required_slots(),
            "all_slots_filled": self.all_required_slots_filled(),
            "output_json": self.output_json
        }

# ============================================================================
# Helper Functions
# ============================================================================

def lookup_hcp_id(hcp_name: str) -> Optional[str]:
    """
    Look up HCP ID from name.
    Supports case-insensitive matching and partial matching.
    
    Args:
        hcp_name: The HCP name to lookup
        
    Returns:
        HCP ID if found, None otherwise
    """
    # Exact match (case-insensitive)
    hcp_id = HCP_NAME_TO_ID_MAP_LOWER.get(hcp_name.lower())
    if hcp_id:
        logger.info(f"Found exact match for HCP: {hcp_name} -> {hcp_id}")
        return hcp_id
    
    # Partial match - check if the input is contained in any HCP name
    for name, id_value in HCP_NAME_TO_ID_MAP.items():
        if hcp_name.lower() in name.lower() or name.lower() in hcp_name.lower():
            logger.info(f"Found partial match for HCP: {hcp_name} -> {name} ({id_value})")
            return id_value
    
    logger.warning(f"No HCP ID found for: {hcp_name}")
    return None


def get_hcp_name_from_partial(partial_name: str) -> Optional[str]:
    """
    Get full HCP name from partial match.
    
    Args:
        partial_name: Partial or full HCP name
        
    Returns:
        Full HCP name if found, None otherwise
    """
    # Exact match
    if partial_name in HCP_NAME_TO_ID_MAP:
        return partial_name
    
    # Case-insensitive exact match
    for name in HCP_NAME_TO_ID_MAP.keys():
        if name.lower() == partial_name.lower():
            return name
    
    # Partial match
    for name in HCP_NAME_TO_ID_MAP.keys():
        if partial_name.lower() in name.lower() or name.lower() in partial_name.lower():
            return name
    
    return None


def validate_hcp_name(hcp_name: str) -> tuple[bool, Optional[str], Optional[str]]:
    """
    Validate HCP name and return status.
    
    Args:
        hcp_name: The HCP name to validate
        
    Returns:
        Tuple of (is_valid, full_name, hcp_id)
    """
    full_name = get_hcp_name_from_partial(hcp_name)
    if full_name:
        hcp_id = lookup_hcp_id(full_name)
        return (True, full_name, hcp_id)
    return (False, None, None)


def get_all_hcp_names() -> List[str]:
    """Get list of all valid HCP names."""
    return list(HCP_NAME_TO_ID_MAP.keys())


def format_json_output(output: Dict[str, Any], pretty: bool = True) -> str:
    """
    Format output JSON as string.
    
    Args:
        output: The output dictionary
        pretty: Whether to pretty-print the JSON
        
    Returns:
        JSON string
    """
    if pretty:
        return json.dumps(output, indent=2)
    return json.dumps(output)


def get_next_question(session: ConversationSession) -> Optional[str]:
    """
    Generate the next question to ask based on missing slots.
    
    Args:
        session: The conversation session
        
    Returns:
        Next question to ask, or None if all slots are filled
    """
    missing_slots = session.get_missing_required_slots()
    
    if not missing_slots:
        return None
    
    # Ask for slots in priority order
    slot_questions = {
        "hcp_name": "Could you please tell me the name of the healthcare professional you met with?",
        "date": "What date did this meeting take place?",
        "time": "What time was the meeting?",
        "product": "Which product did you discuss during the meeting?"
    }
    
    # Return the first missing slot's question
    for slot in REQUIRED_SLOTS:
        if slot in missing_slots:
            return slot_questions.get(slot, f"Could you please provide the {slot}?")
    
    return None


def create_session(session_id: str) -> ConversationSession:
    """
    Create a new conversation session.
    
    Args:
        session_id: Unique session identifier
        
    Returns:
        New ConversationSession instance
    """
    return ConversationSession(session_id)


# ============================================================================
# Session Management (In-Memory Store)
# ============================================================================

# In-memory session store (replace with Redis/Database in production)
_sessions: Dict[str, ConversationSession] = {}


def get_or_create_session(session_id: str) -> ConversationSession:
    """Get existing session or create new one."""
    if session_id not in _sessions:
        _sessions[session_id] = ConversationSession(session_id)
    return _sessions[session_id]


def get_session(session_id: str) -> Optional[ConversationSession]:
    """Get existing session."""
    return _sessions.get(session_id)


def delete_session(session_id: str):
    """Delete a session."""
    if session_id in _sessions:
        del _sessions[session_id]
        logger.info(f"Deleted session: {session_id}")


def list_active_sessions() -> List[str]:
    """List all active session IDs."""
    return list(_sessions.keys())

