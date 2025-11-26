"use strict";
/**
 * Database Adapter with Seamless Fallback
 * Tries Redshift first, falls back to local SQLite if unavailable
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbAdapter = void 0;
const redshift_1 = __importDefault(require("./redshift"));
const localDb_1 = __importDefault(require("./localDb"));
const logger_1 = __importDefault(require("./logger"));
class DatabaseAdapter {
    useRedshift = true;
    lastRedshiftCheck = 0;
    redshiftCheckInterval = 30000; // Check every 30 seconds
    constructor() {
        this.checkRedshiftAvailability();
    }
    /**
     * Check if Redshift is available
     */
    async checkRedshiftAvailability() {
        const now = Date.now();
        // Only check periodically to avoid hammering failed connections
        if (now - this.lastRedshiftCheck < this.redshiftCheckInterval) {
            return this.useRedshift;
        }
        this.lastRedshiftCheck = now;
        try {
            if (!redshift_1.default.isAvailable()) {
                logger_1.default.warn('Redshift not configured - using local SQLite');
                this.useRedshift = false;
                return false;
            }
            // Quick health check
            await redshift_1.default.query('SELECT 1 as health');
            if (!this.useRedshift) {
                logger_1.default.info('✅ Redshift connection restored');
            }
            this.useRedshift = true;
            return true;
        }
        catch (error) {
            if (this.useRedshift) {
                logger_1.default.warn(`⚠️ Redshift unavailable, falling back to local SQLite: ${error}`);
            }
            this.useRedshift = false;
            return false;
        }
    }
    /**
     * Execute query with automatic fallback
     */
    async query(sql, params = []) {
        // Try Redshift first
        const redshiftAvailable = await this.checkRedshiftAvailability();
        if (redshiftAvailable) {
            try {
                logger_1.default.debug('Executing query on Redshift');
                const result = await redshift_1.default.query(sql, params);
                return {
                    rows: result.rows,
                    rowCount: result.rows.length,
                    source: 'redshift',
                };
            }
            catch (error) {
                logger_1.default.warn(`Redshift query failed, falling back to SQLite: ${error}`);
                this.useRedshift = false;
                // Fall through to SQLite
            }
        }
        // Fallback to SQLite
        try {
            logger_1.default.debug('Executing query on local SQLite');
            const result = await localDb_1.default.query(sql, params);
            return {
                rows: result.rows,
                rowCount: result.rows.length,
                source: 'sqlite',
            };
        }
        catch (error) {
            logger_1.default.error(`Both Redshift and SQLite failed: ${error}`);
            return {
                rows: [],
                rowCount: 0,
                source: 'unavailable',
            };
        }
    }
    /**
     * Get list of HCPs with fallback
     */
    async getHcpList() {
        const sql = `
      SELECT DISTINCT 
        id,
        name,
        specialty,
        territory
      FROM hcps
      ORDER BY name
      LIMIT 100
    `;
        return this.query(sql);
    }
    /**
     * Lookup HCP by name with fallback
     */
    async lookupHcp(name) {
        const sql = `
      SELECT 
        id,
        name,
        specialty,
        territory,
        email,
        phone
      FROM hcps
      WHERE LOWER(name) LIKE LOWER($1)
      LIMIT 10
    `;
        return this.query(sql, [`%${name}%`]);
    }
    /**
     * Get call history with fallback
     */
    async getCallHistory(limit = 50) {
        const sql = `
      SELECT 
        call_pk,
        call_channel,
        discussion_topic,
        status,
        account,
        id as hcp_id,
        product,
        call_date,
        call_time,
        adverse_event,
        noncompliance_event,
        call_notes,
        followup_task_type,
        created_at
      FROM calls
      ORDER BY created_at DESC
      LIMIT $1
    `;
        return this.query(sql, [limit]);
    }
    /**
     * Insert call record with fallback
     */
    async insertCall(callData) {
        const sql = `
      INSERT INTO calls (
        call_pk,
        call_channel,
        discussion_topic,
        status,
        account,
        id,
        product,
        call_date,
        call_time,
        adverse_event,
        noncompliance_event,
        call_notes,
        followup_task_type,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      )
      RETURNING call_pk
    `;
        const params = [
            callData.call_pk || `call-${Date.now()}`,
            callData.call_channel || 'In Person',
            callData.discussion_topic || '',
            callData.status || 'Saved',
            callData.account || '',
            callData.id || '',
            callData.product || '',
            callData.call_date || new Date().toISOString().split('T')[0],
            callData.call_time || new Date().toTimeString().split(' ')[0],
            callData.adverse_event || false,
            callData.noncompliance_event || false,
            callData.call_notes || '',
            callData.followup_task_type || '',
            new Date().toISOString(),
        ];
        return this.query(sql, params);
    }
    /**
     * Check health of both databases
     */
    async healthCheck() {
        const result = {
            redshift: { available: false, message: '' },
            sqlite: { available: false, message: '' },
            activeSource: 'none',
        };
        // Check Redshift
        try {
            if (redshift_1.default.isAvailable()) {
                await redshift_1.default.query('SELECT 1');
                result.redshift.available = true;
                result.redshift.message = 'Connected';
            }
            else {
                result.redshift.message = 'Not configured';
            }
        }
        catch (error) {
            result.redshift.message = `Error: ${error}`;
        }
        // Check SQLite
        try {
            await localDb_1.default.query('SELECT 1');
            result.sqlite.available = true;
            result.sqlite.message = 'Connected';
        }
        catch (error) {
            result.sqlite.message = `Error: ${error}`;
        }
        // Determine active source
        if (result.redshift.available) {
            result.activeSource = 'redshift';
        }
        else if (result.sqlite.available) {
            result.activeSource = 'sqlite';
        }
        return result;
    }
    /**
     * Get current database source
     */
    getCurrentSource() {
        return this.useRedshift ? 'redshift' : 'sqlite';
    }
    /**
     * Force switch to SQLite (for testing)
     */
    forceSqlite() {
        logger_1.default.warn('Forcing SQLite mode');
        this.useRedshift = false;
    }
    /**
     * Force retry Redshift (for testing)
     */
    forceRetryRedshift() {
        logger_1.default.info('Forcing Redshift retry');
        this.lastRedshiftCheck = 0;
        this.checkRedshiftAvailability();
    }
}
// Singleton instance
exports.dbAdapter = new DatabaseAdapter();
exports.default = exports.dbAdapter;
//# sourceMappingURL=databaseAdapter.js.map