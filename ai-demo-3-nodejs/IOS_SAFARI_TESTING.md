# iOS Safari Testing Guide

## 🎯 Overview

This guide covers testing the NovaSonic POC on iOS Safari/iPad to ensure full compatibility.

## 📱 Known iOS/Safari Limitations

### 1. AudioContext Initialization
- **Issue**: AudioContext must be created from user interaction
- **Solution**: ✅ Implemented in `voice-test-enhanced.html`
- **Test**: Tap "Start Session" button should initialize audio

### 2. ScriptProcessor Deprecation
- **Issue**: `createScriptProcessor()` is deprecated, may not work on future iOS
- **Current**: Works but needs migration to AudioWorklet
- **Priority**: Medium (works now, but should be upgraded)

### 3. Microphone Permissions
- **Issue**: iOS requires explicit permission prompt
- **Solution**: ✅ Implemented via `getUserMedia()`
- **Test**: Should show native permission dialog

### 4. WebSocket over HTTPS
- **Issue**: iOS Safari requires WSS (WebSocket Secure) for microphone access
- **Solution**: Must deploy with HTTPS certificate
- **Test**: Use `wss://` protocol in production

### 5. Audio Autoplay Restrictions
- **Issue**: iOS blocks autoplay of audio
- **Solution**: ✅ Audio playback triggered by user interaction
- **Test**: Audio should play after user starts recording

## 🧪 Testing Checklist

### Pre-Test Setup

1. **Device**: iPad (borrow from Abhinav)
2. **Browser**: Safari (latest version)
3. **Network**: Wi-Fi with stable connection
4. **Server**: Deployed with HTTPS (required for microphone)

### Test Cases

#### ✅ Test 1: Basic Page Load
- [ ] Open https://your-server.com in Safari
- [ ] Page loads without errors
- [ ] UI elements visible and styled correctly
- [ ] No console errors (use Safari Developer Tools)

**How to check console on iOS:**
1. On Mac: Safari > Preferences > Advanced > Show Develop menu
2. Connect iPad via USB
3. Safari (Mac) > Develop > [Your iPad] > [Your Page]

#### ✅ Test 2: Session Start
- [ ] Tap "Start Session" button
- [ ] Status changes to "Connected"
- [ ] Session info displays correctly
- [ ] No errors in console

**Expected behavior:**
```
Status: Connected
Session ID: abc12345...
Mode: voice
Status: Active
```

#### ✅ Test 3: Microphone Permission
- [ ] Tap "Start Recording"
- [ ] iOS permission dialog appears
- [ ] Grant permission
- [ ] Recording starts successfully
- [ ] Audio visualizer animates

**Expected iOS Permission Dialog:**
```
"your-server.com" Would Like to Access the Microphone
[Don't Allow] [OK]
```

#### ✅ Test 4: Voice Recording
- [ ] Speak into microphone for 5 seconds
- [ ] Audio visualizer shows activity
- [ ] No audio distortion or lag
- [ ] Tap "Stop Recording"
- [ ] Recording stops cleanly

**What to say:**
"Hello, this is a test recording on iPad Safari. My name is [your name] and today is [date]."

#### ✅ Test 5: Audio Playback
- [ ] Wait for server response
- [ ] Audio plays automatically
- [ ] Audio is clear (no distortion)
- [ ] Audio completes without cutting off
- [ ] Transcript appears in UI

**Check:**
- Audio quality (clear speech)
- No crackling/popping
- Complete playback
- Proper transcript

#### ✅ Test 6: Multi-Turn Conversation
- [ ] Complete first recording/response cycle
- [ ] Start second recording
- [ ] Ask about something from first turn
- [ ] Verify AI remembers context

**Example conversation:**
```
Turn 1: "My name is John and I work at ABC company"
[Wait for response]
Turn 2: "What did I just tell you?"
[Should respond with name and company]
```

#### ✅ Test 7: Text Mode (WebSocket)
- [ ] Switch to "Text Mode"
- [ ] Text input becomes enabled
- [ ] Type a message
- [ ] Tap "Send Message" or press Enter
- [ ] Message appears in transcript
- [ ] Response received

**Test message:**
"Hello, this is a test message via WebSocket on iPad."

#### ✅ Test 8: Mode Switching
- [ ] Start in Voice mode
- [ ] Switch to Text mode
- [ ] Send a text message
- [ ] Switch back to Voice mode
- [ ] Record audio
- [ ] Both modes work correctly

#### ✅ Test 9: Session Recovery
- [ ] Start session and have conversation
- [ ] Note the conversation history
- [ ] Close Safari (swipe up to kill app)
- [ ] Reopen Safari
- [ ] Navigate to app
- [ ] Start new session
- [ ] Verify history is recovered

**Expected:**
```
Session recovered!
Loaded 3 previous turns:
  Turn 1 - user: "Hello..."
  Turn 2 - assistant: "Hi..."
  Turn 3 - user: "..."
```

#### ✅ Test 10: Network Interruption
- [ ] Start recording
- [ ] Turn on Airplane mode mid-recording
- [ ] Check error handling
- [ ] Turn off Airplane mode
- [ ] Verify app recovers gracefully

**Expected behavior:**
- Error message displayed
- No app crash
- Can reconnect after network returns

#### ✅ Test 11: Orientation Change
- [ ] Start session in portrait
- [ ] Rotate to landscape
- [ ] Verify UI adapts
- [ ] All functions still work
- [ ] Rotate back to portrait

