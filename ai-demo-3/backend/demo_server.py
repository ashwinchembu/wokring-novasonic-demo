#!/usr/bin/env python3
"""
Demo server for AI Demo 3 - works without AWS SDK for structure demonstration.
This shows the API structure and allows testing of the endpoints.
"""
import asyncio
import base64
import json
import logging
from datetime import datetime
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Models
class SessionStartRequest(BaseModel):
    system_prompt: Optional[str] = None
    voice_id: Optional[str] = None
    temperature: Optional[float] = Field(None, ge=0.0, le=1.0)

class SessionStartResponse(BaseModel):
    session_id: str
    status: str
    created_at: datetime

class AudioChunkRequest(BaseModel):
    session_id: str
    audio_data: str
    format: str = "pcm"
    sample_rate: int = 16000
    channels: int = 1

class AudioEndRequest(BaseModel):
    session_id: str

# Mock session storage
sessions = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Demo server starting...")
    yield
    logger.info("👋 Demo server shutting down...")

app = FastAPI(
    title="AI Demo 3 - Nova Sonic API (Demo Mode)",
    description="FastAPI backend structure demonstration - AWS SDK not required for testing",
    version="1.0.0-demo",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "service": "AI Demo 3 - Nova Sonic API (Demo Mode)",
        "version": "1.0.0-demo",
        "status": "operational",
        "note": "This is a demo server showing API structure. AWS SDK not connected."
    }

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0-demo",
        "mode": "demonstration"
    }

@app.post("/session/start", response_model=SessionStartResponse)
async def start_session(request: SessionStartRequest):
    """Start a new session (demo mode)."""
    import uuid
    session_id = str(uuid.uuid4())
    
    sessions[session_id] = {
        "created_at": datetime.utcnow(),
        "status": "active",
        "system_prompt": request.system_prompt,
        "chunks_received": 0
    }
    
    logger.info(f"✓ Session created: {session_id}")
    
    return SessionStartResponse(
        session_id=session_id,
        status="active",
        created_at=datetime.utcnow()
    )

@app.post("/audio/chunk")
async def send_audio_chunk(request: AudioChunkRequest):
    """Send audio chunk (demo mode)."""
    if request.session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Decode to verify it's valid base64
    try:
        audio_bytes = base64.b64decode(request.audio_data)
        sessions[request.session_id]["chunks_received"] += 1
        
        logger.info(f"✓ Audio chunk received for {request.session_id}: {len(audio_bytes)} bytes")
        
        return {
            "status": "success",
            "bytes_sent": len(audio_bytes),
            "chunk_number": sessions[request.session_id]["chunks_received"]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid audio data: {str(e)}")

@app.post("/audio/end")
async def end_audio_input(request: AudioEndRequest):
    """End audio input (demo mode)."""
    if request.session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    logger.info(f"✓ Audio ended for {request.session_id}")
    
    return {"status": "success", "message": "Audio input ended"}

@app.get("/events/stream/{session_id}")
async def stream_events(session_id: str):
    """Stream events (demo mode)."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    async def event_generator():
        """Generate demo SSE events."""
        # Send some demo events
        events = [
            {
                "event": "transcript",
                "data": json.dumps({
                    "type": "transcript",
                    "speaker": "user",
                    "text": "Hello, this is a demo!",
                    "timestamp": datetime.utcnow().isoformat()
                })
            },
            {
                "event": "transcript",
                "data": json.dumps({
                    "type": "transcript",
                    "speaker": "assistant",
                    "text": "Hello! I'm a demo response. In production, this would be Nova Sonic's voice response.",
                    "timestamp": datetime.utcnow().isoformat()
                })
            },
            {
                "event": "audio",
                "data": json.dumps({
                    "type": "audio_response",
                    "audio_data": base64.b64encode(b'\x00' * 1024).decode(),
                    "format": "pcm",
                    "sample_rate": 24000,
                    "channels": 1,
                    "timestamp": datetime.utcnow().isoformat(),
                    "note": "Demo audio (silence)"
                })
            }
        ]
        
        for event in events:
            yield f"event: {event['event']}\ndata: {event['data']}\n\n"
            await asyncio.sleep(1)
        
        logger.info(f"✓ Finished streaming events for {session_id}")
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream"
    )

@app.delete("/session/{session_id}")
async def end_session(session_id: str):
    """End session (demo mode)."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    del sessions[session_id]
    logger.info(f"✓ Session ended: {session_id}")
    
    return {"status": "success", "message": "Session ended"}

@app.get("/session/{session_id}/info")
async def get_session_info(session_id: str):
    """Get session info (demo mode)."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    info = sessions[session_id]
    return {
        "session_id": session_id,
        "status": info["status"],
        "created_at": info["created_at"].isoformat(),
        "chunks_received": info["chunks_received"],
        "mode": "demo"
    }

# Serve static test pages
from fastapi.responses import FileResponse
import os

@app.get("/test")
async def serve_test_page():
    """Serve the voice test page (original version)."""
    static_file = os.path.join(os.path.dirname(__file__), "static", "voice_test.html")
    return FileResponse(static_file)

@app.get("/test-v2")
async def serve_test_page_v2():
    """Serve the improved voice test page (v2 with fixed audio and transcripts)."""
    static_file = os.path.join(os.path.dirname(__file__), "static", "voice_test_v2.html")
    return FileResponse(static_file)

if __name__ == "__main__":
    import uvicorn
    print("\n" + "=" * 60)
    print("🚀 Starting AI Demo 3 Backend (Demo Mode)")
    print("=" * 60)
    print("\nThis is a demonstration server showing the API structure.")
    print("AWS Bedrock SDK is not required for this demo.")
    print("\n📚 API Documentation:")
    print("   http://localhost:8000/docs")
    print("\n🔍 Health Check:")
    print("   http://localhost:8000/health")
    print("\n" + "=" * 60 + "\n")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )

