#!/bin/bash
# Deploy Nova Sonic API to Render - Frontend and Backend separately
# Repository: https://github.com/ashwinchembu/wokring-novasonic-demo

set -e

echo "==========================================="
echo "  Nova Sonic Voice API - Render Deployment"
echo "==========================================="

# Check for API key
if [ -z "$RENDER_API_KEY" ]; then
    echo ""
    echo "❌ RENDER_API_KEY not set"
    echo ""
    echo "To get your API key:"
    echo "1. Go to https://dashboard.render.com/u/settings#api-keys"
    echo "2. Click 'Create API Key'"
    echo "3. Export it: export RENDER_API_KEY=your_api_key"
    echo ""
    echo "Or use the Dashboard Blueprint method:"
    echo "1. Go to https://dashboard.render.com/blueprints"
    echo "2. Click 'New Blueprint Instance'"
    echo "3. Connect to: https://github.com/ashwinchembu/wokring-novasonic-demo"
    echo "4. Set Blueprint YAML Path to: ai-demo-3-nodejs/render.yaml"
    echo "5. Click 'Apply'"
    echo ""
    exit 1
fi

OWNER_ID=""
REPO="https://github.com/ashwinchembu/wokring-novasonic-demo"
REGION="oregon"
BRANCH="main"

# Get owner ID
echo "📡 Getting owner info..."
OWNER_RESPONSE=$(curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
    "https://api.render.com/v1/owners")
OWNER_ID=$(echo "$OWNER_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$OWNER_ID" ]; then
    echo "❌ Could not get owner ID. Check your API key."
    exit 1
fi
echo "✅ Owner ID: $OWNER_ID"

# ========================================
# STEP 1: Create Backend Service
# ========================================
echo ""
echo "🚀 Creating Backend Service (novasonic-api)..."

BACKEND_RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer $RENDER_API_KEY" \
    -H "Content-Type: application/json" \
    "https://api.render.com/v1/services" \
    -d '{
        "type": "web_service",
        "name": "novasonic-api",
        "ownerId": "'"$OWNER_ID"'",
        "repo": "'"$REPO"'",
        "branch": "'"$BRANCH"'",
        "rootDir": "ai-demo-3-nodejs",
        "autoDeploy": "yes",
        "serviceDetails": {
            "runtime": "node",
            "region": "'"$REGION"'",
            "plan": "starter",
            "buildCommand": "npm install",
            "startCommand": "npm start",
            "healthCheckPath": "/health",
            "envSpecificDetails": {
                "buildCommand": "npm install",
                "startCommand": "npm start"
            }
        }
    }')

BACKEND_ID=$(echo "$BACKEND_RESPONSE" | grep -o '"id":"srv-[^"]*"' | head -1 | cut -d'"' -f4)
BACKEND_URL=$(echo "$BACKEND_RESPONSE" | grep -o '"url":"https://[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$BACKEND_ID" ]; then
    echo "❌ Failed to create backend service"
    echo "Response: $BACKEND_RESPONSE"
    exit 1
fi

echo "✅ Backend created: $BACKEND_ID"
echo "   URL: $BACKEND_URL"

# Set backend environment variables
echo "📝 Setting backend environment variables..."
curl -s -X PUT \
    -H "Authorization: Bearer $RENDER_API_KEY" \
    -H "Content-Type: application/json" \
    "https://api.render.com/v1/services/$BACKEND_ID/env-vars" \
    -d '[
        {"key": "NODE_ENV", "value": "production"},
        {"key": "APP_PORT", "value": "8000"},
        {"key": "APP_HOST", "value": "0.0.0.0"},
        {"key": "AWS_REGION", "value": "us-east-1"},
        {"key": "BEDROCK_MODEL_ID", "value": "amazon.nova-sonic-v1:0"},
        {"key": "LOG_LEVEL", "value": "info"}
    ]' > /dev/null

echo "✅ Backend environment variables set"
echo ""
echo "⚠️  IMPORTANT: Set these secrets in the Render Dashboard:"
echo "   - AWS_ACCESS_KEY_ID"
echo "   - AWS_SECRET_ACCESS_KEY"
echo "   Dashboard: https://dashboard.render.com/web/$BACKEND_ID/env"

