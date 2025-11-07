/**
 * Nova Sonic Client Service
 * Manages bidirectional streaming with AWS Bedrock Nova Sonic model
 */
import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { Subject } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import logger from '../logger';
import config from '../config';
import { AGENT_683_SYSTEM_PROMPT } from '../prompting';
import { getToolDefinitions, dispatchToolCall } from '../tools';

export interface NovaSonicClientOptions {
  modelId?: string;
  region?: string;
  systemPrompt?: string;
}

export class NovaSonicClient {
  private modelId: string;
  private region: string;
  private systemPrompt: string;

  private inputSubject: Subject<string>;
  private outputSubject: Subject<Record<string, unknown>>;
  private audioSubject: Subject<{ audioBytes: Buffer; promptName: string; contentName: string }>;

  private streamResponse: any;
  private isActive: boolean;
  private bedrockClient: BedrockRuntimeClient;

  public sessionId: string;
  private promptName: string;
  private contentName: string;
  private audioContentName: string;

  public role?: string;
  private displayAssistantText: boolean;

  constructor(options: NovaSonicClientOptions = {}) {
    this.modelId = options.modelId || config.bedrock.modelId;
    this.region = options.region || config.aws.region;
    this.systemPrompt = options.systemPrompt || AGENT_683_SYSTEM_PROMPT;

    this.inputSubject = new Subject<string>();
    this.outputSubject = new Subject<Record<string, unknown>>();
    this.audioSubject = new Subject<{ audioBytes: Buffer; promptName: string; contentName: string }>();

    this.isActive = false;

    this.sessionId = uuidv4();
    this.promptName = uuidv4();
    this.contentName = uuidv4();
    this.audioContentName = uuidv4();

    this.displayAssistantText = false;

    this.bedrockClient = new BedrockRuntimeClient({
      region: this.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId || '',
        secretAccessKey: config.aws.secretAccessKey || '',
      },
    });

