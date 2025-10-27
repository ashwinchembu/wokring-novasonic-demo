# Backend Quick Start Guide

## 🚀 Quick Start (60 seconds)

### 1. Install Dependencies
```bash
cd ai-demo-3/backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure AWS
```bash
# Option A: Use environment variables
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_DEFAULT_REGION=us-east-1

# Option B: Use AWS CLI
aws configure
```

### 3. Start Server
```bash
# Easy way (auto-setup)
./run.sh --reload

# Manual way
uvicorn app.main:app --reload --port 8000
```

### 4. Test It
```bash
# In another terminal
curl http://localhost:8000/health
```

Visit http://localhost:8000/docs for interactive API documentation.

## 📝 Testing Round-Trip

### Python Test Client
```bash
# Install test dependencies
pip install httpx sseclient-py

# Run test
python test_client.py
```

The test will:
1. ✅ Start a Nova Sonic session
2. ✅ Send simulated audio input
3. ✅ Receive and display transcripts
4. ✅ Save audio responses to `output/`
5. ✅ Clean up session

### HTTPie Test
```bash
# Install HTTPie
pip install httpie

# Run test
./test_httpie.sh
```

### Manual cURL Test
```bash
# 1. Start session
SESSION_ID=$(curl -s -X POST http://localhost:8000/session/start \
  -H "Content-Type: application/json" \
  -d '{"system_prompt":"You are a friendly assistant."}' \
  | jq -r '.session_id')

echo "Session: $SESSION_ID"

# 2. Send audio (2KB silence)
AUDIO=$(python3 -c "import base64; print(base64.b64encode(b'\x00' * 2048).decode())")

curl -X POST http://localhost:8000/audio/chunk \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"audio_data\":\"$AUDIO\",\"format\":\"pcm\",\"sample_rate\":16000,\"channels\":1}"

# 3. End audio
curl -X POST http://localhost:8000/audio/end \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\"}"

# 4. Stream events (Ctrl+C to stop)
curl -N http://localhost:8000/events/stream/$SESSION_ID

# 5. End session
curl -X DELETE http://localhost:8000/session/$SESSION_ID
```

## 🎯 Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/session/start` | Start Nova Sonic session |
| POST | `/audio/chunk` | Send audio chunk |
| POST | `/audio/end` | End audio input |
| GET | `/events/stream/{id}` | SSE stream responses |
| WS | `/ws/{id}` | WebSocket streaming |
| DELETE | `/session/{id}` | End session |
| GET | `/health` | Health check |

## 📊 Audio Format

**Input (User Speech)**
- Format: PCM (raw audio)
- Sample Rate: 16 kHz
- Channels: 1 (mono)
- Bit Depth: 16-bit
- Encoding: Base64

**Output (AI Response)**
- Format: PCM (raw audio)
- Sample Rate: 24 kHz
- Channels: 1 (mono)
- Bit Depth: 16-bit
- Encoding: Base64

## 🔧 Configuration

All settings via environment variables or `.env`:

```bash
# AWS (Required)
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_DEFAULT_REGION=us-east-1

# Bedrock
BEDROCK_MODEL_ID=amazon.nova-sonic-v1:0

# App
APP_PORT=8000
LOG_LEVEL=INFO

# Nova Sonic
TEMPERATURE=0.7
MAX_TOKENS=1024
VOICE_ID=matthew
```

## 🐛 Troubleshooting

### "Failed to initialize stream"
- ✅ Check AWS credentials
- ✅ Verify IAM permissions for Bedrock
- ✅ Confirm Nova Sonic model access in your region

### "Session not found"
- ✅ Session may have timed out (default: 5 min)
- ✅ Check session ID is correct
- ✅ Ensure session was created successfully

### "Audio format error"
- ✅ Verify PCM 16kHz mono 16-bit
- ✅ Check base64 encoding
- ✅ No WAV headers (raw PCM only)

### Enable Debug Logging
```bash
export LOG_LEVEL=DEBUG
export DEBUG=true
python -m app.main
```

## 📚 Documentation

- [Full Runbook](../docs/RUNBOOK.md) - Detailed operations guide
- [API Reference](../docs/API.md) - Complete API documentation
- [Schema Docs](../docs/SCHEMA.md) - Data models and schemas
- [Backend README](README.md) - Complete backend documentation

## 🎓 Learning Path

1. **Start here**: Run `./run.sh --reload` and visit `/docs`
2. **Test it**: Run `python test_client.py`
3. **Understand**: Read event flow in [RUNBOOK](../docs/RUNBOOK.md)
4. **Customize**: Modify system prompt in config
5. **Integrate**: Use WebSocket or SSE in your frontend

## 💡 Tips

- Use `--reload` flag for auto-reload during development
- Check `/docs` for interactive API testing
- Enable DEBUG logging to see event details
- Use WebSocket for lowest latency
- SSE is simpler for one-way streaming
- Keep sessions under 5 minutes or update activity

## 🚨 Production Checklist

- [ ] Use IAM roles instead of access keys
- [ ] Set `APP_ENV=production`
- [ ] Enable HTTPS/WSS via reverse proxy
- [ ] Configure proper CORS origins
- [ ] Set up monitoring and alerts
- [ ] Adjust session limits for scale
- [ ] Enable structured logging
- [ ] Regular security updates

## 🔗 Next Steps

- [ ] Run the test client successfully
- [ ] Build a frontend integration
- [ ] Deploy to Kubernetes/Docker
- [ ] Set up monitoring
- [ ] Configure production settings

---

**Ready to start?** Run `./run.sh --reload` and visit http://localhost:8000/docs

