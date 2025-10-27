#!/bin/bash
# Test script using HTTPie for AI Demo 3 API
# Install HTTPie: pip install httpie

set -e

API_URL="${API_URL:-http://localhost:8000}"
SESSION_ID=""

echo "======================================"
echo "AI Demo 3 - HTTPie Test Script"
echo "======================================"
echo

# Check if HTTPie is installed
if ! command -v http &> /dev/null; then
    echo "Error: HTTPie is not installed"
    echo "Install with: pip install httpie"
    exit 1
fi

# 1. Health check
echo "1. Testing health endpoint..."
http GET "$API_URL/health"
echo

# 2. Start session
echo "2. Starting session..."
RESPONSE=$(http POST "$API_URL/session/start" \
  system_prompt="You are a friendly assistant. Keep responses to 2-3 sentences." \
  voice_id="matthew")

SESSION_ID=$(echo "$RESPONSE" | jq -r '.session_id')
echo "Session ID: $SESSION_ID"
echo

# 3. Send simulated audio chunk (base64 encoded silence)
echo "3. Sending audio chunk..."
# Generate 2KB of silence (16-bit samples)
SILENCE=$(python3 -c "import base64; print(base64.b64encode(b'\x00' * 2048).decode())")

http POST "$API_URL/audio/chunk" \
  session_id="$SESSION_ID" \
  audio_data="$SILENCE" \
  format="pcm" \
  sample_rate:=16000 \
  channels:=1
echo

# 4. End audio input
echo "4. Ending audio input..."
http POST "$API_URL/audio/end" session_id="$SESSION_ID"
echo

# 5. Get session info
echo "5. Getting session info..."
http GET "$API_URL/session/$SESSION_ID/info"
echo

# 6. Stream events (in background with timeout)
echo "6. Streaming events (5 second timeout)..."
timeout 5 http --stream GET "$API_URL/events/stream/$SESSION_ID" || true
echo

# 7. End session
echo "7. Ending session..."
http DELETE "$API_URL/session/$SESSION_ID"
echo

echo "======================================"
echo "✓ Test completed!"
echo "======================================"