    logger.info(`NovaSonicClient initialized with session_id: ${this.sessionId}`);
    logger.info(`System prompt length: ${this.systemPrompt.length} chars`);
  }

  async initializeStream(): Promise<this> {
    try {
      logger.info(`Attempting to connect to Bedrock model: ${this.modelId}`);

      const command = new InvokeModelWithBidirectionalStreamCommand({
        modelId: this.modelId,
      });

      this.streamResponse = await this.bedrockClient.send(command);
      logger.info('Successfully connected to Bedrock');

      this.isActive = true;

      // Send initialization events
      await this.sendInitializationEvents();

      // Start processing responses
      this.processResponses();

      // Subscribe to input events
      this.inputSubject.subscribe({
        next: async (event) => await this.sendRawEvent(event),
        error: (err) => logger.error(`Input stream error: ${err}`),
      });

      // Subscribe to audio chunks
      this.audioSubject.subscribe({
        next: async (data) => await this.handleAudioInput(data),
        error: (err) => logger.error(`Audio stream error: ${err}`),
      });

      logger.info('Stream initialized successfully');
      return this;
    } catch (error) {
      this.isActive = false;
      logger.error(`Failed to initialize stream: ${error}`);
      throw error;
    }
  }

  private async sendInitializationEvents(): Promise<void> {
    const sessionEvent = this.createSessionStartEvent();
    const promptEvent = this.createPromptStartEvent();
    const textContentStart = this.createTextContentStartEvent('SYSTEM');
    const textContent = this.createTextInputEvent(this.systemPrompt);
    const textContentEnd = this.createContentEndEvent(this.promptName, this.contentName);

    const initEvents = [sessionEvent, promptEvent, textContentStart, textContent, textContentEnd];

    logger.info(`Sending system prompt to Bedrock (length: ${this.systemPrompt.length} chars)`);

    for (const event of initEvents) {
      await this.sendRawEvent(event);
    }
  }

  private createSessionStartEvent(): string {
    return JSON.stringify({
      event: {
        sessionStart: {
          inferenceConfiguration: {
            maxTokens: config.novaSonic.maxTokens,
            topP: config.novaSonic.topP,
            temperature: config.novaSonic.temperature,
          },
        },
      },
    });
  }

  private createPromptStartEvent(): string {
    const toolDefinitions = getToolDefinitions();

    return JSON.stringify({
      event: {
        promptStart: {
          promptName: this.promptName,
          textOutputConfiguration: {
            mediaType: 'text/plain',
          },
          audioOutputConfiguration: {
            mediaType: 'audio/lpcm',
            sampleRateHertz: config.audio.outputSampleRate,
            sampleSizeBits: config.audio.bitDepth,
            channelCount: config.audio.channels,
            voiceId: config.novaSonic.voiceId,
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
  }

  private createTextContentStartEvent(role: string): string {
    return JSON.stringify({
      event: {
        contentStart: {
          promptName: this.promptName,
          contentName: this.contentName,
          role,
          type: 'TEXT',
          interactive: true,
          textInputConfiguration: {
            mediaType: 'text/plain',
          },
        },
      },
    });
  }

  private createTextInputEvent(content: string): string {
    return JSON.stringify({
      event: {
        textInput: {
          promptName: this.promptName,
          contentName: this.contentName,
          content,
        },
      },
    });
  }

  private createContentEndEvent(promptName: string, contentName: string): string {
    return JSON.stringify({
      event: {
        contentEnd: {
          promptName,
          contentName,
        },
      },
    });
  }

  async sendRawEvent(eventJson: string): Promise<void> {
    if (!this.streamResponse || !this.isActive) {
      logger.warn('Stream not initialized or closed');
      return;
    }

    try {
      const encoder = new TextEncoder();
      const eventBytes = encoder.encode(eventJson);
      await this.streamResponse.inputStream.write(eventBytes);

      if (config.debug && eventJson.length > 200) {
        const parsed = JSON.parse(eventJson);
        const eventType = Object.keys(parsed.event || {})[0];
        logger.debug(`Sent event type: ${eventType}`);
      }
    } catch (error) {
      logger.error(`Error sending event: ${error}`);
      this.inputSubject.error(error);
    }
  }

  async sendAudioContentStartEvent(): Promise<void> {
    const contentStartEvent = JSON.stringify({
      event: {
        contentStart: {
          promptName: this.promptName,
          contentName: this.audioContentName,
          type: 'AUDIO',
          interactive: true,
          role: 'USER',
          audioInputConfiguration: {
            mediaType: 'audio/lpcm',
            sampleRateHertz: config.audio.inputSampleRate,
            sampleSizeBits: config.audio.bitDepth,
            channelCount: config.audio.channels,
            audioType: 'SPEECH',
            encoding: 'base64',
          },
        },
      },
    });

    await this.sendRawEvent(contentStartEvent);
    logger.debug('Audio content start event sent');
  }

  private async handleAudioInput(data: {
    audioBytes: Buffer;
    promptName: string;
    contentName: string;
  }): Promise<void> {
    try {
      const blob = data.audioBytes.toString('base64');
      const audioEvent = JSON.stringify({
        event: {
          audioInput: {
            promptName: data.promptName,
            contentName: data.contentName,
            content: blob,
          },
        },
      });

      await this.sendRawEvent(audioEvent);
      logger.debug(`Audio chunk sent: ${data.audioBytes.length} bytes`);
    } catch (error) {
      logger.error(`Error processing audio: ${error}`);
    }
  }

  addAudioChunk(audioBytes: Buffer): void {
    this.audioSubject.next({
      audioBytes,
      promptName: this.promptName,
      contentName: this.audioContentName,
    });
  }

  async sendAudioContentEndEvent(): Promise<void> {
    if (!this.isActive) return;

    const contentEndEvent = this.createContentEndEvent(this.promptName, this.audioContentName);
    await this.sendRawEvent(contentEndEvent);
    logger.debug('Audio content end event sent');
  }

  async sendPromptEndEvent(): Promise<void> {
    if (!this.isActive) return;

    const promptEndEvent = JSON.stringify({
      event: {
        promptEnd: {
          promptName: this.promptName,
        },
      },
    });

    await this.sendRawEvent(promptEndEvent);
    logger.debug('Prompt end event sent');
  }

  async sendSessionEndEvent(): Promise<void> {
    if (!this.isActive) return;

    const sessionEndEvent = JSON.stringify({
      event: {
        sessionEnd: {},
      },
    });

    await this.sendRawEvent(sessionEndEvent);
    this.isActive = false;
    logger.info('Session end event sent');
  }

  private async processResponses(): Promise<void> {
    try {
      for await (const event of this.streamResponse.outputStream) {
        if (!this.isActive) break;

        if (event.chunk?.bytes) {
          const decoder = new TextDecoder();
          const responseData = decoder.decode(event.chunk.bytes);

          try {
            const jsonData = JSON.parse(responseData);

            if (jsonData.error) {
              logger.error(`Bedrock error: ${JSON.stringify(jsonData.error)}`);
              this.outputSubject.next(jsonData);
              continue;
            }

            if (jsonData.event) {
              await this.handleResponseEvent(jsonData.event);
            }

            this.outputSubject.next(jsonData);
          } catch (err) {
            logger.error(`Failed to decode JSON response: ${err}`);
            this.outputSubject.next({ raw_data: responseData });
          }
        }
      }
    } catch (error) {
      logger.error(`Response processing error: ${error}`);
      this.outputSubject.error(error);
    } finally {
      if (this.isActive) {
        this.outputSubject.complete();
      }
    }
  }

  private async handleResponseEvent(event: Record<string, unknown>): Promise<void> {
    // Content start
    if (event.contentStart) {
      const contentStart = event.contentStart as Record<string, unknown>;
      this.role = contentStart.role as string;
    }

    // Text output
    else if (event.textOutput) {
      const textOutput = event.textOutput as Record<string, string>;
      const textContent = textOutput.content;

      // Check for barge-in
      if (textContent.includes('{ "interrupted" : true }')) {
        logger.info('Barge-in detected');
      }

      if (this.role === 'ASSISTANT' && this.displayAssistantText) {
        logger.info(`Assistant: ${textContent}`);
      } else if (this.role === 'USER') {
        logger.info(`User: ${textContent}`);
      }
    }

    // Tool use
    else if (event.toolUse) {
      await this.handleToolUse(event.toolUse as Record<string, unknown>);
    }
  }

  private async handleToolUse(toolUse: Record<string, unknown>): Promise<void> {
    logger.info('='.repeat(80));
    logger.info('🔧 TOOL USE EVENT RECEIVED');
    logger.info(`Full toolUse structure: ${JSON.stringify(toolUse, null, 2)}`);
    logger.info('='.repeat(80));

    const toolUseId = toolUse.toolUseId as string;
    const toolName = toolUse.toolName as string;
    const toolInputStr = (toolUse.content as string) || '{}';

    let toolInput: Record<string, unknown> = {};
    try {
      toolInput =
        typeof toolInputStr === 'string' ? JSON.parse(toolInputStr) : toolInputStr;
    } catch {
      logger.error(`❌ Failed to parse tool input: ${toolInputStr}`);
    }

    logger.info(`🔧 TOOL INVOCATION:`);
    logger.info(`  - Tool Name: ${toolName}`);
    logger.info(`  - Tool Use ID: ${toolUseId}`);
    logger.info(`  - Tool Input: ${JSON.stringify(toolInput, null, 4)}`);

    // Emit tool invocation event to frontend
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
    let toolResult: Record<string, unknown>;

    // Handle getDateTool locally
    if (toolName === 'getDateTool') {
      logger.info('📅 Executing getDateTool (built-in)...');
      toolResult = {
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().split(' ')[0],
        timezone: 'UTC',
        timestamp: new Date().toISOString(),
      };
      logger.info(`✅ getDateTool result: ${JSON.stringify(toolResult, null, 4)}`);
    } else {
      logger.info(`⚙️  Executing tool: ${toolName}...`);
      toolResult = await dispatchToolCall(toolName, toolInput);
      logger.info(`✅ Tool execution complete!`);
      logger.info(`  - Tool Result: ${JSON.stringify(toolResult, null, 4)}`);
    }

    // Emit tool result event to frontend
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

    // Send result back to Nova Sonic
    await this.sendToolResult(toolUseId, toolResult);
  }

  private async sendToolResult(
    toolUseId: string,
    toolResult: Record<string, unknown>
  ): Promise<void> {
    logger.info('📤 send_tool_result() called');
    logger.info(`  - Tool Use ID: ${toolUseId}`);
    logger.info(`  - Result Preview: ${JSON.stringify(toolResult, null, 4).substring(0, 500)}...`);

    if (!this.isActive) {
      logger.warn('⚠️  Cannot send tool result - stream not active');
      return;
    }

    try {
      const toolResultContentName = uuidv4();

      // Content start for TOOL result
      const contentStartEvent = JSON.stringify({
        event: {
          contentStart: {
            promptName: this.promptName,
            contentName: toolResultContentName,
            role: 'TOOL',
            type: 'TOOL',
            interactive: false,
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

      await this.sendRawEvent(contentStartEvent);

      // Tool result data
      const resultContent = JSON.stringify(toolResult);
      const toolResultEvent = JSON.stringify({
        event: {
          toolResult: {
            promptName: this.promptName,
            contentName: toolResultContentName,
            content: resultContent,
          },
        },
      });

      await this.sendRawEvent(toolResultEvent);

      // Content end
      const contentEndEvent = this.createContentEndEvent(this.promptName, toolResultContentName);
      await this.sendRawEvent(contentEndEvent);

      logger.info('='.repeat(80));
      logger.info('✅ TOOL RESULT FULLY TRANSMITTED');
      logger.info(`  - Tool Use ID: ${toolUseId}`);
      logger.info(`  - Result Length: ${resultContent.length} chars`);
      logger.info('='.repeat(80));
    } catch (error) {
      logger.error('='.repeat(80));
      logger.error('❌ ERROR SENDING TOOL RESULT');
      logger.error(`  - Tool Use ID: ${toolUseId}`);
      logger.error(`  - Error: ${error}`);
      logger.error('='.repeat(80));
    }
  }

  async *getEventsStream(): AsyncGenerator<Record<string, unknown>, void, unknown> {
    const queue: Array<Record<string, unknown>> = [];
    let isComplete = false;

    const subscription = this.outputSubject.subscribe({
      next: (event) => queue.push(event),
      error: (error) => {
        queue.push({ error: String(error) });
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
        } else {
          // Wait a bit before checking again
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
    } finally {
      subscription.unsubscribe();
      logger.debug('Event stream subscription disposed');
    }
  }

  async close(): Promise<void> {
    if (!this.isActive) return;

    logger.info('Closing Nova Sonic client');

    this.inputSubject.complete();
    this.audioSubject.complete();

    await this.sendAudioContentEndEvent();
    await this.sendPromptEndEvent();
    await this.sendSessionEndEvent();

    if (this.streamResponse?.inputStream) {
      await this.streamResponse.inputStream.end();
    }

    logger.info('Nova Sonic client closed');
  }
}

