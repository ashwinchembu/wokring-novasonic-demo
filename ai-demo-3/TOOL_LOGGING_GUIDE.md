# Tool Call Logging Guide

This guide explains the extensive tool call logging added to help you debug tool invocations.

## What Changed

Added comprehensive logging with emojis and clear structure to:

1. **`nova_sonic_client.py`** - Tool use event handling and result transmission
2. **`tools.py`** - Tool dispatcher and individual tool handlers

## Log Output Structure

When a tool is called, you'll now see a detailed flow like this:

### 1. Tool Use Event Received (Nova Sonic → Backend)

```
================================================================================
🔧 TOOL USE EVENT RECEIVED
Full toolUse structure: {
  "toolUseId": "abc-123-def-456",
  "toolName": "lookupHcpTool",
  "input": "{\"name\":\"Karina Soto\"}"
}
================================================================================
🔧 TOOL INVOCATION:
  - Tool Name: lookupHcpTool
  - Tool Use ID: abc-123-def-456
  - Tool Input: {
    "name": "Karina Soto"
}
⚙️  Executing tool: lookupHcpTool...
```

### 2. Tool Execution (execute_tool function)

```
⚙️  execute_tool() called
  - Tool: lookupHcpTool
  - Input: {
    "name": "Karina Soto"
}
🔀 Dispatching to tool handler: lookupHcpTool...
```

### 3. Tool Dispatcher (dispatch_tool_call)

```
================================================================================
🎯 TOOL DISPATCHER CALLED
  - Tool Name: lookupHcpTool
  - Arguments: {
    "name": "Karina Soto"
}
================================================================================
🔀 Calling handler: handle_lookup_hcp_tool
```

### 4. Tool Handler Execution (handle_lookup_hcp_tool)

```
🔍 LOOKUP HCP TOOL HANDLER
  - Input name: 'Karina Soto'
  - Name length: 12 chars
🗄️  Step 1: Trying Redshift lookup...
✅ FOUND IN REDSHIFT!
  - HCP Name: Dr. Karina Soto
  - HCP ID: HCP_SOTO
  - HCO ID: HCO_BAYVIEW
  - HCO Name: Bayview Medical Group
```

**OR if not found in Redshift:**

```
⚠️  Not found in Redshift
🔄 Falling back to static map...
📋 Step 2: Trying static map lookup...
✅ FOUND IN STATIC MAP!
  - HCP Name: Dr. William Harper
  - HCP ID: 0013K000013ez2RQAQ
  - HCO: (not available in static map)
```

**OR if not found anywhere:**

```
⚠️  Not found in Redshift
🔄 Falling back to static map...
📋 Step 2: Trying static map lookup...
❌ HCP NOT FOUND in either Redshift or static map
  - Searched name: 'Unknown Doctor'
```

### 5. Tool Dispatcher Return

```
================================================================================
✅ TOOL HANDLER COMPLETED
  - Tool: lookupHcpTool
  - Result: {
    "found": true,
    "hcp_id": "HCP_SOTO",
    "hco_id": "HCO_BAYVIEW",
    "hco_name": "Bayview Medical Group",
    "source": "redshift"
}
================================================================================
```

### 6. Tool Execution Complete (execute_tool return)

```
✅ lookupHcpTool executed successfully
  - Result: {
    "found": true,
    "hcp_id": "HCP_SOTO",
    "hco_id": "HCO_BAYVIEW",
    "hco_name": "Bayview Medical Group",
    "source": "redshift"
}
✅ Tool execution complete!
  - Tool Result: {
    "found": true,
    "hcp_id": "HCP_SOTO",
    "hco_id": "HCO_BAYVIEW",
    "hco_name": "Bayview Medical Group",
    "source": "redshift"
}
================================================================================
```

### 7. Sending Tool Result Back (send_tool_result)

