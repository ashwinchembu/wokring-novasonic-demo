# Architecture Documentation

## Overview

This is a Node.js/TypeScript implementation of the AI Demo 3 backend, which provides a FastAPI-like interface for Amazon Bedrock's Nova Sonic model. The application handles bidirectional audio streaming, conversation state management, and CRM integration.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (Browser/App)                     │
└────────────┬────────────────────────────────────────────────────┘
             │
             │ HTTP/SSE/WebSocket
             │
┌────────────▼────────────────────────────────────────────────────┐
│                      Express.js Server                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Route Handlers                        │   │
│  │  • /session/start                                        │   │
│  │  • /audio/chunk                                          │   │
│  │  • /events/stream/:id (SSE)                              │   │
│  │  • /conversation/:id/*                                   │   │
│  │  • /hcp/*                                                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │               Session Manager                            │   │
│  │  • Create/destroy sessions                               │   │
│  │  • Track active streams                                  │   │
│  │  • Cleanup inactive sessions                             │   │
│  └────────────────────┬─────────────────────────────────────┘   │
└─────────────────────────┼─────────────────────────────────────────┘
                          │
                          │ Manages
                          │
┌─────────────────────────▼─────────────────────────────────────────┐
│                    Nova Sonic Client                              │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │              Bidirectional Stream Handler                │    │
│  │  • Input Subject (RxJS) - Send events to Bedrock        │    │
│  │  • Output Subject (RxJS) - Receive events from Bedrock  │    │
│  │  • Audio Subject (RxJS) - Process audio chunks          │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                 Tool Executor                            │    │
│  │  • getDateTool                                           │    │
│  │  • lookupHcpTool                                         │    │
│  │  • insertCallTool                                        │    │
│  │  • emitN8nEventTool                                      │    │
│  │  • createFollowUpTaskTool                                │    │
│  └──────────────────────────────────────────────────────────┘    │
└────────────────────────┬───────────────────────────────────────────┘
                         │
                         │ AWS SDK
                         │
┌────────────────────────▼───────────────────────────────────────────┐
│                   AWS Bedrock Runtime                              │
│  • InvokeModelWithBidirectionalStream API                          │
│  • Model: amazon.nova-sonic-v1:0                                   │
│  • Region-specific endpoint                                        │
└────────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Express Server (`src/index.ts`)

The main entry point that sets up:
- CORS middleware for cross-origin requests
- JSON body parsing
- Route handlers for all API endpoints
- Graceful shutdown handling
- Error handling middleware

### 2. Session Manager (`src/services/sessionManager.ts`)

Manages the lifecycle of Nova Sonic sessions:
- **Creates sessions** with concurrent limit checking
- **Tracks activity** for timeout detection
- **Manages SSE streams** to prevent duplicates
- **Cleanup task** runs every 60 seconds to remove inactive sessions

Key features:
- Concurrent session limiting
- Activity-based timeout
- Graceful shutdown of all sessions

### 3. Nova Sonic Client (`src/services/novaSonicClient.ts`)

The core component that wraps AWS Bedrock bidirectional streaming:

#### Initialization Sequence
1. Create Bedrock client with credentials
2. Send `sessionStart` event with inference config
3. Send `promptStart` event with tool definitions
4. Send system prompt as `textInput`
5. Start response processing loop

#### Event Flow

**Outgoing (to Bedrock):**
- Session start
- Prompt start (with tools)
- System prompt (text content)
- Audio chunks (base64-encoded LPCM)
- Audio content end
- Tool results
- Prompt end
- Session end

**Incoming (from Bedrock):**
- Content start (user/assistant/tool)
- Text output (transcripts)
- Audio output (TTS responses)
- Tool use requests
- Content end
- Errors

#### Tool Execution

When Nova Sonic invokes a tool:
1. Parse `toolUse` event
2. Extract `toolName`, `toolUseId`, and `input`
3. Execute tool handler
4. Send result back with proper event sequence:
   - `contentStart` (role: TOOL)
   - `toolResult` (with result data)
   - `contentEnd`

### 4. Conversation State (`src/prompting.ts`)

Implements the Agent-683 specification for CRM call recording:

#### Slot-Filling Logic
- **Required slots**: `hcp_name`, `date`, `time`, `product`
- **Optional slots**: `call_notes`, `discussion_topic`, `follow_up_task`
- **Derived slots**: `hcp_id` (from name lookup)

#### HCP Lookup
- Static map of HCP names to IDs
- Case-insensitive matching
- Partial name matching
- Can be extended to Redshift lookup

#### Conversation Flow
1. User provides information via voice
2. System fills slots as information is extracted
3. Missing slots trigger follow-up questions
4. Once complete, system generates summary
5. User confirms summary
6. System generates final JSON output
7. Triggers persistence workflow (insert → n8n → task)

### 5. Tool Handlers (`src/tools.ts`)

Implements the business logic for each tool:

#### getDateTool
Returns current date/time for context.

#### lookupHcpTool
Searches for HCP by name in static map (extendable to Redshift).

#### insertCallTool
Persists call record to database (mock implementation - extend with Redshift).

#### emitN8nEventTool
POSTs event to n8n webhook for automation workflows.

#### createFollowUpTaskTool
Creates task in PM/CRM system via n8n.

### 6. Configuration (`src/config.ts`)

Centralized configuration from environment variables:
- AWS credentials and region
- Bedrock model ID and endpoint
- Audio parameters (sample rates, channels, bit depth)
- Session limits and timeouts
- Nova Sonic parameters (temperature, top_p, max_tokens)
- Optional integrations (Redshift, n8n)

## Data Flow

### Audio Streaming Flow

```
Client -> POST /audio/chunk (base64)
         -> SessionManager.getSession()
         -> NovaSonicClient.addAudioChunk()
         -> audioSubject.next()
         -> handleAudioInput()
         -> sendRawEvent(audioInput)
         -> Bedrock
```

### Event Streaming Flow (SSE)

```
Client -> GET /events/stream/:id
       -> SessionManager.markStreamActive()
       -> NovaSonicClient.sendAudioContentStartEvent()
       -> for await (event of client.getEventsStream())
          -> Process event (textOutput, audioOutput, etc.)
          -> res.write(SSE format)
       -> SessionManager.markStreamInactive()
```

### Tool Invocation Flow

```
Bedrock -> toolUse event
        -> NovaSonicClient.handleToolUse()
        -> dispatchToolCall(toolName, input)
        -> toolHandler(input)
        -> result
        -> sendToolResult(toolUseId, result)
        -> contentStart (TOOL) + toolResult + contentEnd
        -> Bedrock
```

## State Management

### Session State (in SessionManager)
- Session ID → NovaSonicClient mapping
- Session ID → SessionInfo (status, timestamps, counters)
- Session ID → Active stream flag

### Conversation State (in prompting module)
- Session ID → ConversationSession mapping
- Stores: slots, transcript, guardrail flags, confirmed slots

## Error Handling

### Connection Errors
- Timeout after 10 seconds on Bedrock connection
- Graceful fallback with error messages

### Stream Errors
- Duplicate stream prevention (409 Conflict)
- Stream cleanup in finally blocks
- Error events sent to client via SSE

### Tool Errors
- Try-catch around tool execution
- Return error object instead of throwing
- Send error result back to Bedrock

## Performance Considerations

### Concurrency
- Configurable max concurrent sessions
- Per-session stream isolation
- Non-blocking I/O throughout

### Memory Management
- Session cleanup based on inactivity
- Completed subjects to release resources
- Proper stream disposal

### Network Optimization
- Base64 encoding for binary audio
- SSE for efficient server→client streaming
- Keep-alive connections

## Extensibility

### Adding New Tools
1. Define tool in `getToolDefinitions()`
2. Implement handler in `tools.ts`
3. Add to dispatcher mapping
4. Tool automatically available to agent

### Database Integration
1. Implement Redshift client
2. Update `handleLookupHcpTool` to query DB
3. Update `handleInsertCallTool` to persist to DB

### Guardrails
1. Create guardrails module (similar to Python version)
2. Check text before sending via SSE
3. Log violations for compliance

## Security Considerations

### AWS Credentials
- Stored in environment variables
- Never logged or exposed via API
- Use IAM roles in production

### Input Validation
- Session ID validation
- Audio data format validation
- Tool input sanitization

### Rate Limiting
- Concurrent session limits
- Per-session timeout enforcement
- Can add rate limiting middleware

## Deployment

### Local Development
```bash
npm run dev  # Uses tsx for hot reload
```

### Production
```bash
npm run build
npm start
```

### Docker (future)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist ./dist
CMD ["node", "dist/index.js"]
```

### Environment Variables
All configuration via `.env` file or environment variables.

## Monitoring & Logging

### Winston Logger
- Structured logging with levels
- Console output in development
- File output in production
- Timestamps and context

### Key Log Points
- Session lifecycle events
- Tool invocations and results
- Stream events
- Errors and warnings

## Comparison to Python Version

| Aspect | Python (FastAPI) | Node.js (Express) |
|--------|------------------|-------------------|
| Framework | FastAPI | Express.js |
| Type Safety | Pydantic | TypeScript |
| Async | asyncio | async/await |
| Streams | Subject (RxJS port) | RxJS |
| AWS SDK | boto3/smithy | AWS SDK v3 |
| SSE | sse-starlette | Manual implementation |
| Logging | Python logging | Winston |
| Config | pydantic-settings | dotenv + custom |

## Future Enhancements

- [ ] WebSocket support (in addition to SSE)
- [ ] Redshift integration
- [ ] Guardrails implementation
- [ ] Authentication/authorization
- [ ] Rate limiting
- [ ] Metrics and monitoring (Prometheus)
- [ ] Docker and Kubernetes deployment configs
- [ ] Load testing and benchmarks
- [ ] Frontend test client
- [ ] API documentation (OpenAPI/Swagger)

