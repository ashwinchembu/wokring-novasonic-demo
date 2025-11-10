# Voice Test Page

Interactive HTML test page for the Nova Sonic API.

## Access

Open in your browser:
```
http://localhost:8001/test
```

## Features

### 🎙️ Session Control
- Start/end Nova Sonic sessions
- Real-time session status indicator
- Session information display

### 🎵 Audio Features
- Start/stop microphone recording
- Real-time audio visualization (8 animated bars)
- Automatic audio chunk sending (16kHz LPCM)
- Audio playback of responses (24kHz LPCM)

### 💬 Live Transcript
- Real-time SSE event stream
- User and assistant messages
- Tool invocation logs
- Timestamped entries
- Auto-scroll to latest

### 📊 Statistics Dashboard
- Audio chunks sent
- Transcripts received
- Audio responses played
- Tool calls executed

### 👨‍⚕️ HCP List
- 16 healthcare professionals
- Full names and IDs
- Scrollable list
- Auto-loaded on page load

### 🎨 Modern UI
- Beautiful gradient background
- Smooth animations
- Responsive design
- Clean card layout
- Color-coded messages

## How to Use

### 1. Start a Session
Click **"▶️ Start Session"** to connect to Nova Sonic.
- Status indicator turns green
- Session ID displayed
- Recording button becomes enabled

### 2. Start Recording
Click **"🎙️ Start Recording"** to begin speaking.
- Browser will request microphone permission
- Audio visualizer shows live levels
- Audio chunks sent automatically to API

### 3. Watch the Magic
- Your speech appears as **User** messages (blue)
- Nova Sonic responds as **Assistant** messages (purple)
- Tool calls show as **Tool** messages (orange)
- Audio responses play automatically

### 4. Stop Recording
Click **"⏸️ Stop Recording"** when done speaking.
- Sends audio end event
- Processing continues
- Can start recording again anytime

### 5. End Session
Click **"⏹️ End Session"** when finished.
- Closes SSE stream
- Cleans up session
- Resets UI to initial state

## Technical Details

### Audio Format
- **Input**: LPCM 16kHz mono 16-bit
- **Output**: LPCM 24kHz mono 16-bit
- **Encoding**: Base64
- **Chunk Size**: 4096 samples

### SSE Events
- `transcript` - Text from user or assistant
- `audio` - Audio response from Nova Sonic
- `tool_log` - Tool invocations and results
- `content_start` - Content block started
- `content_end` - Content block ended
- `error` - Error messages

### API Calls
```javascript
// Start session
POST /session/start

// Send audio
POST /audio/chunk
{ sessionId, audioData, format, sampleRate, channels }

// End audio
POST /audio/end
{ sessionId }

// SSE stream
GET /events/stream/:sessionId

// End session
DELETE /session/:sessionId
```

## Browser Requirements

- **Modern browser** with:
  - Web Audio API support
  - getUserMedia() for microphone
  - EventSource for SSE
  - ES6+ JavaScript

- **Tested on**:
  - Chrome 90+
  - Firefox 88+
  - Safari 14+
  - Edge 90+

## Troubleshooting

### No Microphone Access
- Check browser permissions
- Look for microphone icon in address bar
- Try HTTPS (not HTTP) for some browsers

### Session Won't Start
- Check AWS credentials in `.env`
- Verify Bedrock access
- Check console for errors
- Ensure server is running on port 8001

### No Audio Playback
- Check browser audio permissions
- Verify speakers/headphones connected
- Check console for decoding errors

### Transcript Not Showing
- Verify SSE connection in Network tab
- Check for CORS errors
- Ensure session started successfully

### Tool Calls Not Working
- Check server logs for tool execution
- Verify tool handlers are implemented
- Check tool input format

## Console Logs

Open browser DevTools (F12) to see:
- Connection status
- SSE events received
- Audio processing info
- Tool invocations
- Any errors

## Customization

### Change API URL
Edit line 422 in `voice-test.html`:
```javascript
const API_BASE = 'http://localhost:8001';
```

### Adjust Audio Settings
Edit the `getUserMedia` call (line 334):
```javascript
audio: {
    channelCount: 1,
    sampleRate: 16000
}
```

### Modify UI Colors
Edit the CSS in `<style>` section:
- `.btn-primary` - Main buttons
- `.btn-success` - Recording button
- `.transcript-entry.user` - User messages
- `.transcript-entry.assistant` - Assistant messages

## Comparison with Python Version

This test page is similar to the Python version's `voice_test.html` and `voice_test_v2.html`, but with:
- ✨ More modern design
- 📊 Better statistics display
- 🎨 Improved visualizations
- 🛠️ Enhanced tool logging
- 📱 Better responsive layout

## Files

- `voice-test.html` - Complete standalone HTML page
- All CSS and JavaScript embedded
- No external dependencies
- Works offline (except API calls)

## Support

For issues:
1. Check browser console
2. Check server logs: `npm run dev`
3. Verify AWS credentials
4. Test with curl first
5. Review API documentation

Enjoy testing with Nova Sonic! 🎤🤖

