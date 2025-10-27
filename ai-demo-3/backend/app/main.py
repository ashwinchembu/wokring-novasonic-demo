"""
AI Demo 3 - FastAPI Backend
Main application with Nova Sonic streaming endpoints with guardrails.
"""
import asyncio
import base64
import json
import hashlib
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.models.session import (
    SessionStartRequest,
    SessionStartResponse,
    AudioChunkRequest,
    AudioEndRequest,
    SessionStatus,
    Speaker,
    AudioFormat
)
from app.services.session_manager import session_manager
from app import guardrails
from app.guardrails_audit import log_guardrail_check

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    logger.info("Starting AI Demo 3 Backend")
    await session_manager.start_cleanup_task()
    yield
    # Shutdown
    logger.info("Shutting down AI Demo 3 Backend")
    await session_manager.shutdown()


app = FastAPI(
    title="AI Demo 3 - Nova Sonic API",
    description="FastAPI backend wrapping Amazon Bedrock Nova Sonic streaming",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "AI Demo 3 - Nova Sonic API",
        "version": "1.0.0",
        "status": "operational"
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0"
    }


@app.post("/session/start", response_model=SessionStartResponse)
async def start_session(request: SessionStartRequest):
    """
    Start a new Nova Sonic session.
    
    Opens a bidirectional stream to Amazon Bedrock Nova Sonic.
    Returns a session ID for subsequent requests.
    """
    try:
        # Prepare kwargs for session creation
        kwargs = {}
        if request.system_prompt:
            kwargs['system_prompt'] = request.system_prompt
        
        # Create session
        session_id, client = await session_manager.create_session(**kwargs)
        
        logger.info(f"Session started: {session_id}")
        
        return SessionStartResponse(
            session_id=session_id,
            status=SessionStatus.ACTIVE,
            created_at=datetime.utcnow()
        )
        
    except ValueError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except Exception as e:
        logger.error(f"Error starting session: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start session: {str(e)}")


@app.post("/audio/chunk")
async def send_audio_chunk(request: AudioChunkRequest):
    """
    Send an audio chunk to an active session.
    
    Forwards base64 LPCM 16kHz mono chunks to Bedrock Nova Sonic.
    """
    # Get session
    client = session_manager.get_session(request.session_id)
    if not client:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if not client.is_active:
        raise HTTPException(status_code=400, detail="Session is not active")
    
    try:
        # Decode base64 audio data
        audio_bytes = base64.b64decode(request.audio_data)
        
        # Send to Nova Sonic
        client.add_audio_chunk(audio_bytes)
        
        # Update session activity
        await session_manager.update_session_activity(request.session_id)
        
        return {"status": "success", "bytes_sent": len(audio_bytes)}
        
    except Exception as e:
        logger.error(f"Error sending audio chunk: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send audio: {str(e)}")


@app.post("/audio/end")
async def end_audio_input(request: AudioEndRequest):
    """
    Signal end of audio input for a session.
    
    Sends contentEnd event to Nova Sonic to indicate user has finished speaking.
    """
    # Get session
    client = session_manager.get_session(request.session_id)
    if not client:
        raise HTTPException(status_code=404, detail="Session not found")
    
    try:
        await client.send_audio_content_end_event()
        await session_manager.update_session_activity(request.session_id)
        
        return {"status": "success", "message": "Audio input ended"}
        
    except Exception as e:
        logger.error(f"Error ending audio input: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to end audio: {str(e)}")


