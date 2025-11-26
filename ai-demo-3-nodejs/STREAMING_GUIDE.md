# Nova Sonic Streaming Architecture

## Subject / Queue / Signal Pattern

### What are these?

**Subject (from RxJS)**
- Think of it as an "event broadcaster"
- Multiple listeners can subscribe
- You push values to it: `subject.next(value)`
- All subscribers get notified

**queueSignal**
- A Subject that signals "new event is ready"
- Doesn't carry data, just signals

**closeSignal**
- A Subject that signals "stream is done"
- Terminates the drain loop

**queue**
- Simple JavaScript array: `[]`
- Holds events waiting to be sent

### How the Flow Works

```javascript
// 1. Push event to queue
queue.push(event);

// 2. Signal that queue has data
queueSignal.next();

// 3. Drain loop wakes up, sees queue has items
while (queue.length > 0) {
  event = queue.shift();  // Take from front
  sendToBedrock(event);   // Send it
}

// 4. When done
closeSignal.next();  // Triggers cleanup
```

### Visual Example

```
Client wants to send system prompt:

┌─────────────────┐
│  queue.push()   │  Add event to queue
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ queueSignal.    │  Wake up drain loop
│    next()       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Drain Loop     │  Pulls from queue
│  queue.shift()  │  Sends to Bedrock
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  AWS Bedrock    │  Receives event
└─────────────────┘
```

### Why Use This Pattern?

**Problem:** Bedrock expects events in a specific order at specific times

**Solution:** Queue events locally, drain them in order when ready

**Benefits:**
- Control timing
- Handle backpressure
- Easy to debug (inspect queue)

## Session Persistence (EKS Pod Restart)

### Problem
Pod restarts → queue cleared → context lost

### Solution
Store conversation in Bedrock Agent Runtime (external service)

### How It Works

```javascript
// On each turn completion:
1. Save turn to Bedrock session
   - User transcript
   - Assistant transcript
   - Turn number

2. Store Bedrock session ID in frontend localStorage

3. On reconnect:
   - Frontend sends existingBedrockSessionId
   - Backend loads all turns from Bedrock
   - Rebuilds conversation history
   - Continues where left off
```

### Code Flow

```javascript
// Turn completion
async completeTurn() {
  // Build turn object
  const turn = {
    number: this.conversationHistory.currentTurnNumber,
    userTranscript: this.currentUserTranscript,
    assistantTranscript: this.currentAssistantTranscript,
    timestamp: new Date()
  };
  
  // Save locally
  this.conversationHistory.turns.push(turn);
  
  // Save to Bedrock (survives restart)
  await this.persistTurnToBedrock(turn);
}

// Session recovery
async loadHistory(bedrockSessionId) {
  const steps = await bedrockSessionService.listInvocationSteps(
    bedrockSessionId, 
    invocationId
  );
  
  // Rebuild history from steps
  for (const step of steps) {
    this.conversationHistory.turns.push(step.data);
  }
}
```

## Multi-Turn Conversation Flow

### AWS Nova Sonic Spec

From: https://docs.aws.amazon.com/nova/latest/userguide/input-events.html

```
Turn 1 (Initial):
  sessionStart
  promptStart (tools, config)
  contentStart (TEXT)
    → textInput (system prompt)
  contentEnd
  contentStart (AUDIO)
    → audioInput (user audio chunks)
  contentEnd
  promptEnd
  
  ✅ SAVE: 
     - User: "hello"
     - Assistant: "Hi there! How can I help?"

Turn 2+ (Subsequent):
  promptStart (tools, config)
  contentStart (TEXT)
    → textInput (system prompt)
    → textInput (turn 1 user: "hello")
    → textInput (turn 1 assistant: "Hi there! How can I help?")
    ... all prior turns ...
  contentEnd
  contentStart (AUDIO)
    → audioInput (new user audio: "what did I say?")
  contentEnd
  promptEnd
  
  ✅ SAVE:
     - User: "what did I say?"
     - Assistant: "You said hello"
```

### Key Rule

**History MUST be sent BEFORE new audio on each turn**

This is how the model maintains context and can answer questions like:
- "What did I just say?"
- "Remind me what we discussed"
- "What was the HCP's name I mentioned?"

### How History is Captured

1. **During Turn**: Text transcripts accumulate
   - `currentUserTranscript += "hello"`
   - `currentAssistantTranscript += "Hi there!"`

2. **End of Turn**: `completeTurn()` saves to history
   ```javascript
   conversationHistory.turns.push({
     role: 'user',
     text: 'hello',
     timestamp: new Date()
   });
   conversationHistory.turns.push({
     role: 'assistant', 
     text: 'Hi there! How can I help?',
     timestamp: new Date()
   });
   ```

3. **Next Turn**: `prepareForNextTurn()` sends all history
   ```javascript
   for (const turn of conversationHistory.turns) {
     sendTextInput(turn.role, turn.text);
   }
   ```

4. **Model Receives**: Full conversation context
   - Can reference any previous statement
   - Maintains coherent multi-turn dialog

### Implementation

```javascript
async prepareForNextTurn() {
  // Save completed turn
  await this.completeTurn();
  
  // On next startRecording():
  if (!isFirstTurn) {
    // Send history before audio
    await this.sendConversationHistory();
  }
  
  // Then start accepting audio
  await this.sendAudioContentStartEvent();
}
```

## Debugging Guide

### Check Queue State

```javascript
// In novaSonicClient.js
console.log('Queue length:', this.sessionData.queue.length);
console.log('Queue contents:', this.sessionData.queue);
```

### Check History

```javascript
// In novaSonicClient.js
console.log('Turns:', this.conversationHistory.turns.length);
console.log('Current turn:', this.conversationHistory.currentTurnNumber);
```

### Check Bedrock Session

```bash
# API call
curl http://localhost:8000/session/status?sessionId=<id>
```

### Common Issues

**Issue:** Audio not streaming
**Check:** Is queue being drained? Add logs in drain loop

**Issue:** Context not maintained across turns
**Check:** Is history being sent before audio? Check logs for "Sending conversation history"

**Issue:** Session lost after disconnect
**Check:** Is bedrockSessionId in localStorage? Check browser DevTools

## Testing Checklist

### Basic Flow
- [ ] Start session
- [ ] Record audio
- [ ] Get response
- [ ] Stop recording

### Multi-Turn
- [ ] Complete turn 1
- [ ] Check history saved
- [ ] Start turn 2
- [ ] Verify history sent before new audio
- [ ] Get contextual response

### Recovery
- [ ] Complete 2 turns
- [ ] Note bedrockSessionId
- [ ] Disconnect (or restart server)
- [ ] Start new session with same bedrockSessionId
- [ ] Verify history loaded
- [ ] Continue conversation

### Database Fallback
- [ ] Start with no Redshift
- [ ] Verify SQLite active
- [ ] Record calls
- [ ] Check `/db/healthz` shows SQLite

