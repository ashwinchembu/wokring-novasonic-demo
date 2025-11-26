"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleLookupHcpTool = handleLookupHcpTool;
exports.handleInsertCallTool = handleInsertCallTool;
exports.handleEmitN8nEventTool = handleEmitN8nEventTool;
exports.handleCreateFollowUpTaskTool = handleCreateFollowUpTaskTool;
exports.dispatchToolCall = dispatchToolCall;
exports.getToolDefinitions = getToolDefinitions;
/**
 * Tool Handler Functions
 * Implements handlers for Bedrock agent tools
 */
const logger_1 = __importDefault(require("./logger"));
const config_1 = __importDefault(require("./config"));
const prompting_1 = require("./prompting");
const redshift_1 = __importDefault(require("./redshift"));

// Tool Handlers

async function handleLookupHcpTool(arguments_) {
    const name = (arguments_.name || '').trim();
    logger_1.default.info('🔍 LOOKUP HCP TOOL HANDLER');
    logger_1.default.info(`  - Input name: '${name}'`);
    logger_1.default.info(`  - Name length: ${name.length} chars`);
    if (!name || name.length < 2) {
        logger_1.default.warn('⚠️  Invalid name (too short or empty)');
        return {
            found: false,
            hcp_id: null,
            hco_id: null,
            hco_name: null,
            source: null,
            error: 'Name must be at least 2 characters',
        };
    }
    // Track where we searched
    let searchedInRedshift = false;
    let searchedInStatic = false;
    // Try Redshift first if available
    if (redshift_1.default.isAvailable()) {
        logger_1.default.info('🗄️  Trying Redshift database lookup...');
        searchedInRedshift = true;
        const result = await redshift_1.default.lookupHcp(name);
        if (result.found) {
            logger_1.default.info('✅ FOUND IN REDSHIFT!');
            logger_1.default.info(`  - HCP Name: ${result.name}`);
            logger_1.default.info(`  - HCP ID: ${result.hcp_id}`);
            logger_1.default.info(`  - HCO ID: ${result.hco_id}`);
            logger_1.default.info(`  - HCO Name: ${result.hco_name}`);
            return {
                ...result,
                source: 'redshift',
            };
        }
        logger_1.default.info('   Not found in Redshift, trying static map...');
    }
    else {
        logger_1.default.info('⚠️  Redshift not available, using static map');
    }
    // Fallback to static map
    logger_1.default.info('📋 Trying static map lookup...');
    searchedInStatic = true;
    const hcpId = (0, prompting_1.lookupHcpId)(name);
    if (hcpId) {
        // Find the full name from the static map
        let fullName;
        for (const [staticName, staticId] of Object.entries(prompting_1.HCP_NAME_TO_ID_MAP)) {
            if (staticId === hcpId) {
                fullName = staticName;
                break;
            }
        }
        logger_1.default.info('✅ FOUND IN STATIC MAP!');
        logger_1.default.info(`  - HCP Name: ${fullName}`);
        logger_1.default.info(`  - HCP ID: ${hcpId}`);
        return {
            found: true,
            name: fullName,
            hcp_id: hcpId,
            hco_id: null,
            hco_name: null,
            source: 'static_map',
        };
    }
    // Not found anywhere - return source info about where we searched
    const searchSources = [];
    if (searchedInRedshift)
        searchSources.push('redshift');
    if (searchedInStatic)
        searchSources.push('static_map');
    const sourceInfo = searchSources.length > 0
        ? `searched_in: ${searchSources.join(', ')}`
        : 'no_sources_available';
    logger_1.default.warn('❌ HCP NOT FOUND in any source');
    logger_1.default.info(`  - Searched name: '${name}'`);
    logger_1.default.info(`  - Sources checked: ${sourceInfo}`);
    return {
        found: false,
        hcp_id: null,
        hco_id: null,
        hco_name: null,
        source: sourceInfo,
    };
}
async function handleInsertCallTool(arguments_) {
    const record = arguments_.record || {};
    if (!record || Object.keys(record).length === 0) {
        return {
            ok: false,
            error: 'No record provided',
        };
    }
    logger_1.default.info('💾 Tool: insertCallTool - persisting call record');
    logger_1.default.info(`   Record: ${JSON.stringify(record, null, 2)}`);
    try {
        // Try Redshift first if available
        if (redshift_1.default.isAvailable()) {
            logger_1.default.info('🗄️  Inserting to Redshift...');
            const result = await redshift_1.default.insertCall(record);
            if (result.ok) {
                logger_1.default.info(`✅ Call persisted to Redshift: ${result.call_id}`);
                return {
                    ok: true,
                    call_pk: result.call_id,
                    source: 'redshift',
                };
            }
            else {
                logger_1.default.error(`❌ Failed to insert to Redshift: ${result.error}`);
                // Fall through to mock implementation
            }
        }
        else {
            logger_1.default.warn('⚠️  Redshift not available, using mock insert');
        }
        // Fallback: generate mock call_pk
        const callPk = `CALL_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        logger_1.default.info(`✅ Call persisted (mock): ${callPk}`);
        return {
            ok: true,
            call_pk: callPk,
            source: 'mock',
        };
    }
    catch (error) {
        logger_1.default.error(`Failed to insert call: ${error}`);
        return {
            ok: false,
            error: String(error),
        };
    }
}
async function handleEmitN8nEventTool(arguments_) {
    const eventType = (arguments_.eventType || '');
    const payload = arguments_.payload || {};
    if (!eventType) {
        return {
            ok: false,
            error: 'No eventType provided',
        };
    }
    logger_1.default.info(`Tool: emitN8nEventTool - emitting event: ${eventType}`);
    // Check if n8n webhook is configured
    if (!config_1.default.n8n?.webhookUrl) {
        logger_1.default.warn('n8n webhook URL not configured, skipping event emission');
        return {
            ok: true,
            message: 'n8n webhook not configured (skipped)',
        };
    }
    try {
        // Prepare webhook payload
        const webhookPayload = {
            eventType,
            payload,
            timestamp: new Date().toISOString(),
        };
        // Prepare headers
        const headers = {
            'Content-Type': 'application/json',
        };
        if (config_1.default.n8n.webhookSecret) {
            headers['X-N8N-Secret'] = config_1.default.n8n.webhookSecret;
        }
        // POST to n8n webhook
        const response = await fetch(config_1.default.n8n.webhookUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(webhookPayload),
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        logger_1.default.info(`✅ n8n event emitted: ${eventType} (status=${response.status})`);
        return {
            ok: true,
            status_code: response.status,
        };
    }
    catch (error) {
        logger_1.default.error(`Failed to emit n8n event: ${error}`);
        return {
            ok: false,
            error: String(error),
        };
    }
}
async function handleCreateFollowUpTaskTool(arguments_) {
    const task = arguments_.task || {};
    if (!task || !task.task_type) {
        return {
            ok: false,
            error: 'No task or task_type provided',
        };
    }
    logger_1.default.info(`Tool: createFollowUpTaskTool - creating task: ${task.task_type}`);
    try {
        // Emit task creation event to n8n
        const eventResult = await handleEmitN8nEventTool({
            eventType: 'task.created',
            payload: {
                task,
                created_at: new Date().toISOString(),
            },
        });
        if (eventResult.ok) {
            // Generate a mock external task ID
            const externalTaskId = `TASK_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
            logger_1.default.info(`✅ Follow-up task created: ${externalTaskId}`);
            return {
                ok: true,
                external_task_id: externalTaskId,
            };
        }
        else {
            return {
                ok: false,
                error: `Failed to emit task event: ${eventResult.error}`,
            };
        }
    }
    catch (error) {
        logger_1.default.error(`Failed to create follow-up task: ${error}`);
        return {
            ok: false,
            error: String(error),
        };
    }
}

