#!/bin/bash
# Deploy Nova Sonic Demo to Render via API (no blueprint)
# This script creates both backend and frontend services separately

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Render API Configuration
RENDER_API_URL="https://api.render.com/v1"
RENDER_API_KEY="${RENDER_API_KEY:-rnd_k6t26o4IUyfVIE909bB4zkPWX7x8}"
OWNER_ID="tea-csprnci3esus739ok930"
REPO_URL="https://github.com/ashwinchembu/wokring-novasonic-demo"
BRANCH="main"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Nova Sonic Demo - Render Deployment Script${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Function to make API calls
render_api() {
    local method=$1
    local endpoint=$2
    local data=$3
    
    if [ -n "$data" ]; then
        curl -s -X "$method" \
            -H "Authorization: Bearer $RENDER_API_KEY" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "${RENDER_API_URL}${endpoint}"
    else
        curl -s -X "$method" \
            -H "Authorization: Bearer $RENDER_API_KEY" \
            "${RENDER_API_URL}${endpoint}"
    fi
}

# ============================================
# Step 1: Create Backend Web Service
# ============================================
echo -e "${YELLOW}Step 1: Creating Backend Web Service...${NC}"

BACKEND_PAYLOAD='{
  "type": "web_service",
  "name": "novasonic-api",
  "ownerId": "'"$OWNER_ID"'",
  "repo": "'"$REPO_URL"'",
  "branch": "'"$BRANCH"'",
  "rootDir": "ai-demo-3-nodejs",
  "autoDeploy": "yes",
  "serviceDetails": {
    "region": "oregon",
    "plan": "starter",
    "runtime": "node",
    "healthCheckPath": "/health",
    "envSpecificDetails": {
      "buildCommand": "npm install",
      "startCommand": "npm start"
    },
    "envVars": [
      {"key": "NODE_ENV", "value": "production"},
      {"key": "APP_PORT", "value": "8000"},
      {"key": "APP_HOST", "value": "0.0.0.0"},
      {"key": "AWS_REGION", "value": "us-east-1"},
      {"key": "BEDROCK_MODEL_ID", "value": "amazon.nova-sonic-v1:0"},
      {"key": "LOG_LEVEL", "value": "info"}
    ]
  }
}'

echo -e "${BLUE}Sending request to create backend service...${NC}"
BACKEND_RESPONSE=$(render_api "POST" "/services" "$BACKEND_PAYLOAD")

# Check if creation was successful
if echo "$BACKEND_RESPONSE" | grep -q '"id"'; then
    BACKEND_ID=$(echo "$BACKEND_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    BACKEND_URL=$(echo "$BACKEND_RESPONSE" | grep -o '"url":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo -e "${GREEN}✓ Backend service created successfully!${NC}"
    echo -e "  Service ID: ${BLUE}$BACKEND_ID${NC}"
    echo -e "  URL: ${BLUE}$BACKEND_URL${NC}"
else
    echo -e "${RED}Backend creation response:${NC}"
    echo "$BACKEND_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$BACKEND_RESPONSE"
    
    # Check if service already exists
    if echo "$BACKEND_RESPONSE" | grep -q "already exists"; then
        echo -e "${YELLOW}Service may already exist. Checking existing services...${NC}"
        EXISTING=$(render_api "GET" "/services?name=novasonic-api")
        echo "$EXISTING" | python3 -m json.tool 2>/dev/null || echo "$EXISTING"
    fi
fi

echo ""

# ============================================
# Step 2: Create Frontend Static Site
# ============================================
echo -e "${YELLOW}Step 2: Creating Frontend Static Site...${NC}"

FRONTEND_PAYLOAD='{
  "type": "static_site",
  "name": "novasonic-frontend",
  "ownerId": "'"$OWNER_ID"'",
  "repo": "'"$REPO_URL"'",
  "branch": "'"$BRANCH"'",
  "rootDir": "ai-demo-3-nodejs/frontend",
  "autoDeploy": "yes",
  "serviceDetails": {
    "buildCommand": "npm install && npm run build",
    "publishPath": "dist",
    "buildPlan": "starter",
    "envVars": [
      {"key": "NODE_ENV", "value": "production"},
      {"key": "RENDER", "value": "true"}
    ],
    "headers": [
      {
        "path": "/*",
        "name": "Cache-Control",
        "value": "public, max-age=0, must-revalidate"
      }
    ],
    "routes": [
      {
        "type": "rewrite",
        "source": "/*",
        "destination": "/index.html"
      }
    ]
  }
}'

echo -e "${BLUE}Sending request to create frontend service...${NC}"
FRONTEND_RESPONSE=$(render_api "POST" "/services" "$FRONTEND_PAYLOAD")

# Check if creation was successful
if echo "$FRONTEND_RESPONSE" | grep -q '"id"'; then
    FRONTEND_ID=$(echo "$FRONTEND_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    FRONTEND_URL=$(echo "$FRONTEND_RESPONSE" | grep -o '"url":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo -e "${GREEN}✓ Frontend service created successfully!${NC}"
    echo -e "  Service ID: ${BLUE}$FRONTEND_ID${NC}"
    echo -e "  URL: ${BLUE}$FRONTEND_URL${NC}"
else
    echo -e "${RED}Frontend creation response:${NC}"
    echo "$FRONTEND_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$FRONTEND_RESPONSE"
fi

echo ""

# ============================================
# Summary
# ============================================
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Go to Render Dashboard to set AWS credentials:"
echo "   - AWS_ACCESS_KEY_ID"
echo "   - AWS_SECRET_ACCESS_KEY"
echo ""
echo "2. After backend deploys, update frontend VITE_API_URL:"
echo "   VITE_API_URL=https://novasonic-api.onrender.com"
echo ""
echo "3. After frontend deploys, update backend CORS_ORIGINS:"
echo "   CORS_ORIGINS=https://novasonic-frontend.onrender.com"
echo ""
echo -e "${BLUE}Dashboard:${NC} https://dashboard.render.com"

