# Session Recovery Guide for EKS Deployments

## Overview

This implementation uses **AWS Bedrock Agent Runtime Session Management APIs** to persist conversation history outside of local memory. This enables:

- ✅ **Session recovery after pod restarts** in EKS/Kubernetes
- ✅ **Conversation continuity** across server crashes
- ✅ **Multi-turn conversations** with full context
- ✅ **Zero data loss** during deployments

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User's Browser                           │
│  - Stores bedrockSessionId in localStorage                  │
│  - Sends bedrockSessionId on reconnect                      │
└────────────────┬────────────────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────────────────┐
│                   Express Server (EKS Pod)                   │
│  - Receives bedrockSessionId from client                    │
│  - Loads conversation history from Bedrock                   │
│  - Continues conversation with full context                  │
└────────────────┬────────────────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────────────────┐
│         AWS Bedrock Agent Runtime Session Store             │
│  - Persistent storage for conversation history               │
│  - Survives pod restarts                                     │
│  - Accessible from any pod                                   │
└─────────────────────────────────────────────────────────────┘
```

### Event Flow on Each Turn

According to [AWS Nova Sonic documentation](https://docs.aws.amazon.com/nova/latest/userguide/input-events.html), the correct event flow is:

1. **sessionStart** (sent once at the beginning)
2. **promptStart** (defines output format and tools)
3. **System prompt** (as textInput with role: SYSTEM)
4. **Conversation history** (as TEXT content events for EACH turn) ← **CRITICAL**
5. **New user audio** (as audioInput events)
6. **contentEnd** + **promptEnd** after user finishes speaking

**Key Insight**: Conversation history must be sent on **EVERY turn** before new audio input, not just once during initialization.

## Implementation Details

### 1. NovaSonicClient (`src/services/novaSonicClient.ts`)

#### Conversation History Storage

```typescript
interface ConversationHistory {
  turns: ConversationTurn[];
  currentTurnNumber: number;
  bedrockSessionId?: string;        // Persistent session ID
  bedrockInvocationId?: string;     // Invocation within session
}
```

#### Key Methods

**`initializeStream()`**
- Creates Bedrock Agent Runtime session
- Sends sessionStart, promptStart, system prompt
- **Sends conversation history (if not first turn)**
- Initializes bidirectional stream

**`prepareForNextTurn()`**
- Called when user clicks mic button again
- Completes previous turn (saves transcripts)
- Loads latest history from Bedrock
- **Sends full conversation history BEFORE audio input**
- Resets audioContentId for new turn

**`completeTurn()`**
- Saves user transcript to history
- Saves assistant transcript to history
- Persists both to Bedrock Agent Runtime
- Increments turn counter

**`persistTurnToBedrock()`**
- Creates invocation (if first turn)
- Stores turn using `PutInvocationStepCommand`
- Conversation survives pod restarts

**`loadConversationHistory()`**
- Loads full history from Bedrock session
- Called during session recovery
- Rebuilds in-memory history from persistent store

### 2. BedrockSessionService (`src/services/bedrockSessionService.ts`)

Wraps AWS Bedrock Agent Runtime APIs:

```typescript
// Create a new session
createSession(userId: string): Promise<string>

// Create invocation within session
createInvocation(sessionId: string): Promise<string>

// Store a conversation turn
putInvocationStep(
  sessionId: string,
  invocationId: string,
  role: 'user' | 'assistant',
  message: string
): Promise<void>

// Load full history
buildChatHistory(sessionId: string, invocationId: string): Promise<ChatHistoryItem[]>

