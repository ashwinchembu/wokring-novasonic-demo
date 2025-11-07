"""
Tool Handler Functions
Implements handlers for Bedrock agent tools (HCP lookup, call persistence, n8n events, task creation).
"""
import logging
import json
import httpx
from typing import Dict, Any, Optional
from datetime import datetime

from app.config import settings
from app.redshift import fetch_hcp_by_name, insert_call
from app.prompting import lookup_hcp_id, HCP_NAME_TO_ID_MAP

logger = logging.getLogger(__name__)

# ============================================================================
# Tool Handlers
# ============================================================================

async def handle_lookup_hcp_tool(arguments: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle lookupHcpTool invocation.
    
    Looks up HCP by name, preferring Redshift, falling back to static map.
    
    Args:
        arguments: { "name": "HCP name" }
        
    Returns:
        {
            "found": boolean,
            "hcp_id": string|null,
            "hco_id": string|null,
            "hco_name": string|null,
            "source": "redshift"|"static"|null
        }
    """
    name = arguments.get('name', '').strip()
    
    logger.info(f"🔍 LOOKUP HCP TOOL HANDLER")
    logger.info(f"  - Input name: '{name}'")
    logger.info(f"  - Name length: {len(name)} chars")
    
    if not name or len(name) < 2:
        logger.warning(f"⚠️  Invalid name (too short or empty)")
        return {
            "found": False,
            "hcp_id": None,
            "hco_id": None,
            "hco_name": None,
            "source": None,
            "error": "Name must be at least 2 characters"
        }
    
    # Try Redshift first
    logger.info(f"🗄️  Step 1: Trying Redshift lookup...")
    try:
        redshift_result = await fetch_hcp_by_name(name)
        if redshift_result:
            logger.info(f"✅ FOUND IN REDSHIFT!")
            logger.info(f"  - HCP Name: {redshift_result['name']}")
            logger.info(f"  - HCP ID: {redshift_result['hcp_id']}")
            logger.info(f"  - HCO ID: {redshift_result['hco_id']}")
            logger.info(f"  - HCO Name: {redshift_result['hco_name']}")
            return {
                "found": True,
                "hcp_id": redshift_result['hcp_id'],
                "hco_id": redshift_result['hco_id'],
                "hco_name": redshift_result['hco_name'],
                "source": "redshift"
            }
        else:
            logger.info(f"⚠️  Not found in Redshift")
    except Exception as e:
        logger.warning(f"❌ Redshift lookup failed: {e}")
        logger.info(f"🔄 Falling back to static map...")
    
    # Fall back to static map
    logger.info(f"📋 Step 2: Trying static map lookup...")
    hcp_id = lookup_hcp_id(name)
    if hcp_id:
        # Find the full name from the static map
        full_name = None
        for static_name, static_id in HCP_NAME_TO_ID_MAP.items():
            if static_id == hcp_id:
                full_name = static_name
                break
        
        logger.info(f"✅ FOUND IN STATIC MAP!")
        logger.info(f"  - HCP Name: {full_name}")
        logger.info(f"  - HCP ID: {hcp_id}")
        logger.info(f"  - HCO: (not available in static map)")
        return {
            "found": True,
            "hcp_id": hcp_id,
            "hco_id": None,  # Static map doesn't have HCO info
            "hco_name": None,
            "source": "static"
        }
    
    # Not found
    logger.warning(f"❌ HCP NOT FOUND in either Redshift or static map")
    logger.info(f"  - Searched name: '{name}'")
    return {
        "found": False,
        "hcp_id": None,
        "hco_id": None,
        "hco_name": None,
        "source": None
    }


async def handle_insert_call_tool(arguments: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle insertCallTool invocation.
    
    Persists the final call JSON to Redshift calls table.
    
    Args:
        arguments: { "record": { ...call JSON... } }
        
    Returns:
        { "ok": true, "call_pk": "<new id>" } on success
        { "ok": false, "error": "message" } on failure
    """
    record = arguments.get('record', {})
    
    if not record:
        return {
            "ok": False,
            "error": "No record provided"
        }
    
    logger.info(f"Tool: insertCallTool - persisting call record")
    
    try:
        call_pk = await insert_call(record)
        
        logger.info(f"✅ Call persisted: {call_pk}")
        return {
            "ok": True,
            "call_pk": call_pk
        }
        
    except Exception as e:
        logger.error(f"Failed to insert call: {e}")
        return {
            "ok": False,
            "error": str(e)
        }


async def handle_emit_n8n_event_tool(arguments: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle emitN8nEventTool invocation.
    
    POSTs event to n8n webhook with shared-secret header.
    
    Args:
        arguments: {
            "eventType": "call.saved",
            "payload": { ...event data... }
        }
        
    Returns:
        { "ok": true } on success
        { "ok": false, "error": "message" } on failure
    """
    event_type = arguments.get('eventType', '')
    payload = arguments.get('payload', {})
    
    if not event_type:
        return {
            "ok": False,
            "error": "No eventType provided"
        }
    
    logger.info(f"Tool: emitN8nEventTool - emitting event: {event_type}")
    
    # Check if n8n webhook is configured
    if not settings.n8n_webhook_url:
        logger.warning("n8n webhook URL not configured, skipping event emission")
        return {
            "ok": True,
            "message": "n8n webhook not configured (skipped)"
        }
    
    try:
        # Prepare webhook payload
        webhook_payload = {
            "eventType": event_type,
            "payload": payload,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Prepare headers
        headers = {
            "Content-Type": "application/json"
        }
        
        # Add shared secret if configured
        if settings.n8n_webhook_secret:
            headers["X-N8N-Secret"] = settings.n8n_webhook_secret
        
        # POST to n8n webhook
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                settings.n8n_webhook_url,
                json=webhook_payload,
                headers=headers
            )
            
            response.raise_for_status()
        
        logger.info(f"✅ n8n event emitted: {event_type} (status={response.status_code})")
        return {
            "ok": True,
            "status_code": response.status_code
        }
        
    except httpx.HTTPError as e:
        logger.error(f"Failed to emit n8n event: {e}")
        return {
            "ok": False,
            "error": f"HTTP error: {str(e)}"
        }
    except Exception as e:
        logger.error(f"Failed to emit n8n event: {e}")
        return {
            "ok": False,
            "error": str(e)
        }


async def handle_create_followup_task_tool(arguments: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle createFollowUpTaskTool invocation.
    
    Creates a follow-up task in PM/CRM system.
    
    Args:
        arguments: {
            "task": {
                "task_type": "Email",
                "description": "...",
                "due_date": "2025-11-13",
                "assigned_to": "Sales Rep 1"
            }
        }
        
    Returns:
        { "ok": true, "external_task_id": "..." } on success
        { "ok": false, "error": "message" } on failure
    """
    task = arguments.get('task', {})
    
    if not task or not task.get('task_type'):
        return {
            "ok": False,
            "error": "No task or task_type provided"
        }
    
    logger.info(f"Tool: createFollowUpTaskTool - creating task: {task.get('task_type')}")
    
    # TODO: Integrate with actual PM/CRM API (Asana, Jira, Salesforce, etc.)
    # For now, we'll emit an n8n event that can route to any task system
    
    try:
        # Emit task creation event to n8n
        event_result = await handle_emit_n8n_event_tool({
            "eventType": "task.created",
            "payload": {
                "task": task,
                "created_at": datetime.utcnow().isoformat()
            }
        })
        
        if event_result.get('ok'):
            # Generate a mock external task ID
            # In production, this would come from the PM/CRM API response
            import uuid
            external_task_id = f"TASK_{uuid.uuid4().hex[:8].upper()}"
            
            logger.info(f"✅ Follow-up task created: {external_task_id}")
            return {
                "ok": True,
                "external_task_id": external_task_id
            }
        else:
            return {
                "ok": False,
                "error": f"Failed to emit task event: {event_result.get('error')}"
            }
        
    except Exception as e:
        logger.error(f"Failed to create follow-up task: {e}")
        return {
            "ok": False,
            "error": str(e)
        }


# ============================================================================
# Tool Dispatcher
# ============================================================================

async def dispatch_tool_call(tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    """
    Dispatch a tool call to the appropriate handler.
    
    Args:
        tool_name: Name of the tool to invoke
        arguments: Tool arguments
        
    Returns:
        Tool result dictionary
    """
    logger.info(f"=" * 80)
    logger.info(f"🎯 TOOL DISPATCHER CALLED")
    logger.info(f"  - Tool Name: {tool_name}")
    logger.info(f"  - Arguments: {json.dumps(arguments, indent=4)}")
    logger.info(f"=" * 80)
    
    handlers = {
        "lookupHcpTool": handle_lookup_hcp_tool,
        "insertCallTool": handle_insert_call_tool,
        "emitN8nEventTool": handle_emit_n8n_event_tool,
        "createFollowUpTaskTool": handle_create_followup_task_tool,
    }
    
    handler = handlers.get(tool_name)
    
    if not handler:
        logger.error(f"=" * 80)
        logger.error(f"❌ UNKNOWN TOOL: {tool_name}")
        logger.error(f"  - Available tools: {list(handlers.keys())}")
        logger.error(f"=" * 80)
        return {
            "error": f"Unknown tool: {tool_name}",
            "available_tools": list(handlers.keys())
        }
    
    try:
        logger.info(f"🔀 Calling handler: {handler.__name__}")
        result = await handler(arguments)
        logger.info(f"=" * 80)
        logger.info(f"✅ TOOL HANDLER COMPLETED")
        logger.info(f"  - Tool: {tool_name}")
        logger.info(f"  - Result: {json.dumps(result, indent=4)[:500]}...")
        logger.info(f"=" * 80)
        return result
    except Exception as e:
        logger.error(f"=" * 80)
        logger.error(f"❌ TOOL EXECUTION FAILED")
        logger.error(f"  - Tool: {tool_name}")
        logger.error(f"  - Error: {e}", exc_info=True)
        logger.error(f"=" * 80)
        return {
            "error": f"Tool execution failed: {str(e)}",
            "tool_name": tool_name
        }


# ============================================================================
# Tool Definitions (for promptStart toolConfiguration)
# ============================================================================

def get_tool_definitions() -> list:
    """
    Get tool definitions for Bedrock promptStart toolConfiguration.
    
    Returns:
        List of tool definition dictionaries
    """
    return [
        {
            "name": "lookupHcpTool",
            "description": "Look up HCP by name (prefer Redshift; fall back to static).",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "minLength": 2,
                            "description": "HCP name to search for"
                        }
                    },
                    "required": ["name"]
                }
            }
        },
        {
            "name": "insertCallTool",
            "description": "Persist the final call JSON to Redshift calls table.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "record": {
                            "type": "object",
                            "description": "Complete call record JSON"
                        }
                    },
                    "required": ["record"]
                }
            }
        },
        {
            "name": "emitN8nEventTool",
            "description": "POST the saved calls row + session metadata to an n8n Webhook with a shared-secret header.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "eventType": {
                            "type": "string",
                            "description": "Event type (e.g., 'call.saved', 'call.updated')"
                        },
                        "payload": {
                            "type": "object",
                            "description": "Event payload data"
                        }
                    },
                    "required": ["eventType", "payload"]
                }
            }
        },
        {
            "name": "createFollowUpTaskTool",
            "description": "Create a follow-up task in PM/CRM when call_follow_up_task.task_type is present.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "task": {
                            "type": "object",
                            "description": "Task details (task_type, description, due_date, assigned_to)"
                        }
                    },
                    "required": ["task"]
                }
            }
        }
    ]

