# Backend - Python FastAPI Service

This directory contains the Python FastAPI backend service that wraps Amazon Bedrock Nova Sonic streaming capabilities.

## Structure
```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI application entry point
│   ├── config.py            # Configuration management
│   ├── models/              # Pydantic data models
│   │   ├── __init__.py
│   │   └── session.py       # Session-related models
│   ├── services/            # Business logic services
│   │   ├── __init__.py
│   │   ├── nova_sonic_client.py    # Nova Sonic client wrapper
│   │   └── session_manager.py      # Session management
│   └── api/                 # API route handlers (future)
├── requirements.txt         # Python dependencies
├── test_requirements.txt    # Testing dependencies
├── test_client.py          # Python test client
├── test_httpie.sh          # HTTPie test script
└── README.md               # This file
```

## Quick Start

### 1. Installation
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configuration
```bash
# Copy environment template
cp ../.env.example .env

# Edit .env and set your AWS credentials
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_DEFAULT_REGION=us-east-1
```

### 3. Run the Service
```bash
# Development mode (auto-reload)
uvicorn app.main:app --reload --port 8000

# Production mode
python -m app.main
```

The API will be available at `http://localhost:8000`

## API Endpoints

### Session Management
- `POST /session/start` - Start a new Nova Sonic session
- `DELETE /session/{session_id}` - End a session
- `GET /session/{session_id}/info` - Get session information

### Audio Streaming
- `POST /audio/chunk` - Send audio chunk (base64 LPCM 16kHz mono)
- `POST /audio/end` - Signal end of audio input
- `GET /events/stream/{session_id}` - SSE stream for responses
- `WS /ws/{session_id}` - WebSocket for bidirectional streaming

### Health & Info
- `GET /` - Root endpoint
- `GET /health` - Health check

## Event Flow

The backend follows the Nova Sonic event pattern:

1. **Session Initialization**
   - `sessionStart` - Configure inference settings
   - `promptStart` - Set up audio/text output
   - `contentStart` (SYSTEM, TEXT) - Send system prompt
   - `textInput` - System prompt content
   - `contentEnd` - Close system prompt

2. **Audio Input** (per user utterance)
   - `contentStart` (USER, AUDIO) - Begin audio stream
   - `audioInput` (multiple chunks) - Audio data
   - `contentEnd` - End audio stream

3. **Audio Output** (from Nova Sonic)
   - `contentStart` (ASSISTANT) - Begin AI response
   - `textOutput` - Transcript of AI speech
   - `audioOutput` (multiple chunks) - Audio data (24kHz LPCM)
   - `contentEnd` - End AI response

4. **Session Termination**
   - `promptEnd` - Close prompt
   - `sessionEnd` - Terminate session

## Testing

### Python Test Client
```bash
# Install test dependencies
pip install -r test_requirements.txt

# Run test client
python test_client.py

# Health check only
python test_client.py --health
```

### HTTPie Test Script
```bash
# Install HTTPie
pip install httpie

# Run test script
./test_httpie.sh
```

### Manual Testing with cURL

**1. Start a session:**
```bash
SESSION_ID=$(curl -s -X POST http://localhost:8000/session/start \
  -H "Content-Type: application/json" \
  -d '{"system_prompt":"You are a friendly assistant."}' \
  | jq -r '.session_id')

echo "Session ID: $SESSION_ID"
```

**2. Send audio chunk:**
```bash
# Generate base64 silence (2KB)
AUDIO=$(python3 -c "import base64; print(base64.b64encode(b'\x00' * 2048).decode())")

curl -X POST http://localhost:8000/audio/chunk \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$SESSION_ID\",
    \"audio_data\": \"$AUDIO\",
    \"format\": \"pcm\",
    \"sample_rate\": 16000,
    \"channels\": 1
  }"
```

**3. Stream events:**
```bash
curl -N http://localhost:8000/events/stream/$SESSION_ID
```

**4. End session:**
```bash
curl -X DELETE http://localhost:8000/session/$SESSION_ID
```

## Configuration

Configure via environment variables or `.env` file:

```bash
# AWS Configuration
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_DEFAULT_REGION=us-east-1

# Bedrock Configuration
BEDROCK_MODEL_ID=amazon.nova-sonic-v1:0

# Application Configuration
APP_PORT=8000
APP_HOST=0.0.0.0
LOG_LEVEL=INFO

# Audio Configuration (defaults)
INPUT_SAMPLE_RATE=16000
OUTPUT_SAMPLE_RATE=24000
AUDIO_CHANNELS=1
AUDIO_BIT_DEPTH=16

# Session Configuration
MAX_SESSION_DURATION=1800
SESSION_TIMEOUT=300
MAX_CONCURRENT_SESSIONS=100

# Nova Sonic Configuration
MAX_TOKENS=1024
TEMPERATURE=0.7
TOP_P=0.9
VOICE_ID=matthew
```

## Key Features

- **WebSocket support** for real-time bidirectional audio streaming
- **Server-Sent Events (SSE)** for event streaming
- **Session management** with automatic cleanup
- **Graceful cancellation** and reconnection logic
- **Error handling** with proper status codes
- **CORS support** for frontend integration
- **Health checks** and monitoring endpoints
- **Structured logging** with configurable levels

## Audio Format

- **Input**: PCM, 16kHz, mono, 16-bit (base64 encoded)
- **Output**: PCM, 24kHz, mono, 16-bit (base64 encoded)

## System Behavior

Nova Sonic is configured to:
- Keep replies concise (2-3 sentences)
- Support barge-in (user can interrupt)
- Stream audio responses in real-time
- Provide text transcripts alongside audio

## Development

### API Documentation
Once running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### Logging
Set `LOG_LEVEL=DEBUG` for verbose logging including event details.

### Hot Reload
Use `uvicorn app.main:app --reload` for automatic code reloading during development.

## Production Deployment

### Using Docker
```bash
docker build -t ai-demo-3-backend .
docker run -p 8000:8000 --env-file .env ai-demo-3-backend
```

### Using Kubernetes
See `../infra/kubernetes/` for deployment manifests.

### Using Helm
```bash
helm install ai-demo-3-backend ../infra/helm-chart/
```

## Troubleshooting

See the [RUNBOOK](../docs/RUNBOOK.md) for detailed troubleshooting guide.

Common issues:
- **AWS credentials**: Set environment variables or use `aws configure`
- **Session timeout**: Increase `SESSION_TIMEOUT` setting
- **Audio format**: Ensure PCM 16kHz mono 16-bit for input
- **CORS errors**: Add your frontend origin to `CORS_ORIGINS`

## Dependencies

Core dependencies:
- `fastapi` - Web framework
- `uvicorn` - ASGI server
- `aws_sdk_bedrock_runtime` - AWS Bedrock SDK
- `rx` - Reactive programming for event handling
- `sse-starlette` - Server-Sent Events support
- `pydantic` - Data validation

## License

See root LICENSE file.

## Support

For detailed documentation, see:
- [API Documentation](../docs/API.md)
- [Runbook](../docs/RUNBOOK.md)
- [Schema Documentation](../docs/SCHEMA.md)

