"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bedrockAgentService = void 0;
/**
 * Bedrock Agent Runtime Service
 * Manages sessions, invocations, and invocation steps for conversation history
 */
const client_bedrock_agent_runtime_1 = require("@aws-sdk/client-bedrock-agent-runtime");
const client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
const uuid_1 = require("uuid");
const config_1 = __importDefault(require("../config"));
const logger_1 = __importDefault(require("../logger"));
class BedrockAgentService {
    bedrockAgentClient;
    bedrockRuntimeClient;
    constructor() {
        const clientConfig = {
            region: config_1.default.aws.region,
            ...(config_1.default.aws.accessKeyId &&
                config_1.default.aws.secretAccessKey && {
                credentials: {
                    accessKeyId: config_1.default.aws.accessKeyId,
                    secretAccessKey: config_1.default.aws.secretAccessKey,
                },
            }),
        };
        this.bedrockAgentClient = new client_bedrock_agent_runtime_1.BedrockAgentRuntimeClient(clientConfig);
        this.bedrockRuntimeClient = new client_bedrock_runtime_1.BedrockRuntimeClient(clientConfig);
    }
    /**
     * Create a new session with AWS Bedrock Agent Runtime
     */
    async createSession(userId) {
        try {
            const command = new client_bedrock_agent_runtime_1.CreateSessionCommand({
                sessionMetadata: {
                    userId: userId,
                },
            });
            const response = await this.bedrockAgentClient.send(command);
            logger_1.default.info(`✅ Session created: ${response.sessionId}`);
            return response.sessionId;
        }
        catch (error) {
            logger_1.default.error('❌ Error creating session:', error);
            throw new Error(`Failed to create session: ${error}`);
        }
    }
    /**
     * Create an invocation within a session
     */
    async createInvocation(sessionId) {
        try {
            const invocationId = (0, uuid_1.v4)();
            const command = new client_bedrock_agent_runtime_1.CreateInvocationCommand({
                sessionIdentifier: sessionId,
                invocationId: invocationId,
            });
            await this.bedrockAgentClient.send(command);
            logger_1.default.info(`✅ Invocation created: ${invocationId} for session ${sessionId}`);
            return invocationId;
        }
        catch (error) {
            logger_1.default.error('❌ Error creating invocation:', error);
            throw new Error(`Failed to create invocation: ${error}`);
        }
    }
    /**
     * Add an invocation step (stores conversation message)
     */
    async addInvocationStep(sessionId, invocationId, role, message) {
        try {
            const command = new client_bedrock_agent_runtime_1.PutInvocationStepCommand({
                sessionIdentifier: sessionId,
                invocationIdentifier: invocationId,
                invocationStepTime: new Date(),
                invocationStepId: (0, uuid_1.v4)(),
                payload: {
                    contentBlocks: [
                        {
                            text: JSON.stringify({
                                text: message,
                                role: role,
                            }),
                        },
                    ],
                },
            });
            await this.bedrockAgentClient.send(command);
            logger_1.default.info(`✅ Invocation step added: ${role} message to session ${sessionId}`);
        }
        catch (error) {
            logger_1.default.error('❌ Error adding invocation step:', error);
            throw new Error(`Failed to add invocation step: ${error}`);
        }
    }
    /**
     * Build chat history from invocation steps
     */
    async buildChatHistory(sessionId, invocationId) {
        try {
            const chatHistory = [];
            const listCommand = new client_bedrock_agent_runtime_1.ListInvocationStepsCommand({
                invocationIdentifier: invocationId,
                sessionIdentifier: sessionId,
            });
            const listResponse = await this.bedrockAgentClient.send(listCommand);
            if (!listResponse.invocationStepSummaries) {
                return chatHistory;
            }
            for (const step of listResponse.invocationStepSummaries) {
                const getCommand = new client_bedrock_agent_runtime_1.GetInvocationStepCommand({
                    invocationIdentifier: invocationId,
                    invocationStepId: step.invocationStepId,
                    sessionIdentifier: sessionId,
                });
                const stepResponse = await this.bedrockAgentClient.send(getCommand);
                if (stepResponse.invocationStep?.payload?.contentBlocks?.[0]?.text) {
                    const stepText = stepResponse.invocationStep.payload.contentBlocks[0].text;
                    const parsedStep = JSON.parse(stepText);
                    chatHistory.unshift({
                        role: parsedStep.role,
                        content: [{ text: parsedStep.text }],
                    });
                }
            }
            logger_1.default.info(`✅ Built chat history with ${chatHistory.length} messages`);
            return chatHistory;
        }
        catch (error) {
            logger_1.default.error('❌ Error building chat history:', error);
            throw new Error(`Failed to build chat history: ${error}`);
        }
    }
    /**
     * Invoke LLM model with conversation history
     */
    async invokeLLM(instruction, conversationHistory = []) {
        try {
            const modelId = config_1.default.bedrock.llmModelId;
            const conversation = {
                role: 'user',
                content: [{ text: instruction }],
            };
            const messages = [...conversationHistory, conversation];
            const command = new client_bedrock_runtime_1.ConverseCommand({
                modelId,
                messages,
            });
            const response = await this.bedrockRuntimeClient.send(command);
            const responseText = response.output?.message?.content?.[0]?.text || '';
            logger_1.default.info(`✅ LLM response received (${responseText.length} chars)`);
            return responseText;
        }
        catch (error) {
            logger_1.default.error('❌ Error invoking LLM:', error);
            throw new Error(`Failed to invoke LLM: ${error}`);
        }
    }
    /**
     * Retrieve records from Knowledge Base
     */
    async retrieveFromKnowledgeBase(accountName) {
        try {
            if (!config_1.default.bedrock.knowledgeBaseId) {
                logger_1.default.warn('⚠️  Knowledge Base ID not configured');
                return [];
            }
            // Normalize account name (remove Dr./Doctor prefix)
            const normalizedName = accountName.replace(/^(Dr\.?|Doctor)\s*/i, '').trim();
            const queryText = `Find HCP ID and Doctor Name WITH NAME LIKE ${normalizedName}. Search for a name regardless of whether the prefix is present. Use a placeholder :search_term to represent the user's input.`;
            const command = new client_bedrock_agent_runtime_1.RetrieveCommand({
                knowledgeBaseId: config_1.default.bedrock.knowledgeBaseId,
                retrievalQuery: {
                    text: queryText,
                },
            });
            const response = await this.bedrockAgentClient.send(command);
            const retrievalResults = response.retrievalResults || [];
            logger_1.default.info(`✅ Retrieved ${retrievalResults.length} results from Knowledge Base`);
            const results = [];
            for (const record of retrievalResults) {
                if (record.content?.row && record.content.row.length > 0) {
                    const merged = {};
                    for (const item of record.content.row) {
                        if (item.columnName && item.columnValue) {
                            merged[item.columnName] = item.columnValue;
                        }
                    }
                    if (merged.id && merged.doctor_name) {
                        results.push({
                            id: merged.id,
                            doctor_name: merged.doctor_name,
                        });
                    }
                }
            }
            return results;
        }
        catch (error) {
            logger_1.default.error('❌ Error retrieving from Knowledge Base:', error);
            // Don't throw, just return empty results
            return [];
        }
    }
    /**
     * Get list of invocations for a session
     */
    async listInvocations(sessionId) {
        try {
            const command = new client_bedrock_agent_runtime_1.ListInvocationsCommand({
                sessionIdentifier: sessionId,
            });
            const response = await this.bedrockAgentClient.send(command);
            const invocationIds = response.invocationSummaries?.map((s) => s.invocationId || '') || [];
            return invocationIds.filter((id) => id !== '');
        }
        catch (error) {
            logger_1.default.error('❌ Error listing invocations:', error);
            return [];
        }
    }
}
exports.bedrockAgentService = new BedrockAgentService();
exports.default = exports.bedrockAgentService;
//# sourceMappingURL=bedrockAgentService.js.map