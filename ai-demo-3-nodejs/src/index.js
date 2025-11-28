"use strict";

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const config_1 = __importDefault(require("./config"));
const logger_1 = __importDefault(require("./logger"));
const sessionManager_1 = require("./services/sessionManager");
const databaseAdapter_1 = __importDefault(require("./databaseAdapter")); // Use database adapter with fallback
const bedrockSessionService_1 = require("./services/bedrockSessionService");
const session_1 = require("./models/session");
const prompting_1 = require("./prompting");
// WebSocket server for text mode
const websocketServer_1 = require("./websocketServer");
// CallRecordingAnalyzer is optional - only import if available
let callRecordingAnalyzer = null;
try {
    const analyzer = require('./services/callRecordingAnalyzer');
    callRecordingAnalyzer = analyzer.callRecordingAnalyzer;
}
catch (error) {
    logger_1.default.warn('CallRecordingAnalyzer not available - analysis endpoints will be disabled');
}
const app = (0, express_1.default)();
// Middleware
app.use((0, cors_1.default)({ origin: config_1.default.cors.origins, credentials: true }));
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
// Serve static files from public directory
app.use('/public', express_1.default.static(path_1.default.join(__dirname, '..', 'public')));
app.use(express_1.default.static(path_1.default.join(__dirname, '..', 'public'))); // Also serve from root
// Request logging middleware
app.use((req, _res, next) => {
    logger_1.default.info(`${req.method} ${req.path}`);
    next();
});

// Root & Health Endpoints

app.get('/', (_req, res) => {
    res.json({
        service: 'AI Demo 3 - Nova Sonic API',
        version: '1.0.0',
        status: 'operational',
    });
});
app.get('/health', (_req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
    });
});
app.get('/test', (_req, res) => {
    res.sendFile(path_1.default.join(__dirname, '..', 'public', 'voice-test-enhanced.html'));
});
app.get('/voice-test.html', (_req, res) => {
    res.sendFile(path_1.default.join(__dirname, '..', 'public', 'voice-test.html'));
});
app.get('/voice-test-enhanced.html', (_req, res) => {
    res.sendFile(path_1.default.join(__dirname, '..', 'public', 'voice-test-enhanced.html'));
});

// Call History Endpoints

