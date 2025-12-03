#!/bin/bash
# Nova Sonic - Render CLI Deployment Script
# This script deploys both frontend and backend to Render

set -e

echo "🚀 Nova Sonic - Render Deployment"
echo "=================================="

# Check if render CLI is installed
if ! command -v render &> /dev/null; then
    echo "❌ Render CLI not found. Install with:"
    echo "   brew install render-oss/render/render"
    echo "   or download from https://render.com/docs/cli"
    exit 1
fi

# Check if logged in
if ! render whoami &> /dev/null; then
    echo "🔐 Please login to Render first:"
    render login
fi

echo ""
echo "Choose deployment method:"
echo "1) Blueprint deploy (recommended - deploys both services)"
echo "2) Manual deploy (step by step)"
echo ""
read -p "Enter choice (1 or 2): " choice

case $choice in
    1)
        echo ""
        echo "📋 Deploying using render.yaml blueprint..."
        echo ""
        render blueprint apply
        
        echo ""
        echo "✅ Blueprint applied!"
        echo ""
        echo "⚠️  IMPORTANT: After deployment completes, you need to:"
        echo "1. Set AWS credentials in the Render dashboard for novasonic-api"
        echo "2. Set VITE_API_URL for novasonic-frontend to your backend URL"
        echo "3. Set CORS_ORIGINS for novasonic-api to your frontend URL"
        ;;
    2)
        echo ""
        echo "📦 Manual deployment - Backend first..."
        echo ""
        
        # Get backend service name
        read -p "Backend service name [novasonic-api]: " backend_name
        backend_name=${backend_name:-novasonic-api}
        
        # Create backend
        echo "Creating backend service: $backend_name"
        render services create \
            --name "$backend_name" \
            --type web \
            --runtime node \
            --region oregon \
            --build-command "npm install" \
            --start-command "npm start" \
            --health-check-path /health || true
        
        echo ""
        echo "⚠️  Set these environment variables in Render Dashboard:"
        echo "   - AWS_ACCESS_KEY_ID"
        echo "   - AWS_SECRET_ACCESS_KEY"
        echo "   - AWS_REGION=us-east-1"
        echo "   - BEDROCK_MODEL_ID=amazon.nova-sonic-v1:0"
        echo "   - APP_PORT=8000"
        echo "   - NODE_ENV=production"
        echo ""
        
        read -p "Press Enter after setting env vars to deploy backend..."
        render deploy --service "$backend_name"
        
        echo ""
        read -p "Enter your backend URL (e.g., https://novasonic-api.onrender.com): " backend_url
        
        echo ""
        echo "📦 Now deploying frontend..."
        echo ""
        
        # Get frontend service name
        read -p "Frontend service name [novasonic-frontend]: " frontend_name
        frontend_name=${frontend_name:-novasonic-frontend}
        
        # Create frontend (static site)
        echo "Creating frontend service: $frontend_name"
        cd frontend
        render services create \
            --name "$frontend_name" \
            --type static \
            --region oregon \
            --build-command "npm install && npm run build" \
            --static-publish-path dist || true
        cd ..
        
        echo ""
        echo "⚠️  Set this environment variable in Render Dashboard for $frontend_name:"
        echo "   - VITE_API_URL=$backend_url"
        echo ""
        
        read -p "Press Enter after setting env var to deploy frontend..."
        render deploy --service "$frontend_name"
        
        echo ""
        read -p "Enter your frontend URL (e.g., https://novasonic-frontend.onrender.com): " frontend_url
        
        echo ""
        echo "📦 Updating backend CORS..."
        render env set CORS_ORIGINS="$frontend_url" --service "$backend_name"
        render deploy --service "$backend_name"
        
        echo ""
        echo "✅ Deployment complete!"
        echo "   Backend: $backend_url"
        echo "   Frontend: $frontend_url"
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "📚 For more info, see RENDER_DEPLOYMENT.md"

