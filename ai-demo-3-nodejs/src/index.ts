/**
 * AI Demo 3 - Express Backend
 * Main application with Nova Sonic streaming endpoints
 */
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import config from './config';
import logger from './logger';
import { sessionManager } from './services/sessionManager';
import { ClaudeClient } from './services/claudeClient';
import redshiftClient from './redshift';
import {
  SessionStartRequest,
  AudioChunkRequest,
  AudioEndRequest,
  SessionStatus,
} from './models/session';
import {
  getOrCreateSession,
  getSession as getConvSession,
  deleteSession as deleteConversationSession,
  validateHcpName,
  getAllHcpNames,
  lookupHcpId,
} from './prompting';

const app = express();

// Claude (text) session management
const claudeSessions = new Map<string, ClaudeClient>();

// Middleware
app.use(cors({ origin: config.cors.origins, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from public directory
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// ============================================================================
// Root & Health Endpoints
// ============================================================================

app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'AI Demo 3 - Nova Sonic API',
    version: '1.0.0',
    status: 'operational',
  });
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

app.get('/test', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'voice-test.html'));
});

// ============================================================================
// Session Management Endpoints
// ============================================================================

app.post('/session/start', async (req: Request, res: Response) => {
  try {
    const request: SessionStartRequest = req.body;

    // Prepare options
    const options: any = {};
    if (request.systemPrompt) {
      options.systemPrompt = request.systemPrompt;
    }

    // Create session
    const [sessionId, _client] = await sessionManager.createSession(options);

    logger.info(`Session started: ${sessionId}`);

    res.json({
      sessionId,
      status: SessionStatus.ACTIVE,
      createdAt: new Date(),
    });
  } catch (error: any) {
    if (error.message.includes('Maximum concurrent sessions')) {
      res.status(429).json({ error: error.message });
    } else {
      logger.error(`Error starting session: ${error}`);
      res.status(500).json({ error: `Failed to start session: ${error.message}` });
    }
  }
});

app.post('/audio/chunk', async (req: Request, res: Response) => {
  try {
    const request: AudioChunkRequest = req.body;

    // Get session
    const client = sessionManager.getSession(request.sessionId);
    if (!client) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!client.isActive) {
      return res.status(400).json({ error: 'Session is not active' });
    }

    // Decode base64 audio data
    const audioBytes = Buffer.from(request.audioData, 'base64');

    // Send to Nova Sonic
    client.addAudioChunk(audioBytes);

    // Update session activity
    await sessionManager.updateSessionActivity(request.sessionId);

    res.json({ status: 'success', bytesSent: audioBytes.length });
  } catch (error: any) {
    logger.error(`Error sending audio chunk: ${error}`);
    res.status(500).json({ error: `Failed to send audio: ${error.message}` });
  }
});

app.post('/audio/end', async (req: Request, res: Response) => {
  try {
    const request: AudioEndRequest = req.body;

    // Get session
    const client = sessionManager.getSession(request.sessionId);
    if (!client) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await client.sendAudioContentEndEvent();
    await sessionManager.updateSessionActivity(request.sessionId);

    res.json({ status: 'success', message: 'Audio input ended' });
  } catch (error: any) {
    logger.error(`Error ending audio input: ${error}`);
    res.status(500).json({ error: `Failed to end audio: ${error.message}` });
  }
});

