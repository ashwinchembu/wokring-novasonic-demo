/**
 * Claude Client Service
 * Manages text-to-text conversations with AWS Bedrock Claude models
 * Supports tool calling and streaming responses
 */
import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  Message,
  ContentBlock,
  Tool,
  ToolUseBlock,
} from '@aws-sdk/client-bedrock-runtime';
import { v4 as uuidv4 } from 'uuid';
import logger from '../logger';
import config from '../config';
import { AGENT_683_SYSTEM_PROMPT } from '../prompting';
import { getToolDefinitions, dispatchToolCall } from '../tools';

export interface ClaudeClientOptions {
  modelId?: string;
  region?: string;
  systemPrompt?: string;
}

export class ClaudeClient {
  private modelId: string;
  private region: string;
  private systemPrompt: string;
  private bedrockClient: BedrockRuntimeClient;
  private conversationHistory: Message[] = [];
  
  public sessionId: string;
  public isActive: boolean;

  constructor(options: ClaudeClientOptions = {}) {
    // Use Claude 3.5 Sonnet by default for text conversations
    // Try environment variable first, then fall back to widely available Claude model
    this.modelId = options.modelId || 
                   process.env.CLAUDE_MODEL_ID || 
                   'anthropic.claude-3-5-sonnet-20240620-v1:0';
    this.region = options.region || config.aws.region;
    this.systemPrompt = options.systemPrompt || AGENT_683_SYSTEM_PROMPT;

    this.sessionId = uuidv4();
    this.isActive = true;

    this.bedrockClient = new BedrockRuntimeClient({
      region: this.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId || '',
        secretAccessKey: config.aws.secretAccessKey || '',
      },
    });

    logger.info(`ClaudeClient initialized with session_id: ${this.sessionId}`);
    logger.info(`Model: ${this.modelId}`);
    logger.info(`System prompt length: ${this.systemPrompt.length} chars`);
  }

  /**
   * Convert Nova Sonic tool definitions to Claude tool format
   */
  private convertToolDefinitions(): Tool[] {
    const novaSonicTools = getToolDefinitions();
    
    return novaSonicTools.map((tool: any) => {
      const toolSpec = tool.toolSpec;
      const inputSchema = JSON.parse(toolSpec.inputSchema.json);

      return {
        toolSpec: {
          name: toolSpec.name,
          description: toolSpec.description,
          inputSchema: {
            json: inputSchema,
          },
        },
      };
    });
  }

  /**
   * Send a text message and get a streaming response
   */
  async *sendMessage(userMessage: string): AsyncGenerator<{
    type: 'text' | 'tool_use' | 'tool_result';
    content?: string;
    toolName?: string;
    toolUseId?: string;
    input?: any;
    result?: any;
  }> {
    if (!this.isActive) {
      throw new Error('Client is not active');
    }

    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: [{ text: userMessage }],
    });

    logger.info(`User: ${userMessage}`);

    let continueLoop = true;

    // Tool use loop - continue until we get a final response without tool use
    while (continueLoop) {
      try {
        const tools = this.convertToolDefinitions();

        const command = new ConverseStreamCommand({
          modelId: this.modelId,
          messages: this.conversationHistory,
          system: [{ text: this.systemPrompt }],
          inferenceConfig: {
            maxTokens: 4096,
            temperature: 0.7,
            topP: 0.9,
          },
          toolConfig: {
            tools,
          },
        });

        const response = await this.bedrockClient.send(command);

        if (!response.stream) {
          throw new Error('No stream in response');
        }

        // Accumulate the assistant's response
        let currentText = '';
        const toolUses: ToolUseBlock[] = [];
        let stopReason: string | undefined;

        // Stream processing
        for await (const chunk of response.stream) {
          if (chunk.contentBlockStart?.start?.toolUse) {
            const toolUse = chunk.contentBlockStart.start.toolUse;
            toolUses.push({
              toolUseId: toolUse.toolUseId || '',
              name: toolUse.name || '',
              input: {},
            });
          } else if (chunk.contentBlockDelta?.delta?.toolUse) {
            // Accumulate tool input
            const delta = chunk.contentBlockDelta.delta.toolUse;
            if (toolUses.length > 0 && delta.input) {
              const lastTool = toolUses[toolUses.length - 1];
              lastTool.input = Object.assign({}, lastTool.input, delta.input);
            }
          } else if (chunk.contentBlockDelta?.delta?.text) {
            const textDelta = chunk.contentBlockDelta.delta.text;
            currentText += textDelta;
            
            // Yield text chunks as they arrive
            yield {
              type: 'text',
              content: textDelta,
            };
          } else if (chunk.messageStop) {
            stopReason = chunk.messageStop.stopReason;
          }
        }

        // Build assistant message for history
        const assistantContent: ContentBlock[] = [];
        
        if (currentText) {
          assistantContent.push({ text: currentText });
          logger.info(`Assistant: ${currentText}`);
        }

        if (toolUses.length > 0) {
          toolUses.forEach((toolUse) => {
            assistantContent.push({ toolUse });
            logger.info(`Tool use: ${toolUse.name} (${toolUse.toolUseId})`);
          });
        }

        this.conversationHistory.push({
          role: 'assistant',
          content: assistantContent,
        });

        // Handle tool use
        if (stopReason === 'tool_use' && toolUses.length > 0) {
          // Execute tools and add results to conversation
          const toolResults: ContentBlock[] = [];

          for (const toolUse of toolUses) {
            const toolName = toolUse.name || 'unknown';
            const toolUseId = toolUse.toolUseId || '';
            
            logger.info(`🔧 Executing tool: ${toolName}`);
            
            // Emit tool invocation
            yield {
              type: 'tool_use',
              toolName,
              toolUseId,
              input: toolUse.input,
            };

            let result: any;

            // Handle getDateTool inline
            if (toolName === 'getDateTool') {
              result = {
                date: new Date().toISOString().split('T')[0],
                time: new Date().toTimeString().split(' ')[0],
                timezone: 'UTC',
                timestamp: new Date().toISOString(),
              };
            } else {
              // Dispatch to tool handlers
              const toolInput = typeof toolUse.input === 'object' && toolUse.input !== null 
                ? toolUse.input as Record<string, unknown>
                : {};
              result = await dispatchToolCall(toolName, toolInput);
            }

            logger.info(`✅ Tool result: ${JSON.stringify(result).substring(0, 200)}...`);

            // Emit tool result
            yield {
              type: 'tool_result',
              toolName,
              toolUseId,
              result,
            };

            toolResults.push({
              toolResult: {
                toolUseId,
                content: [{ json: result }],
              },
            });
          }

          // Add tool results to conversation history
          this.conversationHistory.push({
            role: 'user',
            content: toolResults,
          });

          // Continue loop to get assistant's response after tool use
          continueLoop = true;
        } else {
          // Final response without tool use - we're done
          continueLoop = false;
        }
      } catch (error) {
        logger.error(`Error in Claude conversation: ${error}`);
        throw error;
      }
    }
  }

  /**
   * Get conversation history
   */
  getHistory(): Message[] {
    return this.conversationHistory;
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
    logger.info('Conversation history cleared');
  }

  /**
   * Close the client
   */
  close(): void {
    this.isActive = false;
    logger.info('Claude client closed');
  }
}

