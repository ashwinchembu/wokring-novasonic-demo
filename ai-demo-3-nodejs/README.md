# AI Demo 3 - Node.js/TypeScript

Node.js/TypeScript implementation of the Nova Sonic API backend.

## Overview

This is a Node.js port of the Python FastAPI backend that wraps Amazon Bedrock Nova Sonic streaming for CRM call recording and slot-filling conversations.

## Features

- 🎙️ **Bidirectional Audio Streaming** - Real-time speech-to-speech with Nova Sonic
- 🔧 **Tool Integration** - HCP lookup, call persistence, n8n events, task creation
- 📋 **Slot-Filling** - Intelligent conversation state management for CRM recording
- 🛡️ **Guardrails** - Optional compliance checking (configurable)
- 🔄 **Session Management** - Multiple concurrent sessions with timeout handling
- 📡 **SSE Streaming** - Server-Sent Events for frontend integration
- 🔌 **WebSocket Support** - Alternative real-time communication channel

## Technology Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Framework**: Express.js
- **AWS SDK**: @aws-sdk/client-bedrock-runtime
- **Streaming**: RxJS
- **Logging**: Winston

## Quick Start

### Prerequisites

- Node.js 18+ installed
- AWS credentials configured
- Access to Amazon Bedrock Nova Sonic model

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your AWS credentials and configuration
nano .env
```

### Development

```bash
# Run in development mode with hot reload
npm run dev
```

### Production

```bash
# Build TypeScript
npm run build

# Run production server
npm start
```

## Project Structure

```
ai-demo-3-nodejs/
├── src/
│   ├── index.ts              # Express app and routes
│   ├── config.ts             # Configuration and environment
│   ├── services/
│   │   ├── novaSonicClient.ts      # Bedrock Nova Sonic wrapper
│   │   └── sessionManager.ts       # Session lifecycle management
│   ├── models/
│   │   └── session.ts        # TypeScript types and schemas
│   ├── prompting.ts          # Agent-683 system prompt and slot-filling
│   ├── tools.ts              # Tool handlers (HCP lookup, call insert, etc.)
│   ├── logger.ts             # Winston logging configuration
│   └── utils/
│       └── sse.ts            # Server-Sent Events utilities
├── package.json
├── tsconfig.json
└── .env
```

## API Endpoints

### Session Management
- `POST /session/start` - Start a new Nova Sonic session
- `POST /audio/chunk` - Send audio chunk to session
- `POST /audio/end` - Signal end of audio input
- `GET /events/stream/{sessionId}` - SSE stream for responses
- `DELETE /session/{sessionId}` - End a session
- `GET /session/{sessionId}/info` - Get session information

### Conversation State
- `GET /conversation/{sessionId}/state` - Get conversation state
- `POST /conversation/{sessionId}/slot` - Set a slot value
- `GET /conversation/{sessionId}/summary` - Get conversation summary
- `GET /conversation/{sessionId}/output` - Generate final JSON output
- `DELETE /conversation/{sessionId}` - Delete conversation session

### HCP Management
- `GET /hcp/list` - List all valid HCP names
- `GET /hcp/lookup?name={name}` - Lookup HCP by name

### Health & Monitoring
- `GET /` - Root endpoint
- `GET /health` - Health check
- `GET /db/healthz` - Database health check (if Redshift configured)

## Configuration

All configuration is done via environment variables (see `.env.example`).

Key settings:
- **AWS_REGION**: AWS region for Bedrock (default: us-east-1)
- **BEDROCK_MODEL_ID**: Nova Sonic model ID
- **APP_PORT**: Server port (default: 8000)
- **VOICE_ID**: Nova Sonic voice (matthew, ruth, etc.)

## Tool Integration

The agent can use these tools during conversations:

1. **getDateTool** - Get current date/time
2. **lookupHcpTool** - Lookup healthcare professional by name
3. **insertCallTool** - Persist call record to database
4. **emitN8nEventTool** - Send events to n8n webhook
5. **createFollowUpTaskTool** - Create follow-up tasks in CRM

## Development Notes

### Differences from Python Version

- Uses Express.js instead of FastAPI
- TypeScript for type safety
- RxJS for reactive streams
- Winston for structured logging
- Native AWS SDK v3 for JavaScript

### Testing

You can test the API using:
- The included HTML test pages (add to `public/` folder)
- cURL commands
- Postman/Insomnia
- WebSocket clients

## License

MIT

## Support

For issues or questions, please refer to the project documentation or contact the development team.

