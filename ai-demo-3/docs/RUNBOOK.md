# AI Demo 3 - Runbook

## Overview
This document provides operational procedures for the AI Demo 3 application, which implements a voice-enabled interface with Amazon Nova Sonic streaming capabilities.

## Architecture
- **Backend**: Python FastAPI service wrapping Bedrock Nova Sonic streaming
- **Frontend**: Vue.js application with voice UI, transcript display, and JSON "Excel" grid
- **Infrastructure**: Docker containers, Kubernetes manifests, Helm charts

## Prerequisites
- AWS Account with Bedrock access to Nova Sonic model
- Python 3.12+
- AWS CLI configured with appropriate credentials
- Node.js 18+ (for frontend)
- Docker and Kubernetes cluster (for containerized deployment)

## Backend Setup

### Installation
1. Navigate to the backend directory:
   ```bash
   cd ai-demo-3/backend
   ```

2. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### Configuration
1. Copy the environment template:
   ```bash
   cp ../.env.example .env
   ```

2. Edit `.env` and configure your AWS credentials:
   ```bash
   # Required AWS Configuration
   AWS_ACCESS_KEY_ID=your-access-key-here
   AWS_SECRET_ACCESS_KEY=your-secret-key-here
   AWS_DEFAULT_REGION=us-east-1
   
   # Bedrock Configuration
   BEDROCK_MODEL_ID=amazon.nova-sonic-v1:0
   
   # Application Configuration
   APP_PORT=8000
   LOG_LEVEL=INFO
   ```

3. Alternatively, use AWS CLI credentials:
   ```bash
   aws configure
   ```

### Running the Backend

#### Development Mode
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

#### Production Mode
```bash
cd backend
source .venv/bin/activate
python -m app.main
```

The API will be available at `http://localhost:8000`

### API Documentation
Once running, visit:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## API Usage

### 1. Start a Session
```bash
curl -X POST http://localhost:8000/session/start \
  -H "Content-Type: application/json" \
  -d '{
    "system_prompt": "You are a friendly assistant. Keep responses to 2-3 sentences.",
    "voice_id": "matthew"
  }'
```

Response:
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "active",
  "created_at": "2024-01-01T00:00:00"
}
```

### 2. Send Audio Chunks
```bash
# Encode audio to base64 (16kHz LPCM mono)
AUDIO_BASE64=$(base64 -i audio_chunk.raw)

curl -X POST http://localhost:8000/audio/chunk \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$SESSION_ID\",
    \"audio_data\": \"$AUDIO_BASE64\",
    \"format\": \"pcm\",
    \"sample_rate\": 16000,
    \"channels\": 1
  }"
```

### 3. Stream Events (SSE)
```bash
curl -N http://localhost:8000/events/stream/$SESSION_ID
```

This will stream Server-Sent Events containing:
- Text transcripts (user and assistant)
- Audio responses (base64 encoded, 24kHz LPCM mono)
- Content start/end markers

### 4. End Audio Input
```bash
curl -X POST http://localhost:8000/audio/end \
  -H "Content-Type: application/json" \
  -d "{\"session_id\": \"$SESSION_ID\"}"
```

### 5. End Session
```bash
curl -X DELETE http://localhost:8000/session/$SESSION_ID
```

## WebSocket Alternative

For real-time bidirectional streaming, use the WebSocket endpoint:

```javascript
const ws = new WebSocket('ws://localhost:8000/ws/session_id');

// Send audio data
ws.send(JSON.stringify({
  type: 'audio_data',
  data: base64AudioData
}));

