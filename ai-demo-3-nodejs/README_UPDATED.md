# Nova Sonic API - Node.js Implementation

Multi-turn voice conversations with AWS Bedrock Nova Sonic, featuring **session recovery** for EKS deployments.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the environment template and fill in your AWS credentials:

```bash
cp .env.example .env
nano .env
```

Required variables:
```bash
AWS_ACCESS_KEY_ID=your-access-key-here
AWS_SECRET_ACCESS_KEY=your-secret-key-here
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=amazon.nova-sonic-v1:0
APP_PORT=8001
```

### 3. Build TypeScript

```bash
npm run build
```

### 4. Start Server

```bash
# Development (with hot reload)
npm run dev

# Production
npm start
```

### 5. Test the API

Open in your browser:
```
http://localhost:8001/voice-test-with-recovery.html
```

## ✨ Key Features

### 1. Multi-Turn Conversations with Full Context

Follows the **official AWS Nova Sonic event flow**:
- Conversation history sent on **EVERY turn** before audio input
- Model has complete context for each interaction
- Natural, context-aware responses

### 2. Session Recovery (EKS-Ready)

- Conversation history persisted to **Bedrock Agent Runtime**
- Survives pod restarts and deployments
- Automatic session recovery using `bedrockSessionId`
- Zero data loss in production

### 3. External Session Storage

- No reliance on local in-memory storage
- Session data accessible from any pod
- Horizontal scaling support
- Production-ready for Kubernetes

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   User's Browser                             │
│  - Stores bedrockSessionId in localStorage                  │
│  - Sends bedrockSessionId on reconnect                      │
└────────────────┬────────────────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────────────────┐
│              Express Server (EKS Pod)                        │
│  - Receives bedrockSessionId from client                    │
│  - Loads conversation history from Bedrock                   │
│  - Sends history on EACH turn before audio                  │
│  - Continues conversation with full context                  │
└────────────────┬────────────────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────────────────┐
│        AWS Bedrock Agent Runtime Session Store              │
│  - Persistent storage for conversation history               │
│  - Survives pod restarts                                     │
│  - Accessible from any pod in cluster                        │
└─────────────────────────────────────────────────────────────┘
```

## 📋 Event Flow (Per AWS Documentation)

When user clicks mic button:

1. **sessionStart** (sent once at beginning)
2. **promptStart** (defines output format and tools)
3. **System prompt** (as textInput with role: SYSTEM)
4. **Conversation history** (as TEXT content events) ← **CRITICAL**
5. **New user audio** (as audioInput events)
6. **contentEnd + promptEnd** after user finishes

**Key Insight**: Conversation history must be sent on **EVERY turn** before audio input, not just during initialization.

Reference: [AWS Nova Sonic Input Events](https://docs.aws.amazon.com/nova/latest/userguide/input-events.html)

## 🔧 Implementation Details

### NovaSonicClient (`src/services/novaSonicClient.ts`)

Key methods:

#### `initializeStream()`
- Creates Bedrock session for persistence
- Sends session initialization events
- Starts bidirectional stream

#### `prepareForNextTurn()`
**Called on each turn** (when user clicks mic):
- Completes previous turn (saves transcripts)
- Loads latest history from Bedrock
- **Sends full conversation history as TEXT events**
- Opens new audio content for recording

#### `completeTurn()`
- Saves user and assistant transcripts
- Persists to Bedrock Agent Runtime
- Updates turn counter

#### `loadConversationHistory()`
- Loads history from Bedrock (for recovery)
- Rebuilds in-memory history
- Enables session recovery after pod restart

### BedrockSessionService (`src/services/bedrockSessionService.ts`)

Wraps AWS Bedrock Agent Runtime APIs:

- `createSession()` - Create persistent session
- `createInvocation()` - Create invocation within session
- `putInvocationStep()` - Store conversation turn
- `buildChatHistory()` - Load full history
- `getLatestInvocationId()` - Get latest invocation

## 📡 API Endpoints

### Session Management

#### `POST /session/start`

Start a new session (with optional recovery):

**Request**:
```json
{
  "userId": "user-12345",
  "existingBedrockSessionId": "optional-for-recovery"
}
```

**Response**:
```json
{
  "sessionId": "nova-sonic-session-id",
  "bedrockSessionId": "bedrock-session-id",
  "status": "ACTIVE",
  "createdAt": "2025-11-20T..."
}
```

#### `POST /audio/start`

Start audio recording for a turn:
- Sends conversation history BEFORE audio input
- Opens new audio content

**Request**:
```json
{
  "sessionId": "nova-sonic-session-id"
}
```

#### `POST /audio/chunk`

Send audio data (base64-encoded PCM):

**Request**:
```json
{
  "sessionId": "nova-sonic-session-id",
  "audioData": "base64-encoded-audio"
}
```

#### `POST /audio/end`

End current turn:

**Request**:
```json
{
  "sessionId": "nova-sonic-session-id"
}
```

#### `GET /events/stream/:sessionId`

Server-Sent Events stream for:
- Transcripts (user and assistant)
- Audio responses
- Tool invocations
- Status updates

#### `GET /conversation/:sessionId/history`

Get conversation history:

**Response**:
```json
{
  "sessionId": "...",
  "bedrockSessionId": "...",
  "historyLength": 8,
  "history": [
    {
      "role": "user",
      "text": "I met with Dr. Smith",
      "timestamp": "2025-11-20T..."
    },
    {
      "role": "assistant",
      "text": "Great! Which product did you discuss?",
      "timestamp": "2025-11-20T..."
    }
  ]
}
```

### HCP Management

- `GET /hcp/list` - List all healthcare professionals
- `GET /hcp/lookup?name={name}` - Lookup HCP by name

### Call Recording Analysis

- `POST /api/session/establish` - Create Bedrock session for analysis
- `POST /api/call/analyze` - Analyze call recording (first pass)
- `POST /api/call/fill-missing` - Fill missing details (follow-up)

### Health & Monitoring

- `GET /` - Root endpoint
- `GET /health` - Health check
- `GET /db/healthz` - Database health check

## 🧪 Testing

See [TEST_PLAN.md](./TEST_PLAN.md) for comprehensive testing guide.

### Quick Test

1. Open test page:
   ```
   http://localhost:8001/voice-test-with-recovery.html
   ```

2. Click "Start Session"

3. Have a multi-turn conversation:
   - User: "I met with Dr. Smith"
   - Assistant: "Which product did you discuss?"
   - User: "Aspirin"

4. Restart server:
   ```bash
   Ctrl+C
   npm start
   ```

5. Click "Start Session" again
   - Should show "✅ Session Recovered!"
   - History should be preserved

6. Continue conversation:
   - User: "What did we discuss?"
   - Assistant: "You discussed Aspirin with Dr. Smith" ✅

## 📚 Documentation

- **[SESSION_RECOVERY_GUIDE.md](./SESSION_RECOVERY_GUIDE.md)** - Complete guide on session recovery
- **[IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)** - Implementation details and architecture
- **[TEST_PLAN.md](./TEST_PLAN.md)** - Comprehensive testing guide

## 🔐 IAM Permissions Required

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

## 🚢 Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist ./dist
COPY public ./public
CMD ["node", "dist/index.js"]
```

