"use strict";
/**
 * Mock Nova Sonic Client for Local Testing
 * Works without AWS Bedrock connection
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NovaSonicClientMock = void 0;
const rxjs_1 = require("rxjs");
const uuid_1 = require("uuid");
const logger_1 = __importDefault(require("../logger"));
class NovaSonicClientMock {
    outputSubject;
    sessionId;
    isActive;
    role;
    // Conversation history tracking
    conversationHistory;
    currentUserTranscript = '';
    currentAssistantTranscript = '';
    // Mock state
    isRecording = false;
    mockResponseTimer;
    constructor() {
        this.outputSubject = new rxjs_1.Subject();
        this.isActive = false;
        this.sessionId = (0, uuid_1.v4)();
        this.conversationHistory = {
            turns: [],
            currentTurnNumber: 0,
        };
        logger_1.default.info(`[MOCK MODE] NovaSonicClientMock initialized with session_id: ${this.sessionId}`);
    }
    async initializeStream() {
        logger_1.default.info('[MOCK MODE] Initializing mock stream...');
        this.isActive = true;
        // Simulate successful connection
        setTimeout(() => {
            this.outputSubject.next({
                event: {
                    contentStart: {
                        role: 'SYSTEM',
                    },
                },
            });
        }, 100);
        logger_1.default.info('[MOCK MODE] Mock stream initialized successfully');
        return this;
    }
    async sendAudioContentStartEvent() {
        logger_1.default.info('[MOCK MODE] Audio content start event');
        this.isRecording = true;
        this.role = 'USER';
    }
    addAudioChunk(_audioBytes) {
        // Simulate receiving audio
        // In mock mode, we'll just simulate transcription after a delay
    }
    async sendAudioContentEndEvent() {
        logger_1.default.info('[MOCK MODE] Audio content end event');
        this.isRecording = false;
        // Simulate user transcript
        const mockUserMessages = [
            "I met with Dr. John Anderson",
            "It was today at 2pm",
            "We discussed Aspirin",
            "The meeting went well",
            "He was interested in the product",
        ];
        const userText = mockUserMessages[this.conversationHistory.currentTurnNumber % mockUserMessages.length];
        this.currentUserTranscript = userText;
        // Emit user transcript
        setTimeout(() => {
            this.role = 'USER';
            this.outputSubject.next({
                event: {
                    contentStart: {
                        role: 'USER',
                    },
                },
            });
            this.outputSubject.next({
                event: {
                    textOutput: {
                        content: userText,
                    },
                },
            });
            this.outputSubject.next({
                event: {
                    contentEnd: {},
                },
            });
            // Now simulate assistant response
            this.simulateAssistantResponse();
        }, 1000);
    }
    simulateAssistantResponse() {
        const mockAssistantResponses = [
            "Great! Let me record that. Can you tell me what time the meeting was?",
            "Perfect. Which product did you discuss with Dr. Anderson?",
            "Excellent! I've recorded your call with Dr. John Anderson today at 2pm to discuss Aspirin. Is there anything else you'd like to add?",
            "Thank you for that information. Would you like me to create a follow-up task?",
            "Understood. I'll make a note of that.",
        ];
        const assistantText = mockAssistantResponses[this.conversationHistory.currentTurnNumber % mockAssistantResponses.length];
        this.currentAssistantTranscript = assistantText;
        // Simulate typing delay
        setTimeout(() => {
            this.role = 'ASSISTANT';
            this.outputSubject.next({
                event: {
                    contentStart: {
                        role: 'ASSISTANT',
                    },
                },
            });
            // Simulate streaming text word by word
            const words = assistantText.split(' ');
            let currentText = '';
            words.forEach((word, index) => {
                setTimeout(() => {
                    currentText += (index > 0 ? ' ' : '') + word;
                    this.outputSubject.next({
                        event: {
                            textOutput: {
                                content: word + (index < words.length - 1 ? ' ' : ''),
                            },
                        },
                    });
                }, index * 100);
            });
            // End assistant response
            setTimeout(() => {
                this.outputSubject.next({
                    event: {
                        contentEnd: {},
                    },
                });
            }, words.length * 100 + 200);
        }, 1500);
    }
    async sendPromptEndEvent() {
        logger_1.default.debug('[MOCK MODE] Prompt end event');
    }
    async sendSessionEndEvent() {
        logger_1.default.info('[MOCK MODE] Session end event');
        this.isActive = false;
    }
    async *getEventsStream() {
        const queue = [];
        let isComplete = false;
        const subscription = this.outputSubject.subscribe({
            next: (event) => queue.push(event),
            error: (error) => {
                queue.push({ error: error.message });
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
            logger_1.default.debug('[MOCK MODE] Event stream subscription disposed');
        }
    }
    async close() {
        if (!this.isActive)
            return;
        logger_1.default.info('[MOCK MODE] Closing mock client');
        await this.completeTurn();
        await this.sendSessionEndEvent();
    }
    // Conversation History Management
    async completeTurn() {
        // Save user transcript
        if (this.currentUserTranscript.trim()) {
            const userTurn = {
                role: 'user',
                text: this.currentUserTranscript.trim(),
                timestamp: new Date(),
            };
            this.conversationHistory.turns.push(userTurn);
            logger_1.default.info(`[MOCK MODE] 📝 User turn saved: "${userTurn.text.substring(0, 100)}..."`);
        }
        // Save assistant transcript
        if (this.currentAssistantTranscript.trim()) {
            const assistantTurn = {
                role: 'assistant',
                text: this.currentAssistantTranscript.trim(),
                timestamp: new Date(),
            };
            this.conversationHistory.turns.push(assistantTurn);
            logger_1.default.info(`[MOCK MODE] 📝 Assistant turn saved: "${assistantTurn.text.substring(0, 100)}..."`);
        }
        // Clear current transcripts
        this.currentUserTranscript = '';
        this.currentAssistantTranscript = '';
        // Increment turn counter
        this.conversationHistory.currentTurnNumber++;
        logger_1.default.info(`[MOCK MODE] ✅ Turn ${this.conversationHistory.currentTurnNumber} completed. Total history: ${this.conversationHistory.turns.length} turns`);
    }
    getConversationHistory() {
        return this.conversationHistory.turns;
    }
    async loadConversationHistory(_bedrockSessionId) {
        logger_1.default.info('[MOCK MODE] ⚠️ Session recovery not available in mock mode');
    }
    async prepareForNextTurn() {
        logger_1.default.info('[MOCK MODE] 🔄 Preparing for next turn...');
        await this.completeTurn();
        // In mock mode, we simulate sending history
        if (this.conversationHistory.turns.length > 0) {
            logger_1.default.info(`[MOCK MODE] 📜 Simulating conversation history (${this.conversationHistory.turns.length} turns)`);
        }
        logger_1.default.info(`[MOCK MODE] ✅ Ready for turn ${this.conversationHistory.currentTurnNumber + 1}`);
    }
    getBedrockSessionId() {
        return 'mock-bedrock-session-' + this.sessionId;
    }
}
exports.NovaSonicClientMock = NovaSonicClientMock;
//# sourceMappingURL=novaSonicClientMock.js.map