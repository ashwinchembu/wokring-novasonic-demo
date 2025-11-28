# Deployment Guide - NovaSonic POC

## 🎯 Overview

This guide covers deploying the NovaSonic Voice & Text POC to ZS/Gilead environments.

## 📋 Prerequisites

### Required Access
- [ ] AWS Account with Bedrock access
- [ ] AWS IAM credentials with permissions:
  - `bedrock:InvokeModel`
  - `bedrock-runtime:*`
  - `bedrock-agent-runtime:*`
- [ ] Redshift database access (optional, falls back to SQLite)
- [ ] Node.js 18+ installed
- [ ] npm or yarn package manager

### Environment Configuration

Create a `.env` file in the project root:

```env
# AWS Configuration
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_REGION=us-east-1

# Application Configuration
APP_PORT=8000
APP_HOST=0.0.0.0

# Bedrock Configuration
BEDROCK_MODEL_ID=amazon.nova-sonic-v1:0
BEDROCK_AGENT_ID=your_agent_id  # Optional
BEDROCK_AGENT_ALIAS_ID=your_alias  # Optional

# Database Configuration (Optional - falls back to SQLite)
REDSHIFT_HOST=your-redshift-endpoint.redshift.amazonaws.com
REDSHIFT_PORT=5439
REDSHIFT_DATABASE=your_database
REDSHIFT_USER=your_user
REDSHIFT_PASSWORD=your_password

# CORS Configuration (for production)
CORS_ORIGINS=https://your-domain.com,https://another-domain.com

# Logging
LOG_LEVEL=info
```

## 🚀 Deployment Options

### Option 1: Local Development

```bash
# Install dependencies
npm install

# Start server
npm start

# Access at http://localhost:8000
```

### Option 2: Docker Deployment

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create SQLite directory
RUN mkdir -p /app/data

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "src/index.js"]
```

Build and run:

```bash
# Build image
docker build -t novasonic-poc:latest .

# Run container
docker run -d \
  --name novasonic-poc \
  -p 8000:8000 \
  -v $(pwd)/.env:/app/.env \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  novasonic-poc:latest

# View logs
docker logs -f novasonic-poc
```

### Option 3: Kubernetes Deployment

Create `k8s-deployment.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: novasonic-config
data:
  APP_PORT: "8000"
  APP_HOST: "0.0.0.0"
  AWS_REGION: "us-east-1"
  BEDROCK_MODEL_ID: "amazon.nova-sonic-v1:0"
  LOG_LEVEL: "info"

---
apiVersion: v1
kind: Secret
metadata:
  name: novasonic-secrets
type: Opaque
stringData:
  AWS_ACCESS_KEY_ID: "your_access_key"
  AWS_SECRET_ACCESS_KEY: "your_secret_key"
  REDSHIFT_PASSWORD: "your_db_password"

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: novasonic-poc
  labels:
    app: novasonic-poc
spec:
  replicas: 2
  selector:
    matchLabels:
      app: novasonic-poc
  template:
    metadata:
      labels:
        app: novasonic-poc
    spec:
      containers:
      - name: novasonic
        image: novasonic-poc:latest
        ports:
        - containerPort: 8000
        envFrom:
        - configMapRef:
            name: novasonic-config
        - secretRef:
            name: novasonic-secrets
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"

---
apiVersion: v1
kind: Service
metadata:
  name: novasonic-service
spec:
  type: LoadBalancer
  selector:
    app: novasonic-poc
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8000

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: novasonic-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - novasonic.your-domain.com
    secretName: novasonic-tls
  rules:
  - host: novasonic.your-domain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: novasonic-service
            port:
              number: 80
```

Deploy:

```bash
# Apply configurations
kubectl apply -f k8s-deployment.yaml

# Check status
kubectl get pods -l app=novasonic-poc
kubectl get svc novasonic-service

# View logs
kubectl logs -f deployment/novasonic-poc
```

## 🔒 Security Configuration

### 1. Enable HTTPS

For production, always use HTTPS:

```bash
# Using nginx reverse proxy
server {
    listen 443 ssl http2;
    server_name novasonic.your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_read_timeout 86400;
    }
}
```

### 2. Configure CORS

Update `.env`:

```env
CORS_ORIGINS=https://your-frontend.com,https://admin.your-frontend.com
```

### 3. Add Authentication (Recommended)

Create middleware in `src/middleware/auth.js`:

```javascript
// Example: API Key authentication
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
}