Build and run:
```bash
docker build -t nova-sonic-api .
docker run -p 8001:8001 --env-file .env nova-sonic-api
```

### Kubernetes (EKS)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nova-sonic-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nova-sonic-api
  template:
    metadata:
      labels:
        app: nova-sonic-api
    spec:
      serviceAccountName: nova-sonic-sa
      containers:
      - name: app
        image: your-ecr-repo/nova-sonic-api:latest
        ports:
        - containerPort: 8001
        env:
        - name: AWS_REGION
          value: "us-east-1"
        - name: BEDROCK_MODEL_ID
          value: "amazon.nova-sonic-v1:0"
        - name: APP_PORT
          value: "8001"
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 1000m
            memory: 1Gi
---
apiVersion: v1
kind: Service
metadata:
  name: nova-sonic-api
spec:
  selector:
    app: nova-sonic-api
  ports:
  - port: 80
    targetPort: 8001
  type: LoadBalancer
```

Deploy:
```bash
kubectl apply -f kubernetes/deployment.yaml
```

## 📊 Monitoring

### Key Metrics

1. **Session Recovery Rate**
   ```typescript
   recoveryRate = recoveredSessions / totalSessions
   ```

2. **History Load Time**
   ```typescript
   loadTime = Date.now() - startTime
   ```

3. **Persistence Success Rate**
   ```typescript
   persistenceRate = successfulPersists / totalPersists
   ```

### CloudWatch Alarms

- Alert if history load time > 2 seconds
- Alert if persistence success rate < 95%
- Alert if session recovery rate < 90%

## 🐛 Troubleshooting

### Issue: "Session not found" after pod restart

**Cause**: Frontend didn't send `existingBedrockSessionId`

**Solution**: Check that `bedrockSessionId` is stored in localStorage

### Issue: "Failed to load conversation history"

**Cause**: Bedrock session expired (default: 24 hours)

**Solution**: Handle gracefully and start new session

### Issue: History not included in LLM response

**Cause**: History not sent before audio input

**Solution**: Ensure `prepareForNextTurn()` is called in `/audio/start`

### Issue: Assistant doesn't remember context

**Check**:
1. Server logs: Are historical turns being sent?
   ```
   📜 Sending conversation history (N turns)
   ```
2. Is `prepareForNextTurn()` being called?
3. Are transcripts being saved via `completeTurn()`?

## 🎯 Benefits

### 1. Correctness
✅ Follows official AWS Nova Sonic event flow  
✅ Model has full context on each turn  
✅ Multi-turn conversations work properly

### 2. Reliability
✅ Conversation survives pod restarts  
✅ Zero data loss during deployments  
✅ External session storage (not in-memory)

### 3. Scalability
✅ Horizontal scaling (multiple pods)  
✅ Load balancer can route to any pod  
✅ Session data accessible from all pods

### 4. User Experience
✅ Seamless conversation continuity  
✅ No need to repeat context  
✅ Feels like single continuous conversation

## 📖 References

- [AWS Nova Sonic Input Events Documentation](https://docs.aws.amazon.com/nova/latest/userguide/input-events.html)
- [AWS Bedrock Agent Runtime API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_Operations_Agents_for_Amazon_Bedrock_Runtime.html)
- [Amazon Nova Sonic Samples](https://github.com/aws-samples/amazon-nova-samples)

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly (see TEST_PLAN.md)
4. Submit a pull request

## 📄 License

MIT

## 🆘 Support

For issues or questions:
- Check [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
- Review [SESSION_RECOVERY_GUIDE.md](./SESSION_RECOVERY_GUIDE.md)
- See [TEST_PLAN.md](./TEST_PLAN.md)

## 🎉 Summary

This implementation provides:

1. ✅ **Correct AWS Nova Sonic event flow** - History sent on EACH turn
2. ✅ **Bedrock Agent Runtime Session Management** - External persistent storage
3. ✅ **Session recovery for EKS** - Survives pod restarts
4. ✅ **Zero reliance on local memory** - All history stored externally
5. ✅ **Production-ready** - Scales horizontally, handles failures gracefully

**Key Insight**: Conversation history must be sent on **every turn** before audio input, following the official AWS Nova Sonic documentation. This ensures the model always has full context for natural, context-aware multi-turn conversations.

