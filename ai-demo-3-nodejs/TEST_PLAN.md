# Test Plan: Nova Sonic Multi-Turn Conversation with Session Recovery

## Prerequisites

### 1. Install Dependencies

```bash
cd /Users/ashwin/zs/wokring-novasonic-demo/ai-demo-3-nodejs
npm install
```

### 2. Configure Environment

Create `.env` file:

```bash
# AWS Credentials
AWS_ACCESS_KEY_ID=your-access-key-here
AWS_SECRET_ACCESS_KEY=your-secret-key-here
AWS_REGION=us-east-1

# Bedrock Model
BEDROCK_MODEL_ID=amazon.nova-sonic-v1:0

# Server Configuration
APP_PORT=8001
APP_HOST=0.0.0.0

# Session Settings
SESSION_MAX_CONCURRENT=10
SESSION_TIMEOUT=3600
```

### 3. Build TypeScript

```bash
npm run build
```

This compiles `src/**/*.ts` to `dist/**/*.js`.

### 4. Start Server

```bash
npm run dev
# or
npm start
```

Expected output:
```
=======================================================================
AI Demo 3 - Nova Sonic API (Node.js)
=======================================================================
Server: http://0.0.0.0:8001
AWS Region: us-east-1
Bedrock Model: amazon.nova-sonic-v1:0
=======================================================================
```

## Test Suite

### Test 1: Basic Multi-Turn Conversation

**Objective**: Verify that conversation history is sent on each turn and the model has context.

**Steps**:

1. Open test page:
   ```
   http://localhost:8001/voice-test-with-recovery.html
   ```

2. Click **"▶️ Start Session"**
   - Verify both session IDs appear in UI
   - Note the Bedrock session ID

3. Click **"🎙️ Start Recording"**

4. Say into your microphone:
   ```
   "I met with Dr. John Anderson"
   ```

5. Click **"⏸️ Stop Recording"**

6. Wait for assistant response (should ask for more details)

7. Click **"🎙️ Start Recording"** again

8. Say:
   ```
   "It was today at 2pm"
   ```

9. Click **"⏸️ Stop Recording"**

10. Wait for assistant response (should ask about product)

11. Click **"🎙️ Start Recording"** again

12. Say:
    ```
    "We discussed Aspirin"
    ```

13. Click **"⏸️ Stop Recording"**

14. Wait for assistant response

15. Click **"🔄 Reload History from Bedrock"**

**Expected Results**:
- ✅ Assistant remembers Dr. John Anderson from turn 1
- ✅ Assistant remembers date/time from turn 2
- ✅ Assistant combines all information for call record
- ✅ History shows all 6 messages (3 user + 3 assistant)
- ✅ Conversation feels natural and contextual

**Verification**:

Check server logs for:
```
📜 Sending conversation history (N turns)
  ↳ Sent history turn: user - "I met with Dr. John Anderson..."
  ↳ Sent history turn: assistant - "Great! Which product..."
✅ Sent N historical turns to Nova Sonic
```

This confirms history is being sent on each turn.

### Test 2: Session Recovery After Server Restart

**Objective**: Verify that conversation survives server restart.

**Steps**:

1. Complete Test 1 (have a multi-turn conversation)

2. Note the **Bedrock Session ID** from the UI (starts with `bedrock-...`)

3. **DO NOT** click "End Session" - keep the page open

4. In terminal, **restart the server**:
   ```bash
   # Find the process ID
   ps aux | grep node

   # Kill the process
   kill <PID>

   # Start server again
   npm start
   ```

5. Back in the browser, click **"▶️ Start Session"**
   - The page should automatically send the stored `bedrockSessionId`
   - Watch for the green "✅ Session Recovered!" banner

6. Click **"🔄 Reload History from Bedrock"**

7. Verify the history shows all previous turns

8. Continue the conversation:
   - Click **"🎙️ Start Recording"**
   - Say: "What did we discuss?"
   - Click **"⏸️ Stop Recording"**

**Expected Results**:
- ✅ Green "Session Recovered!" banner appears
- ✅ History shows all previous turns
- ✅ Assistant remembers previous conversation
- ✅ Assistant correctly answers "You discussed Aspirin with Dr. John Anderson on [date] at 2pm"
- ✅ Zero data loss

