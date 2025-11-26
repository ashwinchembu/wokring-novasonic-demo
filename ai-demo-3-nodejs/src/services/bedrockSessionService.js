"use strict";
/**
 * Bedrock Agent Runtime Session Service
 * Manages sessions and invocations for call recording analysis
 * Ported from Lambda text-to-text implementation
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bedrockSessionService = exports.BedrockSessionService = void 0;
const client_bedrock_agent_runtime_1 = require("@aws-sdk/client-bedrock-agent-runtime");
const uuid_1 = require("uuid");
const config_1 = __importDefault(require("../config"));
const logger_1 = __importDefault(require("../logger"));
class BedrockSessionService {
    bedrockClient;
    constructor() {
        this.bedrockClient = new client_bedrock_agent_runtime_1.BedrockAgentRuntimeClient({
            region: config_1.default.aws.region,
            credentials: {
                accessKeyId: config_1.default.aws.accessKeyId || '',
                secretAccessKey: config_1.default.aws.secretAccessKey || '',
            },
        });
        logger_1.default.info('BedrockSessionService initialized');
    }
    /**
     * Create a new Bedrock Agent Runtime session
     */
    async createSession(userId) {
        try {
            const command = new client_bedrock_agent_runtime_1.CreateSessionCommand({
                sessionMetadata: {
                    userId,
                },
            });
            const response = await this.bedrockClient.send(command);
            const sessionId = response.sessionId;
            logger_1.default.info(`Created Bedrock session: ${sessionId} for user: ${userId}`);
            return sessionId;
        }
        catch (error) {
            logger_1.default.error('Failed to create Bedrock session:', error);
            throw new Error(`Failed to create session: ${error}`);
        }
    }
    /**
     * Create a new invocation within a session
     */
    async createInvocation(sessionId) {
        try {
            const invocationId = (0, uuid_1.v4)();
            const command = new client_bedrock_agent_runtime_1.CreateInvocationCommand({
                sessionIdentifier: sessionId,
                invocationId,
            });
            await this.bedrockClient.send(command);
            logger_1.default.info(`Created invocation: ${invocationId} for session: ${sessionId}`);
            return invocationId;
        }
        catch (error) {
            logger_1.default.error('Failed to create invocation:', error);
            throw new Error(`Failed to create invocation: ${error}`);
        }
    }
    /**
     * Add an invocation step (user or assistant message)
     */
    async putInvocationStep(sessionId, invocationId, role, message) {
        try {
            const stepData = {
                role,
                text: message,
            };
            const command = new client_bedrock_agent_runtime_1.PutInvocationStepCommand({
                sessionIdentifier: sessionId,
                invocationIdentifier: invocationId,
                invocationStepTime: new Date(),
                invocationStepId: (0, uuid_1.v4)(),
                payload: {
                    contentBlocks: [
                        {
                            text: JSON.stringify(stepData),
                        },
                    ],
                },
            });
            await this.bedrockClient.send(command);
            logger_1.default.debug(`Put invocation step: ${role} - ${message.substring(0, 100)}...`);
        }
        catch (error) {
            logger_1.default.error('Failed to put invocation step:', error);
            throw new Error(`Failed to put invocation step: ${error}`);
        }
    }
    /**
     * Build chat history from invocation steps
     */
    async buildChatHistory(sessionId, invocationId) {
        try {
            const chatHistory = [];
            // List invocation steps
            const listCommand = new client_bedrock_agent_runtime_1.ListInvocationStepsCommand({
                invocationIdentifier: invocationId,
                sessionIdentifier: sessionId,
            });
            const listResponse = await this.bedrockClient.send(listCommand);
            if (!listResponse.invocationStepSummaries) {
                return chatHistory;
            }
            // Fetch each step
            for (const stepSummary of listResponse.invocationStepSummaries) {
                const getCommand = new client_bedrock_agent_runtime_1.GetInvocationStepCommand({
                    invocationIdentifier: invocationId,
                    invocationStepId: stepSummary.invocationStepId,
                    sessionIdentifier: sessionId,
                });
                const getResponse = await this.bedrockClient.send(getCommand);
                if (getResponse.invocationStep?.payload?.contentBlocks?.[0]?.text) {
                    const stepText = getResponse.invocationStep.payload.contentBlocks[0].text;
                    const stepData = JSON.parse(stepText);
                    chatHistory.unshift({
                        role: stepData.role,
                        content: [{ text: stepData.text }],
                    });
                }
            }
            logger_1.default.info(`Built chat history with ${chatHistory.length} messages`);
            return chatHistory;
        }
        catch (error) {
            logger_1.default.error('Failed to build chat history:', error);
            throw new Error(`Failed to build chat history: ${error}`);
        }
    }
    /**
     * Get the most recent invocation for a session
     */
    async getLatestInvocationId(sessionId) {
        try {
            const command = new client_bedrock_agent_runtime_1.ListInvocationsCommand({
                sessionIdentifier: sessionId,
            });
            const response = await this.bedrockClient.send(command);
            if (!response.invocationSummaries || response.invocationSummaries.length === 0) {
                return null;
            }
            const latestInvocation = response.invocationSummaries[0];
            return latestInvocation.invocationId || null;
        }
        catch (error) {
            logger_1.default.error('Failed to get latest invocation:', error);
            throw new Error(`Failed to get latest invocation: ${error}`);
        }
    }
}
exports.BedrockSessionService = BedrockSessionService;
// Singleton instance
exports.bedrockSessionService = new BedrockSessionService();
//# sourceMappingURL=bedrockSessionService.js.map