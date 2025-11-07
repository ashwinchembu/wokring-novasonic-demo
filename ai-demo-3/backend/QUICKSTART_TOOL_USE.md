# Quick Start: Nova Sonic Tool Use

## ✅ Implementation Status

**All code changes complete!** Tool use is fully implemented and ready to test.

## What Was Implemented

### Two Tools Added:
1. **`getDateTool`** - Returns current date/time
2. **`lookupHcpTool`** - Looks up HCP by name (static list, Redshift-ready)

### Changes:
- ✅ Tool definitions in `nova_sonic_client.py`
- ✅ Tool execution handlers (automatic)
- ✅ System prompt updated with tool policy
- ✅ SSE stream emits tool events to frontend
- ✅ Test suite (`test_tools.py`)
- ✅ Guardrails integration maintained

## Quick Start (3 Steps)

### Step 1: Install AWS SDK

```bash
cd backend
./install_and_start.sh
```

Or manually:
```bash
pip install aws_sdk_bedrock_runtime>=0.1.0 smithy-aws-core>=0.0.1
```

### Step 2: Start Backend

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Step 3: Test Tool Use

Open: `http://localhost:8000/test-v2`

**Say these to test:**
1. "hello" → normal greeting
2. "record a cp interaction with doctor" → asks for HCP
3. "karina soto" → **🔧 Triggers lookupHcpTool**
4. "is karina soto in your list" → **🔧 Uses lookupHcpTool**
5. "run the date tool" → **🔧 Triggers getDateTool**

## Monitor Tool Calls

Watch backend logs for:
```
INFO - Tool use request: lookupHcpTool (id: abc123)
INFO - Executing tool: lookupHcpTool with input: {'name': 'Karina Soto'}
INFO - lookupHcpTool result for 'Karina Soto': {'found': False, ...}
INFO - Tool result sent for tool_use_id: abc123
```

## Expected Behavior

### User: "karina soto"
→ **Assistant calls lookupHcpTool**  
→ Tool returns `{found: false}` (not in static list)  
→ **Assistant says:** "I couldn't find Karina Soto in the system."

### With Redshift (Production):
→ Tool would return:
```json
{
  "found": true,
  "hcp_id": "HCP_SOTO",
  "hco_id": "HCO_BAYVIEW",
  "hco_name": "Bayview Medical Group",
  "source": "redshift"
}
```

### User: "run the date tool"
→ **Assistant calls getDateTool**  
→ Tool returns: `{date: "2025-11-04", time: "14:00:00", ...}`  
→ **Assistant says:** "The current date is November 4th, 2025..."

## Test Without Running Backend

```bash
cd backend
python test_tools.py
```

Runs offline tests for tool logic, definitions, and system prompt.

## Files Changed

```
app/services/nova_sonic_client.py  (+206 lines) - Tool definitions & handlers
app/prompting.py                   (+11 lines)  - System prompt with tool policy
app/main.py                        (+32 lines)  - SSE tool events
test_tools.py                      (new file)   - Test suite
TOOL_USE_IMPLEMENTATION.md         (new file)   - Full documentation
```

## Troubleshooting

### "ModuleNotFoundError: No module named 'aws_sdk_bedrock_runtime'"
→ Run: `pip install aws_sdk_bedrock_runtime smithy-aws-core`

### Backend won't start
→ Check port 8000 is free: `lsof -i :8000`  
→ Check logs: `tail -f /tmp/backend.log`

### Tool not being called
→ Check system prompt includes "TOOL USAGE POLICY"  
→ Verify tool definitions in `TOOL_DEFINITIONS` array  
→ Check backend logs for "Tool use request"

## Next Steps

1. **Install AWS SDK** (required)
2. **Start backend**
3. **Test with voice** using conversation flow above
4. **Integrate Redshift** for production HCP lookup (see `TOOL_USE_IMPLEMENTATION.md`)

## Documentation

- **Full Implementation Details:** `TOOL_USE_IMPLEMENTATION.md`
- **AWS Tool Use Guide:** https://docs.aws.amazon.com/nova/latest/userguide/speech-tools-use.html
- **Test Script:** `test_tools.py`

---

🎉 **Tool use is ready!** Just install the AWS SDK and start testing.