```
📤 Sending tool result back to agent...
📤 send_tool_result() called
  - Tool Use ID: abc-123-def-456
  - Status: success
  - Result Preview: {
    "found": true,
    "hcp_id": "HCP_SOTO",
    ...
}...
📦 Generated content name: xyz-789-abc-012
📤 Step 1: Sending contentStart event for TOOL result...
✅ contentStart sent
📤 Step 2: Sending tool result data...
✅ Tool result data sent (length: 234 chars)
📤 Step 3: Sending contentEnd event...
✅ contentEnd sent
================================================================================
✅ TOOL RESULT FULLY TRANSMITTED
  - Tool Use ID: abc-123-def-456
  - Content Name: xyz-789-abc-012
  - Result Length: 234 chars
  - Result: {"found":true,"hcp_id":"HCP_SOTO",...}...
================================================================================
✅ Tool result sent successfully!
================================================================================
```

## Error Scenarios

### Tool Execution Error

```
❌ Error executing tool lookupHcpTool: Database connection failed
  - Error result: {
    "error": "Database connection failed",
    "tool_name": "lookupHcpTool",
    "tool_input": {
        "name": "Karina Soto"
    }
}
```

### Tool Dispatcher Error

```
================================================================================
❌ TOOL EXECUTION FAILED
  - Tool: lookupHcpTool
  - Error: Database connection timeout
================================================================================
```

### Tool Result Transmission Error

```
================================================================================
❌ ERROR SENDING TOOL RESULT
  - Tool Use ID: abc-123-def-456
  - Error: Stream not active
================================================================================
```

### Unknown Tool

```
================================================================================
❌ UNKNOWN TOOL: someInvalidTool
  - Available tools: ['lookupHcpTool', 'insertCallTool', 'emitN8nEventTool', 'createFollowUpTaskTool']
================================================================================
```

## Emoji Legend

| Emoji | Meaning |
|-------|---------|
| 🔧 | Tool use event |
| ⚙️ | Tool execution |
| 🎯 | Tool dispatcher |
| 🔀 | Routing/dispatching |
| 🔍 | Lookup/search operation |
| 🗄️ | Database operation |
| 📋 | Static map lookup |
| 📤 | Sending data |
| 📦 | Generated ID/content |
| ✅ | Success |
| ⚠️ | Warning |
| ❌ | Error |
| 🔄 | Fallback/retry |

## Log Levels

- **INFO** - Normal operation (all the structured logs above)
- **WARNING** - Non-fatal issues (Redshift fallback, invalid inputs)
- **ERROR** - Fatal issues (tool failures, unknown tools)
- **DEBUG** - Additional detail (not shown above, but available if `LOG_LEVEL=DEBUG`)

## Where to View Logs

### Local Development

```bash
# Tail backend logs
tail -f backend/server.log

# Or if running with uvicorn directly
# Logs will appear in terminal
```

### Kubernetes

```bash
# Stream logs
kubectl logs -f deployment/backend -n ai-demo-3

# View recent logs
kubectl logs deployment/backend -n ai-demo-3 --tail=100
```

### Docker

```bash
docker logs -f ai-demo-3-backend
```

## Filtering Logs

### Show only tool-related logs

```bash
# Linux/Mac
kubectl logs deployment/backend -n ai-demo-3 | grep -E "🔧|⚙️|🎯|📤"

# Or search for specific tool
kubectl logs deployment/backend -n ai-demo-3 | grep "lookupHcpTool"
```

### Show only errors

```bash
kubectl logs deployment/backend -n ai-demo-3 | grep "❌"
```

### Show tool execution flow for a specific tool

```bash
kubectl logs deployment/backend -n ai-demo-3 | grep -A 20 "🔧 TOOL USE EVENT RECEIVED"
```

## Example Full Flow

Here's what you'll see for a complete tool call when asking "is doctor karina soto in the database":

