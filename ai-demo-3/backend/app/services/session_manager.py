"""Session manager for handling multiple concurrent Nova Sonic sessions."""
import asyncio
import logging
from datetime import datetime
from typing import Dict, Optional
from app.services.nova_sonic_client import NovaSonicClient
from app.models.session import SessionStatus, SessionInfo
from app.config import settings

logger = logging.getLogger(__name__)


class SessionManager:
    """Manages multiple Nova Sonic client sessions."""
    
    def __init__(self):
        self.sessions: Dict[str, NovaSonicClient] = {}
        self.session_info: Dict[str, SessionInfo] = {}
        self._cleanup_task: Optional[asyncio.Task] = None
    
    async def create_session(
        self,
        system_prompt: Optional[str] = None,
        **kwargs
    ) -> tuple[str, NovaSonicClient]:
        """Create a new Nova Sonic session."""
        # Check concurrent session limit
        active_sessions = sum(
            1 for info in self.session_info.values()
            if info.status == SessionStatus.ACTIVE
        )
        
        if active_sessions >= settings.max_concurrent_sessions:
            raise ValueError(f"Maximum concurrent sessions ({settings.max_concurrent_sessions}) reached")
        
        # Create new client
        client = NovaSonicClient(system_prompt=system_prompt, **kwargs)
        
        try:
            await client.initialize_stream()
            
            # Store session
            session_id = client.session_id
            self.sessions[session_id] = client
            self.session_info[session_id] = SessionInfo(
                session_id=session_id,
                status=SessionStatus.ACTIVE,
                created_at=datetime.utcnow(),
                last_activity=datetime.utcnow()
            )
            
            logger.info(f"Session created: {session_id}")
            return session_id, client
            
        except Exception as e:
            logger.error(f"Failed to create session: {e}")
            raise
    
    def get_session(self, session_id: str) -> Optional[NovaSonicClient]:
        """Get an existing session."""
        return self.sessions.get(session_id)
    
    def get_session_info(self, session_id: str) -> Optional[SessionInfo]:
        """Get session information."""
        return self.session_info.get(session_id)
    
    async def end_session(self, session_id: str):
        """End a session and clean up resources."""
        client = self.sessions.get(session_id)
        if not client:
            logger.warning(f"Session not found: {session_id}")
            return
        
        try:
            await client.close()
            
            # Update session info
            if session_id in self.session_info:
                self.session_info[session_id].status = SessionStatus.ENDED
                self.session_info[session_id].last_activity = datetime.utcnow()
            
            # Remove from active sessions
            del self.sessions[session_id]
            
            logger.info(f"Session ended: {session_id}")
            
        except Exception as e:
            logger.error(f"Error ending session {session_id}: {e}")
            if session_id in self.session_info:
                self.session_info[session_id].status = SessionStatus.ERROR
    
    async def update_session_activity(self, session_id: str):
        """Update last activity timestamp for a session."""
        if session_id in self.session_info:
            self.session_info[session_id].last_activity = datetime.utcnow()
    
    async def cleanup_inactive_sessions(self):
        """Clean up sessions that have been inactive for too long."""
        now = datetime.utcnow()
        timeout_seconds = settings.session_timeout
        
        sessions_to_end = []
        for session_id, info in self.session_info.items():
            if info.status == SessionStatus.ACTIVE and info.last_activity:
                inactive_duration = (now - info.last_activity).total_seconds()
                if inactive_duration > timeout_seconds:
                    sessions_to_end.append(session_id)
        
        for session_id in sessions_to_end:
            logger.info(f"Cleaning up inactive session: {session_id}")
            await self.end_session(session_id)
    
    async def start_cleanup_task(self):
        """Start background task for cleaning up inactive sessions."""
        async def cleanup_loop():
            while True:
                try:
                    await asyncio.sleep(60)  # Check every minute
                    await self.cleanup_inactive_sessions()
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Error in cleanup task: {e}")
        
        self._cleanup_task = asyncio.create_task(cleanup_loop())
        logger.info("Cleanup task started")
    
    async def stop_cleanup_task(self):
        """Stop background cleanup task."""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            logger.info("Cleanup task stopped")
    
    async def shutdown(self):
        """Shutdown all sessions and cleanup."""
        logger.info("Shutting down session manager")
        
        # Stop cleanup task
        await self.stop_cleanup_task()
        
        # Close all active sessions
        session_ids = list(self.sessions.keys())
        for session_id in session_ids:
            await self.end_session(session_id)
        
        logger.info("Session manager shutdown complete")


# Global session manager instance
session_manager = SessionManager()