app.get('/api/calls/history', async (_req, res) => {
    try {
        logger_1.default.info('📊 Fetching call history (with automatic fallback)...');
        const result = await databaseAdapter_1.default.getCallHistory(50);
        if (result.source === 'unavailable') {
            logger_1.default.warn('⚠️ Both databases unavailable, returning empty history');
            return res.json({
                calls: [],
                count: 0,
                source: 'unavailable',
                warning: 'Database temporarily unavailable'
            });
        }
        const sourceEmoji = result.source === 'redshift' ? '☁️' : '💾';
        logger_1.default.info(`✅ Found ${result.rowCount} calls from ${result.source} ${sourceEmoji}`);
        res.json({
            calls: result.rows,
            count: result.rowCount,
            source: result.source,
            message: result.source === 'sqlite' ? 'Using local backup database' : undefined,
        });
    }
    catch (error) {
        logger_1.default.error('❌ Error fetching call history:', error);
        res.status(500).json({
            error: 'Failed to fetch call history',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// Session Management Endpoints (Updated for Multi-Turn Conversations)

/**
 * Start a new session
 * Creates both NovaSonic session and Bedrock session for persistence
 */
app.post('/session/start', async (req, res) => {
    try {
        const request = req.body;
        // Prepare options
        const options = {};
        if (request.systemPrompt) {
            options.systemPrompt = request.systemPrompt;
        }
        if (request.userId) {
            options.userId = request.userId;
        }
        // If existingBedrockSessionId is provided, load history from Bedrock
        if (request.existingBedrockSessionId) {
            options.existingBedrockSessionId = request.existingBedrockSessionId;
        }
        // Create session
        const [sessionId, client] = await sessionManager_1.sessionManager.createSession(options);
        // Load history if recovering from pod restart
        if (request.existingBedrockSessionId) {
            try {
                await client.loadConversationHistory(request.existingBedrockSessionId);
                logger_1.default.info(`✅ Session recovered with history from Bedrock: ${request.existingBedrockSessionId}`);
            }
            catch (error) {
                logger_1.default.warn(`⚠️ Failed to load history: ${error}`);
            }
        }
        logger_1.default.info(`Session started: ${sessionId}`);
        logger_1.default.info(`Bedrock session: ${client.getBedrockSessionId()}`);
        const history = client.getConversationHistory();
        logger_1.default.info(`Session has ${history.length} turns of conversation history`);
        res.json({
            sessionId,
            bedrockSessionId: client.getBedrockSessionId(),
            status: session_1.SessionStatus.ACTIVE,
            createdAt: new Date(),
            conversationHistory: history,
        });
    }
    catch (error) {
        if (error.message.includes('Maximum concurrent sessions')) {
            res.status(429).json({ error: error.message });
        }
        else {
            logger_1.default.error(`Error starting session: ${error}`);
            res.status(500).json({ error: `Failed to start session: ${error.message}` });
        }
    }
});
/**
 * Start audio recording for a turn
 * Sends conversation history BEFORE audio input (as per AWS documentation)
 */
app.post('/audio/start', async (req, res) => {
    try {
        const { sessionId } = req.body;
        // Get session
        const client = sessionManager_1.sessionManager.getSession(sessionId);
        if (!client) {
            return res.status(404).json({ error: 'Session not found' });
        }
        if (!client.isActive) {
            return res.status(400).json({ error: 'Session is not active' });
        }
        // Prepare for next turn (sends conversation history automatically)
        await client.prepareForNextTurn();
        // Open a new audio content for this recording turn
        await client.sendAudioContentStartEvent();
        // Give the contentStart event time to reach Bedrock before audio chunks arrive
        await new Promise(resolve => setTimeout(resolve, 200));
        await sessionManager_1.sessionManager.updateSessionActivity(sessionId);
        const history = client.getConversationHistory();
        logger_1.default.info(`🎙️ Started audio recording for session ${sessionId} with ${history.length} turns of history`);
        res.json({
            status: 'success',
            message: 'Audio recording started',
            historyLength: history.length,
            history: history,
        });
    }
    catch (error) {
        logger_1.default.error(`Error starting audio recording: ${error}`);
        res.status(500).json({ error: `Failed to start audio recording: ${error.message}` });
    }
});
/**
 * Send audio chunk
 */
app.post('/audio/chunk', async (req, res) => {
    try {
        const request = req.body;
        // Get session
        const client = sessionManager_1.sessionManager.getSession(request.sessionId);
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
        await sessionManager_1.sessionManager.updateSessionActivity(request.sessionId);
        res.json({ status: 'success', bytesSent: audioBytes.length });
    }
    catch (error) {
        logger_1.default.error(`Error sending audio chunk: ${error}`);
        res.status(500).json({ error: `Failed to send audio: ${error.message}` });
    }
});
/**
 * End audio recording for current turn
 * Completes the turn and saves transcripts to Bedrock session
 */
app.post('/audio/end', async (req, res) => {
    try {
        const request = req.body;
        // Get session
        const client = sessionManager_1.sessionManager.getSession(request.sessionId);
        if (!client) {
            return res.status(404).json({ error: 'Session not found' });
        }
        // Close the current audio content
        await client.sendAudioContentEndEvent();
        // Note: We DON'T call prepareForNextTurn here anymore
        // It will be called when the user clicks the mic button again (in /audio/start)
        // This allows the assistant to complete their response first
        await sessionManager_1.sessionManager.updateSessionActivity(request.sessionId);
        res.json({
            status: 'success',
            message: 'Audio input ended',
            historyLength: client.getConversationHistory().length,
        });
    }
    catch (error) {
        logger_1.default.error(`Error ending audio input: ${error}`);
        res.status(500).json({ error: `Failed to end audio: ${error.message}` });
    }
});
/**
 * SSE Event Stream
 * Streams transcript, audio, and tool events from Nova Sonic
 */
app.get('/events/stream/:sessionId', async (req, res) => {
    const sessionId = req.params.sessionId;
    // Get session
    const client = sessionManager_1.sessionManager.getSession(sessionId);
    if (!client) {
        return res.status(404).json({ error: 'Session not found' });
    }
    // Check if there's already an active stream
    if (sessionManager_1.sessionManager.hasActiveStream(sessionId)) {
        logger_1.default.warn(`Attempt to create duplicate stream for session ${sessionId}`);
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
    sessionManager_1.sessionManager.markStreamActive(sessionId);
    logger_1.default.info(`SSE stream started for session ${sessionId}`);
    // Handle client disconnection
    req.on('close', () => {
        logger_1.default.info(`Client disconnected from SSE stream for session ${sessionId}`);
        sessionManager_1.sessionManager.markStreamInactive(sessionId);
    });
    // Track seen events to prevent duplicates
    const seenEventIds = new Set();
    let eventCounter = 0;
    try {
        for await (const event of client.getEventsStream()) {
            eventCounter++;
            await sessionManager_1.sessionManager.updateSessionActivity(sessionId);
            if (!event)
                break;
            // Handle error events
            if ('error' in event) {
                // Ensure error message is properly converted to string
                const errorMessage = typeof event.error === 'string'
                    ? event.error
                    : event.error instanceof Error
                        ? `${event.error.name}: ${event.error.message}`
                        : JSON.stringify(event.error);
                // Check if this is an expected error that shouldn't close the connection
                const expectedErrors = [
                    'RequestInProgressException', // Normal turn completion
                    'Timed out waiting for input events', // Nova Sonic idle timeout (expected after ~1 min)
                ];
                const isExpectedError = expectedErrors.some((expected) => errorMessage.includes(expected));
                if (!isExpectedError) {
                    // Unexpected error - send it and close the connection
                    res.write(`event: error\ndata: ${JSON.stringify({
                        type: 'error',
                        message: errorMessage,
                        timestamp: new Date().toISOString(),
                    })}\n\n`);
                    break;
                }
                else {
                    // Expected error - just log it, DON'T close the connection
                    logger_1.default.info(`Expected error received (keeping SSE open): ${errorMessage}`);
                    // Optionally send a status update instead of an error
                    res.write(`event: status\ndata: ${JSON.stringify({
                        type: 'status',
                        message: errorMessage.includes('Timed out') ? 'idle' : 'ready',
                        timestamp: new Date().toISOString(),
                    })}\n\n`);
                    // Continue the loop - don't break!
                }
            }
            if (!('event' in event))
                continue;
            const eventData = event.event;
            // Text output (transcript)
            if (eventData.textOutput) {
                const textContent = eventData.textOutput.content;
                const role = client.role || 'assistant';
                logger_1.default.info(`[${sessionId}] Received textOutput: role=${role}, text=${textContent.substring(0, 100)}...`);
                // Skip interrupted messages
                if (!textContent.includes('{ "interrupted" : true }')) {
                    const finalText = textContent;
                    // Create content hash for deduplication (include timestamp to avoid false positives)
                    const contentHash = Buffer.from(`${role}:${finalText}:${eventCounter}`)
                        .toString('base64')
                        .substring(0, 20);
                    if (seenEventIds.has(contentHash)) {
                        logger_1.default.warn(`[${sessionId}] DUPLICATE DETECTED! Skipping: ${role} - ${finalText.substring(0, 50)}...`);
                        continue;
                    }
                    seenEventIds.add(contentHash);
                    // Normalize role to lowercase for consistency
                    const speakerRole = role.toLowerCase().replace('user', 'user').replace('assistant', 'assistant');
                    logger_1.default.info(`[${sessionId}] ✅ YIELDING transcript #${eventCounter}: ${speakerRole} - ${finalText.substring(0, 50)}...`);
                    res.write(`event: transcript\ndata: ${JSON.stringify({
                        type: 'transcript',
                        speaker: speakerRole,
                        text: finalText,
                        timestamp: new Date().toISOString(),
                    })}\n\n`);
                }
                else {
                    logger_1.default.info(`[${sessionId}] ⏭️  Skipping interrupted message: ${textContent.substring(0, 50)}...`);
                }
            }
            // Audio output
            else if (eventData.audioOutput) {
                const audioContent = eventData.audioOutput.content;
                res.write(`event: audio\ndata: ${JSON.stringify({
                    type: 'audio_response',
                    audioData: audioContent,
                    format: 'pcm',
                    sampleRate: config_1.default.audio.outputSampleRate,
                    channels: config_1.default.audio.channels,
                    timestamp: new Date().toISOString(),
                })}\n\n`);
            }
            // Content start
            else if (eventData.contentStart) {
                const contentStart = eventData.contentStart;
                res.write(`event: content_start\ndata: ${JSON.stringify({
                    type: 'content_start',
                    role: contentStart.role || 'unknown',
                    timestamp: new Date().toISOString(),
                })}\n\n`);
            }
            // Content end
            else if (eventData.contentEnd) {
                res.write(`event: content_end\ndata: ${JSON.stringify({
                    type: 'content_end',
                    timestamp: new Date().toISOString(),
                })}\n\n`);
            }
            // Tool log
            else if (eventData.toolLog) {
                const toolLog = eventData.toolLog;
                const logType = toolLog.type;
                if (logType === 'invocation') {
                    logger_1.default.info(`📤 Sending tool invocation log to frontend: ${toolLog.toolName}`);
                    res.write(`event: tool_log\ndata: ${JSON.stringify({
                        type: 'tool_invocation',
                        toolName: toolLog.toolName,
                        toolUseId: toolLog.toolUseId,
                        input: toolLog.input,
                        timestamp: new Date().toISOString(),
                    })}\n\n`);
                }
                else if (logType === 'result') {
                    logger_1.default.info(`📥 Sending tool result log to frontend: ${toolLog.toolName}`);
                    res.write(`event: tool_log\ndata: ${JSON.stringify({
                        type: 'tool_result',
                        toolName: toolLog.toolName,
                        toolUseId: toolLog.toolUseId,
                        result: toolLog.result,
                        timestamp: new Date().toISOString(),
                    })}\n\n`);
                }
            }
        }
        logger_1.default.info(`Event stream completed for session ${sessionId}`);
    }
    catch (error) {
        logger_1.default.error(`Error in event stream for session ${sessionId}:`, error);
        res.write(`event: error\ndata: ${JSON.stringify({
            type: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
        })}\n\n`);
    }
    finally {
        sessionManager_1.sessionManager.markStreamInactive(sessionId);
        res.end();
    }
});
/**
 * End session
 */
app.delete('/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        await sessionManager_1.sessionManager.endSession(sessionId);
        res.json({ status: 'success', message: 'Session ended' });
    }
    catch (error) {
        logger_1.default.error(`Error ending session: ${error}`);
        res.status(500).json({ error: `Failed to end session: ${error.message}` });
    }
});
/**
 * Get session info
 */
app.get('/session/:sessionId/info', (req, res) => {
    const { sessionId } = req.params;
    const info = sessionManager_1.sessionManager.getSessionInfo(sessionId);
    const client = sessionManager_1.sessionManager.getSession(sessionId);
    if (!info || !client) {
        return res.status(404).json({ error: 'Session not found' });
    }
    res.json({
        ...info,
        bedrockSessionId: client.getBedrockSessionId(),
        historyLength: client.getConversationHistory().length,
    });
});

// Conversation History Endpoints (for debugging/inspection)

/**
 * Get conversation history for a session
 */
app.get('/conversation/:sessionId/history', (req, res) => {
    const { sessionId } = req.params;
    const client = sessionManager_1.sessionManager.getSession(sessionId);
    if (!client) {
        return res.status(404).json({ error: 'Session not found' });
    }
    const history = client.getConversationHistory();
    res.json({
        sessionId,
        bedrockSessionId: client.getBedrockSessionId(),
        historyLength: history.length,
        history,
    });
});

// Bedrock Session Management API (for session recovery)

/**
 * Establish a new Bedrock session for call recording analysis
 */
app.post('/api/session/establish', async (req, res) => {
    try {
        const { userId } = req.body;
        const sessionId = await bedrockSessionService_1.bedrockSessionService.createSession(userId || 'default-user');
        logger_1.default.info(`Bedrock session established: ${sessionId}`);
        res.json({
            sessionId,
            message: 'Session established successfully',
        });
    }
    catch (error) {
        logger_1.default.error('Error establishing session:', error);
        res.status(500).json({
            error: 'Failed to establish session',
            message: error.message,
        });
    }
});
/**
 * List all HCP names (for frontend)
 */
app.get('/hcp/list', (_req, res) => {
    const hcpList = Object.keys(prompting_1.HCP_NAME_TO_ID_MAP).map((name) => ({
        name,
        id: prompting_1.HCP_NAME_TO_ID_MAP[name],
    }));
    res.json({
        hcps: hcpList,
        count: hcpList.length,
    });
});
/**
 * Lookup HCP by name
 */
app.get('/hcp/lookup', (req, res) => {
    const { name } = req.query;
    if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'Name parameter is required' });
    }
    const hcpId = prompting_1.HCP_NAME_TO_ID_MAP[name];
    if (!hcpId) {
        return res.status(404).json({
            error: 'HCP not found',
            name,
            suggestions: Object.keys(prompting_1.HCP_NAME_TO_ID_MAP)
                .filter((hcpName) => hcpName.toLowerCase().includes(name.toLowerCase()))
                .slice(0, 5),
        });
    }
    res.json({
        name,
        id: hcpId,
    });
});

// Call Recording Analysis Endpoints (Bedrock Agent Runtime)

/**
 * Analyze call recording (first pass)
 */
app.post('/api/call/analyze', async (req, res) => {
    try {
        if (!callRecordingAnalyzer) {
            return res.status(503).json({
                error: 'Call recording analysis not available',
                message: 'CallRecordingAnalyzer service is not installed',
            });
        }
        const { sessionId, input } = req.body;
        if (!sessionId || !input) {
            return res.status(400).json({ error: 'sessionId and input are required' });
        }
        const result = await callRecordingAnalyzer.analyzeCallRecording(sessionId, input);
        res.json(result);
    }
    catch (error) {
        logger_1.default.error('Error analyzing call:', error);
        res.status(500).json({
            error: 'Failed to analyze call',
            message: error.message,
        });
    }
});
/**
 * Fill missing details (follow-up)
 */
app.post('/api/call/fill-missing', async (req, res) => {
    try {
        if (!callRecordingAnalyzer) {
            return res.status(503).json({
                error: 'Call recording analysis not available',
                message: 'CallRecordingAnalyzer service is not installed',
            });
        }
        const { sessionId, input } = req.body;
        if (!sessionId || !input) {
            return res.status(400).json({ error: 'sessionId and input are required' });
        }
        const result = await callRecordingAnalyzer.fillMissingDetails(sessionId, input);
        res.json(result);
    }
    catch (error) {
        logger_1.default.error('Error filling missing details:', error);
        res.status(500).json({
            error: 'Failed to fill missing details',
            message: error.message,
        });
    }
});

// Database Management & Health Check

/**
 * Get current database status
 */
app.get('/db/status', async (_req, res) => {
    try {
        const currentSource = databaseAdapter_1.default.getCurrentSource();
        const health = await databaseAdapter_1.default.healthCheck();
        res.json({
            currentSource,
            sourceEmoji: currentSource === 'redshift' ? '☁️' : '💾',
            sourceName: currentSource === 'redshift' ? 'Redshift (Cloud)' : 'SQLite (Local Backup)',
            databases: health,
            message: currentSource === 'sqlite'
                ? '⚠️ Running on local backup - Redshift unavailable'
                : '✅ Running on primary cloud database',
        });
    }
    catch (error) {
        res.status(500).json({
            error: 'Failed to get database status',
            message: error.message,
        });
    }
});
/**
 * Force database switch (for testing)
 */
app.post('/db/force-sqlite', (_req, res) => {
    logger_1.default.warn('🔄 Forcing switch to SQLite (testing mode)');
    databaseAdapter_1.default.forceSqlite();
    res.json({
        message: 'Switched to SQLite backup database',
        source: 'sqlite',
    });
});
/**
 * Retry Redshift connection (for testing)
 */
app.post('/db/retry-redshift', (_req, res) => {
    logger_1.default.info('🔄 Retrying Redshift connection...');
    databaseAdapter_1.default.forceRetryRedshift();
    res.json({
        message: 'Retrying Redshift connection',
        currentSource: databaseAdapter_1.default.getCurrentSource(),
    });
});
app.get('/db/healthz', async (_req, res) => {
    try {
        const health = await databaseAdapter_1.default.healthCheck();
        const overallHealthy = health.redshift.available || health.sqlite.available;
        const statusCode = overallHealthy ? 200 : 503;
        res.status(statusCode).json({
            status: overallHealthy ? 'healthy' : 'degraded',
            activeSource: health.activeSource,
            databases: {
                redshift: {
                    available: health.redshift.available,
                    message: health.redshift.message,
                    emoji: health.redshift.available ? '✅' : '❌',
                },
                sqlite: {
                    available: health.sqlite.available,
                    message: health.sqlite.message,
                    emoji: health.sqlite.available ? '✅' : '❌',
                },
            },
            message: health.activeSource === 'redshift'
                ? '☁️ Using Redshift (primary)'
                : health.activeSource === 'sqlite'
                    ? '💾 Using SQLite (backup)'
                    : '⚠️ No database available',
        });
    }
    catch (error) {
        logger_1.default.error('Database health check failed:', error);
        res.status(503).json({
            status: 'error',
            message: error.message,
        });
    }
});

// Error Handling Middleware

app.use((err, _req, res, _next) => {
    logger_1.default.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message,
    });
});

