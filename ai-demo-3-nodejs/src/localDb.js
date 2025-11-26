"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lookupHcpByName = lookupHcpByName;
exports.insertCall = insertCall;
exports.getRecentCalls = getRecentCalls;
exports.checkConnection = checkConnection;
exports.query = query;
exports.isAvailable = isAvailable;
/**
 * Local SQLite Database Module
 * Provides same interface as redshift.ts but uses SQLite
 */
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
const path = __importStar(require("path"));
const logger_1 = __importDefault(require("./logger"));
const DB_PATH = path.join(__dirname, '..', 'local_crm.db');
let db = null;
/**
 * Get database connection
 */
async function getConnection() {
    if (!db) {
        db = await (0, sqlite_1.open)({
            filename: DB_PATH,
            driver: sqlite3_1.default.Database,
        });
    }
    return db;
}
/**
 * Look up HCP by name (case-insensitive)
 */
async function lookupHcpByName(name) {
    try {
        const conn = await getConnection();
        const row = await conn.get('SELECT hcp_id, name, hco_id FROM hcp WHERE LOWER(name) = LOWER(?)', [name]);
        if (row) {
            return {
                hcp_id: row.hcp_id,
                name: row.name,
                hco_id: row.hco_id,
                found: true,
            };
        }
        return null;
    }
    catch (error) {
        logger_1.default.error('Error looking up HCP:', error);
        return null;
    }
}
/**
 * Insert call record into SQLite
 */
async function insertCall(record) {
    const callPk = `CALL_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    try {
        const conn = await getConnection();
        // Extract follow-up task
        const followup = record.call_follow_up_task || {};
        await conn.run(`INSERT INTO calls (
        call_pk, call_channel, discussion_topic, status, account, id,
        adverse_event, adverse_event_details,
        noncompliance_event, noncompliance_description,
        call_notes, call_date, call_time, product,
        followup_task_type, followup_description, followup_due_date, followup_assigned_to,
        created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        CURRENT_TIMESTAMP
      )`, [
            callPk,
            record.call_channel || 'In-person',
            record.discussion_topic || '',
            record.status || 'Saved_vod',
            record.account || '',
            record.id || '',
            record.adverse_event || false,
            record.adverse_event_details || '',
            record.noncompliance_event || false,
            record.noncompliance_description || '',
            record.call_notes || '',
            record.call_date || '',
            record.call_time || '',
            record.product || '',
            followup.task_type || '',
            followup.description || '',
            followup.due_date || '',
            followup.assigned_to || '',
        ]);
        logger_1.default.info(`✅ Call record inserted: ${callPk}`);
        return callPk;
    }
    catch (error) {
        logger_1.default.error('Failed to insert call:', error);
        throw error;
    }
}
/**
 * Get recent calls
 */
async function getRecentCalls(limit = 10) {
    try {
        const conn = await getConnection();
        const rows = await conn.all('SELECT * FROM calls ORDER BY created_at DESC LIMIT ?', [limit]);
        return rows;
    }
    catch (error) {
        logger_1.default.error('Error fetching calls:', error);
        return [];
    }
}
/**
 * Check database connection
 */
async function checkConnection() {
    try {
        await getConnection();
        return true;
    }
    catch (error) {
        logger_1.default.error('Database check failed:', error);
        return false;
    }
}
/**
 * Generic query method (PostgreSQL-compatible interface)
 * Converts SQLite results to match Redshift format
 */
async function query(sql, params = []) {
    try {
        const conn = await getConnection();
        // Convert PostgreSQL $1, $2 parameters to SQLite ? placeholders
        let sqliteSql = sql;
        let sqliteParams = params;
        // Check if using PostgreSQL-style parameters ($1, $2, etc.)
        if (sql.includes('$')) {
            // Replace $1, $2, etc. with ?
            sqliteSql = sql.replace(/\$\d+/g, '?');
        }
        // Determine if this is a SELECT query
        const isSelect = sqliteSql.trim().toUpperCase().startsWith('SELECT');
        if (isSelect) {
            const rows = await conn.all(sqliteSql, sqliteParams);
            return { rows };
        }
        else {
            // INSERT/UPDATE/DELETE
            const result = await conn.run(sqliteSql, sqliteParams);
            return {
                rows: [{
                        rowCount: result.changes,
                        lastID: result.lastID
                    }]
            };
        }
    }
    catch (error) {
        logger_1.default.error('SQLite query failed:', error);
        throw error;
    }
}
/**
 * Check if database is available
 */
function isAvailable() {
    return true; // SQLite is always available locally
}
// Export default object with all methods
exports.default = {
    lookupHcpByName,
    insertCall,
    getRecentCalls,
    checkConnection,
    query,
    isAvailable,
};
//# sourceMappingURL=localDb.js.map