"use strict";

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NovaSonicClient = void 0;
const client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
const node_http_handler_1 = require("@smithy/node-http-handler");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const uuid_1 = require("uuid");
const logger_1 = __importDefault(require("../logger"));
const config_1 = __importDefault(require("../config"));
const prompting_1 = require("../prompting");
const tools_1 = require("../tools");
const bedrockSessionService_1 = require("./bedrockSessionService");
class NovaSonicClient {
    modelId;
    region;
    systemPrompt;
    userId;
    bedrockClient;
    sessionData = null;
    outputSubject;
    sessionId;
    isActive;
    role;
    // Conversation history tracking
    conversationHistory;
    currentUserTranscript = '';
    currentAssistantTranscript = '';
    isFirstTurn = true;
    // Nova Sonic stream state
    currentStream = null; // Store the current bidirectional stream
    constructor(options = {}) {
        this.modelId = options.modelId || config_1.default.bedrock.modelId;
        this.region = options.region || config_1.default.aws.region;
        this.systemPrompt = options.systemPrompt || prompting_1.AGENT_683_SYSTEM_PROMPT;
        this.userId = options.userId || `user-${Date.now()}`;
        this.outputSubject = new rxjs_1.Subject();
        this.isActive = false;
        this.sessionId = (0, uuid_1.v4)();
        // Initialize conversation history
        this.conversationHistory = {
            turns: [],
            currentTurnNumber: 0,
        };
        // Use HTTP/2 handler (critical for bidirectional streaming!)
        const nodeHttp2Handler = new node_http_handler_1.NodeHttp2Handler({
            requestTimeout: 300000, // 5 minutes
            sessionTimeout: 300000,
            disableConcurrentStreams: false,
            maxConcurrentStreams: 20,
        });
        this.bedrockClient = new client_bedrock_runtime_1.BedrockRuntimeClient({
            region: this.region,
            credentials: {
                accessKeyId: config_1.default.aws.accessKeyId || '',
                secretAccessKey: config_1.default.aws.secretAccessKey || '',
            },
            requestHandler: nodeHttp2Handler,
        });
        logger_1.default.info(`NovaSonicClient initialized with session_id: ${this.sessionId}`);
        logger_1.default.info(`System prompt length: ${this.systemPrompt.length} chars`);
    }
    async initializeStream() {
        try {
            logger_1.default.info(`Attempting to connect to Bedrock model: ${this.modelId}`);
            // Create Bedrock Agent Runtime session for conversation history persistence
            try {
                const bedrockSessionId = await bedrockSessionService_1.bedrockSessionService.createSession(this.userId);
                this.conversationHistory.bedrockSessionId = bedrockSessionId;
                logger_1.default.info(`✅ Bedrock session created for history: ${bedrockSessionId}`);
            }
            catch (error) {
                logger_1.default.warn(`⚠️ Failed to create Bedrock session for history: ${error}`);
                // Continue without session persistence - will use in-memory only
            }
            // Initialize session data
            this.sessionData = {
                queue: [],
                queueSignal: new rxjs_1.Subject(),
                closeSignal: new rxjs_1.Subject(),
                isActive: true,
                promptName: (0, uuid_1.v4)(),
                audioContentId: (0, uuid_1.v4)(),
            };
            // Send initialization events following AWS Nova Sonic event flow
            
            this.queueEvent({
                event: {
                    sessionStart: {
                        inferenceConfiguration: {
                            maxTokens: config_1.default.novaSonic.maxTokens,
                            topP: config_1.default.novaSonic.topP,
                            temperature: config_1.default.novaSonic.temperature,
                        },
                    },
                },
            });
            
            const toolDefinitions = (0, tools_1.getToolDefinitions)();
            this.queueEvent({
                event: {
                    promptStart: {
                        promptName: this.sessionData.promptName,
                        textOutputConfiguration: {
                            mediaType: 'text/plain',
                        },
                        audioOutputConfiguration: {
                            mediaType: 'audio/lpcm',
                            sampleRateHertz: config_1.default.audio.outputSampleRate,
                            sampleSizeBits: config_1.default.audio.bitDepth,
                            channelCount: config_1.default.audio.channels,
                            voiceId: config_1.default.novaSonic.voiceId,
                            encoding: 'base64',
                            audioType: 'SPEECH',
                        },
                        toolUseOutputConfiguration: {
                            mediaType: 'application/json',
                        },
                        toolConfiguration: {
                            tools: toolDefinitions,
                        },
                    },
                },
            });
            
            const textPromptId = (0, uuid_1.v4)();
            this.queueEvent({
                event: {
                    contentStart: {
                        promptName: this.sessionData.promptName,
                        contentName: textPromptId,
                        type: 'TEXT',
                        interactive: false,
                        role: 'SYSTEM',
                        textInputConfiguration: {
                            mediaType: 'text/plain',
                        },
                    },
                },
            });
            this.queueEvent({
                event: {
                    textInput: {
                        promptName: this.sessionData.promptName,
                        contentName: textPromptId,
                        content: this.systemPrompt,
                    },
                },
            });
            this.queueEvent({
                event: {
                    contentEnd: {
                        promptName: this.sessionData.promptName,
                        contentName: textPromptId,
                    },
                },
            });
            
            // NOTE: This is sent on EVERY turn before audio input, not just once!
            if (!this.isFirstTurn && this.conversationHistory.turns.length > 0) {
                logger_1.default.info(`📜 Sending conversation history (${this.conversationHistory.turns.length} turns)`);
                await this.sendConversationHistory();
            }
            else {
                logger_1.default.info('📝 First turn - no history to send');
            }
            // Create async iterable for input
            const asyncIterable = this.createAsyncIterable();
            logger_1.default.info('Starting bidirectional stream...');
            // Start the bidirectional stream
            const response = await this.bedrockClient.send(new client_bedrock_runtime_1.InvokeModelWithBidirectionalStreamCommand({
                modelId: this.modelId,
                body: asyncIterable,
            }));
            this.currentStream = response;
            this.isActive = true;
            logger_1.default.info('Successfully connected to Bedrock');
            // Process responses
            this.processResponses(response);
            logger_1.default.info('Stream initialized successfully');
            return this;
        }
        catch (error) {
            this.isActive = false;
            logger_1.default.error(`Failed to initialize stream: ${error}`);
            throw error;
        }
    }
    createAsyncIterable() {
        const session = this.sessionData;
        if (!session) {
            throw new Error('Session not initialized');
        }
        return {
            [Symbol.asyncIterator]: () => {
                return {
                    next: async () => {
                        try {
                            if (!session.isActive) {
                                return { value: undefined, done: true };
                            }
                            // Wait for items in queue
                            if (session.queue.length === 0) {
                                try {
                                    await Promise.race([
                                        (0, rxjs_1.firstValueFrom)(session.queueSignal.pipe((0, operators_1.take)(1))),
                                        (0, rxjs_1.firstValueFrom)(session.closeSignal.pipe((0, operators_1.take)(1))).then(() => {
                                            throw new Error('Stream closed');
                                        }),
                                    ]);
                                }
                                catch (error) {
                                    if (error instanceof Error &&
                                        (error.message === 'Stream closed' || !session.isActive)) {
                                        return { value: undefined, done: true };
                                    }
                                }
                            }
                            if (session.queue.length === 0 || !session.isActive) {
                                return { value: undefined, done: true };
                            }
                            const nextEvent = session.queue.shift();
                            return {
                                value: {
                                    chunk: {
                                        bytes: new TextEncoder().encode(JSON.stringify(nextEvent)),
                                    },
                                },
                                done: false,
                            };
                        }
                        catch (error) {
                            logger_1.default.error(`Error in iterator: ${error}`);
                            session.isActive = false;
                            return { value: undefined, done: true };
                        }
                    },
                    return: async () => {
                        session.isActive = false;
                        return { value: undefined, done: true };
                    },
                    throw: async (error) => {
                        session.isActive = false;
                        throw error;
                    },
                };
            },
        };
    }
    async processResponses(response) {
        let shouldCompleteStream = true; // Flag to control stream completion
        try {
            for await (const event of response.body) {
                if (!this.isActive)
                    break;
                if (event.chunk?.bytes) {
                    const textResponse = new TextDecoder().decode(event.chunk.bytes);
                    try {
                        const jsonResponse = JSON.parse(textResponse);
                        if (jsonResponse.error) {
                            // Extract error message from Bedrock error response
                            const errorMsg = typeof jsonResponse.error === 'string'
                                ? jsonResponse.error
                                : jsonResponse.error.message || JSON.stringify(jsonResponse.error);
                            logger_1.default.error(`Bedrock error: ${errorMsg}`);
                            // Check if this is an expected error
                            const expectedErrors = [
                                'RequestInProgressException', // Normal turn completion
                                'Timed out waiting for input events', // Nova Sonic idle timeout
                            ];
                            const isExpectedError = expectedErrors.some((expected) => errorMsg.includes(expected));
                            if (isExpectedError) {
                                logger_1.default.info(`Expected error, keeping stream alive: ${errorMsg}`);
                                shouldCompleteStream = false; // DON'T complete the stream for expected errors
                            }
                            // Pass error as a properly formatted error event
                            this.outputSubject.next({
                                error: errorMsg,
                            });
                            continue;
                        }
                        if (jsonResponse.event) {
                            await this.handleResponseEvent(jsonResponse.event);
                        }
                        this.outputSubject.next(jsonResponse);
                    }
                    catch (err) {
                        logger_1.default.error(`Failed to decode JSON response: ${err}`);
                        this.outputSubject.next({ raw_data: textResponse });
                    }
                }
            }
            logger_1.default.info('Response stream processing complete');
        }
        catch (error) {
            // Properly serialize error for logging and output
            let errorMessage;
            if (error instanceof Error) {
                errorMessage = `${error.name}: ${error.message}`;
            }
            else if (typeof error === 'object' && error !== null) {
                // Extract message from error object if it exists
                const errorObj = error;
                errorMessage = errorObj.message || JSON.stringify(error);
            }
            else {
                errorMessage = String(error);
            }
            logger_1.default.error(`Response processing error: ${errorMessage}`);
            // Check if this is an expected error that shouldn't close the stream
            const expectedErrors = [
                'RequestInProgressException', // Normal turn completion
                'Timed out waiting for input events', // Nova Sonic idle timeout
            ];
            const isExpectedError = expectedErrors.some((expected) => errorMessage.includes(expected));
            if (isExpectedError) {
                // Expected error - emit as a regular event, DON'T complete the stream
                logger_1.default.info(`Expected error detected in catch, emitting as event: ${errorMessage}`);
                this.outputSubject.next({ error: errorMessage });
                shouldCompleteStream = false; // DON'T complete the stream
            }
            else {
                // Unexpected error - complete the stream with error
                this.outputSubject.error(errorMessage);
                shouldCompleteStream = false; // Already errored, don't complete again
            }
        }
        finally {
            if (shouldCompleteStream && this.isActive && !this.outputSubject.closed) {
                logger_1.default.info('Completing output stream');
                this.outputSubject.complete();
            }
            else if (!shouldCompleteStream) {
                logger_1.default.info('Stream kept alive for multi-turn conversation');
            }
        }
    }
    async handleResponseEvent(event) {
        if (event.contentStart) {
            const contentStart = event.contentStart;
            this.role = contentStart.role;
        }
        else if (event.textOutput) {
            const textOutput = event.textOutput;
            const textContent = textOutput.content;
            if (textContent.includes('{ "interrupted" : true }')) {
                logger_1.default.info('Barge-in detected');
                return; // Don't accumulate interrupted messages
            }
            if (this.role === 'ASSISTANT') {
                logger_1.default.info(`Assistant: ${textContent}`);
                // Accumulate assistant transcript
                this.currentAssistantTranscript += textContent;
            }
            else if (this.role === 'USER') {
                logger_1.default.info(`User: ${textContent}`);
                // Accumulate user transcript
                this.currentUserTranscript += textContent;
            }
        }
        else if (event.toolUse) {
            await this.handleToolUse(event.toolUse);
        }
    }
    async handleToolUse(toolUse) {
        logger_1.default.info('='.repeat(80));
        logger_1.default.info('🔧 TOOL USE EVENT RECEIVED');
        const toolUseId = toolUse.toolUseId;
        const toolName = toolUse.toolName;
        const toolInputStr = toolUse.content || '{}';
        let toolInput = {};
        try {
            toolInput = typeof toolInputStr === 'string' ? JSON.parse(toolInputStr) : toolInputStr;
        }
        catch {
            logger_1.default.error(`❌ Failed to parse tool input: ${toolInputStr}`);
        }
        logger_1.default.info(`  - Tool Name: ${toolName}`);
        logger_1.default.info(`  - Tool Use ID: ${toolUseId}`);
        // Emit tool invocation event
        this.outputSubject.next({
            event: {
                toolLog: {
                    type: 'invocation',
                    toolName,
                    toolUseId,
                    input: toolInput,
                },
            },
        });
        // Execute tool
        let toolResult;
        if (toolName === 'getDateTool') {
            toolResult = {
                date: new Date().toISOString().split('T')[0],
                time: new Date().toTimeString().split(' ')[0],
                timezone: 'UTC',
                timestamp: new Date().toISOString(),
            };
        }
        else {
            toolResult = await (0, tools_1.dispatchToolCall)(toolName, toolInput);
        }
        logger_1.default.info(`✅ Tool execution complete: ${toolName}`);
        // Emit tool result event
        this.outputSubject.next({
            event: {
                toolLog: {
                    type: 'result',
                    toolName,
                    toolUseId,
                    result: toolResult,
                },
            },
        });
        // Send result back
        await this.sendToolResult(toolUseId, toolResult);
    }
    async sendToolResult(toolUseId, result) {
        if (!this.isActive || !this.sessionData)
            return;
        const contentId = (0, uuid_1.v4)();
        this.queueEvent({
            event: {
                contentStart: {
                    promptName: this.sessionData.promptName,
                    contentName: contentId,
                    interactive: false,
                    type: 'TOOL',
                    role: 'TOOL',
                    toolResultInputConfiguration: {
                        toolUseId,
                        type: 'TEXT',
                        textInputConfiguration: {
                            mediaType: 'text/plain',
                        },
                    },
                },
            },
        });
        const resultContent = JSON.stringify(result);
        this.queueEvent({
            event: {
                toolResult: {
                    promptName: this.sessionData.promptName,
                    contentName: contentId,
                    content: resultContent,
                },
            },
        });
        this.queueEvent({
            event: {
                contentEnd: {
                    promptName: this.sessionData.promptName,
                    contentName: contentId,
                },
            },
        });
        logger_1.default.info('✅ Tool result sent');
    }
    async sendAudioContentStartEvent() {
        if (!this.sessionData)
            return;
        this.queueEvent({
            event: {
                contentStart: {
                    promptName: this.sessionData.promptName,
                    contentName: this.sessionData.audioContentId,
                    type: 'AUDIO',
                    interactive: true,
                    role: 'USER',
                    audioInputConfiguration: {
                        mediaType: 'audio/lpcm',
                        sampleRateHertz: config_1.default.audio.inputSampleRate,
                        sampleSizeBits: config_1.default.audio.bitDepth,
                        channelCount: config_1.default.audio.channels,
                        audioType: 'SPEECH',
                        encoding: 'base64',
                    },
                },
            },
        });
        logger_1.default.debug('Audio content start event sent');
    }
    addAudioChunk(audioBytes) {
        if (!this.sessionData)
            return;
        const base64Data = audioBytes.toString('base64');
        this.queueEvent({
            event: {
                audioInput: {
                    promptName: this.sessionData.promptName,
                    contentName: this.sessionData.audioContentId,
                    content: base64Data,
                },
            },
        });
    }
    async sendAudioContentEndEvent() {
        if (!this.isActive || !this.sessionData)
            return;
        this.queueEvent({
            event: {
                contentEnd: {
                    promptName: this.sessionData.promptName,
                    contentName: this.sessionData.audioContentId,
                },
            },
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
        logger_1.default.debug('Audio content end event sent');
    }
    async sendPromptEndEvent() {
        if (!this.isActive || !this.sessionData)
            return;
        this.queueEvent({
            event: {
                promptEnd: {
                    promptName: this.sessionData.promptName,
                },
            },
        });
        await new Promise((resolve) => setTimeout(resolve, 300));
        logger_1.default.debug('Prompt end event sent');
    }
    async sendSessionEndEvent() {
        if (!this.sessionData)
            return;
        this.queueEvent({
            event: {
                sessionEnd: {},
            },
        });
        await new Promise((resolve) => setTimeout(resolve, 300));
        this.sessionData.isActive = false;
        this.sessionData.closeSignal.next();
        this.sessionData.closeSignal.complete();
        this.isActive = false;
        logger_1.default.info('Session end event sent');
    }
    queueEvent(event) {
        if (!this.sessionData)
            return;
        this.sessionData.queue.push(event);
        this.sessionData.queueSignal.next();
    }
    async *getEventsStream() {
        const queue = [];
        let isComplete = false;
        const subscription = this.outputSubject.subscribe({
            next: (event) => queue.push(event),
            error: (error) => {
                // Error is already a string from processResponses
                const errorMessage = typeof error === 'string'
                    ? error
                    : error instanceof Error
                        ? `${error.name}: ${error.message}`
                        : JSON.stringify(error);
                queue.push({ error: errorMessage });
                isComplete = true;
            },
            complete: () => {
                isComplete = true;
            },
        });
        try {
            while (!isComplete || queue.length > 0) {
                if (queue.length > 0) {
                    const event = queue.shift();
                    if (event) {
                        yield event;
                    }
                }
                else {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }
            }
        }
        finally {
            subscription.unsubscribe();
            logger_1.default.debug('Event stream subscription disposed');
        }
    }
    async close() {
        if (!this.isActive)
            return;
        logger_1.default.info('Closing Nova Sonic client');
        // Complete the current turn before closing
        await this.completeTurn();
        await this.sendAudioContentEndEvent();
        await this.sendPromptEndEvent();
        await this.sendSessionEndEvent();
        logger_1.default.info('Nova Sonic client closed');
    }
    
    // Conversation History Management Methods
    
    
    async sendConversationHistory() {
        if (!this.sessionData)
            return;
        for (const turn of this.conversationHistory.turns) {
            const historyContentId = (0, uuid_1.v4)();
            // contentStart for historical message
            this.queueEvent({
                event: {
                    contentStart: {
                        promptName: this.sessionData.promptName,
                        contentName: historyContentId,
                        type: 'TEXT',
                        interactive: false,
                        role: turn.role.toUpperCase(), // 'USER' or 'ASSISTANT'
                        textInputConfiguration: {
                            mediaType: 'text/plain',
                        },
                    },
                },
            });
            // textInput with the historical content
            this.queueEvent({
                event: {
                    textInput: {
                        promptName: this.sessionData.promptName,
                        contentName: historyContentId,
                        content: turn.text,
                    },
                },
            });
            // contentEnd
            this.queueEvent({
                event: {
                    contentEnd: {
                        promptName: this.sessionData.promptName,
                        contentName: historyContentId,
                    },
                },
            });
            logger_1.default.debug(`  ↳ Sent history turn: ${turn.role} - "${turn.text.substring(0, 50)}..."`);
        }
        logger_1.default.info(`✅ Sent ${this.conversationHistory.turns.length} historical turns to Nova Sonic`);
    }
    /**
     * Complete the current turn and persist to Bedrock session
     * Called when audio ends or session closes
     */
    async completeTurn() {
        // Save user transcript if exists
        if (this.currentUserTranscript.trim()) {
            const userTurn = {
                role: 'user',
                text: this.currentUserTranscript.trim(),
                timestamp: new Date(),
            };
            this.conversationHistory.turns.push(userTurn);
            logger_1.default.info(`📝 User turn saved: "${userTurn.text.substring(0, 100)}..."`);
            // Persist to Bedrock session
            await this.persistTurnToBedrock(userTurn);
        }
        // Save assistant transcript if exists
        if (this.currentAssistantTranscript.trim()) {
            const assistantTurn = {
                role: 'assistant',
                text: this.currentAssistantTranscript.trim(),
                timestamp: new Date(),
            };
            this.conversationHistory.turns.push(assistantTurn);
            logger_1.default.info(`📝 Assistant turn saved: "${assistantTurn.text.substring(0, 100)}..."`);
            // Persist to Bedrock session
            await this.persistTurnToBedrock(assistantTurn);
        }
        // Clear current transcripts for next turn
        this.currentUserTranscript = '';
        this.currentAssistantTranscript = '';
        // Increment turn counter
        this.conversationHistory.currentTurnNumber++;
        // No longer first turn
        this.isFirstTurn = false;
        logger_1.default.info(`✅ Turn ${this.conversationHistory.currentTurnNumber} completed. Total history: ${this.conversationHistory.turns.length} turns`);
    }
    /**
     * Persist a conversation turn to Bedrock Agent Runtime session
     */
    async persistTurnToBedrock(turn) {
        if (!this.conversationHistory.bedrockSessionId) {
            logger_1.default.warn('⚠️ No Bedrock session ID - skipping persistence');
            return;
        }
        try {
            // Create invocation if this is the first turn
            if (!this.conversationHistory.bedrockInvocationId) {
                const invocationId = await bedrockSessionService_1.bedrockSessionService.createInvocation(this.conversationHistory.bedrockSessionId);
                this.conversationHistory.bedrockInvocationId = invocationId;
                logger_1.default.info(`📋 Created Bedrock invocation: ${invocationId}`);
            }
            // Store the turn
            await bedrockSessionService_1.bedrockSessionService.putInvocationStep(this.conversationHistory.bedrockSessionId, this.conversationHistory.bedrockInvocationId, turn.role, turn.text);
            logger_1.default.debug(`✅ Persisted ${turn.role} turn to Bedrock session`);
        }
        catch (error) {
            logger_1.default.error(`❌ Failed to persist turn to Bedrock: ${error}`);
            // Continue - don't fail the conversation if persistence fails
        }
    }
    /**
     * Get conversation history (for debugging/inspection)
     */
    getConversationHistory() {
        return this.conversationHistory.turns;
    }
    /**
     * Load conversation history from Bedrock session (for session recovery)
     */
    async loadConversationHistory(bedrockSessionId) {
        try {
            logger_1.default.info(`📚 Loading conversation history from Bedrock session: ${bedrockSessionId}`);
            this.conversationHistory.bedrockSessionId = bedrockSessionId;
            // Get latest invocation
            const invocationId = await bedrockSessionService_1.bedrockSessionService.getLatestInvocationId(bedrockSessionId);
            if (!invocationId) {
                logger_1.default.info('No previous invocations found - starting fresh');
                return;
            }
            this.conversationHistory.bedrockInvocationId = invocationId;
            // Build chat history
            const chatHistory = await bedrockSessionService_1.bedrockSessionService.buildChatHistory(bedrockSessionId, invocationId);
            // Convert to our format
            this.conversationHistory.turns = chatHistory.map((item) => ({
                role: item.role,
                text: item.content[0].text,
                timestamp: new Date(),
            }));
            this.conversationHistory.currentTurnNumber = this.conversationHistory.turns.length;
            // If we have history, we're not on the first turn
            if (this.conversationHistory.turns.length > 0) {
                this.isFirstTurn = false;
            }
            logger_1.default.info(`✅ Loaded ${this.conversationHistory.turns.length} turns from Bedrock session`);
        }
        catch (error) {
            logger_1.default.error(`❌ Failed to load conversation history: ${error}`);
            throw error;
        }
    }
    
    async prepareForNextTurn() {
        logger_1.default.info('🔄 Preparing for next turn...');
        // Complete the previous turn (save transcripts to history)
        await this.completeTurn();
        // Load latest history from Bedrock session (in case it was updated externally)
        if (this.conversationHistory.bedrockSessionId) {
            try {
                const latestInvocationId = await bedrockSessionService_1.bedrockSessionService.getLatestInvocationId(this.conversationHistory.bedrockSessionId);
                if (latestInvocationId && latestInvocationId !== this.conversationHistory.bedrockInvocationId) {
                    // Reload history if there's a new invocation
                    await this.loadConversationHistory(this.conversationHistory.bedrockSessionId);
                }
            }
            catch (error) {
                logger_1.default.warn(`⚠️ Failed to reload history: ${error}`);
                // Continue with existing history
            }
        }
        // Reset audio content ID for new turn
        if (this.sessionData) {
            this.sessionData.audioContentId = (0, uuid_1.v4)();
        }
        logger_1.default.info(`✅ Ready for turn ${this.conversationHistory.currentTurnNumber + 1}`);
        logger_1.default.info(`📊 History size: ${this.conversationHistory.turns.length} turns`);
        // Send conversation history BEFORE the next audio input
        // This follows the AWS Nova Sonic event flow
        if (this.conversationHistory.turns.length > 0) {
            logger_1.default.info(`📜 Sending conversation history for next turn (${this.conversationHistory.turns.length} turns)`);
            await this.sendConversationHistory();
        }
    }
    /**
     * Get Bedrock session ID for external use
     */
    getBedrockSessionId() {
        return this.conversationHistory.bedrockSessionId;
    }
}
exports.NovaSonicClient = NovaSonicClient;
//# sourceMappingURL=novaSonicClient.js.map