// Receive responses
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'audio_response') {
    // Play audio
  } else if (data.type === 'transcript') {
    // Display transcript
  }
};
```

## Testing with Example Script

A test script is provided for round-trip testing:

```bash
cd backend
python test_client.py
```

This script:
1. Starts a session
2. Sends audio chunks (or simulated audio)
3. Receives and displays transcripts
4. Receives and saves audio responses
5. Properly cleans up the session

## Event Flow

The backend follows the Nova Sonic event pattern:

1. **Session Start**
   - `sessionStart` - Initialize session with inference config
   - `promptStart` - Configure audio/text output settings
   - `contentStart` (SYSTEM, TEXT) - Send system prompt
   - `textInput` - System prompt content
   - `contentEnd` - Close system prompt

2. **Audio Input** (per utterance)
   - `contentStart` (USER, AUDIO) - Begin user audio
   - `audioInput` (multiple) - Audio chunks
   - `contentEnd` - End user audio

3. **Audio Output** (from Nova Sonic)
   - `contentStart` (ASSISTANT) - Begin AI response
   - `textOutput` - Transcript of AI speech
   - `audioOutput` (multiple) - Audio chunks
   - `contentEnd` - End AI response

4. **Session End**
   - `promptEnd` - Close prompt
   - `sessionEnd` - Terminate session

## Monitoring

### Health Checks
```bash
curl http://localhost:8000/health
```

### Session Information
```bash
curl http://localhost:8000/session/$SESSION_ID/info
```

### Logs
Logs are written to stdout/stderr. Configure log level via `LOG_LEVEL` environment variable:
- `DEBUG` - Verbose logging including event details
- `INFO` - Standard operational logs
- `WARNING` - Warning messages only
- `ERROR` - Error messages only

### Metrics
- Active sessions count
- Audio bytes sent/received per session
- Session duration
- Error rates

## Troubleshooting

### Common Issues

#### 1. AWS Authentication Errors
**Issue**: `Failed to initialize stream: Unable to locate credentials`

**Solutions**:
- Verify AWS credentials are set in `.env` or via `aws configure`
- Check IAM permissions for Bedrock access
- Ensure credentials have `bedrock:InvokeModelWithBidirectionalStream` permission

#### 2. Audio Format Issues
**Issue**: `Error processing audio: invalid format`

**Solutions**:
- Verify audio is LPCM format, 16kHz, mono, 16-bit for input
- Check base64 encoding is correct
- Ensure no audio headers (raw PCM only)

#### 3. Session Not Found
**Issue**: `404 Session not found`

**Solutions**:
- Session may have timed out (default: 5 minutes inactivity)
- Check session was created successfully
- Verify session ID is correct

#### 4. Maximum Sessions Reached
**Issue**: `429 Maximum concurrent sessions reached`

**Solutions**:
- End unused sessions via DELETE endpoint
- Increase `MAX_CONCURRENT_SESSIONS` in settings
- Implement session cleanup in client

#### 5. WebSocket Connection Issues
**Issue**: WebSocket closes immediately

**Solutions**:
- Check firewall settings
- Verify WebSocket URL scheme (ws:// or wss://)
- Check for proxy interference
- Enable CORS for your origin

### Debug Mode
Enable debug logging:
```bash
export LOG_LEVEL=DEBUG
export DEBUG=true
```

## Performance Tuning

### Session Management
- Default timeout: 5 minutes of inactivity
- Max concurrent sessions: 100
- Cleanup runs every 60 seconds

Adjust in `app/config.py`:
```python
session_timeout: int = 300  # seconds
max_concurrent_sessions: int = 100
```

### Audio Configuration
- Input: 16kHz LPCM mono 16-bit
- Output: 24kHz LPCM mono 16-bit
- Recommended chunk size: 512-2048 bytes

### Resource Requirements
- CPU: 2+ cores recommended
- Memory: 512MB + (50MB per active session)
- Network: Low latency connection to AWS region

## Production Deployment

### Environment Variables
Set production values:
```bash
APP_ENV=production
LOG_LEVEL=INFO
DEBUG=false
MAX_CONCURRENT_SESSIONS=1000
SESSION_TIMEOUT=300
```

### HTTPS/WSS
Use a reverse proxy (nginx, Caddy) for TLS termination:
```nginx
location /ws/ {
    proxy_pass http://localhost:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

### Monitoring
- Set up Prometheus metrics endpoint
- Configure health check monitoring
- Enable structured logging for log aggregation
- Set up alerts for error rates and latency

## Security Considerations
- Never commit AWS credentials to version control
- Use IAM roles when running on AWS infrastructure
- Implement rate limiting for public endpoints
- Enable HTTPS in production
- Validate and sanitize all inputs
- Set appropriate CORS policies
- Regular security updates for dependencies

## Support
For issues and questions:
1. Check this runbook first
2. Review application logs with DEBUG level
3. Test with example script
4. Consult AWS Bedrock documentation
5. Check Nova Sonic model availability in your region

## Emergency Procedures

### Service Restart
```bash
# Find process
ps aux | grep uvicorn

# Kill gracefully
kill -SIGTERM <PID>

# Restart
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Force Close All Sessions
```python
# In Python shell or script
from app.services.session_manager import session_manager
await session_manager.shutdown()
```

### Rollback
```bash
git checkout previous-stable-version
pip install -r requirements.txt
systemctl restart ai-demo-3-backend
```