// Get latest invocation
getLatestInvocationId(sessionId: string): Promise<string | null>
```

### 3. Express API Endpoints

#### POST `/session/start`

**Request:**
```json
{
  "userId": "user-12345",
  "existingBedrockSessionId": "bedrock-session-id-from-previous-pod"  // Optional
}
```

**Response:**
```json
{
  "sessionId": "nova-sonic-session-id",
  "bedrockSessionId": "bedrock-session-id",
  "status": "ACTIVE",
  "createdAt": "2025-11-20T..."
}
```

**Behavior:**
- If `existingBedrockSessionId` is provided:
  - Loads conversation history from Bedrock
  - Continues conversation with full context
  - Enables session recovery after pod restart
- If not provided:
  - Creates new Bedrock session
  - Starts fresh conversation

#### POST `/audio/start`

**Request:**
```json
{
  "sessionId": "nova-sonic-session-id"
}
```

**Behavior:**
1. Calls `prepareForNextTurn()`
2. Sends full conversation history as TEXT events
3. Opens new audio content for recording
4. Ready to receive audio chunks

**Key Change**: History is sent on **each turn**, not just once!

#### GET `/conversation/:sessionId/history`

**Response:**
```json
{
  "sessionId": "...",
  "bedrockSessionId": "...",
  "historyLength": 8,
  "history": [
    {
      "role": "user",
      "text": "I met with Dr. Smith today at 2pm",
      "timestamp": "2025-11-20T..."
    },
    {
      "role": "assistant",
      "text": "Great! Let me record that call. Which product did you discuss?",
      "timestamp": "2025-11-20T..."
    },
    ...
  ]
}
```

## Frontend Integration (Session Recovery)

### Step 1: Store Bedrock Session ID

```javascript
let bedrockSessionId = localStorage.getItem('bedrockSessionId');

async function startSession() {
  const requestBody = {
    userId: 'user-12345'
  };

  // If recovering from previous session
  if (bedrockSessionId) {
    requestBody.existingBedrockSessionId = bedrockSessionId;
  }

  const response = await fetch('/session/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  const data = await response.json();
  
  // Store for recovery
  bedrockSessionId = data.bedrockSessionId;
  localStorage.setItem('bedrockSessionId', bedrockSessionId);
  
  console.log('Session started:', data.sessionId);
  console.log('Bedrock session:', data.bedrockSessionId);
  
  if (requestBody.existingBedrockSessionId) {
    console.log('✅ Session recovered with conversation history!');
  }
}
```

### Step 2: Clear Session on Logout

```javascript
function endSession() {
  // Clear local session data
  localStorage.removeItem('bedrockSessionId');
  bedrockSessionId = null;
}
```

### Step 3: Show Recovery Status

```html
<div id="session-status">
  <span id="recovery-indicator" style="display: none;">
    ✅ Session recovered from previous pod
  </span>
</div>
```

```javascript
if (data.historyLength > 0) {
  document.getElementById('recovery-indicator').style.display = 'block';
  console.log(`Loaded ${data.historyLength} turns from history`);
}
```

## Testing Session Recovery

### Test 1: Pod Restart Simulation

1. Start a conversation:
   ```bash
   curl -X POST http://localhost:8001/session/start \
     -H "Content-Type: application/json" \
     -d '{"userId": "test-user"}'
   ```
   
   Save the `bedrockSessionId` from response.

2. Have a multi-turn conversation:
   - User: "I met with Dr. Smith"
   - Assistant: "Which product did you discuss?"
   - User: "Aspirin"

3. Restart the server:
   ```bash
   kill <server-pid>
   npm start
   ```

4. Reconnect with same Bedrock session:
   ```bash
   curl -X POST http://localhost:8001/session/start \
     -H "Content-Type: application/json" \
     -d '{
       "userId": "test-user",
       "existingBedrockSessionId": "BEDROCK_SESSION_ID_FROM_STEP_1"
     }'
   ```

5. Verify history is loaded:
   ```bash
   curl http://localhost:8001/conversation/NEW_SESSION_ID/history
   ```

6. Continue conversation:
   - User: "What did we discuss?"
   - Assistant: "You met with Dr. Smith and discussed Aspirin" ✅

### Test 2: EKS Rolling Update

1. Start conversation in Pod A
2. Save `bedrockSessionId` in localStorage
3. Trigger rolling update (Pod A terminates, Pod B starts)
4. User's browser reconnects to Pod B
5. Frontend sends `existingBedrockSessionId`
6. Pod B loads history from Bedrock
7. Conversation continues seamlessly ✅

## Configuration

### Environment Variables

```bash
# AWS credentials (required)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1

# Bedrock model
BEDROCK_MODEL_ID=amazon.nova-sonic-v1:0

