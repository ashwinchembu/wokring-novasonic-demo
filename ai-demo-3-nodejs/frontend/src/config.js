/**
 * Frontend Configuration
 * Supports both local development and separate production deployment
 */

// API URL - defaults to relative path (same origin) if not set
const API_URL = import.meta.env.VITE_API_URL || '';

// WebSocket URL - derived from API URL
const getWsUrl = () => {
  if (!API_URL) {
    // Same origin: use current page protocol
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }
  
  // External API: convert http(s) to ws(s)
  const wsProtocol = API_URL.startsWith('https://') ? 'wss://' : 'ws://';
  return API_URL.replace(/^https?:\/\//, wsProtocol);
};

export const config = {
  apiUrl: API_URL,
  wsUrl: getWsUrl(),
  
  // API endpoints helper
  endpoints: {
    // Session management
    sessionStart: `${API_URL}/session/start`,
    sessionEnd: (sessionId) => `${API_URL}/session/${sessionId}`,
    sessionInfo: (sessionId) => `${API_URL}/session/${sessionId}/info`,
    
    // Audio streaming
    audioStart: `${API_URL}/audio/start`,
    audioChunk: `${API_URL}/audio/chunk`,
    audioEnd: `${API_URL}/audio/end`,
    
    // Server-Sent Events
    eventsStream: (sessionId) => `${API_URL}/events/stream/${sessionId}`,
    
    // HCP (Healthcare Professional) management
    hcpList: `${API_URL}/hcp/list`,
    hcpLookup: `${API_URL}/hcp/lookup`,
    
    // Call history and data
    callHistory: `${API_URL}/api/calls/history`,
    callAnalyze: `${API_URL}/api/call/analyze`,
    callFillMissing: `${API_URL}/api/call/fill-missing`,
    
    // Conversation history
    conversationHistory: (sessionId) => `${API_URL}/conversation/${sessionId}/history`,
    
    // Bedrock session
    bedrockSessionEstablish: `${API_URL}/api/session/establish`,
    
    // Database status
    dbStatus: `${API_URL}/db/status`,
  }
};

export default config;

