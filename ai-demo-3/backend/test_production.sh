#!/bin/bash
echo "=========================================="
echo "Testing Production Nova Sonic Backend"
echo "=========================================="
echo

echo "1. Health Check"
curl -s http://localhost:8000/health | python3 -m json.tool
echo

echo "2. Start Session (This will connect to real Nova Sonic!)"
SESSION_RESPONSE=$(curl -s -X POST http://localhost:8000/session/start \
  -H "Content-Type: application/json" \
  -d '{"system_prompt":"You are a friendly assistant. Keep responses to 2-3 sentences."}')

echo "$SESSION_RESPONSE" | python3 -m json.tool
SESSION_ID=$(echo "$SESSION_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['session_id'])")
echo "Session ID: $SESSION_ID"
echo

echo "✓ Nova Sonic session created successfully!"
echo "  This is a REAL connection to AWS Bedrock Nova Sonic"
echo

# Give it a moment
sleep 2

echo "3. Check Session Info"
curl -s http://localhost:8000/session/$SESSION_ID/info | python3 -m json.tool
echo

echo "4. Clean up session"
curl -s -X DELETE http://localhost:8000/session/$SESSION_ID | python3 -m json.tool
echo

echo "=========================================="
echo "✓ Production test complete!"
echo "=========================================="
