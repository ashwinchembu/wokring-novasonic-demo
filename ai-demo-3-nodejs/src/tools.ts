/**
 * Tool Handler Functions
 * Implements handlers for Bedrock agent tools
 */
import logger from './logger';
import config from './config';
import { lookupHcpId, HCP_NAME_TO_ID_MAP } from './prompting';

// ============================================================================
// Tool Handlers
// ============================================================================

export async function handleLookupHcpTool(
  arguments_: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const name = (arguments_.name as string || '').trim();

  logger.info('🔍 LOOKUP HCP TOOL HANDLER');
  logger.info(`  - Input name: '${name}'`);
  logger.info(`  - Name length: ${name.length} chars`);

  if (!name || name.length < 2) {
    logger.warn('⚠️  Invalid name (too short or empty)');
    return {
      found: false,
      hcp_id: null,
      hco_id: null,
      hco_name: null,
      source: null,
      error: 'Name must be at least 2 characters',
    };
  }

  // Try static map (Redshift integration can be added later)
  logger.info('📋 Trying static map lookup...');
  const hcpId = lookupHcpId(name);
  if (hcpId) {
    // Find the full name from the static map
    let fullName: string | undefined;
    for (const [staticName, staticId] of Object.entries(HCP_NAME_TO_ID_MAP)) {
      if (staticId === hcpId) {
        fullName = staticName;
        break;
      }
    }

    logger.info('✅ FOUND IN STATIC MAP!');
    logger.info(`  - HCP Name: ${fullName}`);
    logger.info(`  - HCP ID: ${hcpId}`);
    return {
      found: true,
      name: fullName,
      hcp_id: hcpId,
      hco_id: null,
      hco_name: null,
      source: 'static',
    };
  }

  // Not found
  logger.warn('❌ HCP NOT FOUND in static map');
  logger.info(`  - Searched name: '${name}'`);
  return {
    found: false,
    hcp_id: null,
    hco_id: null,
    hco_name: null,
    source: null,
  };
}