# ========================================
# STEP 2: Create Frontend Service
# ========================================
echo ""
echo "🚀 Creating Frontend Service (novasonic-frontend)..."

FRONTEND_RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer $RENDER_API_KEY" \
    -H "Content-Type: application/json" \
    "https://api.render.com/v1/services" \
    -d '{
        "type": "static_site",
        "name": "novasonic-frontend",
        "ownerId": "'"$OWNER_ID"'",
        "repo": "'"$REPO"'",
        "branch": "'"$BRANCH"'",
        "rootDir": "ai-demo-3-nodejs/frontend",
        "autoDeploy": "yes",
        "serviceDetails": {
            "buildCommand": "npm install && npm run build",
            "publishPath": "dist",
            "routes": [{"type": "rewrite", "source": "/*", "destination": "/index.html"}],
            "headers": [{"path": "/*", "name": "Cache-Control", "value": "public, max-age=0, must-revalidate"}]
        }
    }')

FRONTEND_ID=$(echo "$FRONTEND_RESPONSE" | grep -o '"id":"srv-[^"]*"' | head -1 | cut -d'"' -f4)
FRONTEND_URL=$(echo "$FRONTEND_RESPONSE" | grep -o '"url":"https://[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$FRONTEND_ID" ]; then
    echo "❌ Failed to create frontend service"
    echo "Response: $FRONTEND_RESPONSE"
    exit 1
fi

echo "✅ Frontend created: $FRONTEND_ID"
echo "   URL: $FRONTEND_URL"

# Set frontend environment variables with backend URL
echo "📝 Setting frontend API URL..."
curl -s -X PUT \
    -H "Authorization: Bearer $RENDER_API_KEY" \
    -H "Content-Type: application/json" \
    "https://api.render.com/v1/services/$FRONTEND_ID/env-vars" \
    -d '[
        {"key": "VITE_API_URL", "value": "'"$BACKEND_URL"'"}
    ]' > /dev/null

echo "✅ Frontend environment variables set"

# Update backend CORS with frontend URL
echo "📝 Updating backend CORS for frontend..."
curl -s -X PUT \
    -H "Authorization: Bearer $RENDER_API_KEY" \
    -H "Content-Type: application/json" \
    "https://api.render.com/v1/services/$BACKEND_ID/env-vars" \
    -d '[
        {"key": "NODE_ENV", "value": "production"},
        {"key": "APP_PORT", "value": "8000"},
        {"key": "APP_HOST", "value": "0.0.0.0"},
        {"key": "AWS_REGION", "value": "us-east-1"},
        {"key": "BEDROCK_MODEL_ID", "value": "amazon.nova-sonic-v1:0"},
        {"key": "LOG_LEVEL", "value": "info"},
        {"key": "CORS_ORIGINS", "value": "'"$FRONTEND_URL"'"}
    ]' > /dev/null

echo "✅ CORS updated"

# ========================================
# SUMMARY
# ========================================
echo ""
echo "==========================================="
echo "  🎉 DEPLOYMENT COMPLETE!"
echo "==========================================="
echo ""
echo "Backend (API):"
echo "  ID:  $BACKEND_ID"
echo "  URL: $BACKEND_URL"
echo "  Dashboard: https://dashboard.render.com/web/$BACKEND_ID"
echo ""
echo "Frontend:"
echo "  ID:  $FRONTEND_ID"
echo "  URL: $FRONTEND_URL"
echo "  Dashboard: https://dashboard.render.com/static/$FRONTEND_ID"
echo ""
echo "⚠️  NEXT STEPS:"
echo "1. Add AWS credentials in the backend dashboard:"
echo "   https://dashboard.render.com/web/$BACKEND_ID/env"
echo "   - AWS_ACCESS_KEY_ID"
echo "   - AWS_SECRET_ACCESS_KEY"
echo ""
echo "2. Wait for initial deployments to complete (5-10 minutes)"
echo ""
echo "3. Test the application:"
echo "   - Health check: curl $BACKEND_URL/health"
echo "   - Frontend: Open $FRONTEND_URL"
echo ""

