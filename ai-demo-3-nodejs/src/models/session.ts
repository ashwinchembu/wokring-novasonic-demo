/**
 * Session models and TypeScript types
 */

export enum SessionStatus {
  CREATED = 'created',
  ACTIVE = 'active',
  ENDED = 'ended',
  ERROR = 'error',
}

export enum AudioFormat {
  PCM = 'pcm',
  WAV = 'wav',
  MP3 = 'mp3',
}

export enum Speaker {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export interface SessionStartRequest {
  systemPrompt?: string;
  voiceId?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface SessionStartResponse {
  sessionId: string;
  status: SessionStatus;
  createdAt: Date;
}

export interface AudioChunkRequest {
  sessionId: string;
  audioData: string; // Base64 encoded
  format?: AudioFormat;
  sampleRate?: number;
  channels?: number;
}

export interface AudioEndRequest {
  sessionId: string;
}

export interface TranscriptMessage {
  speaker: Speaker;
  text: string;
  timestamp: Date;
  confidence?: number;
  isFinal?: boolean;
}

export interface AudioResponseMessage {
  audioData: string; // Base64 encoded
  format: AudioFormat;
  sampleRate: number;
  channels: number;
  transcript?: string;
}

export interface ErrorMessage {
  errorCode: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SessionInfo {
  sessionId: string;
  status: SessionStatus;
  createdAt: Date;
  lastActivity?: Date;
  audioBytesSent: number;
  audioBytesReceived: number;
  messageCount: number;
}

// Event types for SSE
export interface SSEEvent {
  event: string;
  data: string;
}

export interface TranscriptEvent {
  type: 'transcript';
  speaker: string;
  text: string;
  timestamp: string;
}

export interface AudioEvent {
  type: 'audio_response';
  audioData: string;
  format: string;
  sampleRate: number;
  channels: number;
  timestamp: string;
}

export interface ContentStartEvent {
  type: 'content_start';
  role: string;
  timestamp: string;
}

export interface ContentEndEvent {
  type: 'content_end';
  timestamp: string;
}

export interface ToolLogEvent {
  type: 'tool_invocation' | 'tool_result';
  toolName: string;
  toolUseId: string;
  input?: Record<string, unknown>;
  result?: Record<string, unknown>;
  timestamp: string;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
  timestamp: string;
}

export type NovaResponseEvent =
  | TranscriptEvent
  | AudioEvent
  | ContentStartEvent
  | ContentEndEvent
  | ToolLogEvent
  | ErrorEvent;

