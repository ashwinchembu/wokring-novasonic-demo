# Duplicate Transcript Fix

## Problem
Text transcripts were being generated twice in the AI Demo 3 application, causing duplicate messages to appear in the UI.

## Root Cause
The issue was caused by **multiple subscriptions** to the same RxPY `output_subject` in the Nova Sonic client:

1. **Subscription leak**: Every time a client connected to the SSE endpoint `/events/stream/{session_id}`, the `get_events_stream()` method created a NEW subscription to `output_subject`
2. **No cleanup**: Subscriptions were never disposed when the stream closed
3. **Broadcasting behavior**: RxPY subjects broadcast events to ALL active subscribers, so if there were 2 connections (e.g., browser auto-reconnect, multiple tabs, or repeated connections), every event would be delivered twice

## Solution

### 1. Fixed Subscription Cleanup (`nova_sonic_client.py`)
Added proper subscription disposal in a `try/finally` block:

```python
async def get_events_stream(self) -> AsyncIterator[dict]:
    """Get an async iterator of events from the output subject."""
    queue = asyncio.Queue()
    subscription = None
    
    try:
        subscription = self.output_subject.subscribe(...)
        
        while True:
            event = await queue.get()
            if event is None:
                break
            yield event
    finally:
        # Clean up subscription when stream closes
        if subscription is not None:
            subscription.dispose()
            logger.debug("Event stream subscription disposed")
```

**Impact**: Ensures that when an SSE connection closes, the RxPY subscription is properly cleaned up, preventing subscription leaks.

### 2. Added Stream Tracking (`session_manager.py`)
Added tracking to ensure only ONE active SSE stream per session:

```python
class SessionManager:
    def __init__(self):
        # ...existing code...
        self.active_streams: Dict[str, bool] = {}  # Track active SSE streams
    
    def has_active_stream(self, session_id: str) -> bool:
        """Check if a session already has an active event stream."""
        return self.active_streams.get(session_id, False)
    
    def mark_stream_active(self, session_id: str):
        """Mark a session as having an active event stream."""
        self.active_streams[session_id] = True
    
    def mark_stream_inactive(self, session_id: str):
        """Mark a session's event stream as inactive."""
        if session_id in self.active_streams:
            del self.active_streams[session_id]
```

**Impact**: Prevents multiple simultaneous SSE connections to the same session.

### 3. Updated SSE Endpoint (`main.py`)
Modified the `/events/stream/{session_id}` endpoint to:

**Check for existing streams:**
```python
@app.get("/events/stream/{session_id}")
async def stream_events(session_id: str):
    # ...get session...
    
    # Check if there's already an active stream for this session
    if session_manager.has_active_stream(session_id):
        logger.warning(f"Attempt to create duplicate stream for session {session_id}")
        raise HTTPException(
            status_code=409, 
            detail="A stream is already active for this session."
        )
```

**Mark stream active/inactive:**
```python
async def event_generator() -> AsyncIterator[dict]:
    try:
        # Mark this stream as active
        session_manager.mark_stream_active(session_id)
        logger.info(f"SSE stream started for session {session_id}")
        
        # ... stream events ...
        
    finally:
        # Always mark stream as inactive when generator exits
        session_manager.mark_stream_inactive(session_id)
        logger.info(f"SSE stream ended for session {session_id}")
```

**Impact**: 
- Prevents duplicate SSE connections at the HTTP level (returns 409 Conflict)
- Tracks stream lifecycle properly
- Adds logging for debugging

## Testing

### Before Fix
- Opening the voice test page would sometimes show duplicate transcripts
- Browser reconnections would create additional subscriptions
- Multiple tabs would multiply the transcripts

### After Fix
- ✅ Only ONE transcript per message
- ✅ Browser reconnections are blocked until the old stream closes
- ✅ Multiple tabs cannot connect to the same session simultaneously
- ✅ Proper cleanup when streams close

### How to Test
1. Start the server: `bash start-real-server.sh`
2. Open test page: http://localhost:8000/test-v2
3. Click "Start Conversation" and speak
4. Verify transcripts appear only ONCE
5. Try opening multiple tabs - second tab should get a 409 error when trying to connect

## Files Modified
- `/backend/app/services/nova_sonic_client.py` - Added subscription cleanup
- `/backend/app/services/session_manager.py` - Added stream tracking
- `/backend/app/main.py` - Added duplicate stream prevention

## Additional Notes
- The frontend (`voice_test_v2.html`) already had duplicate prevention logic (lines 287-295), but this was insufficient because the duplicates were coming from the backend
- The WebSocket endpoint was not affected by this issue since it's a separate code path
- Session cleanup will automatically clean up stream tracking when sessions end

## Prevention
To prevent similar issues in the future:
1. Always dispose of RxPY subscriptions when done
2. Use `try/finally` blocks for cleanup
3. Track active connections/subscriptions at the session level
4. Add logging to identify duplicate connections
5. Consider using single-consumer patterns for event streaming