// Tool Dispatcher

async function dispatchToolCall(toolName, arguments_) {
    logger_1.default.info('='.repeat(80));
    logger_1.default.info('🎯 TOOL DISPATCHER CALLED');
    logger_1.default.info(`  - Tool Name: ${toolName}`);
    logger_1.default.info(`  - Arguments: ${JSON.stringify(arguments_, null, 4)}`);
    logger_1.default.info('='.repeat(80));
    const handlers = {
        lookupHcpTool: handleLookupHcpTool,
        insertCallTool: handleInsertCallTool,
        // emitN8nEventTool: handleEmitN8nEventTool, // Disabled for now
        createFollowUpTaskTool: handleCreateFollowUpTaskTool,
    };
    const handler = handlers[toolName];
    if (!handler) {
        logger_1.default.error('='.repeat(80));
        logger_1.default.error(`❌ UNKNOWN TOOL: ${toolName}`);
        logger_1.default.error(`  - Available tools: ${Object.keys(handlers).join(', ')}`);
        logger_1.default.error('='.repeat(80));
        return {
            error: `Unknown tool: ${toolName}`,
            available_tools: Object.keys(handlers),
        };
    }
    try {
        logger_1.default.info(`🔀 Calling handler: ${handler.name}`);
        const result = await handler(arguments_);
        logger_1.default.info('='.repeat(80));
        logger_1.default.info('✅ TOOL HANDLER COMPLETED');
        logger_1.default.info(`  - Tool: ${toolName}`);
        logger_1.default.info(`  - Result: ${JSON.stringify(result, null, 4).substring(0, 500)}...`);
        logger_1.default.info('='.repeat(80));
        return result;
    }
    catch (error) {
        logger_1.default.error('='.repeat(80));
        logger_1.default.error('❌ TOOL EXECUTION FAILED');
        logger_1.default.error(`  - Tool: ${toolName}`);
        logger_1.default.error(`  - Error: ${error}`);
        logger_1.default.error('='.repeat(80));
        return {
            error: `Tool execution failed: ${String(error)}`,
            tool_name: toolName,
        };
    }
}