export async function handleInsertCallTool(
  arguments_: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const record = arguments_.record as Record<string, unknown> || {};

  if (!record || Object.keys(record).length === 0) {
    return {
      ok: false,
      error: 'No record provided',
    };
  }

  logger.info('Tool: insertCallTool - persisting call record');

  try {
    // TODO: Implement actual Redshift insert
    // For now, generate a mock call_pk
    const callPk = `CALL_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    logger.info(`✅ Call persisted: ${callPk}`);
    return {
      ok: true,
      call_pk: callPk,
    };
  } catch (error) {
    logger.error(`Failed to insert call: ${error}`);
    return {
      ok: false,
      error: String(error),
    };
  }
}

export async function handleEmitN8nEventTool(
  arguments_: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const eventType = (arguments_.eventType as string || '');
  const payload = (arguments_.payload as Record<string, unknown>) || {};

  if (!eventType) {
    return {
      ok: false,
      error: 'No eventType provided',
    };
  }

  logger.info(`Tool: emitN8nEventTool - emitting event: ${eventType}`);

  // Check if n8n webhook is configured
  if (!config.n8n?.webhookUrl) {
    logger.warn('n8n webhook URL not configured, skipping event emission');
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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.n8n.webhookSecret) {
      headers['X-N8N-Secret'] = config.n8n.webhookSecret;
    }

    // POST to n8n webhook
    const response = await fetch(config.n8n.webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(webhookPayload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    logger.info(`✅ n8n event emitted: ${eventType} (status=${response.status})`);
    return {
      ok: true,
      status_code: response.status,
    };
  } catch (error) {
    logger.error(`Failed to emit n8n event: ${error}`);
    return {
      ok: false,
      error: String(error),
    };
  }
}

export async function handleCreateFollowUpTaskTool(
  arguments_: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const task = (arguments_.task as Record<string, unknown>) || {};

  if (!task || !task.task_type) {
    return {
      ok: false,
      error: 'No task or task_type provided',
    };
  }

  logger.info(`Tool: createFollowUpTaskTool - creating task: ${task.task_type}`);

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

      logger.info(`✅ Follow-up task created: ${externalTaskId}`);
      return {
        ok: true,
        external_task_id: externalTaskId,
      };
    } else {
      return {
        ok: false,
        error: `Failed to emit task event: ${eventResult.error}`,
      };
    }
  } catch (error) {
    logger.error(`Failed to create follow-up task: ${error}`);
    return {
      ok: false,
      error: String(error),
    };
  }
}

// ============================================================================
// Tool Dispatcher
// ============================================================================

export async function dispatchToolCall(
  toolName: string,
  arguments_: Record<string, unknown>
): Promise<Record<string, unknown>> {
  logger.info('='.repeat(80));
  logger.info('🎯 TOOL DISPATCHER CALLED');
  logger.info(`  - Tool Name: ${toolName}`);
  logger.info(`  - Arguments: ${JSON.stringify(arguments_, null, 4)}`);
  logger.info('='.repeat(80));

  const handlers: Record<string, (args: Record<string, unknown>) => Promise<Record<string, unknown>>> = {
    lookupHcpTool: handleLookupHcpTool,
    insertCallTool: handleInsertCallTool,
    emitN8nEventTool: handleEmitN8nEventTool,
    createFollowUpTaskTool: handleCreateFollowUpTaskTool,
  };

  const handler = handlers[toolName];

  if (!handler) {
    logger.error('='.repeat(80));
    logger.error(`❌ UNKNOWN TOOL: ${toolName}`);
    logger.error(`  - Available tools: ${Object.keys(handlers).join(', ')}`);
    logger.error('='.repeat(80));
    return {
      error: `Unknown tool: ${toolName}`,
      available_tools: Object.keys(handlers),
    };
  }

  try {
    logger.info(`🔀 Calling handler: ${handler.name}`);
    const result = await handler(arguments_);
    logger.info('='.repeat(80));
    logger.info('✅ TOOL HANDLER COMPLETED');
    logger.info(`  - Tool: ${toolName}`);
    logger.info(`  - Result: ${JSON.stringify(result, null, 4).substring(0, 500)}...`);
    logger.info('='.repeat(80));
    return result;
  } catch (error) {
    logger.error('='.repeat(80));
    logger.error('❌ TOOL EXECUTION FAILED');
    logger.error(`  - Tool: ${toolName}`);
    logger.error(`  - Error: ${error}`);
    logger.error('='.repeat(80));
    return {
      error: `Tool execution failed: ${String(error)}`,
      tool_name: toolName,
    };
  }
}

// ============================================================================
// Tool Definitions (for promptStart toolConfiguration)
// ============================================================================

export function getToolDefinitions(): Array<Record<string, unknown>> {
  return [
    {
      toolSpec: {
        name: 'getDateTool',
        description:
          'Return current date/time for sanity checks. Use this tool when the user asks about the current date or time.',
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
        description:
          "Lookup an HCP (Healthcare Professional) by name in the system. Use this tool when the user mentions a doctor's name or asks if an HCP exists. Returns {found:Boolean, hcp_id:String|null, hco_id:String|null, hco_name:String|null, name:String|null, source:String|null}.",
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
        description:
          'Persist the final call JSON to Redshift calls table. Use this tool after the user confirms the call summary to save the record to the database.',
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
    {
      toolSpec: {
        name: 'emitN8nEventTool',
        description:
          'POST the saved calls row + session metadata to an n8n Webhook. Use this tool after successfully inserting a call to trigger automation workflows.',
        inputSchema: {
          json: JSON.stringify({
            type: 'object',
            properties: {
              eventType: {
                type: 'string',
                description: "Event type (e.g., 'call.saved', 'call.updated')",
              },
              payload: {
                type: 'object',
                description: 'Event payload data',
              },
            },
            required: ['eventType', 'payload'],
          }),
        },
      },
    },
    {
      toolSpec: {
        name: 'createFollowUpTaskTool',
        description:
          'Create a follow-up task in PM/CRM when call_follow_up_task.task_type is present. Use this tool after persisting a call that includes a follow-up task.',
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

