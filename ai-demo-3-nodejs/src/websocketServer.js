"use strict";
/**
 * WebSocket Server for Text-based Conversations
 * 
 * Provides bidirectional text communication alongside voice mode.
 * Uses the same session management and NovaSonic client.
 */

const WebSocket = require('ws');
const logger = require('./logger').default;
const { sessionManager } = require('./services/sessionManager');

class WebSocketServer {
  constructor(httpServer) {
    this.wss = new WebSocket.Server({ 
      server: httpServer,
      path: '/ws'
    });
    
    this.setupWebSocketServer();
    logger.info('🔌 WebSocket server initialized on /ws');
  }

  setupWebSocketServer() {
    this.wss.on('connection', (ws, req) => {
      const clientIp = req.socket.remoteAddress;
      logger.info(`🔌 WebSocket client connected from ${clientIp}`);
      
      // Store session ID for this connection
      let sessionId = null;
      
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
          logger.info(`📨 WebSocket message: ${data.type}`);
          
          switch (data.type) {
            case 'ping':
              ws.send(JSON.stringify({ type: 'pong' }));
              break;
              
            case 'connect_session':
              // Associate this WebSocket with an existing session
              sessionId = data.sessionId;
              const client = sessionManager.getSession(sessionId);
              
              if (!client) {
                ws.send(JSON.stringify({ 
                  type: 'error', 
                  message: 'Session not found. Please start a session first.' 
                }));
                return;
              }
              
              logger.info(`✅ WebSocket connected to session ${sessionId}`);
              ws.send(JSON.stringify({ 
                type: 'session_connected',
                sessionId: sessionId,
                conversationHistory: client.getConversationHistory()
              }));
              break;
              
            case 'text_message':
              // Handle text message (similar to audio but with text input)
              if (!sessionId) {
                ws.send(JSON.stringify({ 
                  type: 'error', 
                  message: 'No session connected. Send connect_session first.' 
                }));
                return;
              }
              
              await this.handleTextMessage(sessionId, data.text, ws);
              break;
              
            default:
              logger.warn(`❓ Unknown WebSocket message type: ${data.type}`);
          }
        } catch (error) {
          logger.error('❌ WebSocket message error:', error);
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: error.message 
          }));
        }
      });
      
      ws.on('close', () => {
        logger.info(`🔌 WebSocket client disconnected${sessionId ? ` (session: ${sessionId})` : ''}`);
      });
      
      ws.on('error', (error) => {
        logger.error('❌ WebSocket error:', error);
      });
      
      // Send welcome message
      ws.send(JSON.stringify({ 
        type: 'welcome',
        message: 'WebSocket connected. Send connect_session to link to a session.' 
      }));
    });
  }

  async handleTextMessage(sessionId, text, ws) {
    try {
      const client = sessionManager.getSession(sessionId);
      
      if (!client) {
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Session not found or expired' 
        }));
        return;
      }
      
      if (!client.isActive) {
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Session is not active' 
        }));
        return;
      }
      
      logger.info(`💬 Processing text message for session ${sessionId}: "${text}"`);
      
      // Echo user message back
      ws.send(JSON.stringify({
        type: 'transcript',
        speaker: 'user',
        text: text,
        timestamp: new Date().toISOString()
      }));
      
      // Prepare for next turn (sends conversation history)
      await client.prepareForNextTurn();
      
      // Send text input event to NovaSonic
      // Note: This is a simplified version. The actual implementation depends on
      // whether NovaSonic supports text input or if we need a different model.
      await client.sendTextContentStartEvent();
      await client.sendTextContent(text);
      await client.sendContentEndEvent();
      await client.sendPromptEndEvent();
      
      // Listen for response events from NovaSonic client
      // The NovaSonic client will emit events that we forward via WebSocket
      const eventListener = (event) => {
        ws.send(JSON.stringify(event));
      };
      
      // Subscribe to client events (would need to add event emitter to NovaSonic client)
      // For now, send a simple acknowledgment
      ws.send(JSON.stringify({
        type: 'processing',
        message: 'Text message received and processing'
      }));
      
      // Update session activity
      await sessionManager.updateSessionActivity(sessionId);
      
      logger.info(`✅ Text message processed for session ${sessionId}`);
      
    } catch (error) {
      logger.error(`❌ Error handling text message: ${error.message}`);
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: `Failed to process text message: ${error.message}` 
      }));
    }
  }

  close() {
    this.wss.close(() => {
      logger.info('🔌 WebSocket server closed');
    });
  }
}

module.exports = { WebSocketServer };