```
[2025-11-06 15:30:00] INFO: Content start: USER
[2025-11-06 15:30:01] INFO: User: is doctor karina soto in the...
[2025-11-06 15:30:01] INFO: Content end
[2025-11-06 15:30:01] INFO: Content start: USER
[2025-11-06 15:30:02] INFO: User: database...
[2025-11-06 15:30:02] INFO: Content end
[2025-11-06 15:30:02] INFO: ================================================================================
[2025-11-06 15:30:02] INFO: 🔧 TOOL USE EVENT RECEIVED
[2025-11-06 15:30:02] INFO: Full toolUse structure: {
  "toolUseId": "tooluse-abc123",
  "toolName": "lookupHcpTool",
  "input": "{\"name\":\"karina soto\"}"
}
[2025-11-06 15:30:02] INFO: ================================================================================
[2025-11-06 15:30:02] INFO: 🔧 TOOL INVOCATION:
[2025-11-06 15:30:02] INFO:   - Tool Name: lookupHcpTool
[2025-11-06 15:30:02] INFO:   - Tool Use ID: tooluse-abc123
[2025-11-06 15:30:02] INFO:   - Tool Input: {
    "name": "karina soto"
}
[2025-11-06 15:30:02] INFO: ⚙️  Executing tool: lookupHcpTool...
[2025-11-06 15:30:02] INFO: ⚙️  execute_tool() called
[2025-11-06 15:30:02] INFO:   - Tool: lookupHcpTool
[2025-11-06 15:30:02] INFO:   - Input: {
    "name": "karina soto"
}
[2025-11-06 15:30:02] INFO: 🔀 Dispatching to tool handler: lookupHcpTool...
[2025-11-06 15:30:02] INFO: ================================================================================
[2025-11-06 15:30:02] INFO: 🎯 TOOL DISPATCHER CALLED
[2025-11-06 15:30:02] INFO:   - Tool Name: lookupHcpTool
[2025-11-06 15:30:02] INFO:   - Arguments: {
    "name": "karina soto"
}
[2025-11-06 15:30:02] INFO: ================================================================================
[2025-11-06 15:30:02] INFO: 🔀 Calling handler: handle_lookup_hcp_tool
[2025-11-06 15:30:02] INFO: 🔍 LOOKUP HCP TOOL HANDLER
[2025-11-06 15:30:02] INFO:   - Input name: 'karina soto'
[2025-11-06 15:30:02] INFO:   - Name length: 12 chars
[2025-11-06 15:30:02] INFO: 🗄️  Step 1: Trying Redshift lookup...
[2025-11-06 15:30:03] INFO: ✅ FOUND IN REDSHIFT!
[2025-11-06 15:30:03] INFO:   - HCP Name: Dr. Karina Soto
[2025-11-06 15:30:03] INFO:   - HCP ID: HCP_SOTO
[2025-11-06 15:30:03] INFO:   - HCO ID: HCO_BAYVIEW
[2025-11-06 15:30:03] INFO:   - HCO Name: Bayview Medical Group
[2025-11-06 15:30:03] INFO: ================================================================================
[2025-11-06 15:30:03] INFO: ✅ TOOL HANDLER COMPLETED
[2025-11-06 15:30:03] INFO:   - Tool: lookupHcpTool
[2025-11-06 15:30:03] INFO:   - Result: {
    "found": true,
    "hcp_id": "HCP_SOTO",
    "hco_id": "HCO_BAYVIEW",
    "hco_name": "Bayview Medical Group",
    "source": "redshift"
}
[2025-11-06 15:30:03] INFO: ================================================================================
[2025-11-06 15:30:03] INFO: ✅ lookupHcpTool executed successfully
[2025-11-06 15:30:03] INFO:   - Result: {
    "found": true,
    "hcp_id": "HCP_SOTO",
    ...
}
[2025-11-06 15:30:03] INFO: ✅ Tool execution complete!
[2025-11-06 15:30:03] INFO:   - Tool Result: {
    "found": true,
    ...
}
[2025-11-06 15:30:03] INFO: ================================================================================
[2025-11-06 15:30:03] INFO: 📤 Sending tool result back to agent...
[2025-11-06 15:30:03] INFO: 📤 send_tool_result() called
[2025-11-06 15:30:03] INFO:   - Tool Use ID: tooluse-abc123
[2025-11-06 15:30:03] INFO:   - Status: success
[2025-11-06 15:30:03] INFO:   - Result Preview: {
    "found": true,
    ...
}
[2025-11-06 15:30:03] INFO: 📦 Generated content name: content-xyz789
[2025-11-06 15:30:03] INFO: 📤 Step 1: Sending contentStart event for TOOL result...
[2025-11-06 15:30:03] INFO: ✅ contentStart sent
[2025-11-06 15:30:03] INFO: 📤 Step 2: Sending tool result data...
[2025-11-06 15:30:03] INFO: ✅ Tool result data sent (length: 156 chars)
[2025-11-06 15:30:03] INFO: 📤 Step 3: Sending contentEnd event...
[2025-11-06 15:30:03] INFO: ✅ contentEnd sent
[2025-11-06 15:30:03] INFO: ================================================================================
[2025-11-06 15:30:03] INFO: ✅ TOOL RESULT FULLY TRANSMITTED
[2025-11-06 15:30:03] INFO:   - Tool Use ID: tooluse-abc123
[2025-11-06 15:30:03] INFO:   - Content Name: content-xyz789
[2025-11-06 15:30:03] INFO:   - Result Length: 156 chars
[2025-11-06 15:30:03] INFO:   - Result: {"found":true,"hcp_id":"HCP_SOTO",...}
[2025-11-06 15:30:03] INFO: ================================================================================
[2025-11-06 15:30:03] INFO: ✅ Tool result sent successfully!
[2025-11-06 15:30:03] INFO: ================================================================================
[2025-11-06 15:30:03] INFO: Content start: TOOL
[2025-11-06 15:30:03] INFO: Content end
[2025-11-06 15:30:04] INFO: Content start: ASSISTANT
[2025-11-06 15:30:05] INFO: Assistant: Yes, Doctor Karina Soto is in our database...
[2025-11-06 15:30:05] INFO: Content end
```

