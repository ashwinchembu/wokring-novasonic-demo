/**
 * Bedrock Agent Runtime Session Service
 * Manages sessions and invocations for call recording analysis
 * Ported from Lambda text-to-text implementation
 */

import {
  BedrockAgentRuntimeClient,
  CreateSessionCommand,
  ListInvocationsCommand,
  CreateInvocationCommand,
  PutInvocationStepCommand,
  ListInvocationStepsCommand,
  GetInvocationStepCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { v4 as uuidv4 } from 'uuid';
import config from '../config';
import logger from '../logger';

export interface BedrockSessionInfo {
  sessionId: string;
  userId: string;
  createdAt: Date;
}

export interface InvocationStepData {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: Array<{ text: string }>;
}

export class BedrockSessionService {
  private bedrockClient: BedrockAgentRuntimeClient;

  constructor() {
    this.bedrockClient = new BedrockAgentRuntimeClient({
      region: config.aws.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId || '',
        secretAccessKey: config.aws.secretAccessKey || '',
      },
    });
    logger.info('BedrockSessionService initialized');
  }

  /**
   * Create a new Bedrock Agent Runtime session
   */
  async createSession(userId: string): Promise<string> {
    try {
      const command = new CreateSessionCommand({
        sessionMetadata: {
          userId,
        },
      });

      const response = await this.bedrockClient.send(command);
      const sessionId = response.sessionId!;

      logger.info(`Created Bedrock session: ${sessionId} for user: ${userId}`);
      return sessionId;
    } catch (error) {
      logger.error('Failed to create Bedrock session:', error);
      throw new Error(`Failed to create session: ${error}`);
    }
  }

  /**
   * Create a new invocation within a session
   */
  async createInvocation(sessionId: string): Promise<string> {
    try {
      const invocationId = uuidv4();
      const command = new CreateInvocationCommand({
        sessionIdentifier: sessionId,
        invocationId,
      });

      await this.bedrockClient.send(command);
      logger.info(`Created invocation: ${invocationId} for session: ${sessionId}`);
      return invocationId;
    } catch (error) {
      logger.error('Failed to create invocation:', error);
      throw new Error(`Failed to create invocation: ${error}`);
    }
  }

  /**
   * Add an invocation step (user or assistant message)
   */
  async putInvocationStep(
    sessionId: string,
    invocationId: string,
    role: 'user' | 'assistant',
    message: string
  ): Promise<void> {
    try {
      const stepData: InvocationStepData = {
        role,
        text: message,
      };

      const command = new PutInvocationStepCommand({
        sessionIdentifier: sessionId,
        invocationIdentifier: invocationId,
        invocationStepTime: new Date(),
        invocationStepId: uuidv4(),
        payload: {
          contentBlocks: [
            {
              text: JSON.stringify(stepData),
            },
          ],
        },
      });

      await this.bedrockClient.send(command);
      logger.debug(`Put invocation step: ${role} - ${message.substring(0, 100)}...`);
    } catch (error) {
      logger.error('Failed to put invocation step:', error);
      throw new Error(`Failed to put invocation step: ${error}`);
    }
  }

  /**
   * Build chat history from invocation steps
   */
  async buildChatHistory(sessionId: string, invocationId: string): Promise<ChatHistoryItem[]> {
    try {
      const chatHistory: ChatHistoryItem[] = [];

      // List invocation steps
      const listCommand = new ListInvocationStepsCommand({
        invocationIdentifier: invocationId,
        sessionIdentifier: sessionId,
      });

      const listResponse = await this.bedrockClient.send(listCommand);

      if (!listResponse.invocationStepSummaries) {
        return chatHistory;
      }

      // Fetch each step
      for (const stepSummary of listResponse.invocationStepSummaries) {
        const getCommand = new GetInvocationStepCommand({
          invocationIdentifier: invocationId,
          invocationStepId: stepSummary.invocationStepId!,
          sessionIdentifier: sessionId,
        });

        const getResponse = await this.bedrockClient.send(getCommand);

        if (getResponse.invocationStep?.payload?.contentBlocks?.[0]?.text) {
          const stepText = getResponse.invocationStep.payload.contentBlocks[0].text;
          const stepData: InvocationStepData = JSON.parse(stepText);

          chatHistory.unshift({
            role: stepData.role,
            content: [{ text: stepData.text }],
          });
        }
      }

      logger.info(`Built chat history with ${chatHistory.length} messages`);
      return chatHistory;
    } catch (error) {
      logger.error('Failed to build chat history:', error);
      throw new Error(`Failed to build chat history: ${error}`);
    }
  }

  /**
   * Get the most recent invocation for a session
   */
  async getLatestInvocationId(sessionId: string): Promise<string | null> {
    try {
      const command = new ListInvocationsCommand({
        sessionIdentifier: sessionId,
      });

      const response = await this.bedrockClient.send(command);

      if (!response.invocationSummaries || response.invocationSummaries.length === 0) {
        return null;
      }

      const latestInvocation = response.invocationSummaries[0];
      return latestInvocation.invocationId || null;
    } catch (error) {
      logger.error('Failed to get latest invocation:', error);
      throw new Error(`Failed to get latest invocation: ${error}`);
    }
  }
}

// Singleton instance
export const bedrockSessionService = new BedrockSessionService();

