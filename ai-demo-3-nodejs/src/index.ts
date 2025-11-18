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
import redshiftClient from './redshift';
import { bedrockSessionService } from './services/bedrockSessionService';
import { callRecordingAnalyzer } from './services/callRecordingAnalyzer';
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

app.get('/voice-test.html', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'voice-test.html'));
});

// ============================================================================
// Call History Endpoints
// ============================================================================

app.get('/api/calls/history', async (_req: Request, res: Response) => {
  try {
    logger.info('📊 Fetching call history from Redshift...');
    
    if (!redshiftClient.isAvailable()) {
      logger.warn('Redshift not available, returning empty history');
      return res.json({ calls: [], source: 'unavailable' });
    }
    
    const result = await redshiftClient.query(`
      SELECT 
        call_pk,
        call_channel,
        discussion_topic,
        status,
        account,
        id as hcp_id,
        product,
        call_date,
        call_time,
        adverse_event,
        noncompliance_event,
        call_notes,
        followup_task_type,
        created_at
      FROM calls
      ORDER BY created_at DESC
      LIMIT 50
    `);
    
    logger.info(`✅ Found ${result.rows.length} calls in history`);
    
    res.json({
      calls: result.rows,
      count: result.rows.length,
      source: 'redshift',
    });
  } catch (error) {
    logger.error('❌ Error fetching call history:', error);
    res.status(500).json({
      error: 'Failed to fetch call history',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
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

        logger.info(`[${sessionId}] Received textOutput: role=${role}, text=${textContent.substring(0, 100)}...`);

        // Skip interrupted messages
        if (!textContent.includes('{ "interrupted" : true }')) {
          const finalText = textContent;

          // Create content hash for deduplication (include timestamp to avoid false positives)
          const contentHash = Buffer.from(`${role}:${finalText}:${eventCounter}`)
            .toString('base64')
            .substring(0, 20);

          if (seenEventIds.has(contentHash)) {
            logger.warn(`[${sessionId}] DUPLICATE DETECTED! Skipping: ${role} - ${finalText.substring(0, 50)}...`);
            continue;
          }

          seenEventIds.add(contentHash);

          // Normalize role to lowercase for consistency
          const speakerRole = role.toLowerCase().replace('user', 'user').replace('assistant', 'assistant');

          logger.info(`[${sessionId}] ✅ YIELDING transcript #${eventCounter}: ${speakerRole} - ${finalText.substring(0, 50)}...`);
          res.write(
            `event: transcript\ndata: ${JSON.stringify({
              type: 'transcript',
              speaker: speakerRole,
              text: finalText,
              timestamp: new Date().toISOString(),
            })}\n\n`
          );
        } else {
          logger.info(`[${sessionId}] ⏭️  Skipping interrupted message: ${textContent.substring(0, 50)}...`);
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
// Bedrock Agent Runtime Session Endpoints (for Call Recording Analysis)
// ============================================================================

/**
 * POST /api/session/establish
 * Create a new Bedrock Agent Runtime session for call recording analysis
 * Body: { userId: string }
 */
app.post('/api/session/establish', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const sessionId = await bedrockSessionService.createSession(userId);

    logger.info(`Bedrock session established: ${sessionId}`);

    res.json({
      sessionId,
      message: 'Session established successfully',
    });
  } catch (error: any) {
    logger.error(`Error establishing Bedrock session: ${error}`);
    res.status(500).json({ error: `Failed to establish session: ${error.message}` });
  }
});

/**
 * POST /api/call/analyze
 * Analyze a call recording transcript (first pass)
 * Body: { sessionId: string, input: string }
 */
app.post('/api/call/analyze', async (req: Request, res: Response) => {
  try {
    const { sessionId, input } = req.body;

    if (!sessionId || !input) {
      return res.status(400).json({ error: 'sessionId and input are required' });
    }

    logger.info(`Analyzing call recording for session: ${sessionId}`);

    const result = await callRecordingAnalyzer.analyzeCallRecording(sessionId, input);

    res.json(result);
  } catch (error: any) {
    logger.error(`Error analyzing call recording: ${error}`);
    res.status(500).json({ error: `Failed to analyze call recording: ${error.message}` });
  }
});

/**
 * POST /api/call/fill-missing
 * Fill missing details from a previous call analysis
 * Body: { sessionId: string, input: string }
 */
app.post('/api/call/fill-missing', async (req: Request, res: Response) => {
  try {
    const { sessionId, input } = req.body;

    if (!sessionId || !input) {
      return res.status(400).json({ error: 'sessionId and input are required' });
    }

    logger.info(`Filling missing details for session: ${sessionId}`);

    const result = await callRecordingAnalyzer.fillMissingDetails(sessionId, input);

    res.json(result);
  } catch (error: any) {
    logger.error(`Error filling missing details: ${error}`);
    res.status(500).json({ error: `Failed to fill missing details: ${error.message}` });
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
    await sessionManager.shutdown();
    await redshiftClient.close();
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(async () => {
    await sessionManager.shutdown();
    await redshiftClient.close();
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;