// Server Startup and Graceful Shutdown

// Start the cleanup task
sessionManager_1.sessionManager.startCleanupTask();
const server = app.listen(config_1.default.app.port, config_1.default.app.host, () => {
    logger_1.default.info('='.repeat(71));
    logger_1.default.info('AI Demo 3 - Nova Sonic API (Node.js)');
    logger_1.default.info('='.repeat(71));
    logger_1.default.info(`Server: http://${config_1.default.app.host}:${config_1.default.app.port}`);
    logger_1.default.info(`AWS Region: ${config_1.default.aws.region}`);
    logger_1.default.info(`Bedrock Model: ${config_1.default.bedrock.modelId}`);
    logger_1.default.info('='.repeat(71));
});
// Initialize WebSocket server for text mode
const wsServer = new websocketServer_1.WebSocketServer(server);
logger_1.default.info('🔌 WebSocket server initialized on /ws');
// Graceful shutdown
process.on('SIGTERM', async () => {
    logger_1.default.info('SIGTERM received. Starting graceful shutdown...');
    server.close(async () => {
        logger_1.default.info('HTTP server closed');
        // Shutdown WebSocket server
        wsServer.close();
        // Shutdown session manager
        await sessionManager_1.sessionManager.shutdown();
        logger_1.default.info('Graceful shutdown complete');
        process.exit(0);
    });
});
process.on('SIGINT', async () => {
    logger_1.default.info('SIGINT received. Starting graceful shutdown...');
    server.close(async () => {
        logger_1.default.info('HTTP server closed');
        // Shutdown WebSocket server
        wsServer.close();
        // Shutdown session manager
        await sessionManager_1.sessionManager.shutdown();
        logger_1.default.info('Graceful shutdown complete');
        process.exit(0);
    });
});
exports.default = app;
//# sourceMappingURL=index.js.map