## Troubleshooting with Logs

### Tool not being called

**Look for:** `🔧 TOOL USE EVENT RECEIVED`

**If missing:** Agent didn't invoke the tool. Check:
- Tool definition in `TOOL_DEFINITIONS`
- System prompt includes tool usage instructions
- Agent actually received user query about HCP

### Tool called but no result

**Look for:** 
- `⚙️  execute_tool() called` (should appear)
- `✅ Tool execution complete!` (might be missing)

**If missing completion:** Tool execution failed. Check:
- Error logs: `❌ Error executing tool`
- Tool handler logs: `🔍 LOOKUP HCP TOOL HANDLER`

### Tool executed but agent didn't respond

**Look for:**
- `✅ TOOL RESULT FULLY TRANSMITTED` (should appear)
- `Content start: ASSISTANT` (should follow shortly)

**If missing assistant response:** Tool result not transmitted properly. Check:
- `📤 send_tool_result()` logs
- Any errors in transmission steps

### Redshift lookup failing

**Look for:**
```
🗄️  Step 1: Trying Redshift lookup...
❌ Redshift lookup failed: <error message>
```

**Check:**
- Redshift connection (`curl http://localhost:8000/db/healthz`)
- Schema initialized (`python -c "from app.redshift import init_schema; ..."`)
- Data seeded (`SELECT * FROM hcp;`)

## Next Steps

1. **Restart backend** to pick up the new logging
2. **Test a tool call** (ask "is doctor karina soto in the database")
3. **View logs** using the commands above
4. **Share logs** if you need help debugging

The logs will now clearly show:
- ✅ When each tool is called
- ✅ What arguments were passed
- ✅ Whether Redshift or static map was used
- ✅ What result was returned
- ✅ Whether the result was successfully transmitted to the agent

