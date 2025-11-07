# Quick Start Guide - AI Demo 3 Node.js

Get up and running in minutes!

## Prerequisites

- **Node.js 18+** installed ([Download](https://nodejs.org))
- **AWS Credentials** with Bedrock access
- **Bedrock Model Access** - Ensure `amazon.nova-sonic-v1:0` is enabled in your AWS account

## Step 1: Install Dependencies

```bash
cd ai-demo-3-nodejs
npm install
```

## Step 2: Configure Environment

Create a `.env` file (copy from example, but can't be done programmatically due to gitignore):

```bash
# Manually create .env with these required variables:

AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_REGION=us-east-1

BEDROCK_MODEL_ID=amazon.nova-sonic-v1:0

APP_PORT=8000
APP_HOST=0.0.0.0
LOG_LEVEL=info
```

**Required fields:**
- `AWS_ACCESS_KEY_ID` - Your AWS access key
- `AWS_SECRET_ACCESS_KEY` - Your AWS secret key
- `AWS_REGION` - AWS region (must have Bedrock access)

**Optional fields:**
- `BEDROCK_ENDPOINT_URL` - Custom Bedrock endpoint (leave blank for default)
- `REDSHIFT_HOST` - Redshift host for database integration
- `N8N_WEBHOOK_URL` - n8n webhook for automation
- See `.env.example` for all options

## Step 3: Run the Server

### Development Mode (with hot reload)

```bash
npm run dev
```

### Production Mode

```bash
# Build TypeScript
npm run build

# Run compiled JavaScript
npm start
```

### Using the start script

```bash
chmod +x start.sh
./start.sh
```

## Step 4: Test the API

### Health Check

```bash
curl http://localhost:8000/health
```

### Start a Session

```bash
curl -X POST http://localhost:8000/session/start \
  -H "Content-Type: application/json" \
  -d '{}'
```

Response:
```json
{
  "sessionId": "uuid-here",
  "status": "active",
  "createdAt": "2025-11-07T..."
}
```

### List HCPs

```bash
curl http://localhost:8000/hcp/list
```

### Send Audio Chunk

```bash
curl -X POST http://localhost:8000/audio/chunk \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "your-session-id",
    "audioData": "base64-encoded-pcm-audio"
  }'
```

### Stream Events (SSE)

Open in browser or use curl:
```bash
curl -N http://localhost:8000/events/stream/your-session-id
```

## API Endpoints Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Root info |
| `/health` | GET | Health check |
| `/session/start` | POST | Start new session |
| `/audio/chunk` | POST | Send audio data |
| `/audio/end` | POST | End audio input |
| `/events/stream/:sessionId` | GET | SSE stream for responses |
| `/session/:sessionId` | DELETE | End session |
| `/conversation/:sessionId/state` | GET | Get conversation state |
| `/hcp/list` | GET | List all HCPs |
| `/hcp/lookup?name=Dr...` | GET | Lookup HCP by name |

## Testing with a Client

You can test the streaming API with:

1. **Web Browser** - Create an HTML page with EventSource API
2. **Postman** - Use Server-Sent Events support
3. **Python Client** - Use `requests` with stream=True
4. **Node.js Client** - Use `EventSource` package

## Troubleshooting

### "Failed to connect to Bedrock"

- Check AWS credentials are correct
- Verify region has Bedrock access
- Ensure Nova Sonic model is enabled in your AWS account
- Check network connectivity to AWS

### "Maximum concurrent sessions reached"

- Increase `MAX_CONCURRENT_SESSIONS` in `.env`
- Or wait for inactive sessions to timeout

### Audio not working

- Ensure audio format is LPCM 16kHz mono 16-bit
- Audio data must be base64 encoded
- Check sample rate matches configuration

### Logs show errors

- Check log level: `LOG_LEVEL=debug` for verbose output
- Review Winston logs in console
- Check AWS CloudWatch for Bedrock errors

## Next Steps

- Read the full [README.md](./README.md) for architecture details
- Explore the [source code](./src/) to understand the implementation
- Add database integration (Redshift)
- Add guardrails for compliance checking
- Deploy to production (Docker, Kubernetes, etc.)

## Support

For issues or questions:
- Review the code documentation
- Check AWS Bedrock documentation
- Review Nova Sonic API reference

Happy coding! 🚀