#### ✅ Test 12: Background/Foreground
- [ ] Start recording
- [ ] Press Home button (app goes to background)
- [ ] Wait 5 seconds
- [ ] Return to app
- [ ] Check if recording continued or stopped gracefully

**Expected behavior:**
- Recording should stop when backgrounded
- App should recover when foregrounded

#### ✅ Test 13: Long Session
- [ ] Start session
- [ ] Have 10+ back-and-forth conversations
- [ ] Check for memory leaks
- [ ] Verify performance remains stable

**Monitor:**
- UI responsiveness
- Audio quality consistency
- Memory usage (Settings > Safari > Advanced > Web Inspector)

#### ✅ Test 14: Multiple Sessions
- [ ] Start session
- [ ] End session
- [ ] Start new session
- [ ] Repeat 3-5 times
- [ ] Verify no issues with cleanup

## 🐛 Known Issues & Workarounds

### Issue 1: ScriptProcessor Deprecated
**Status**: Works but deprecated  
**Impact**: May stop working in future iOS updates  
**Workaround**: Plan to migrate to AudioWorklet  
**Priority**: Medium (not urgent but should be addressed)

**Migration Plan:**
```javascript
// TODO: Replace ScriptProcessor with AudioWorklet
// Create audioWorklet.js:
class AudioProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const channel = input[0];
    
    if (channel) {
      // Process audio and send to main thread
      this.port.postMessage(channel);
    }
    
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
```

### Issue 2: WebSocket Connection Drops
**Status**: Can happen on network changes  
**Impact**: Lost connection  
**Workaround**: ✅ Implemented auto-reconnect  
**Test**: Verify reconnection works

### Issue 3: Audio Playback Delay
**Status**: Minor delay on first playback  
**Impact**: ~200ms delay  
**Workaround**: Audio context pre-initialization  
**Priority**: Low (acceptable latency)

## 📊 Performance Benchmarks

### Target Metrics
- Page load: < 3 seconds
- Session start: < 1 second
- Recording start: < 500ms
- Audio playback latency: < 500ms
- WebSocket message: < 100ms

### Measure Performance

```javascript
// Add to console during testing
console.time('session-start');
// Click start session button
console.timeEnd('session-start');

console.time('recording-start');
// Click start recording
console.timeEnd('recording-start');
```

## 🎯 Acceptance Criteria

The POC passes iOS/Safari testing if:

- [x] All 14 test cases pass
- [x] No critical errors in console
- [x] Audio quality is clear
- [x] Microphone permission works
- [x] WebSocket connects successfully
- [x] Session recovery works
- [x] Performance meets targets
- [x] UI is responsive and usable
- [x] Multi-turn conversation works
- [x] App recovers from errors gracefully

## 🔧 Debugging Tools

### Safari Developer Tools

1. **Enable on iPad:**
   - Settings > Safari > Advanced > Web Inspector (ON)

2. **Connect from Mac:**
   - Safari > Develop > [iPad Name] > [Page URL]

3. **Key panels:**
   - Console: Error messages
   - Network: API calls, WebSocket
   - Timeline: Performance profiling
   - Storage: LocalStorage, cookies

### Console Commands

```javascript
// Check audio context state
playbackContext.state  // Should be 'running'

// Check WebSocket status
websocket.readyState  // 1 = OPEN, 0 = CONNECTING, 2 = CLOSING, 3 = CLOSED

// Check session
sessionId  // Should have UUID
bedrockSessionId  // Should have session ID

// Check audio queue
audioQueue.length  // Number of pending audio chunks

// Force audio context resume (if suspended)
playbackContext.resume()
```

## 📝 Test Report Template

```
Date: ___________
Tester: ___________
Device: iPad ___________
iOS Version: ___________
Safari Version: ___________

Test Results:
[ ] Test 1: Basic Page Load - PASS/FAIL
[ ] Test 2: Session Start - PASS/FAIL
[ ] Test 3: Microphone Permission - PASS/FAIL
[ ] Test 4: Voice Recording - PASS/FAIL
[ ] Test 5: Audio Playback - PASS/FAIL
[ ] Test 6: Multi-Turn Conversation - PASS/FAIL
[ ] Test 7: Text Mode - PASS/FAIL
[ ] Test 8: Mode Switching - PASS/FAIL
[ ] Test 9: Session Recovery - PASS/FAIL
[ ] Test 10: Network Interruption - PASS/FAIL
[ ] Test 11: Orientation Change - PASS/FAIL
[ ] Test 12: Background/Foreground - PASS/FAIL
[ ] Test 13: Long Session - PASS/FAIL
[ ] Test 14: Multiple Sessions - PASS/FAIL

Issues Found:
1. _____________________________________
2. _____________________________________
3. _____________________________________

Performance Metrics:
- Page Load: _____ ms
- Session Start: _____ ms
- Recording Start: _____ ms
- Audio Latency: _____ ms

Overall Status: PASS/FAIL

Notes:
_________________________________________
_________________________________________
```

## 🚀 Next Steps After Testing

1. **If all tests pass:**
   - Document passing test report
   - Get sign-off from Saurabh
   - Schedule deployment to staging

2. **If issues found:**
   - Document each issue with:
     - Steps to reproduce
     - Expected behavior
     - Actual behavior
     - Screenshots/video
   - Prioritize issues (P0/P1/P2)
   - Fix P0 issues immediately
   - Retest

3. **Follow-up items:**
   - Plan AudioWorklet migration
   - Performance optimization if needed
   - Additional user testing with real HCPs

## 📞 Contacts for Testing

- **iPad Device**: Borrow from Abhinav
- **Test Coordination**: Saurabh
- **Technical Issues**: Development team

