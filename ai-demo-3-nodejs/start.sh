#!/bin/bash

# Start script for AI Demo 3 Node.js backend

echo "================================================"
echo "AI Demo 3 - Nova Sonic API (Node.js/TypeScript)"
echo "================================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo "Please create .env from .env.example:"
    echo "  cp .env.example .env"
    echo "  # Then edit .env with your AWS credentials"
    exit 1
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start the server
echo ""
echo "🚀 Starting server..."
echo ""

npm run dev