app.get('/events/stream/:sessionId', async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId;

  // Get session
  const client = sessionManager.getSession(sessionId);
  if (!client) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Check if there's already an active stream
  if (sessionManager.hasActiveStream(sessionId)) {
    logger.warn(`Attempt to create duplicate stream for session ${sessionId}`);
    return res.status(409).json({
      error: 'A stream is already active for this session. Close the existing connection first.',
    });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  // Mark stream as active
  sessionManager.markStreamActive(sessionId);
  logger.info(`SSE stream started for session ${sessionId}`);

  // Send audio content start event when client connects
  await client.sendAudioContentStartEvent();

  // Track seen events to prevent duplicates
  const seenEventIds = new Set<string>();
  let eventCounter = 0;

  try {
    for await (const event of client.getEventsStream()) {
      eventCounter++;
      await sessionManager.updateSessionActivity(sessionId);

      if (!event) break;

      // Handle error events
      if ('error' in event) {
        res.write(
          `event: error\ndata: ${JSON.stringify({
            type: 'error',
            message: event.error,
            timestamp: new Date().toISOString(),
          })}\n\n`
        );
        break;
      }

      if (!('event' in event)) continue;

      const eventData = (event as any).event;

      // Text output (transcript)
      if (eventData.textOutput) {
        const textContent = eventData.textOutput.content;
        const role = client.role || 'assistant';

        logger.debug(`[${sessionId}] Received textOutput: role=${role}, text=${textContent.substring(0, 50)}...`);

        // Skip interrupted messages
        if (!textContent.includes('{ "interrupted" : true }')) {
          const finalText = textContent;

          // Create content hash for deduplication
          const contentHash = Buffer.from(`${role}:${finalText}`)
            .toString('base64')
            .substring(0, 16);

          if (seenEventIds.has(contentHash)) {
            logger.warn(`[${sessionId}] DUPLICATE DETECTED! Skipping: ${role} - ${finalText.substring(0, 50)}...`);
            continue;
          }

          seenEventIds.add(contentHash);

          logger.info(`[${sessionId}] YIELDING transcript: ${role.toLowerCase()} - ${finalText.substring(0, 50)}...`);
          res.write(
            `event: transcript\ndata: ${JSON.stringify({
              type: 'transcript',
              speaker: role.toLowerCase(),
              text: finalText,
              timestamp: new Date().toISOString(),
            })}\n\n`
          );
        }
      }

      // Audio output
      else if (eventData.audioOutput) {
        const audioContent = eventData.audioOutput.content;
        res.write(
          `event: audio\ndata: ${JSON.stringify({
            type: 'audio_response',
            audioData: audioContent,
            format: 'pcm',
            sampleRate: config.audio.outputSampleRate,
            channels: config.audio.channels,
            timestamp: new Date().toISOString(),
          })}\n\n`
        );
      }

      // Content start
      else if (eventData.contentStart) {
        const contentStart = eventData.contentStart;
        res.write(
          `event: content_start\ndata: ${JSON.stringify({
            type: 'content_start',
            role: contentStart.role || 'unknown',
            timestamp: new Date().toISOString(),
          })}\n\n`
        );
      }

      // Content end
      else if (eventData.contentEnd) {
        res.write(
          `event: content_end\ndata: ${JSON.stringify({
            type: 'content_end',
            timestamp: new Date().toISOString(),
          })}\n\n`
        );
      }

      // Tool log
      else if (eventData.toolLog) {
        const toolLog = eventData.toolLog;
        const logType = toolLog.type;

        if (logType === 'invocation') {
          logger.info(`📤 Sending tool invocation log to frontend: ${toolLog.toolName}`);
          res.write(
            `event: tool_log\ndata: ${JSON.stringify({
              type: 'tool_invocation',
              toolName: toolLog.toolName,
              toolUseId: toolLog.toolUseId,
              input: toolLog.input,
              timestamp: new Date().toISOString(),
            })}\n\n`
          );
        } else if (logType === 'result') {
          logger.info(`📤 Sending tool result log to frontend: ${toolLog.toolName}`);
          res.write(
            `event: tool_log\ndata: ${JSON.stringify({
              type: 'tool_result',
              toolName: toolLog.toolName,
              toolUseId: toolLog.toolUseId,
              result: toolLog.result,
              timestamp: new Date().toISOString(),
            })}\n\n`
          );
        }
      }
    }
  } catch (error: any) {
    logger.error(`Error in event stream: ${error}`);
    res.write(
      `event: error\ndata: ${JSON.stringify({
        type: 'error',
        message: error.message,
        timestamp: new Date().toISOString(),
      })}\n\n`
    );
  } finally {
    sessionManager.markStreamInactive(sessionId);
    logger.info(`SSE stream ended for session ${sessionId}`);
    res.end();
  }
});

app.delete('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId;

    const client = sessionManager.getSession(sessionId);
    if (!client) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await sessionManager.endSession(sessionId);
    res.json({ status: 'success', message: 'Session ended' });
  } catch (error: any) {
    logger.error(`Error ending session: ${error}`);
    res.status(500).json({ error: `Failed to end session: ${error.message}` });
  }
});

app.get('/session/:sessionId/info', (req: Request, res: Response) => {
  const sessionId = req.params.sessionId;
  const info = sessionManager.getSessionInfo(sessionId);

  if (!info) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json(info);
});

// ============================================================================
// Conversation Policy Endpoints
// ============================================================================

app.get('/conversation/:sessionId/state', (req: Request, res: Response) => {
  const sessionId = req.params.sessionId;
  const convSession = getConvSession(sessionId);

  if (!convSession) {
    return res.status(404).json({ error: 'Conversation session not found' });
  }

  res.json(convSession.toDict());
});