# Session management
SESSION_MAX_CONCURRENT=10
SESSION_TIMEOUT=3600  # 1 hour
```

### IAM Permissions

The EKS pod needs these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModelWithBidirectionalStream",
        "bedrock:InvokeModel"
      ],
      "Resource": "arn:aws:bedrock:*:*:model/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock-agent-runtime:CreateSession",
        "bedrock-agent-runtime:CreateInvocation",
        "bedrock-agent-runtime:PutInvocationStep",
        "bedrock-agent-runtime:ListInvocations",
        "bedrock-agent-runtime:ListInvocationSteps",
        "bedrock-agent-runtime:GetInvocationStep"
      ],
      "Resource": "*"
    }
  ]
}
```

## Benefits

### 1. Resilience
- Conversations survive pod restarts
- Zero data loss during deployments
- Automatic failover in multi-pod deployments

### 2. Scalability
- Session data stored externally (not in pod memory)
- Can scale horizontally without losing sessions
- Load balancer can route to any pod

### 3. User Experience
- Seamless conversation continuity
- No need to repeat context after reconnect
- Feels like a single continuous conversation

### 4. Compliance
- Full conversation audit trail in Bedrock
- Can retrieve historical conversations
- Meets data retention requirements

## Troubleshooting

### Issue: "Session not found" after pod restart

**Cause**: Frontend didn't send `existingBedrockSessionId`

**Solution**:
```javascript
// Always check localStorage for existing session
const bedrockSessionId = localStorage.getItem('bedrockSessionId');
```

### Issue: "Failed to load conversation history"

**Cause**: Bedrock session expired (default: 24 hours)

**Solution**: Handle gracefully:
```typescript
try {
  await client.loadConversationHistory(bedrockSessionId);
} catch (error) {
  logger.warn('History not available, starting fresh');
  // Start new conversation
}
```

### Issue: History not included in LLM response

**Cause**: History not sent before audio input

**Solution**: Ensure `prepareForNextTurn()` is called in `/audio/start`:
```typescript
// Prepare for next turn (sends history automatically)
await client.prepareForNextTurn();

// THEN open audio content
await client.sendAudioContentStartEvent();
```

## Best Practices

### 1. Always Store Bedrock Session ID
```javascript
localStorage.setItem('bedrockSessionId', data.bedrockSessionId);
```

### 2. Handle Expired Sessions
```javascript
if (response.status === 404) {
  // Session expired, start fresh
  localStorage.removeItem('bedrockSessionId');
  await startNewSession();
}
```

### 3. Periodic History Sync
```javascript
// Every 5 turns, reload from Bedrock to stay in sync
if (turnCount % 5 === 0) {
  await client.loadConversationHistory(bedrockSessionId);
}
```

### 4. Graceful Degradation
```javascript
// If Bedrock persistence fails, continue with in-memory only
try {
  await persistTurnToBedrock(turn);
} catch (error) {
  logger.warn('Persistence failed, continuing with in-memory history');
}
```

## Monitoring

### Key Metrics

1. **Session Recovery Rate**
   ```typescript
   const recoveredSessions = totalRecoveredSessions / totalSessions;
   ```

2. **History Load Time**
   ```typescript
   const loadTime = Date.now() - startTime;
   logger.info(`History loaded in ${loadTime}ms`);
   ```

3. **Persistence Success Rate**
   ```typescript
   const persistenceRate = successfulPersists / totalPersists;
   ```

### CloudWatch Alarms

- Alert if history load time > 2 seconds
- Alert if persistence success rate < 95%
- Alert if session recovery rate < 90%

## Conclusion

This implementation fully leverages AWS Bedrock Agent Runtime Session Management APIs to provide:

- ✅ **Persistent conversation history** (survives pod restarts)
- ✅ **Multi-turn conversations** with full context
- ✅ **Session recovery** for EKS deployments
- ✅ **Compliance** with AWS Nova Sonic event flow
- ✅ **Zero reliance** on local in-memory storage

The conversation history is sent on **every turn** before audio input, following the official AWS documentation, ensuring the model always has full context.

