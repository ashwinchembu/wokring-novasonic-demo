# iPad & Mobile Deployment Guide

Complete guide for deploying the Nova Sonic Voice UI on iPad and mobile devices for Veeva/G360 use.

## Quick Start (iPad)

1. **Open in Safari** (Required for iOS)
   ```
   http://your-server-ip:8000/voice-ipad.html
   ```

2. **Add to Home Screen** (for app-like experience)
   - Tap the Share button (square with arrow)
   - Select "Add to Home Screen"
   - Name it "Nova Sonic Voice"
   - Tap "Add"

3. **Grant Microphone Permission**
   - Tap "Connect"
   - When prompted, tap "Allow" for microphone access

4. **Start Recording**
   - Tap the large "Tap to Start Recording" button
   - Speak clearly
   - Tap again to stop and process

## Features

### iPad-Optimized Interface

- **Large Touch Targets**: All buttons are sized for easy touch interaction
- **Visual Feedback**: Clear visual indicators for recording, connecting, etc.
- **Audio Visualizer**: Real-time visual feedback while recording
- **Responsive Design**: Adapts to portrait and landscape orientations

### iOS Safari Compatibility

- **Audio Support**: Optimized for iOS audio constraints
- **Touch Gestures**: Prevents double-tap zoom for better UX
- **PWA Ready**: Can be added to home screen for full-screen experience
- **Permission Handling**: Clear prompts for microphone access

### Session Management

- **Auto-Reconnect**: Automatically reconnects if connection is lost
- **Session Recovery**: Can resume previous conversations
- **Connection Status**: Always-visible connection indicator

## Deployment Options

### Option 1: Local Network (Development)

For testing within your local network:

```bash
# Start the server
cd /path/to/ai-demo-3-nodejs
npm start

# Find your local IP
ipconfig getifaddr en0   # macOS
# or
ip addr show            # Linux

# Access from iPad
# http://<your-ip>:8000/voice-ipad.html
```

### Option 2: ngrok Tunnel (Quick Demo)

For quick demos over the internet:

```bash
# Install ngrok
brew install ngrok   # macOS
# or download from https://ngrok.com

# Start your server
npm start

# In another terminal, create tunnel
ngrok http 8000

# Copy the https URL (e.g., https://abc123.ngrok.io)
# Access on iPad: https://abc123.ngrok.io/voice-ipad.html
```

**Note**: Free ngrok URLs expire after session ends.

### Option 3: Cloud Deployment (Production)

#### AWS EC2 Deployment

1. **Launch EC2 Instance**
   ```bash
   # Amazon Linux 2 or Ubuntu 22.04
   # Instance type: t3.medium or larger
   # Security Group: Allow ports 80, 443, 8000
   ```

2. **Setup Server**
   ```bash
   # SSH into instance
   ssh -i your-key.pem ec2-user@<instance-ip>
   
   # Install Node.js
   curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
   sudo yum install -y nodejs
   
   # Clone/upload your app
   git clone <your-repo>
   cd ai-demo-3-nodejs
   
   # Install dependencies
   npm install
   
   # Configure environment
   cp .env.example .env
   # Edit .env with your AWS credentials
   
   # Start with PM2 (process manager)
   sudo npm install -g pm2
   pm2 start src/index.js --name nova-sonic
   pm2 startup
   pm2 save
   ```

3. **Setup SSL (Required for iOS)**
   ```bash
   # Install Nginx
   sudo yum install -y nginx
   
   # Install certbot for Let's Encrypt
   sudo yum install -y certbot python3-certbot-nginx
   
   # Get SSL certificate
   sudo certbot --nginx -d your-domain.com
   ```

