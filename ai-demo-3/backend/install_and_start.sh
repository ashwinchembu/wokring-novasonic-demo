#!/bin/bash
# Quick setup script for Nova Sonic backend with tool use support

set -e

echo "=========================================="
echo "Nova Sonic Backend - Tool Use Setup"
echo "=========================================="
echo

# Navigate to backend directory
cd "$(dirname "$0")"

echo "✓ Current directory: $(pwd)"
echo

# Check Python version
echo "Checking Python version..."
python --version
echo

# Install AWS Bedrock SDK
echo "Installing AWS Bedrock SDK..."
echo "This may take a few minutes..."
echo

pip install aws_sdk_bedrock_runtime>=0.1.0 smithy-aws-core>=0.0.1 --quiet

echo "✓ AWS SDK installed"
echo

# Verify installation
echo "Verifying AWS SDK installation..."
python -c "import aws_sdk_bedrock_runtime; print('✓ aws_sdk_bedrock_runtime imported successfully')"
python -c "import smithy_aws_core; print('✓ smithy_aws_core imported successfully')"
echo

# Check if other dependencies are installed
echo "Checking other dependencies..."
python -c "import fastapi; print('✓ fastapi')" 2>/dev/null || echo "⚠  fastapi not found - run: pip install -r requirements.txt"
python -c "import uvicorn; print('✓ uvicorn')" 2>/dev/null || echo "⚠  uvicorn not found - run: pip install -r requirements.txt"
echo

echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo
echo "To start the backend:"
echo "  uvicorn app.main:app --host 0.0.0.0 --port 8000"
echo
echo "Or run in background:"
echo "  uvicorn app.main:app --host 0.0.0.0 --port 8000 > /tmp/backend.log 2>&1 &"
echo
echo "Test endpoint:"
echo "  curl http://localhost:8000/health"
echo
echo "Tool use test page:"
echo "  http://localhost:8000/test-v2"
echo
echo "=========================================="

# Ask if user wants to start now
read -p "Start backend now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo "Starting backend..."
    echo "Logs will be saved to /tmp/nova_sonic_backend.log"
    echo "Press Ctrl+C to stop"
    echo
    uvicorn app.main:app --host 0.0.0.0 --port 8000
fi

