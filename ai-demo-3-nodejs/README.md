# Nova Sonic Voice API

Real-time voice conversation API using AWS Bedrock Nova Sonic with multi-turn history and session recovery.

## Quick Start

```bash
npm install
npm start
```

Server runs on `http://localhost:8000`

## Environment Setup

Create `.env` file:

```env
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
APP_PORT=8000
```

## Key Features

- Real-time bidirectional audio streaming
- Multi-turn conversation with persistent history
- Session recovery (survives pod restarts)
- Automatic database fallback (Redshift → SQLite)

## Architecture

### Streaming Flow

The system uses RxJS Subjects for managing async streams:

**Subject**: Observable that can push values to multiple subscribers
**queueSignal**: Subject that signals when new events are ready to send
**closeSignal**: Subject that signals when stream should close

**How it works:**
1. Events are queued: `queue.push(event)`
2. Signal is fired: `queueSignal.next()`
3. Drain loop picks it up and sends to Bedrock
4. When done: `closeSignal.next()` terminates stream

### Session Persistence

Conversation history is stored in Bedrock Agent Runtime:
- Each session has a `bedrockSessionId`
- Turns are saved as invocation steps
- On reconnect, history is loaded and replayed

This allows sessions to survive EKS pod restarts.

### Multi-Turn Flow with Conversation History

Following AWS Nova Sonic spec:

```
Turn 1:
  → sessionStart
  → promptStart (tools, config)
  → system prompt
  → audio input
  → contentEnd + promptEnd
  ✓ Save: user transcript + assistant transcript
  
Turn 2+:
  → promptStart
  → system prompt
  → conversation history (all prior turns as text):
      "user: hello"
      "assistant: Hi there! How can I help?"
      "user: what's the date"
      "assistant: Today is..."
  → new audio input
  → contentEnd + promptEnd
  ✓ Save: user transcript + assistant transcript
```

**How it works:**
1. After each turn, transcripts are saved to memory
2. On next turn, ALL previous conversation is sent as text
3. Nova Sonic receives full context and can reference prior discussion
4. User can ask "what did I say earlier?" and get accurate responses

History is sent **every turn** before new audio to maintain context.

## API Endpoints

### Session Management
- `POST /session/start` - Start new session (with optional recovery)
- `POST /session/end` - End session
- `GET /session/status` - Get session info

### Audio Streaming
- `POST /audio/start` - Begin audio input
- `POST /audio/chunk` - Send audio data (base64 PCM)
- `POST /audio/end` - Finalize turn and prepare for next

### Database
- `GET /db/healthz` - Check DB status and active source
- `GET /api/calls/history` - Get call records

## Vue.js Frontend (iPad Optimized)

The project includes a Vue.js frontend designed specifically for iPad Safari:

### Using the Vue App

**Production (pre-built):**
```
http://localhost:8000/app
```

**Development (with hot reload):**
```bash
npm run frontend:dev
# Opens at http://localhost:3000 with API proxy
```

**Rebuild:**
```bash
npm run build:frontend
```

### iPad Safari Features
- AudioContext created on user gesture
- Context resume handling for iOS restrictions
- Touch-optimized UI with large tap targets
- Dynamic viewport (`100dvh`) for Safari toolbar
- Safe area insets for notched devices
- PWA-ready with home screen support

See `frontend/README.md` for full details.

## Testing

Visit: `http://localhost:8000/app` (Vue app - **recommended for iPad**)

Or legacy test pages: `http://localhost:8000/voice-test.html`

### Test Conversation History

Try this conversation to verify history is working:

```
Turn 1:
You: "My name is John and I work at ABC company"
Bot: [Responds and acknowledges]

Turn 2:
You: "What did I just tell you?"
Bot: "You told me your name is John and you work at ABC company"
```

If the bot can recall what you said, conversation history is working! ✅

### Features:
- Real-time voice conversation
- Conversation history preserved across turns
- Tool calling (HCP lookup, dates, etc.)
- Audio transcription
- Multi-turn context

## Database Fallback

Tries Redshift first, falls back to local SQLite automatically.

Status: `GET /db/healthz`

Force SQLite: `POST /db/force-sqlite`

Retry Redshift: `POST /db/retry-redshift`

## Debugging

Logs: `tail -f server.log`

Check session: `GET /session/status?sessionId=<id>`

## Project Structure

```
├── src/                        # Backend (Node.js/Express)
│   ├── index.js                # Main Express server
│   ├── config.js               # Environment config
│   ├── databaseAdapter.js      # DB fallback logic
│   ├── services/
│   │   ├── novaSonicClient.js  # Bedrock streaming client
│   │   ├── sessionManager.js   # Session lifecycle
│   │   └── bedrockSessionService.js
│   └── models/
│       └── session.js          # Session data types
│
├── frontend/                   # Vue.js frontend
│   ├── src/
│   │   ├── App.vue             # Main app with voice logic
│   │   └── components/
│   │       ├── StatusBadge.vue
│   │       ├── AudioVisualizer.vue
│   │       ├── TranscriptBox.vue
│   │       └── ToolLog.vue
│   ├── vite.config.js          # Build config
│   └── package.json
│
└── public/                     # Static files
    ├── vue-app/                # Built Vue app (served at /app)
    └── voice-test.html         # Legacy test pages
```

## Notes

- Audio format: 16-bit PCM, 16kHz, mono
- Max session duration: 30 minutes
- Max concurrent sessions: 100
- History stored externally (Bedrock Agent Runtime)
