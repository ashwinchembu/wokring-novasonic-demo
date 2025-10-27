#!/bin/bash
# Start AI Demo 3 Backend with Real Nova Sonic Integration

cd "$(dirname "$0")"

echo "=========================================="
echo "AI Demo 3 - Real Nova Sonic Server"
echo "=========================================="
echo

# Export AWS credentials from AWS CLI config
export AWS_ACCESS_KEY_ID=$(aws configure get aws_access_key_id)
export AWS_SECRET_ACCESS_KEY=$(aws configure get aws_secret_access_key)
export AWS_DEFAULT_REGION=$(aws configure get region || echo "us-east-1")

if [ -z "$AWS_ACCESS_KEY_ID" ]; then
    echo "ERROR: AWS credentials not found!"
    echo "Please run: aws configure"
    exit 1
fi

echo "✓ AWS credentials loaded"
echo "✓ Region: $AWS_DEFAULT_REGION"
echo

# Kill any existing server
if [ -f server.pid ]; then
    OLD_PID=$(cat server.pid)
    if kill -0 $OLD_PID 2>/dev/null; then
        echo "Stopping existing server (PID: $OLD_PID)..."
        kill $OLD_PID
        sleep 2
    fi
fi

# Activate venv and start server
echo "Starting Nova Sonic server..."
source .venv312/bin/activate
python -m app.main > server.log 2>&1 &
echo $! > server.pid

echo
echo "=========================================="
echo "✅ Server Started!"
echo "=========================================="
echo "PID: $(cat server.pid)"
echo "API: http://localhost:8000"
echo "Test Page: http://localhost:8000/test-v2"
echo "Logs: tail -f server.log"
echo
echo "To stop: kill \$(cat server.pid)"
echo "=========================================="

