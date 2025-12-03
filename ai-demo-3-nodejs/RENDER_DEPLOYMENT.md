# Render CLI Deployment Guide

Deploy the Nova Sonic Voice API with **separate frontend and backend services** on Render.

## Prerequisites

1. **Render CLI installed:**
   ```bash
   # macOS
   brew install render-oss/render/render
   
   # Or download from https://render.com/docs/cli
   ```

2. **Authenticate with Render:**
   ```bash
   render login
   ```

3. **AWS Credentials ready:**
   - AWS_ACCESS_KEY_ID
   - AWS_SECRET_ACCESS_KEY
   - Bedrock access enabled in us-east-1

## Quick Deploy (Blueprint)

Deploy both services at once using the blueprint:

```bash
cd /Users/ashwin/zs/wokring-novasonic-demo/ai-demo-3-nodejs

# Deploy using the render.yaml blueprint
render blueprint apply
```

This creates:
- **novasonic-api** - Backend Node.js web service
- **novasonic-frontend** - Static site for Vue.js frontend

## Manual Deploy (Step-by-Step)

### Step 1: Deploy Backend

```bash
# Create the backend service
render services create \
  --name novasonic-api \
  --type web \
  --runtime node \
  --region oregon \
  --build-command "npm install" \
  --start-command "npm start" \
  --health-check-path /health

# Get the service ID
render services list

# Set environment variables (replace with your values)
render env set AWS_ACCESS_KEY_ID=your_key --service novasonic-api
render env set AWS_SECRET_ACCESS_KEY=your_secret --service novasonic-api
render env set AWS_REGION=us-east-1 --service novasonic-api
render env set BEDROCK_MODEL_ID=amazon.nova-sonic-v1:0 --service novasonic-api
render env set APP_PORT=8000 --service novasonic-api
render env set NODE_ENV=production --service novasonic-api
render env set LOG_LEVEL=info --service novasonic-api

# Deploy
render deploy --service novasonic-api
```

Note the backend URL (e.g., `https://novasonic-api.onrender.com`)

### Step 2: Update Backend CORS

After getting the frontend URL, update CORS:

```bash
render env set CORS_ORIGINS=https://novasonic-frontend.onrender.com --service novasonic-api
render deploy --service novasonic-api
```

### Step 3: Deploy Frontend

```bash
# Navigate to frontend directory
cd frontend

# Create the static site
render services create \
  --name novasonic-frontend \
  --type static \
  --region oregon \
  --build-command "npm install && npm run build" \
  --static-publish-path dist

# Set the API URL (use your backend URL from Step 1)
render env set VITE_API_URL=https://novasonic-api.onrender.com --service novasonic-frontend

# Deploy
render deploy --service novasonic-frontend
```

## Environment Variables Reference

### Backend (novasonic-api)

| Variable | Required | Description |
|----------|----------|-------------|
| AWS_ACCESS_KEY_ID | ✅ | AWS access key |
| AWS_SECRET_ACCESS_KEY | ✅ | AWS secret key |
| AWS_REGION | ✅ | AWS region (default: us-east-1) |
| BEDROCK_MODEL_ID | ❌ | Model ID (default: amazon.nova-sonic-v1:0) |
| APP_PORT | ❌ | Server port (default: 8000) |
| CORS_ORIGINS | ✅ | Frontend URL(s), comma-separated |
| LOG_LEVEL | ❌ | Logging level (default: info) |
| REDSHIFT_HOST | ❌ | Optional Redshift host |
| REDSHIFT_PORT | ❌ | Optional Redshift port |
| REDSHIFT_DB | ❌ | Optional Redshift database |
| REDSHIFT_USER | ❌ | Optional Redshift user |
| REDSHIFT_PASSWORD | ❌ | Optional Redshift password |

### Frontend (novasonic-frontend)

| Variable | Required | Description |
|----------|----------|-------------|
| VITE_API_URL | ✅ | Backend API URL (e.g., https://novasonic-api.onrender.com) |

## Post-Deployment Checklist

1. **Verify Backend Health:**
   ```bash
   curl https://novasonic-api.onrender.com/health
   ```

2. **Verify Database Status:**
   ```bash
   curl https://novasonic-api.onrender.com/db/healthz
   ```

3. **Test Frontend:**
   - Open https://novasonic-frontend.onrender.com
   - Click "Connect" to start a session
   - Allow microphone access when prompted
   - Speak and verify audio transcription

## Updating Deployments

### Redeploy after code changes:

```bash
# Backend
render deploy --service novasonic-api

# Frontend
render deploy --service novasonic-frontend
```

### View logs:

```bash
# Backend logs
render logs --service novasonic-api

# Tail logs
render logs --service novasonic-api --tail
```

## Troubleshooting

### CORS Errors
If you see CORS errors in browser console:
```bash
# Update CORS with your frontend URL
render env set CORS_ORIGINS=https://your-frontend.onrender.com --service novasonic-api
render deploy --service novasonic-api
```

### Connection Refused
- Verify the backend is running: `render services list`
- Check logs: `render logs --service novasonic-api`
- Ensure APP_PORT is set to 8000

### Audio/Microphone Issues
- Ensure HTTPS is being used (required for microphone access)
- Check browser permissions for microphone
- On iOS Safari, tap the connect button (requires user gesture)

### AWS/Bedrock Errors
- Verify AWS credentials are set correctly
- Ensure Bedrock is enabled in your AWS region
- Check that your IAM user has `bedrock:InvokeModel` permissions

## Service URLs

After deployment, your services will be available at:
- **Backend:** `https://novasonic-api.onrender.com`
- **Frontend:** `https://novasonic-frontend.onrender.com`

(Actual URLs depend on your service names and may include random suffixes)

## Costs

- **Backend (Starter plan):** ~$7/month
- **Frontend (Static Site):** Free tier available

Consider upgrading to Standard plan ($25/month) for production workloads with better performance.