module.exports = { authenticateApiKey };
```

## 📊 Monitoring & Logging

### 1. Health Checks

Endpoints:
- `GET /health` - Basic health check
- `GET /db/healthz` - Database connectivity check

### 2. Logging

Logs are written to:
- Console (stdout/stderr)
- `server.log` file

Configure log level in `.env`:

```env
LOG_LEVEL=info  # Options: error, warn, info, debug
```

### 3. Monitoring Setup (CloudWatch Example)

```bash
# Install CloudWatch agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i amazon-cloudwatch-agent.deb

# Configure log collection
cat > /opt/aws/amazon-cloudwatch-agent/etc/config.json << EOF
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/app/server.log",
            "log_group_name": "/aws/novasonic/app",
            "log_stream_name": "{instance_id}"
          }
        ]
      }
    }
  }
}
EOF

# Start agent
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/config.json
```

## 🧪 Testing Deployment

### 1. Basic Connectivity

```bash
# Health check
curl http://your-server:8000/health

# Expected response:
# {"status":"healthy","timestamp":"2024-01-01T00:00:00.000Z","version":"1.0.0"}
```

### 2. Database Connectivity

```bash
curl http://your-server:8000/db/healthz

# Expected response:
# {"status":"healthy","database":"redshift","message":"Connected to Redshift"}
```

### 3. Session Creation

```bash
curl -X POST http://your-server:8000/session/start \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected response:
# {"sessionId":"...","bedrockSessionId":"...","status":"ACTIVE","createdAt":"..."}
```

### 4. WebSocket Test

```javascript
// JavaScript console test
const ws = new WebSocket('ws://your-server:8000/ws');
ws.onmessage = (e) => console.log('Received:', JSON.parse(e.data));
ws.onopen = () => {
  console.log('Connected');
  ws.send(JSON.stringify({ type: 'ping' }));
};
```

## 📱 iOS/Safari Deployment Considerations

### 1. HTTPS Requirement

iOS requires HTTPS for:
- Microphone access
- WebSocket connections
- Audio playback

Ensure SSL certificates are properly configured.

### 2. Audio Context Initialization

Audio must be initialized from user interaction:

```javascript
// Already handled in voice-test-enhanced.html
button.addEventListener('click', () => {
  const ctx = new AudioContext();
  ctx.resume(); // Required on iOS
});
```

### 3. WebSocket Configuration

For iOS Safari, ensure WebSocket uses correct protocol:

```javascript
const wsUrl = location.protocol === 'https:' 
  ? 'wss://your-server.com/ws' 
  : 'ws://your-server.com/ws';
```

## 🔧 Troubleshooting

### Issue: WebSocket not connecting

**Solution:**
```bash
# Check if WebSocket server is running
netstat -an | grep 8000

# Verify nginx WebSocket config
sudo nginx -t
sudo systemctl reload nginx
```

### Issue: Audio not playing on iOS

**Solution:**
1. Ensure HTTPS is enabled
2. Check audio context initialization
3. Verify audio format (PCM 16-bit, 24kHz)
4. Test with simple audio first

### Issue: High memory usage

**Solution:**
```bash
# Monitor memory
docker stats novasonic-poc

# Adjust limits in k8s-deployment.yaml
resources:
  limits:
    memory: "4Gi"  # Increase if needed
```

### Issue: Database connection failures

**Solution:**
- Falls back to SQLite automatically
- Check Redshift security group allows connection
- Verify credentials in `.env`

## 📈 Scaling Recommendations

### Horizontal Scaling

```bash
# Kubernetes
kubectl scale deployment novasonic-poc --replicas=5

# Docker Swarm
docker service scale novasonic-poc=5
```

### Vertical Scaling

Adjust resources based on load:
- 2 CPU cores per 100 concurrent sessions
- 2GB RAM per 100 concurrent sessions

### Load Balancing

Use session affinity for WebSocket connections:

```yaml
# Kubernetes service
apiVersion: v1
kind: Service
metadata:
  name: novasonic-service
spec:
  sessionAffinity: ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 3600
```

## 🎯 Production Checklist

- [ ] Environment variables configured
- [ ] HTTPS enabled with valid certificates
- [ ] CORS configured for production domains
- [ ] Authentication/authorization implemented
- [ ] Monitoring and logging set up
- [ ] Health checks configured
- [ ] Database connectivity verified
- [ ] Backup strategy defined
- [ ] Scaling parameters configured
- [ ] Security group/firewall rules configured
- [ ] iOS/Safari testing completed
- [ ] Load testing performed
- [ ] Disaster recovery plan documented

## 📞 Support Contacts

- **Infrastructure**: Saurabh
- **iOS Testing**: Abhinav
- **Test Data**: Prateek

## 📚 Additional Resources

- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [Nova Sonic API Reference](https://docs.aws.amazon.com/nova/latest/userguide/)
- [WebSocket API Reference](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [iOS Web Audio API Compatibility](https://caniuse.com/audio-api)

