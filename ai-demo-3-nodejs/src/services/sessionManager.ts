/**
 * Session Manager for handling multiple concurrent Nova Sonic sessions
 */
import { NovaSonicClient, NovaSonicClientOptions } from './novaSonicClient';
import { SessionInfo, SessionStatus } from '../models/session';
import config from '../config';
import logger from '../logger';

export class SessionManager {
  private sessions: Map<string, NovaSonicClient>;
  private sessionInfo: Map<string, SessionInfo>;
  private activeStreams: Map<string, boolean>;
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    this.sessions = new Map();
    this.sessionInfo = new Map();
    this.activeStreams = new Map();
  }

  async createSession(options: NovaSonicClientOptions = {}): Promise<[string, NovaSonicClient]> {
    // Check concurrent session limit
    const activeCount = Array.from(this.sessionInfo.values()).filter(
      (info) => info.status === SessionStatus.ACTIVE
    ).length;

    if (activeCount >= config.session.maxConcurrent) {
      throw new Error(
        `Maximum concurrent sessions (${config.session.maxConcurrent}) reached`
      );
    }

    // Create new client
    const client = new NovaSonicClient(options);

    try {
      await client.initializeStream();

      // Store session
      const sessionId = client.sessionId;
      this.sessions.set(sessionId, client);
      this.sessionInfo.set(sessionId, {
        sessionId,
        status: SessionStatus.ACTIVE,
        createdAt: new Date(),
        lastActivity: new Date(),
        audioBytesSent: 0,
        audioBytesReceived: 0,
        messageCount: 0,
      });

      logger.info(`Session created: ${sessionId}`);
      return [sessionId, client];
    } catch (error) {
      logger.error(`Failed to create session: ${error}`);
      throw error;
    }
  }

  getSession(sessionId: string): NovaSonicClient | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionInfo(sessionId: string): SessionInfo | undefined {
    return this.sessionInfo.get(sessionId);
  }

  hasActiveStream(sessionId: string): boolean {
    return this.activeStreams.get(sessionId) || false;
  }

  markStreamActive(sessionId: string): void {
    this.activeStreams.set(sessionId, true);
    logger.debug(`Stream marked active for session: ${sessionId}`);
  }

  markStreamInactive(sessionId: string): void {
    this.activeStreams.delete(sessionId);
    logger.debug(`Stream marked inactive for session: ${sessionId}`);
  }

  async endSession(sessionId: string): Promise<void> {
    const client = this.sessions.get(sessionId);
    if (!client) {
      logger.warn(`Session not found: ${sessionId}`);
      return;
    }

    try {
      await client.close();

      // Update session info
      const info = this.sessionInfo.get(sessionId);
      if (info) {
        info.status = SessionStatus.ENDED;
        info.lastActivity = new Date();
      }

      // Clean up stream tracking
      this.markStreamInactive(sessionId);

      // Remove from active sessions
      this.sessions.delete(sessionId);

      logger.info(`Session ended: ${sessionId}`);
    } catch (error) {
      logger.error(`Error ending session ${sessionId}: ${error}`);
      const info = this.sessionInfo.get(sessionId);
      if (info) {
        info.status = SessionStatus.ERROR;
      }
    }
  }

  async updateSessionActivity(sessionId: string): Promise<void> {
    const info = this.sessionInfo.get(sessionId);
    if (info) {
      info.lastActivity = new Date();
    }
  }

  async cleanupInactiveSessions(): Promise<void> {
    const now = new Date();
    const timeoutMs = config.session.timeout * 1000;

    const sessionsToEnd: string[] = [];
    for (const [sessionId, info] of this.sessionInfo.entries()) {
      if (info.status === SessionStatus.ACTIVE && info.lastActivity) {
        const inactiveDuration = now.getTime() - info.lastActivity.getTime();
        if (inactiveDuration > timeoutMs) {
          sessionsToEnd.push(sessionId);
        }
      }
    }

    for (const sessionId of sessionsToEnd) {
      logger.info(`Cleaning up inactive session: ${sessionId}`);
      await this.endSession(sessionId);
    }
  }

  startCleanupTask(): void {
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupInactiveSessions();
      } catch (error) {
        logger.error(`Error in cleanup task: ${error}`);
      }
    }, 60000); // Check every minute

    logger.info('Cleanup task started');
  }

  stopCleanupTask(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      logger.info('Cleanup task stopped');
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down session manager');

    // Stop cleanup task
    this.stopCleanupTask();

    // Close all active sessions
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      await this.endSession(sessionId);
    }

    logger.info('Session manager shutdown complete');
  }
}

// Global session manager instance
export const sessionManager = new SessionManager();

