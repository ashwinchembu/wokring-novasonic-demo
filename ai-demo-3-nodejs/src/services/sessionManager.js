"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionManager = exports.SessionManager = void 0;
/**
 * Session Manager for handling multiple concurrent Nova Sonic sessions
 */
const novaSonicClient_1 = require("./novaSonicClient");
const session_1 = require("../models/session");
const config_1 = __importDefault(require("../config"));
const logger_1 = __importDefault(require("../logger"));
class SessionManager {
    sessions;
    sessionInfo;
    activeStreams;
    cleanupInterval;
    constructor() {
        this.sessions = new Map();
        this.sessionInfo = new Map();
        this.activeStreams = new Map();
    }
    async createSession(options = {}) {
        // Check concurrent session limit
        const activeCount = Array.from(this.sessionInfo.values()).filter((info) => info.status === session_1.SessionStatus.ACTIVE).length;
        if (activeCount >= config_1.default.session.maxConcurrent) {
            throw new Error(`Maximum concurrent sessions (${config_1.default.session.maxConcurrent}) reached`);
        }
        // Create new client
        const client = new novaSonicClient_1.NovaSonicClient(options);
        try {
            await client.initializeStream();
            // Store session
            const sessionId = client.sessionId;
            this.sessions.set(sessionId, client);
            this.sessionInfo.set(sessionId, {
                sessionId,
                status: session_1.SessionStatus.ACTIVE,
                createdAt: new Date(),
                lastActivity: new Date(),
                audioBytesSent: 0,
                audioBytesReceived: 0,
                messageCount: 0,
            });
            logger_1.default.info(`Session created: ${sessionId}`);
            return [sessionId, client];
        }
        catch (error) {
            logger_1.default.error(`Failed to create session: ${error}`);
            throw error;
        }
    }
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    getSessionInfo(sessionId) {
        return this.sessionInfo.get(sessionId);
    }
    hasActiveStream(sessionId) {
        return this.activeStreams.get(sessionId) || false;
    }
    markStreamActive(sessionId) {
        this.activeStreams.set(sessionId, true);
        logger_1.default.debug(`Stream marked active for session: ${sessionId}`);
    }
    markStreamInactive(sessionId) {
        this.activeStreams.delete(sessionId);
        logger_1.default.debug(`Stream marked inactive for session: ${sessionId}`);
    }
    async endSession(sessionId) {
        const client = this.sessions.get(sessionId);
        if (!client) {
            logger_1.default.warn(`Session not found: ${sessionId}`);
            return;
        }
        try {
            await client.close();
            // Update session info
            const info = this.sessionInfo.get(sessionId);
            if (info) {
                info.status = session_1.SessionStatus.ENDED;
                info.lastActivity = new Date();
            }
            // Clean up stream tracking
            this.markStreamInactive(sessionId);
            // Remove from active sessions
            this.sessions.delete(sessionId);
            logger_1.default.info(`Session ended: ${sessionId}`);
        }
        catch (error) {
            logger_1.default.error(`Error ending session ${sessionId}: ${error}`);
            const info = this.sessionInfo.get(sessionId);
            if (info) {
                info.status = session_1.SessionStatus.ERROR;
            }
        }
    }
    async updateSessionActivity(sessionId) {
        const info = this.sessionInfo.get(sessionId);
        if (info) {
            info.lastActivity = new Date();
        }
    }
    async cleanupInactiveSessions() {
        const now = new Date();
        const timeoutMs = config_1.default.session.timeout * 1000;
        const sessionsToEnd = [];
        for (const [sessionId, info] of this.sessionInfo.entries()) {
            if (info.status === session_1.SessionStatus.ACTIVE && info.lastActivity) {
                const inactiveDuration = now.getTime() - info.lastActivity.getTime();
                if (inactiveDuration > timeoutMs) {
                    sessionsToEnd.push(sessionId);
                }
            }
        }
        for (const sessionId of sessionsToEnd) {
            logger_1.default.info(`Cleaning up inactive session: ${sessionId}`);
            await this.endSession(sessionId);
        }
    }
    startCleanupTask() {
        this.cleanupInterval = setInterval(async () => {
            try {
                await this.cleanupInactiveSessions();
            }
            catch (error) {
                logger_1.default.error(`Error in cleanup task: ${error}`);
            }
        }, 60000); // Check every minute
        logger_1.default.info('Cleanup task started');
    }
    stopCleanupTask() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            logger_1.default.info('Cleanup task stopped');
        }
    }
    async shutdown() {
        logger_1.default.info('Shutting down session manager');
        // Stop cleanup task
        this.stopCleanupTask();
        // Close all active sessions
        const sessionIds = Array.from(this.sessions.keys());
        for (const sessionId of sessionIds) {
            await this.endSession(sessionId);
        }
        logger_1.default.info('Session manager shutdown complete');
    }
}
exports.SessionManager = SessionManager;
// Global session manager instance
exports.sessionManager = new SessionManager();
//# sourceMappingURL=sessionManager.js.map