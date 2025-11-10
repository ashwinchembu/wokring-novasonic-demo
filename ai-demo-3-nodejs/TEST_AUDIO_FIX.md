# Testing the Audio Choppiness Fix (v2)

## Quick Test Guide

### Prerequisites
- Server running on port 8001
- AWS credentials configured
- Chrome/Safari browser (best Web Audio API support)

### Test Steps

1. **Start the server** (if not already running)
   ```bash
   cd /Users/ashwin/zs/wokring-novasonic-demo/ai-demo-3-nodejs
   npm run dev
   ```

2. **Open the test page**
   ```
   http://localhost:8001/test
   ```

3. **Start a session**
   - Click "▶️ Start Session"
   - Wait for status to show "Connected"

4. **Begin recording**
   - Click "🎙️ Start Recording"
   - Speak clearly: "Tell me a story about artificial intelligence"
   - Speak for about 10-15 seconds

5. **Stop and listen**
   - Click "⏸️ Stop Recording"
   - Listen carefully to the AI response
   - **What to expect**: Smooth, continuous audio with NO gaps or stuttering

---

## What to Monitor

### Browser Console
Open browser DevTools (F12) and check the Console tab:

#### ✅ Good Signs
```
Initializing audio schedule: current=0.000s, start=0.150s
Scheduled audio: start=0.150s, duration=0.200s, buffer=0.150s
Scheduled audio: start=0.340s, duration=0.180s, buffer=0.240s
Scheduled audio: start=0.510s, duration=0.190s, buffer=0.310s
```

- Buffer stays between 150ms - 400ms
- No "Buffer running low" warnings
- No "Buffer getting too long" warnings

#### ⚠️ Warning Signs
```
Buffer running low, adding padding...
```
- Means network is slower than expected
- Adaptive buffering should handle it automatically
- Audio should still be smooth

```
Audio buffer getting too long, adjusting...
```
- Means buffer grew too large (> 3s)
- System will auto-adjust to reduce lag
- May cause brief pause but will recover

---

## Test Scenarios

### Basic Test (5 min)
1. Single question and answer
2. Listen for gaps or stuttering
3. Check console for buffer health

### Stress Test (15 min)
1. Ask multiple questions back-to-back
2. Try longer responses (30+ seconds)
3. Test with poor network (throttle in DevTools)
4. Verify adaptive buffering works

### Quality Test
1. Use headphones for accurate assessment
2. Listen for:
   - ✅ Smooth transitions between words
   - ✅ Consistent volume
   - ✅ No clicks or pops
   - ✅ No gaps or pauses
   - ✅ Natural speech flow

---

## Comparison Test

### Before Fix (v1)
- Some gaps between chunks
- Occasional stuttering
- "Robotic" sound quality

### After Fix (v2)
- Zero gaps
- Smooth, continuous audio
- Professional, natural sound quality

---

## Sample Test Questions

Try these to generate longer responses:

1. **"Tell me a story about artificial intelligence"**
   - Generates ~30 seconds of audio
   - Good for testing continuous playback

2. **"Explain quantum computing to me"**
   - Technical content, longer response
   - Tests buffer management

3. **"What's the weather like today?"**
   - Short response
   - Tests quick startup

4. **"Count from 1 to 20"**
   - Consistent cadence
   - Easy to detect gaps

---

## Troubleshooting

### Audio is still choppy
1. **Check browser**: Use Chrome or Safari (best Web Audio support)
2. **Check network**: Run `ping api.us-east-1.amazonaws.com`
3. **Check CPU**: Close other apps to free resources
4. **Clear cache**: Hard refresh (Cmd+Shift+R / Ctrl+Shift+R)

### No audio at all
1. Check browser permissions (microphone allowed)
2. Check console for errors
3. Verify AWS credentials
4. Check Bedrock model availability

### Gaps still present
1. Check console for "Buffer running low" warnings
2. Verify network speed (should be > 1 Mbps)
3. Try increasing buffer in code (150ms → 200ms)

---

## Expected Console Output

### Healthy Session
```
🎤 Nova Sonic Voice Test Loaded
API Base: http://localhost:8001

Session started: abc123...
Initializing audio schedule: current=0.000s, start=0.150s

Scheduled audio: start=0.150s, duration=0.204s, buffer=0.150s
Scheduled audio: start=0.344s, duration=0.198s, buffer=0.244s
Scheduled audio: start=0.532s, duration=0.201s, buffer=0.332s
Scheduled audio: start=0.723s, duration=0.196s, buffer=0.423s
...

Resetting audio schedule (no active sources)
Session ended
```

---

## Performance Metrics

### Target Metrics
- **Buffer Range**: 150-400ms
- **Overlap**: 10ms per chunk
- **Gap Frequency**: 0 (zero)
- **Startup Time**: < 200ms
- **Audio Quality**: Professional

### Actual Metrics (should match)
- ✅ Buffer stays in optimal range
- ✅ No gaps detected
- ✅ Smooth startup
- ✅ Professional quality

---

## Success Criteria

### ✅ Test Passes If:
1. Audio plays smoothly without gaps
2. Buffer stays 150-400ms
3. No frequent buffer warnings
4. Natural, professional sound quality
5. Console shows healthy scheduling

### ❌ Test Fails If:
1. Audible gaps between words
2. Stuttering or choppy playback
3. Frequent buffer adjustments
4. Robotic or unnatural sound
5. Console errors

---

## Reporting Issues

If audio is still choppy after v2 fix, please provide:

1. **Browser & Version**: e.g., Chrome 119.0.6045.105
2. **OS**: e.g., macOS 13.6.0
3. **Console Logs**: Copy full console output
4. **Network Speed**: Run speed test
5. **Recording**: If possible, screen recording showing issue

---

## Additional Tests

### Network Jitter Simulation
1. Open DevTools → Network tab
2. Select "Slow 3G" throttling
3. Run test - adaptive buffering should handle it

### Concurrent Sessions
1. Open multiple browser tabs
2. Start sessions in each
3. Test audio quality in all tabs

### Long Session Test
1. Keep session active for 10+ minutes
2. Ask multiple questions
3. Verify audio stays smooth throughout

---

## Date
November 8, 2025

## Status
✅ **READY FOR TESTING**

## Expected Result
🎉 **Smooth, professional-quality audio with zero gaps!**

