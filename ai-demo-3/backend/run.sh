#!/bin/bash
# Startup script for AI Demo 3 Backend

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "======================================"
echo "AI Demo 3 - Backend Startup"
echo "======================================"
echo

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source .venv/bin/activate

# Check if dependencies are installed
if [ ! -f ".venv/installed" ]; then
    echo "Installing dependencies..."
    pip install --upgrade pip
    pip install -r requirements.txt
    touch .venv/installed
else
    echo "Dependencies already installed"
fi

# Check for .env file
if [ ! -f ".env" ]; then
    echo
    echo "Warning: .env file not found!"
    echo "Please create .env from .env.example and configure AWS credentials"
    echo
    
    if [ -f "../.env.example" ]; then
        echo "Copying .env.example to .env..."
        cp ../.env.example .env
        echo "Please edit .env and add your AWS credentials"
        exit 1
    fi
fi

# Check AWS credentials
if [ -z "$AWS_ACCESS_KEY_ID" ] && ! grep -q "AWS_ACCESS_KEY_ID=your-" .env; then
    echo
    echo "Checking AWS credentials..."
    if ! aws sts get-caller-identity &> /dev/null; then
        echo "Warning: AWS credentials not configured"
        echo "Please run 'aws configure' or set AWS credentials in .env"
    else
        echo "✓ AWS credentials configured via AWS CLI"
    fi
fi

echo
echo "Starting FastAPI server..."
echo "API will be available at: http://localhost:8000"
echo "API docs: http://localhost:8000/docs"
echo
echo "Press Ctrl+C to stop"
echo

# Start the server
if [ "$1" = "--reload" ]; then
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
else
    python -m app.main
fi

