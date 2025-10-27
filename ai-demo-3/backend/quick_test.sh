#!/bin/bash
echo "=========================================="
echo "AI Demo 3 - Quick API Test"
echo "=========================================="
echo

echo "1. Health Check"
curl -s http://localhost:8000/health | python3 -m json.tool
echo

echo "2. Root Endpoint"
curl -s http://localhost:8000/ | python3 -m json.tool
echo

echo "3. Start Session"
SESSION_ID=$(curl -s -X POST http://localhost:8000/session/start \
  -H "Content-Type: application/json" \
  -d '{"system_prompt":"You are a friendly assistant."}' \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['session_id'])")

echo "Session ID: $SESSION_ID"
echo

echo "4. Send Audio Chunk"
AUDIO=$(python3 -c "import base64; print(base64.b64encode(b'\x00' * 2048).decode())")

curl -s -X POST http://localhost:8000/audio/chunk \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"audio_data\":\"$AUDIO\",\"format\":\"pcm\",\"sample_rate\":16000,\"channels\":1}" \
  | python3 -m json.tool
echo

echo "5. End Audio"
curl -s -X POST http://localhost:8000/audio/end \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\"}" \
  | python3 -m json.tool
echo

echo "6. Get Session Info"
curl -s http://localhost:8000/session/$SESSION_ID/info | python3 -m json.tool
echo

echo "7. Stream Events (3 seconds)"
timeout 3 curl -N http://localhost:8000/events/stream/$SESSION_ID || true
echo
echo

echo "8. End Session"
curl -s -X DELETE http://localhost:8000/session/$SESSION_ID | python3 -m json.tool
echo

echo "=========================================="
echo "✓ All tests completed!"
echo "=========================================="