4. **Nginx Configuration**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       return 301 https://$server_name$request_uri;
   }
   
   server {
       listen 443 ssl http2;
       server_name your-domain.com;
       
       ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
       
       location / {
           proxy_pass http://localhost:8000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
       
       location /events/ {
           proxy_pass http://localhost:8000;
           proxy_buffering off;
           proxy_cache off;
           proxy_set_header Connection '';
           proxy_http_version 1.1;
           chunked_transfer_encoding off;
       }
   }
   ```

5. **Access on iPad**
   ```
   https://your-domain.com/voice-ipad.html
   ```

#### Heroku Deployment

```bash
# Install Heroku CLI
brew install heroku   # macOS

# Login
heroku login

# Create app
heroku create nova-sonic-voice

# Set environment variables
heroku config:set AWS_ACCESS_KEY_ID=your_key
heroku config:set AWS_SECRET_ACCESS_KEY=your_secret
heroku config:set AWS_REGION=us-east-1

# Deploy
git push heroku main

# Open in browser
heroku open
```

Access: `https://your-app.herokuapp.com/voice-ipad.html`

### Option 4: Docker Deployment

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 8000

CMD ["node", "src/index.js"]
```

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  nova-sonic:
    build: .
    ports:
      - "8000:8000"
    environment:
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - AWS_REGION=${AWS_REGION}
      - APP_PORT=8000
    restart: unless-stopped
```

Deploy:

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## iOS Safari Specific Issues & Solutions

### Issue 1: Audio Not Recording

**Symptoms**: Microphone permission granted but no audio captured

**Solution**:
```javascript
// Resume audio context on user interaction (already implemented)
if (audioContext.state === 'suspended') {
    await audioContext.resume();
}
```

### Issue 2: Audio Playback Delayed

**Symptoms**: Response audio plays late or choppy

**Solution**:
- Use PCM format (not MP3) - ✅ Already implemented
- Initialize AudioContext on first user interaction - ✅ Done
- Use smaller buffer sizes (4096) - ✅ Configured

### Issue 3: Page Zooms on Double-Tap

**Symptoms**: UI zooms when user double-taps buttons

**Solution**:
```javascript
// Prevent double-tap zoom (already implemented)
document.addEventListener('touchend', preventDoubleTap);
```

### Issue 4: Can't Test on Simulator

**Symptoms**: iOS Simulator doesn't have microphone

**Solution**:
- Must test on physical iPad/iPhone
- Can test UI layout in simulator, but not audio functionality
- Use ngrok for remote testing without deploying

## Testing Checklist

Before deploying to production:

- [ ] Test on physical iPad (not simulator)
- [ ] Test in portrait and landscape orientation
- [ ] Verify microphone permission prompt appears
- [ ] Confirm audio recording works
- [ ] Verify audio playback is clear
- [ ] Test connection loss and recovery
- [ ] Check session recovery after app backgrounding
- [ ] Verify "Add to Home Screen" works
- [ ] Test on different iOS versions (iOS 14+)
- [ ] Check on different iPad models (Air, Pro, mini)
- [ ] Test with both WiFi and cellular connection

## Veeva CRM Integration

For integration with Veeva CRM on iPad:

### Veeva MyInsights

1. **Create Custom HTML Page**
   ```html
   <!-- veeva-nova-sonic.html -->
   <!DOCTYPE html>
   <html>
   <head>
       <meta name="viewport" content="width=device-width, initial-scale=1">
       <title>Nova Sonic Voice</title>
   </head>
   <body style="margin:0;padding:0;">
       <iframe 
           src="https://your-server.com/voice-ipad.html" 
           style="width:100%;height:100vh;border:none;">
       </iframe>
   </body>
   </html>
   ```

2. **Upload to Veeva**
   - Go to Veeva CRM
   - Navigate to MyInsights
   - Upload HTML file
   - Configure as a new insight

3. **Link to HCP Profiles**
   - Associate with relevant HCP records
   - Set permissions for field users

### G360 Integration

1. **Create Integration Point**
   ```javascript
   // Expose API for G360 to call
   window.g360 = {
       startCall: () => voiceClient.connect(),
       endCall: () => voiceClient.disconnect(),
       getTranscript: () => voiceClient.conversationHistory
   };
   ```

2. **Configure in G360**
   - Add custom component URL
   - Set permissions
   - Map data fields to G360 objects

## Performance Optimization

### Reduce Latency

1. **Use CDN for Static Assets**
   - Host CSS/JS on CloudFront
   - Reduces load time on slower connections

2. **Enable Compression**
   ```javascript
   // Add to Express server
   const compression = require('compression');
   app.use(compression());
   ```

3. **Optimize Audio Chunks**
   ```javascript
   // Reduce chunk size for faster transmission
   const processor = audioContext.createScriptProcessor(2048, 1, 1);
   ```

### Battery Optimization

1. **Reduce Visualizer Updates**
   ```javascript
   // Update every N frames instead of every frame
   if (frameCount % 3 === 0) {
       updateVisualizer(audioData);
   }
   ```

2. **Close Audio Context When Idle**
   ```javascript
   // Auto-disconnect after 5 minutes of inactivity
   setTimeout(() => {
       if (!isRecording) voiceClient.disconnect();
   }, 5 * 60 * 1000);
   ```

## Troubleshooting

### Connection Issues

**Problem**: "Failed to connect" error

**Check**:
1. Server is running: `curl http://localhost:8000/db/healthz`
2. Firewall allows port 8000
3. iPad is on same network (for local testing)
4. HTTPS is configured (for production)

### Audio Issues

**Problem**: No sound playback

**Check**:
1. iPad volume is up
2. Silent mode is off
3. Check browser console for errors
4. Verify audio format is PCM 24kHz

**Problem**: Choppy audio

**Solutions**:
- Reduce audio chunk size
- Check network bandwidth
- Use wired connection instead of WiFi

### Permission Issues

**Problem**: Microphone permission denied

**Solution**:
1. Go to iPad Settings > Safari > Camera & Microphone
2. Ensure permissions are allowed for your domain
3. Reload the page
4. Try in private browsing mode to reset permissions

## Security Considerations

1. **Always Use HTTPS in Production**
   - Required for microphone access on iOS
   - Protects audio data in transit

2. **Implement Authentication**
   ```javascript
   // Add API key or JWT token
   headers: {
       'Authorization': `Bearer ${token}`
   }
   ```

3. **Rate Limiting**
   ```javascript
   // Prevent abuse
   const rateLimit = require('express-rate-limit');
   app.use('/audio/', rateLimit({ windowMs: 60000, max: 100 }));
   ```

4. **Input Validation**
   - Validate audio chunk sizes
   - Check session IDs
   - Sanitize text transcripts

## Support & Maintenance

### Logging

Monitor these metrics:
- Connection success/failure rates
- Audio processing latency
- Session duration
- Error rates by type

### Updates

For rolling updates with zero downtime:

```bash
# Blue-green deployment
pm2 reload nova-sonic

# Or with health check
pm2 reload nova-sonic --wait-ready
```

## Next Steps

1. ✅ Test on physical iPad
2. ✅ Deploy to staging environment
3. ✅ Conduct user acceptance testing
4. ✅ Set up monitoring and alerts
5. ✅ Deploy to production
6. ✅ Train end users
7. ✅ Create support documentation

## Resources

- [iOS Safari Audio Best Practices](https://developer.apple.com/documentation/webkit/delivering_video_content_for_safari)
- [PWA on iOS](https://web.dev/progressive-web-apps/)
- [Veeva CRM MyInsights Guide](https://www.veeva.com/products/multichannel-crm/myinsights/)
- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)

## Questions?

For deployment support, contact the team or refer to the main README.md file.

