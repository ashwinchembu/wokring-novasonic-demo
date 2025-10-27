"""Session models and schemas."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from enum import Enum


class SessionStatus(str, Enum):
    """Session status enumeration."""
    CREATED = "created"
    ACTIVE = "active"
    ENDED = "ended"
    ERROR = "error"


class AudioFormat(str, Enum):
    """Audio format enumeration."""
    PCM = "pcm"
    WAV = "wav"
    MP3 = "mp3"


class Speaker(str, Enum):
    """Speaker enumeration."""
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class SessionStartRequest(BaseModel):
    """Request model for starting a new session."""
    system_prompt: Optional[str] = None
    voice_id: Optional[str] = None
    temperature: Optional[float] = Field(None, ge=0.0, le=1.0)
    max_tokens: Optional[int] = Field(None, ge=100, le=4000)
    top_p: Optional[float] = Field(None, ge=0.0, le=1.0)


class SessionStartResponse(BaseModel):
    """Response model for session start."""
    session_id: str
    status: SessionStatus
    created_at: datetime


class AudioChunkRequest(BaseModel):
    """Request model for audio chunk."""
    session_id: str
    audio_data: str  # Base64 encoded
    format: AudioFormat = AudioFormat.PCM
    sample_rate: int = 16000
    channels: int = 1


class AudioEndRequest(BaseModel):
    """Request model for ending audio input."""
    session_id: str


class TranscriptMessage(BaseModel):
    """Transcript message model."""
    speaker: Speaker
    text: str
    timestamp: datetime
    confidence: Optional[float] = None
    is_final: bool = False


class AudioResponseMessage(BaseModel):
    """Audio response message model."""
    audio_data: str  # Base64 encoded
    format: AudioFormat = AudioFormat.PCM
    sample_rate: int = 24000
    channels: int = 1
    transcript: Optional[str] = None


class ErrorMessage(BaseModel):
    """Error message model."""
    error_code: str
    message: str
    details: Optional[dict] = None


class SessionInfo(BaseModel):
    """Session information model."""
    session_id: str
    status: SessionStatus
    created_at: datetime
    last_activity: Optional[datetime] = None
    audio_bytes_sent: int = 0
    audio_bytes_received: int = 0
    message_count: int = 0

