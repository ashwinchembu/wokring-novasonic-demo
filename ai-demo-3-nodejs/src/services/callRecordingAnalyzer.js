"use strict";
/**
 * Call Recording Analyzer Service
 * Analyzes call transcripts and extracts structured data
 * Ported from Lambda implementation
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callRecordingAnalyzer = exports.CallRecordingAnalyzer = void 0;
const client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
const moment_1 = __importDefault(require("moment"));
const config_1 = __importDefault(require("../config"));
const logger_1 = __importDefault(require("../logger"));
const bedrockSessionService_1 = require("./bedrockSessionService");
const callRecording_1 = require("../prompts/callRecording");
const callRecording_2 = require("../models/callRecording");
const prompting_1 = require("../prompting");
class CallRecordingAnalyzer {
    bedrockRuntimeClient;
    llmModelId;
    constructor() {
        this.bedrockRuntimeClient = new client_bedrock_runtime_1.BedrockRuntimeClient({
            region: config_1.default.aws.region,
            credentials: {
                accessKeyId: config_1.default.aws.accessKeyId || '',
                secretAccessKey: config_1.default.aws.secretAccessKey || '',
            },
        });
        // Use Claude for text analysis
        this.llmModelId = process.env.LLM_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';
        logger_1.default.info(`CallRecordingAnalyzer initialized with model: ${this.llmModelId}`);
    }
    /**
     * Invoke LLM model with conversation history
     */
    async invokeLLM(instruction, conversationHistory) {
        try {
            const conversation = {
                role: 'user',
                content: [{ text: instruction }],
            };
            const messages = [...conversationHistory, conversation];
            const response = await this.bedrockRuntimeClient.send(new client_bedrock_runtime_1.ConverseCommand({
                modelId: this.llmModelId,
                messages,
            }));
            const responseText = response.output?.message?.content?.[0]?.text || '';
            logger_1.default.debug(`LLM response: ${responseText.substring(0, 200)}...`);
            return responseText;
        }
        catch (error) {
            logger_1.default.error('Failed to invoke LLM:', error);
            throw new Error(`Failed to invoke LLM: ${error}`);
        }
    }
    /**
     * Normalize account name (remove Dr. prefix for matching)
     */
    normalizeAccountName(name) {
        return name.replace(/^(Dr\.?|Doctor)\s*/i, '').trim();
    }
    /**
     * Retrieve HCP records from knowledge base (local lookup for now)
     */
    async retrieveRecordsFromKnowledgeBase(accountName) {
        const accountNameNormalized = this.normalizeAccountName(accountName);
        logger_1.default.info(`Searching for HCP: ${accountName} (normalized: ${accountNameNormalized})`);
        const results = [];
        // Search through HCP map
        for (const [name, id] of Object.entries(prompting_1.HCP_NAME_TO_ID_MAP)) {
            const normalizedMapName = this.normalizeAccountName(name);
            // Check for partial match
            if (normalizedMapName.toLowerCase().includes(accountNameNormalized.toLowerCase()) ||
                accountNameNormalized.toLowerCase().includes(normalizedMapName.toLowerCase())) {
                results.push({
                    id,
                    doctor_name: name,
                });
            }
        }
        logger_1.default.info(`Found ${results.length} matching HCPs`);
        return results;
    }
    /**
     * Analyze missing information and return structured payload
     */
    async analyzeMissingInformation(callRecordingParameters) {
        const missingInformationEvents = [];
        let callRecordingPayload = {};
        const { call_channel, accountName, accountId, call_date, call_time, product_description, } = callRecordingParameters;
        logger_1.default.info('Analyzing missing information for parameters:', {
            accountName,
            accountId,
            call_date,
            call_time,
            product_description,
            call_channel,
        });
        // Check Account Name
        if (!accountName || accountName === '') {
            missingInformationEvents.push(callRecording_2.MissingInformationEvent.ACCOUNT_NAME_MISSING);
            callRecordingPayload.accountName = '';
            callRecordingPayload.accountId = '';
        }
        else {
            // Search for HCP
            if (!accountId || accountId === '') {
                const hcpSearchResults = await this.retrieveRecordsFromKnowledgeBase(accountName);
                if (hcpSearchResults.length === 0) {
                    // No HCP found
                    missingInformationEvents.push(callRecording_2.MissingInformationEvent.ACCOUNT_NOT_FOUND);
                    callRecordingPayload.accountName = '';
                    callRecordingPayload.accountId = '';
                }
                else if (hcpSearchResults.length > 1) {
                    // Multiple HCPs found
                    missingInformationEvents.push(callRecording_2.MissingInformationEvent.MULTIPLE_ACCOUNTS_FOUND);
                    const multipleAccountsFoundArray = hcpSearchResults.map((record) => ({
                        accountId: record.id,
                        accountName: record.doctor_name,
                    }));
                    callRecordingPayload.accountName = accountName;
                    callRecordingPayload.accountId = '';
                    callRecordingPayload.multipleAccountsFoundArray = multipleAccountsFoundArray;
                }
                else {
                    // Single match found
                    callRecordingPayload.accountName = hcpSearchResults[0].doctor_name;
                    callRecordingPayload.accountId = hcpSearchResults[0].id;
                }
            }
            else {
                // Account ID already exists
                callRecordingPayload.accountName = accountName;
                callRecordingPayload.accountId = accountId;
            }
        }
        // Check Call Date
        if (!call_date || call_date === '') {
            missingInformationEvents.push(callRecording_2.MissingInformationEvent.CALL_DATE_NOT_FOUND);
            callRecordingPayload.call_date = '';
        }
        else {
            callRecordingPayload.call_date = (0, moment_1.default)(call_date).format('YYYY-MM-DD');
        }
        // Check Call Time
        if (!call_time || call_time === '') {
            missingInformationEvents.push(callRecording_2.MissingInformationEvent.CALL_TIME_NOT_FOUND);
            callRecordingPayload.call_time = '';
        }
        else {
            callRecordingPayload.call_time = call_time;
        }
        // Check Product Name
        if (!product_description || product_description === '') {
            missingInformationEvents.push(callRecording_2.MissingInformationEvent.PRODUCT_INFO_NOT_FOUND);
            callRecordingPayload.product_description = '';
        }
        else {
            callRecordingPayload.product_description = product_description;
        }
        // Check Call Channel
        if (!call_channel || call_channel === '') {
            missingInformationEvents.push(callRecording_2.MissingInformationEvent.CALL_CHANNEL_NOT_FOUND);
            callRecordingPayload.call_channel = '';
        }
        else {
            callRecordingPayload.call_channel = call_channel;
        }
        // Copy other fields
        const { adverse_event_details, non_compliance_description, call_notes, discussion_notes, status, activity, attendees, non_compliance_event, adverse_event, follow_up_description, assigned_to, due_date, } = callRecordingParameters;
        callRecordingPayload = {
            ...callRecordingPayload,
            adverse_event_details: adverse_event_details || null,
            non_compliance_description: non_compliance_description || '',
            call_notes: call_notes || '',
            discussion_notes: discussion_notes || '',
            status: status || 'Saved',
            activity: activity || '',
            attendees: attendees || [],
            non_compliance_event: non_compliance_event || false,
            adverse_event: adverse_event || false,
            follow_up_description: follow_up_description || '',
            assigned_to: assigned_to || '',
            due_date: due_date || '',
        };
        logger_1.default.info(`Missing information events: ${missingInformationEvents.join(', ')}`);
        return {
            callRecordingPayload: callRecordingPayload,
            missingInformationEvents,
        };
    }
    /**
     * Analyze call recording transcript (first pass)
     */
    async analyzeCallRecording(sessionId, inputText) {
        try {
            // Create invocation
            const invocationId = await bedrockSessionService_1.bedrockSessionService.createInvocation(sessionId);
            // Store user input
            await bedrockSessionService_1.bedrockSessionService.putInvocationStep(sessionId, invocationId, 'user', inputText);
            // Generate prompt
            const callRecordingPrompt = (0, callRecording_1.generateCallRecordingPrompt)(inputText);
            // Call LLM
            const llmResponse = await this.invokeLLM(callRecordingPrompt, []);
            // Parse response
            const callRecordingParameters = JSON.parse(llmResponse);
            // Analyze missing information
            const result = await this.analyzeMissingInformation(callRecordingParameters);
            // Store assistant response
            await bedrockSessionService_1.bedrockSessionService.putInvocationStep(sessionId, invocationId, 'assistant', JSON.stringify(result.callRecordingPayload));
            logger_1.default.info('Call recording analysis complete');
            return result;
        }
        catch (error) {
            logger_1.default.error('Failed to analyze call recording:', error);
            throw new Error(`Failed to analyze call recording: ${error}`);
        }
    }
    /**
     * Fill missing details (follow-up turn)
     */
    async fillMissingDetails(sessionId, inputText) {
        try {
            // Get latest invocation
            const invocationId = await bedrockSessionService_1.bedrockSessionService.getLatestInvocationId(sessionId);
            if (!invocationId) {
                throw new Error('No invocation found for session');
            }
            // Build chat history
            const chatHistory = await bedrockSessionService_1.bedrockSessionService.buildChatHistory(sessionId, invocationId);
            // Generate fill missing details prompt
            const fillMissingPrompt = (0, callRecording_1.generateFillMissingDetailsPrompt)(inputText);
            // Call LLM with history
            const llmResponse = await this.invokeLLM(fillMissingPrompt, chatHistory);
            // Parse response
            let callRecordingParameters = JSON.parse(llmResponse);
            // Analyze missing information again
            const result = await this.analyzeMissingInformation(callRecordingParameters);
            // Merge with existing data
            const { accountName, accountId, call_channel, call_date, call_time, product_description, multipleAccountsFoundArray, } = result.callRecordingPayload;
            callRecordingParameters = {
                ...callRecordingParameters,
                accountName,
                accountId,
                call_channel,
                call_date,
                call_time,
                product_description,
            };
            // Store user input
            await bedrockSessionService_1.bedrockSessionService.putInvocationStep(sessionId, invocationId, 'user', inputText);
            // Store assistant response
            await bedrockSessionService_1.bedrockSessionService.putInvocationStep(sessionId, invocationId, 'assistant', JSON.stringify(callRecordingParameters));
            logger_1.default.info('Missing details filled successfully');
            return {
                callRecordingPayload: {
                    ...result.callRecordingPayload,
                    multipleAccountsFoundArray,
                },
                missingInformationEvents: result.missingInformationEvents,
            };
        }
        catch (error) {
            logger_1.default.error('Failed to fill missing details:', error);
            throw new Error(`Failed to fill missing details: ${error}`);
        }
    }
}
exports.CallRecordingAnalyzer = CallRecordingAnalyzer;
// Singleton instance
exports.callRecordingAnalyzer = new CallRecordingAnalyzer();
//# sourceMappingURL=callRecordingAnalyzer.js.map