// Tool Definitions (for promptStart toolConfiguration)

function getToolDefinitions() {
    return [
        {
            toolSpec: {
                name: 'getDateTool',
                description: 'Return current date/time for sanity checks. Use this tool when the user asks about the current date or time.',
                inputSchema: {
                    json: JSON.stringify({
                        type: 'object',
                        properties: {},
                        required: [],
                    }),
                },
            },
        },
        {
            toolSpec: {
                name: 'lookupHcpTool',
                description: "Lookup an HCP (Healthcare Professional) by name in the system. Use this tool when the user mentions a doctor's name or asks if an HCP exists. Returns {found:Boolean, hcp_id:String|null, hco_id:String|null, hco_name:String|null, name:String|null, source:String|null}.",
                inputSchema: {
                    json: JSON.stringify({
                        type: 'object',
                        properties: {
                            name: {
                                type: 'string',
                                minLength: 2,
                                description: 'The name of the healthcare professional to look up',
                            },
                        },
                        required: ['name'],
                    }),
                },
            },
        },
        {
            toolSpec: {
                name: 'insertCallTool',
                description: 'Persist the final call JSON to Redshift calls table. Use this tool after the user confirms the call summary to save the record to the database.',
                inputSchema: {
                    json: JSON.stringify({
                        type: 'object',
                        properties: {
                            record: {
                                type: 'object',
                                description: 'Complete call record JSON with all fields',
                            },
                        },
                        required: ['record'],
                    }),
                },
            },
        },
        // N8N tool disabled for now
        // {
        //   toolSpec: {
        //     name: 'emitN8nEventTool',
        //     description:
        //       'POST the saved calls row + session metadata to an n8n Webhook. Use this tool after successfully inserting a call to trigger automation workflows.',
        //     inputSchema: {
        //       json: JSON.stringify({
        //         type: 'object',
        //         properties: {
        //           eventType: {
        //             type: 'string',
        //             description: "Event type (e.g., 'call.saved', 'call.updated')",
        //           },
        //           payload: {
        //             type: 'object',
        //             description: 'Event payload data',
        //           },
        //         },
        //         required: ['eventType', 'payload'],
        //       }),
        //     },
        //   },
        // },
        {
            toolSpec: {
                name: 'createFollowUpTaskTool',
                description: 'Create a follow-up task in PM/CRM when call_follow_up_task.task_type is present. Use this tool after persisting a call that includes a follow-up task.',
                inputSchema: {
                    json: JSON.stringify({
                        type: 'object',
                        properties: {
                            task: {
                                type: 'object',
                                description: 'Task details (task_type, description, due_date, assigned_to)',
                            },
                        },
                        required: ['task'],
                    }),
                },
            },
        },
    ];
}
//# sourceMappingURL=tools.js.map