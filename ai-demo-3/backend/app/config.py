"""
Configuration module for AI Demo 3 backend.
Reads AWS and application settings from environment variables.
"""
import os
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # AWS Configuration
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None
    aws_region: str = "us-east-1"
    aws_default_region: str = "us-east-1"
    
    # Bedrock Configuration
    bedrock_model_id: str = "amazon.nova-sonic-v1:0"
    bedrock_endpoint_url: Optional[str] = None
    
    # Application Configuration
    app_env: str = "development"
    app_port: int = 8000
    app_host: str = "0.0.0.0"
    log_level: str = "INFO"
    
    # Audio Configuration
    input_sample_rate: int = 16000
    output_sample_rate: int = 24000
    audio_channels: int = 1
    audio_bit_depth: int = 16
    
    # Session Configuration
    max_session_duration: int = 1800  # 30 minutes in seconds
    session_timeout: int = 300  # 5 minutes of inactivity
    max_concurrent_sessions: int = 100
    
    # Nova Sonic Configuration
    max_tokens: int = 1024
    temperature: float = 0.7
    top_p: float = 0.9
    voice_id: str = "matthew"
    
    # System Prompt
    system_prompt: str = (
        "You are a friendly assistant. The user and you will engage in a spoken dialog "
        "exchanging the transcripts of a natural real-time conversation. Keep your responses short, "
        "generally two or three sentences for chatty scenarios."
    )
    
    # CORS Configuration
    cors_origins: str = "http://localhost:8080,http://localhost:3000"
    
    # Redshift Configuration
    redshift_host: Optional[str] = None
    redshift_port: int = 5439
    redshift_db: Optional[str] = None
    redshift_user: Optional[str] = None
    redshift_password: Optional[str] = None
    redshift_use_iam: bool = False
    redshift_connect_timeout: int = 10
    redshift_query_timeout: int = 30
    
    # n8n Configuration
    n8n_webhook_url: Optional[str] = None
    n8n_webhook_secret: Optional[str] = None
    
    # Debug
    debug: bool = False
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
    
    @property
    def region(self) -> str:
        """Return the configured AWS region."""
        return self.aws_region or self.aws_default_region
    
    @property
    def endpoint_url(self) -> str:
        """Return the Bedrock endpoint URL."""
        if self.bedrock_endpoint_url:
            return self.bedrock_endpoint_url
        return f"https://bedrock-runtime.{self.region}.amazonaws.com"
    
    @property
    def cors_origins_list(self) -> list:
        """Parse CORS origins as list."""
        if isinstance(self.cors_origins, str):
            return [origin.strip() for origin in self.cors_origins.split(',')]
        return self.cors_origins


# Global settings instance
settings = Settings()

