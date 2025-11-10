/**
 * Nova Sonic Client Service
 * Manages bidirectional streaming with AWS Bedrock Nova Sonic model
 * Based on AWS amazon-nova-samples implementation
 */
import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
  InvokeModelWithBidirectionalStreamInput,
} from '@aws-sdk/client-bedrock-runtime';
import { NodeHttp2Handler } from '@smithy/node-http-handler';
import { Subject, firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
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

// Session data structure
interface SessionData {
  queue: Array<any>;
  queueSignal: Subject<void>;
  closeSignal: Subject<void>;
  isActive: boolean;
  promptName: string;
  audioContentId: string;
}

export class NovaSonicClient {
  private modelId: string;
  private region: string;
  private systemPrompt: string;

  private bedrockClient: BedrockRuntimeClient;
  private sessionData: SessionData | null = null;
  private outputSubject: Subject<Record<string, unknown>>;

  public sessionId: string;
  public isActive: boolean;
  public role?: string;

  constructor(options: NovaSonicClientOptions = {}) {
    this.modelId = options.modelId || config.bedrock.modelId;
    this.region = options.region || config.aws.region;
    this.systemPrompt = options.systemPrompt || AGENT_683_SYSTEM_PROMPT;

    this.outputSubject = new Subject<Record<string, unknown>>();
    this.isActive = false;

    this.sessionId = uuidv4();

    // Use HTTP/2 handler (critical for bidirectional streaming!)
    const nodeHttp2Handler = new NodeHttp2Handler({
      requestTimeout: 300000,
      sessionTimeout: 300000,
      disableConcurrentStreams: false,
      maxConcurrentStreams: 20,
    });

    this.bedrockClient = new BedrockRuntimeClient({
      region: this.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId || '',
        secretAccessKey: config.aws.secretAccessKey || '',
      },
      requestHandler: nodeHttp2Handler,
    });

    logger.info(`NovaSonicClient initialized with session_id: ${this.sessionId}`);
    logger.info(`System prompt length: ${this.systemPrompt.length} chars`);
  }

  async initializeStream(): Promise<this> {
    try {
      logger.info(`Attempting to connect to Bedrock model: ${this.modelId}`);

      // Initialize session data
      this.sessionData = {
        queue: [],
        queueSignal: new Subject<void>(),
        closeSignal: new Subject<void>(),
        isActive: true,
        promptName: uuidv4(),
        audioContentId: uuidv4(),
      };

      // Send initialization events
      this.queueEvent({
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

      const toolDefinitions = getToolDefinitions();

      this.queueEvent({
        event: {
          promptStart: {
            promptName: this.sessionData.promptName,
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

      // System prompt
      const textPromptId = uuidv4();
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

      // Create async iterable for input
      const asyncIterable = this.createAsyncIterable();

      logger.info('Starting bidirectional stream...');

      // Start the bidirectional stream
      const response = await this.bedrockClient.send(
        new InvokeModelWithBidirectionalStreamCommand({
          modelId: this.modelId,
          body: asyncIterable,
        })
      );

      this.isActive = true;
      logger.info('Successfully connected to Bedrock');

      // Process responses
      this.processResponses(response);

      logger.info('Stream initialized successfully');
      return this;
    } catch (error) {
      this.isActive = false;
      logger.error(`Failed to initialize stream: ${error}`);
      throw error;
    }
  }

  private createAsyncIterable(): AsyncIterable<InvokeModelWithBidirectionalStreamInput> {
    const session = this.sessionData;
    if (!session) {
      throw new Error('Session not initialized');
    }

    return {
      [Symbol.asyncIterator]: () => {
        return {
          next: async (): Promise<IteratorResult<InvokeModelWithBidirectionalStreamInput>> => {
            try {
              if (!session.isActive) {
                return { value: undefined, done: true };
              }

              // Wait for items in queue
              if (session.queue.length === 0) {
                try {
                  await Promise.race([
                    firstValueFrom(session.queueSignal.pipe(take(1))),
                    firstValueFrom(session.closeSignal.pipe(take(1))).then(() => {
                      throw new Error('Stream closed');
                    }),
                  ]);
                } catch (error) {
                  if (error instanceof Error && (error.message === 'Stream closed' || !session.isActive)) {
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
            } catch (error) {
              logger.error(`Error in iterator: ${error}`);
              session.isActive = false;
              return { value: undefined, done: true };
            }
          },

          return: async (): Promise<IteratorResult<InvokeModelWithBidirectionalStreamInput>> => {
            session.isActive = false;
            return { value: undefined, done: true };
          },

          throw: async (error: any): Promise<IteratorResult<InvokeModelWithBidirectionalStreamInput>> => {
            session.isActive = false;
            throw error;
          },
        };
      },
    };
  }

  private async processResponses(response: any): Promise<void> {
    try {
      for await (const event of response.body) {
        if (!this.isActive) break;

        if (event.chunk?.bytes) {
          const textResponse = new TextDecoder().decode(event.chunk.bytes);

          try {
            const jsonResponse = JSON.parse(textResponse);

            if (jsonResponse.error) {
              logger.error(`Bedrock error: ${JSON.stringify(jsonResponse.error)}`);
              this.outputSubject.next(jsonResponse);
              continue;
            }

            if (jsonResponse.event) {
              await this.handleResponseEvent(jsonResponse.event);
            }

            this.outputSubject.next(jsonResponse);
          } catch (err) {
            logger.error(`Failed to decode JSON response: ${err}`);
            this.outputSubject.next({ raw_data: textResponse });
          }
        }
      }

      logger.info('Response stream processing complete');
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
    if (event.contentStart) {
      const contentStart = event.contentStart as Record<string, unknown>;
      this.role = contentStart.role as string;
    } else if (event.textOutput) {
      const textOutput = event.textOutput as Record<string, string>;
      const textContent = textOutput.content;

      if (textContent.includes('{ "interrupted" : true }')) {
        logger.info('Barge-in detected');
      }

      if (this.role === 'ASSISTANT') {
        logger.info(`Assistant: ${textContent}`);
      } else if (this.role === 'USER') {
        logger.info(`User: ${textContent}`);
      }
    } else if (event.toolUse) {
      await this.handleToolUse(event.toolUse as Record<string, unknown>);
    }
  }

  private async handleToolUse(toolUse: Record<string, unknown>): Promise<void> {
    logger.info('='.repeat(80));
    logger.info('🔧 TOOL USE EVENT RECEIVED');

    const toolUseId = toolUse.toolUseId as string;
    const toolName = toolUse.toolName as string;
    const toolInputStr = (toolUse.content as string) || '{}';

    let toolInput: Record<string, unknown> = {};
    try {
      toolInput = typeof toolInputStr === 'string' ? JSON.parse(toolInputStr) : toolInputStr;
    } catch {
      logger.error(`❌ Failed to parse tool input: ${toolInputStr}`);
    }

    logger.info(`  - Tool Name: ${toolName}`);
    logger.info(`  - Tool Use ID: ${toolUseId}`);

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
    let toolResult: Record<string, unknown>;

    if (toolName === 'getDateTool') {
      toolResult = {
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().split(' ')[0],
        timezone: 'UTC',
        timestamp: new Date().toISOString(),
      };
    } else {
      toolResult = await dispatchToolCall(toolName, toolInput);
    }

    logger.info(`✅ Tool execution complete: ${toolName}`);

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

  private async sendToolResult(toolUseId: string, result: Record<string, unknown>): Promise<void> {
    if (!this.isActive || !this.sessionData) return;

    const contentId = uuidv4();

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

    logger.info('✅ Tool result sent');
  }

  async sendAudioContentStartEvent(): Promise<void> {
    if (!this.sessionData) return;

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
            sampleRateHertz: config.audio.inputSampleRate,
            sampleSizeBits: config.audio.bitDepth,
            channelCount: config.audio.channels,
            audioType: 'SPEECH',
            encoding: 'base64',
          },
        },
      },
    });

    logger.debug('Audio content start event sent');
  }

  addAudioChunk(audioBytes: Buffer): void {
    if (!this.sessionData) return;

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

  async sendAudioContentEndEvent(): Promise<void> {
    if (!this.isActive || !this.sessionData) return;

    this.queueEvent({
      event: {
        contentEnd: {
          promptName: this.sessionData.promptName,
          contentName: this.sessionData.audioContentId,
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 500));
    logger.debug('Audio content end event sent');
  }

  async sendPromptEndEvent(): Promise<void> {
    if (!this.isActive || !this.sessionData) return;

    this.queueEvent({
      event: {
        promptEnd: {
          promptName: this.sessionData.promptName,
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 300));
    logger.debug('Prompt end event sent');
  }

  async sendSessionEndEvent(): Promise<void> {
    if (!this.sessionData) return;

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

    logger.info('Session end event sent');
  }

  private queueEvent(event: any): void {
    if (!this.sessionData) return;

    this.sessionData.queue.push(event);
    this.sessionData.queueSignal.next();
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

    await this.sendAudioContentEndEvent();
    await this.sendPromptEndEvent();
    await this.sendSessionEndEvent();

    logger.info('Nova Sonic client closed');
  }
}