**Server Logs**:
```
✅ Session recovered with history from Bedrock: <session-id>
📚 Loading conversation history from Bedrock session: <session-id>
✅ Loaded N turns from Bedrock session
```

### Test 3: Clear Stored Session

**Objective**: Verify that clearing storage starts a fresh conversation.

**Steps**:

1. After completing Test 2, click **"🔄 Clear Stored Session"**

2. Verify:
   - Bedrock Session ID changes to "Not started"
   - History Length shows "0 turns"
   - Conversation History is empty

3. Click **"▶️ Start Session"**

4. Click **"🎙️ Start Recording"**

5. Say: "What did we discuss?"

6. Click **"⏸️ Stop Recording"**

**Expected Results**:
- ✅ No "Session Recovered!" banner
- ✅ Assistant has no memory of previous conversation
- ✅ Assistant asks for clarification or says "I don't have any previous context"
- ✅ Fresh session started

### Test 4: API Testing with cURL

**Objective**: Test the API directly without frontend.

#### 4.1: Create Session

```bash
curl -X POST http://localhost:8001/session/start \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user-123"}' \
  | jq
```

**Expected Response**:
```json
{
  "sessionId": "...",
  "bedrockSessionId": "...",
  "status": "ACTIVE",
  "createdAt": "2025-11-20T..."
}
```

Save the `sessionId` and `bedrockSessionId` for next steps.

#### 4.2: Get Session Info

```bash
curl http://localhost:8001/session/<sessionId>/info | jq
```

**Expected Response**:
```json
{
  "sessionId": "...",
  "bedrockSessionId": "...",
  "status": "ACTIVE",
  "historyLength": 0,
  "createdAt": "...",
  "lastActivity": "..."
}
```

#### 4.3: Simulate Multi-Turn Conversation

Since audio streaming is hard to test via cURL, we'll test the history API:

```bash
# Get current history (should be empty)
curl http://localhost:8001/conversation/<sessionId>/history | jq
```

#### 4.4: Recover Session

```bash
# Start new session with existing Bedrock session ID
curl -X POST http://localhost:8001/session/start \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "existingBedrockSessionId": "<bedrockSessionId-from-step-1>"
  }' \
  | jq
```

**Expected**: Should return new `sessionId` but same `bedrockSessionId`.

### Test 5: Bedrock Session Management API

**Objective**: Test direct Bedrock session operations.

#### 5.1: Establish Bedrock Session

```bash
curl -X POST http://localhost:8001/api/session/establish \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user-456"}' \
  | jq
```

**Expected Response**:
```json
{
  "sessionId": "<bedrock-session-id>",
  "message": "Session established successfully"
}
```

#### 5.2: Analyze Call Recording (First Pass)

```bash
curl -X POST http://localhost:8001/api/call/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "<bedrock-session-id>",
    "input": "I met with Dr. John Anderson today at 2pm to discuss Aspirin"
  }' \
  | jq
```

**Expected Response**:
```json
{
  "callRecordingPayload": {
    "accountName": "Dr. John Anderson",
    "accountId": "0013K000013ez2XQAQ",
    "call_date": "2025-11-20",
    "call_time": "14:00:00",
    "product_description": "Aspirin",
    ...
  },
  "missingInformationEvents": []
}
```

#### 5.3: Fill Missing Details (Follow-up)

```bash
curl -X POST http://localhost:8001/api/call/fill-missing \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "<bedrock-session-id>",
    "input": "The call was about their new oncology program"
  }' \
  | jq
```

This should use the chat history from the previous call.

### Test 6: Load Testing (Optional)

**Objective**: Test concurrent sessions and pod scalability.

```bash
# Install Apache Bench (if not installed)
# macOS: brew install httpd
# Linux: sudo apt-get install apache2-utils

# Run 100 requests with 10 concurrent
ab -n 100 -c 10 -p session_start.json -T application/json \
  http://localhost:8001/session/start
```

**session_start.json**:
```json
{"userId": "load-test-user"}
```