app.post('/conversation/:sessionId/slot', (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId;
    const { slotName, value } = req.body;

    const convSession = getOrCreateSession(sessionId);

    // Special handling for HCP name
    if (slotName === 'hcp_name') {
      const { isValid, fullName, hcpId } = validateHcpName(value);
      if (isValid) {
        convSession.setSlot('hcp_name', fullName);
        convSession.setSlot('hcp_id', hcpId);
        return res.json({
          status: 'success',
          slot: slotName,
          value: fullName,
          hcpId,
          missingSlots: convSession.getMissingRequiredSlots(),
        });
      } else {
        return res.status(400).json({
          error: `Invalid HCP name: ${value}. Please check spelling or choose from available HCPs.`,
        });
      }
    }

    convSession.setSlot(slotName, value);

    res.json({
      status: 'success',
      slot: slotName,
      value,
      missingSlots: convSession.getMissingRequiredSlots(),
    });
  } catch (error: any) {
    logger.error(`Error setting slot: ${error}`);
    res.status(500).json({ error: error.message });
  }
});

app.get('/conversation/:sessionId/summary', (req: Request, res: Response) => {
  const sessionId = req.params.sessionId;
  const convSession = getConvSession(sessionId);

  if (!convSession) {
    return res.status(404).json({ error: 'Conversation session not found' });
  }

  if (!convSession.allRequiredSlotsFilled()) {
    return res.json({
      status: 'incomplete',
      missingSlots: convSession.getMissingRequiredSlots(),
      summary: null,
    });
  }

  const summary = convSession.generateSummary();
  res.json({
    status: 'complete',
    summary,
    missingSlots: [],
  });
});

app.get('/conversation/:sessionId/output', (req: Request, res: Response) => {
  const sessionId = req.params.sessionId;
  const convSession = getConvSession(sessionId);

  if (!convSession) {
    return res.status(404).json({ error: 'Conversation session not found' });
  }

  if (!convSession.allRequiredSlotsFilled()) {
    return res.status(400).json({
      error: `Cannot generate output - missing required slots: ${convSession.getMissingRequiredSlots().join(', ')}`,
    });
  }

  const outputJson = convSession.generateOutputJson();

  res.json({
    status: 'success',
    output: outputJson,
    sessionId,
  });
});

app.delete('/conversation/:sessionId', (req: Request, res: Response) => {
  const sessionId = req.params.sessionId;
  const convSession = getConvSession(sessionId);

  if (!convSession) {
    return res.status(404).json({ error: 'Conversation session not found' });
  }

  deleteConversationSession(sessionId);

  res.json({
    status: 'success',
    message: `Conversation session ${sessionId} deleted`,
  });
});

// ============================================================================
// Text (Claude) Conversation Endpoints
// ============================================================================

app.post('/text/session/start', (_req: Request, res: Response) => {
  try {
    const client = new ClaudeClient();
    const sessionId = client.sessionId;

    claudeSessions.set(sessionId, client);

    logger.info(`Text session started: ${sessionId}`);

    res.json({
      sessionId,
      status: 'active',
      createdAt: new Date(),
      mode: 'text',
    });
  } catch (error: any) {
    logger.error(`Error starting text session: ${error}`);
    res.status(500).json({ error: `Failed to start text session: ${error.message}` });
  }
});