@app.get("/events/stream/{session_id}")
async def stream_events(session_id: str):
    """
    Server-Sent Events (SSE) stream for receiving Nova Sonic responses.
    
    Streams back text transcripts and audio chunks (24kHz mono LPCM base64).
    """
    # Get session
    client = session_manager.get_session(session_id)
    if not client:
        raise HTTPException(status_code=404, detail="Session not found")
    
    async def event_generator() -> AsyncIterator[dict]:
        """Generate SSE events from Nova Sonic output."""
        try:
            # Send audio content start event when client connects
            await client.send_audio_content_start_event()
            
            async for event in client.get_events_stream():
                await session_manager.update_session_activity(session_id)
                
                if not event:
                    break
                
                # Handle different event types
                if 'error' in event:
                    yield {
                        "event": "error",
                        "data": json.dumps({
                            "type": "error",
                            "message": event['error'],
                            "timestamp": datetime.utcnow().isoformat()
                        })
                    }
                    break
                
                if 'event' not in event:
                    continue
                
                event_data = event['event']
                
                # Text output (transcript)
                if 'textOutput' in event_data:
                    text_content = event_data['textOutput']['content']
                    role = client.role or 'assistant'
                    
                    # Skip interrupted messages
                    if '{ "interrupted" : true }' not in text_content:
                        # GUARDRAILS CHECK - Only check assistant text
                        final_text = text_content
                        should_suppress_audio = False
                        
                        if role.lower() == 'assistant':
                            check_result = guardrails.check(
                                text_segment=text_content,
                                locale="en-US",  # TODO: Get from session context
                                role="assistant"
                            )
                            
                            # Log the check for compliance audit
                            log_guardrail_check(
                                session_id=session_id,
                                role="assistant",
                                text=text_content,
                                result=check_result
                            )
                            
                            # Handle violations
                            if check_result.should_block or check_result.should_rewrite:
                                # Replace with compliant message
                                final_text = check_result.action_message
                                should_suppress_audio = True
                                
                                logger.warning(
                                    f"Guardrail violation in session {session_id}: "
                                    f"Replaced with action_message. "
                                    f"Rules: {check_result.all_matched_rules}"
                                )
                                
                                # Store noncompliance flag in session (for audit)
                                if not hasattr(client, 'noncompliance_events'):
                                    client.noncompliance_events = []
                                client.noncompliance_events.append({
                                    "timestamp": datetime.utcnow().isoformat(),
                                    "matched_rules": check_result.all_matched_rules,
                                    "action_taken": "blocked" if check_result.should_block else "rewritten",
                                    "original_text_hash": hashlib.sha256(text_content.encode()).hexdigest()
                                })
                        
                        # Emit transcript (original or compliant replacement)
                        yield {
                            "event": "transcript",
                            "data": json.dumps({
                                "type": "transcript",
                                "speaker": role.lower(),
                                "text": final_text,
                                "timestamp": datetime.utcnow().isoformat()
                            })
                        }
                        
                        # Store suppression flag for audio handling
                        if should_suppress_audio:
                            if not hasattr(client, 'suppress_next_audio'):
                                client.suppress_next_audio = False
                            client.suppress_next_audio = True
                
                # Audio output
                elif 'audioOutput' in event_data:
                    audio_content = event_data['audioOutput']['content']
                    
                    # Check if audio should be suppressed due to guardrail violation
                    if hasattr(client, 'suppress_next_audio') and client.suppress_next_audio:
                        # Suppress this audio chunk (non-compliant content)
                        logger.info(f"Suppressing audio due to guardrail violation in session {session_id}")
                        # Note: In production, you might want to synthesize audio 
                        # from the action_message instead
                        # For now, we just suppress the original audio
                        continue
                    
                    yield {
                        "event": "audio",
                        "data": json.dumps({
                            "type": "audio_response",
                            "audio_data": audio_content,
                            "format": "pcm",
                            "sample_rate": settings.output_sample_rate,
                            "channels": settings.audio_channels,
                            "timestamp": datetime.utcnow().isoformat()
                        })
                    }
                
                # Content start
                elif 'contentStart' in event_data:
                    content_start = event_data['contentStart']
                    yield {
                        "event": "content_start",
                        "data": json.dumps({
                            "type": "content_start",
                            "role": content_start.get('role', 'unknown'),
                            "timestamp": datetime.utcnow().isoformat()
                        })
                    }
                
                # Content end
                elif 'contentEnd' in event_data:
                    yield {
                        "event": "content_end",
                        "data": json.dumps({
                            "type": "content_end",
                            "timestamp": datetime.utcnow().isoformat()
                        })
                    }
        
        except Exception as e:
            logger.error(f"Error in event stream: {e}")
            yield {
                "event": "error",
                "data": json.dumps({
                    "type": "error",
                    "message": str(e),
                    "timestamp": datetime.utcnow().isoformat()
                })
            }
    
    return EventSourceResponse(event_generator())


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for bidirectional audio streaming.
    
    Alternative to REST endpoints for real-time streaming.
    """
    await websocket.accept()
    logger.info(f"WebSocket connection accepted for session: {session_id}")
    
    # Get or create session
    client = session_manager.get_session(session_id)
    if not client:
        try:
            session_id, client = await session_manager.create_session()
            await websocket.send_json({
                "type": "session_created",
                "session_id": session_id
            })
        except Exception as e:
            await websocket.send_json({
                "type": "error",
                "message": f"Failed to create session: {str(e)}"
            })
            await websocket.close()
            return
    
    # Start audio content
    await client.send_audio_content_start_event()
    
    # Task for receiving audio from client
    async def receive_audio():
        try:
            while True:
                message = await websocket.receive_json()
                
                if message.get('type') == 'audio_data':
                    audio_data = message.get('data')
                    if audio_data:
                        audio_bytes = base64.b64decode(audio_data)
                        client.add_audio_chunk(audio_bytes)
                        await session_manager.update_session_activity(session_id)
                
                elif message.get('type') == 'end_audio':
                    await client.send_audio_content_end_event()
                
                elif message.get('type') == 'end_session':
                    break
                    
        except WebSocketDisconnect:
            logger.info(f"WebSocket disconnected: {session_id}")
        except Exception as e:
            logger.error(f"Error receiving audio: {e}")
    
    # Task for sending responses to client
    async def send_responses():
        try:
            async for event in client.get_events_stream():
                if not event:
                    break
                
                await session_manager.update_session_activity(session_id)
                
                if 'event' not in event:
                    continue
                
                event_data = event['event']
                
                # Text output
                if 'textOutput' in event_data:
                    text_content = event_data['textOutput']['content']
                    if '{ "interrupted" : true }' not in text_content:
                        await websocket.send_json({
                            "type": "transcript",
                            "speaker": (client.role or 'assistant').lower(),
                            "text": text_content,
                            "timestamp": datetime.utcnow().isoformat()
                        })
                
                # Audio output
                elif 'audioOutput' in event_data:
                    audio_content = event_data['audioOutput']['content']
                    await websocket.send_json({
                        "type": "audio_response",
                        "audio_data": audio_content,
                        "format": "pcm",
                        "sample_rate": settings.output_sample_rate,
                        "channels": settings.audio_channels
                    })
                    
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.error(f"Error sending responses: {e}")
            await websocket.send_json({
                "type": "error",
                "message": str(e)
            })
    
    # Run both tasks concurrently
    try:
        await asyncio.gather(
            receive_audio(),
            send_responses()
        )
    finally:
        await session_manager.end_session(session_id)
        try:
            await websocket.close()
        except:
            pass


@app.delete("/session/{session_id}")
async def end_session(session_id: str):
    """
    End a session and clean up resources.
    
    Sends promptEnd and sessionEnd events, closes the Bedrock stream.
    """
    client = session_manager.get_session(session_id)
    if not client:
        raise HTTPException(status_code=404, detail="Session not found")
    
    try:
        await session_manager.end_session(session_id)
        return {"status": "success", "message": "Session ended"}
        
    except Exception as e:
        logger.error(f"Error ending session: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to end session: {str(e)}")


@app.get("/session/{session_id}/info")
async def get_session_info(session_id: str):
    """Get information about a session."""
    info = session_manager.get_session_info(session_id)
    if not info:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return info


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=settings.debug,
        log_level=settings.log_level.lower()
    )


# Serve static test pages
from fastapi.responses import FileResponse
import os

@app.get("/test")
async def serve_test_page():
    """Serve the voice test page (original version)."""
    static_file = os.path.join(os.path.dirname(__file__), "..", "static", "voice_test.html")
    return FileResponse(static_file)

@app.get("/test-v2")
async def serve_test_page_v2():
    """Serve the improved voice test page (v2 with fixed audio and transcripts)."""
    static_file = os.path.join(os.path.dirname(__file__), "..", "static", "voice_test_v2.html")
    return FileResponse(static_file)

@app.post("/admin/guardrails/reload")
async def reload_guardrails():
    """Admin endpoint to force reload guardrails from Excel file."""
    try:
        guardrails.reload_rules()
        config = guardrails.load_guardrails()
        
        return {
            "status": "success",
            "message": "Guardrails reloaded successfully",
            "loaded_at": config.loaded_at.isoformat(),
            "total_rules": len(config.rules),
            "enabled_rules": sum(1 for r in config.rules if r.enabled),
            "categories": list(set(r.category for r in config.rules if r.enabled))
        }
    except Exception as e:
        logger.error(f"Error reloading guardrails: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to reload guardrails: {str(e)}")

@app.get("/admin/guardrails/status")
async def get_guardrails_status():
    """Get current guardrails configuration status."""
    try:
        config = guardrails.load_guardrails()
        
        return {
            "loaded_at": config.loaded_at.isoformat(),
            "file_path": str(config.file_path),
            "file_modified": config.file_modified.isoformat(),
            "total_rules": len(config.rules),
            "enabled_rules": sum(1 for r in config.rules if r.enabled),
            "categories": list(set(r.category for r in config.rules if r.enabled)),
            "rules_by_category": {
                cat: sum(1 for r in config.rules if r.category == cat and r.enabled)
                for cat in set(r.category for r in config.rules)
            }
        }
    except Exception as e:
        logger.error(f"Error getting guardrails status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/admin/audit/session/{session_id}")
async def get_session_audit_logs(session_id: str, include_text: bool = False):
    """Get audit logs for a specific session (admin only, no PII)."""
    try:
        from app.guardrails_audit import get_audit_logger
        
        audit_logger = get_audit_logger()
        logs = audit_logger.read_session_logs(session_id, include_text=include_text)
        
        return {
            "session_id": session_id,
            "total_checks": len(logs),
            "violations": sum(1 for log in logs if log.get("violated")),
            "logs": logs
        }
    except Exception as e:
        logger.error(f"Error retrieving audit logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))