**Expected**:
- ✅ All requests succeed
- ✅ No "Maximum concurrent sessions" errors (if < 10 concurrent)
- ✅ Server remains stable

### Test 7: EKS Simulation (Advanced)

**Objective**: Simulate EKS rolling update with session recovery.

#### Setup

1. Run two instances on different ports:
   ```bash
   # Terminal 1 (Pod A)
   APP_PORT=8001 npm start

   # Terminal 2 (Pod B)
   APP_PORT=8002 npm start
   ```

2. Start conversation on Pod A (port 8001)

3. Have a 3-turn conversation

4. Note the `bedrockSessionId`

5. Kill Pod A:
   ```bash
   # In Terminal 1
   Ctrl+C
   ```

6. In browser, change the URL port from 8001 to 8002

7. Start new session with `existingBedrockSessionId`

**Expected**:
- ✅ Pod B loads history from Bedrock
- ✅ Conversation continues on Pod B
- ✅ No data loss

## Verification Checklist

### Multi-Turn Conversation
- [ ] History sent on each turn (check server logs)
- [ ] Assistant remembers previous context
- [ ] Transcripts properly accumulated
- [ ] History visible in UI

### Session Persistence
- [ ] History persisted to Bedrock after each turn
- [ ] `bedrockSessionId` stored in localStorage
- [ ] History survives server restart
- [ ] API endpoints return correct data

### Session Recovery
- [ ] "Session Recovered!" banner appears
- [ ] Previous conversation history loaded
- [ ] Conversation continues seamlessly
- [ ] No duplicate messages

### Error Handling
- [ ] Graceful handling if Bedrock unavailable
- [ ] Fallback to in-memory if persistence fails
- [ ] Clear error messages in UI
- [ ] Server doesn't crash on errors

### Performance
- [ ] History load time < 2 seconds
- [ ] No memory leaks during long conversations
- [ ] Multiple concurrent sessions work
- [ ] Clean session cleanup

## Troubleshooting

### Issue: "Session not found" error

**Cause**: Session expired or server restarted without recovery.

**Solution**: Click "Clear Stored Session" and start fresh.

### Issue: History not loaded after restart

**Check**:
1. Is `bedrockSessionId` stored in localStorage? (Check browser DevTools → Application → Local Storage)
2. Are server logs showing "Loading conversation history"?
3. Does the Bedrock session still exist? (Check AWS console)

### Issue: Assistant doesn't remember context

**Check**:
1. Server logs: Are historical turns being sent?
   ```
   📜 Sending conversation history (N turns)
   ```
2. Is `prepareForNextTurn()` being called? (Check `/audio/start` endpoint)
3. Are transcripts being saved? (Check `completeTurn()` logs)

### Issue: "Failed to persist turn to Bedrock"

**Causes**:
- IAM permissions missing
- Bedrock service unavailable
- Network issues

**Solution**:
- Check IAM permissions (see IMPLEMENTATION_SUMMARY.md)
- Verify AWS credentials are correct
- Check network connectivity to AWS

## Success Criteria

✅ **All tests pass**  
✅ **Multi-turn conversations work with full context**  
✅ **Session recovery works after server restart**  
✅ **No errors in server logs**  
✅ **UI shows correct information**  
✅ **Conversation history persisted externally**

## Next Steps

After all tests pass:

1. **Deploy to EKS**:
   ```bash
   kubectl apply -f kubernetes/deployment.yaml
   ```

2. **Monitor in production**:
   - CloudWatch logs
   - Session recovery rate
   - History load time
   - Error rates

3. **Add monitoring dashboards**:
   - Session metrics
   - History persistence success rate
   - Recovery success rate

4. **Set up alerts**:
   - Alert if history load time > 2s
   - Alert if persistence rate < 95%
   - Alert if recovery rate < 90%

## Conclusion

This test plan validates:

1. ✅ **Correct event flow** - History sent on each turn
2. ✅ **Session persistence** - Bedrock Agent Runtime APIs
3. ✅ **Session recovery** - Survives pod restarts
4. ✅ **Multi-turn conversations** - Full context maintained
5. ✅ **Production readiness** - Error handling, performance, scalability

If all tests pass, the implementation is ready for production deployment in EKS.