app.post('/text/message', async (req: Request, res: Response) => {
  try {
    const { sessionId, message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId and message are required' });
    }

    const client = claudeSessions.get(sessionId);
    if (!client) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!client.isActive) {
      return res.status(400).json({ error: 'Session is not active' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    logger.info(`[${sessionId}] User message: ${message.substring(0, 100)}...`);

    try {
      // Stream response from Claude
      for await (const event of client.sendMessage(message)) {
        if (event.type === 'text' && event.content) {
          res.write(
            `event: text\ndata: ${JSON.stringify({
              type: 'text',
              content: event.content,
              timestamp: new Date().toISOString(),
            })}\n\n`
          );
        } else if (event.type === 'tool_use') {
          logger.info(`[${sessionId}] Tool invocation: ${event.toolName}`);
          res.write(
            `event: tool_use\ndata: ${JSON.stringify({
              type: 'tool_use',
              toolName: event.toolName,
              toolUseId: event.toolUseId,
              input: event.input,
              timestamp: new Date().toISOString(),
            })}\n\n`
          );
        } else if (event.type === 'tool_result') {
          logger.info(`[${sessionId}] Tool result: ${event.toolName}`);
          res.write(
            `event: tool_result\ndata: ${JSON.stringify({
              type: 'tool_result',
              toolName: event.toolName,
              toolUseId: event.toolUseId,
              result: event.result,
              timestamp: new Date().toISOString(),
            })}\n\n`
          );
        }
      }

      // Send completion event
      res.write(
        `event: complete\ndata: ${JSON.stringify({
          type: 'complete',
          timestamp: new Date().toISOString(),
        })}\n\n`
      );
    } catch (error: any) {
      logger.error(`Error in text conversation: ${error}`);
      res.write(
        `event: error\ndata: ${JSON.stringify({
          type: 'error',
          message: error.message,
          timestamp: new Date().toISOString(),
        })}\n\n`
      );
    } finally {
      res.end();
    }
  } catch (error: any) {
    logger.error(`Error sending text message: ${error}`);
    if (!res.headersSent) {
      res.status(500).json({ error: `Failed to send message: ${error.message}` });
    }
  }
});

app.delete('/text/session/:sessionId', (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId;

    const client = claudeSessions.get(sessionId);
    if (!client) {
      return res.status(404).json({ error: 'Session not found' });
    }

    client.close();
    claudeSessions.delete(sessionId);

    logger.info(`Text session ended: ${sessionId}`);

    res.json({ status: 'success', message: 'Text session ended' });
  } catch (error: any) {
    logger.error(`Error ending text session: ${error}`);
    res.status(500).json({ error: `Failed to end text session: ${error.message}` });
  }
});

app.get('/text/session/:sessionId/history', (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId;

    const client = claudeSessions.get(sessionId);
    if (!client) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const history = client.getHistory();

    res.json({
      sessionId,
      history,
      messageCount: history.length,
    });
  } catch (error: any) {
    logger.error(`Error getting text session history: ${error}`);
    res.status(500).json({ error: `Failed to get history: ${error.message}` });
  }
});

app.post('/text/session/:sessionId/clear', (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId;

    const client = claudeSessions.get(sessionId);
    if (!client) {
      return res.status(404).json({ error: 'Session not found' });
    }

    client.clearHistory();

    logger.info(`Text session history cleared: ${sessionId}`);

    res.json({ status: 'success', message: 'History cleared' });
  } catch (error: any) {
    logger.error(`Error clearing text session history: ${error}`);
    res.status(500).json({ error: `Failed to clear history: ${error.message}` });
  }
});

// ============================================================================
// HCP Endpoints
// ============================================================================

app.get('/hcp/list', (_req: Request, res: Response) => {
  const hcpNames = getAllHcpNames();
  const hcpList = hcpNames.map((name) => ({
    name,
    id: lookupHcpId(name),
  }));

  res.json({
    total: hcpList.length,
    hcps: hcpList,
  });
});

app.get('/hcp/lookup', (req: Request, res: Response) => {
  const name = (req.query.name as string) || '';
  const { isValid, fullName, hcpId } = validateHcpName(name);

  if (isValid) {
    return res.json({
      found: true,
      name: fullName,
      id: hcpId,
    });
  } else {
    // Provide suggestions
    const allHcps = getAllHcpNames();
    const suggestions = allHcps
      .filter((hcp) => hcp.toLowerCase().includes(name.toLowerCase()))
      .slice(0, 5);

    return res.json({
      found: false,
      name,
      suggestions,
    });
  }
});

// ============================================================================
// Error Handler
// ============================================================================

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(`Unhandled error: ${err.message}`, err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================================
// Server Startup
// ============================================================================

const server = app.listen(config.app.port, config.app.host, async () => {
  logger.info('='.repeat(80));
  logger.info('AI Demo 3 - Nova Sonic API (Node.js)');
  logger.info('='.repeat(80));
  logger.info(`Environment: ${config.app.env}`);
  logger.info(`Server: http://${config.app.host}:${config.app.port}`);
  logger.info(`AWS Region: ${config.aws.region}`);
  logger.info(`Bedrock Model: ${config.bedrock.modelId}`);
  logger.info('='.repeat(80));

  // Initialize Redshift connection
  await redshiftClient.initialize();

  // Start cleanup task
  sessionManager.startCleanupTask();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(async () => {
    // Close all Claude sessions
    for (const [sessionId, client] of claudeSessions.entries()) {
      client.close();
      claudeSessions.delete(sessionId);
    }
    
    await sessionManager.shutdown();
    await redshiftClient.close();
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(async () => {
    // Close all Claude sessions
    for (const [sessionId, client] of claudeSessions.entries()) {
      client.close();
      claudeSessions.delete(sessionId);
    }
    
    await sessionManager.shutdown();
    await redshiftClient.close();
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;

