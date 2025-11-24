/**
 * Local SQLite Database Module
 * Provides same interface as redshift.ts but uses SQLite
 */
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';
import logger from './logger';

const DB_PATH = path.join(__dirname, '..', 'local_crm.db');

let db: Database | null = null;

/**
 * Get database connection
 */
async function getConnection(): Promise<Database> {
  if (!db) {
    db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database,
    });
  }
  return db;
}

/**
 * Look up HCP by name (case-insensitive)
 */
export async function lookupHcpByName(name: string): Promise<any | null> {
  try {
    const conn = await getConnection();
    
    const row = await conn.get(
      'SELECT hcp_id, name, hco_id FROM hcp WHERE LOWER(name) = LOWER(?)',
      [name]
    );
    
    if (row) {
      return {
        hcp_id: row.hcp_id,
        name: row.name,
        hco_id: row.hco_id,
        found: true,
      };
    }
    
    return null;
  } catch (error) {
    logger.error('Error looking up HCP:', error);
    return null;
  }
}

/**
 * Insert call record into SQLite
 */
export async function insertCall(record: any): Promise<string> {
  const callPk = `CALL_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  try {
    const conn = await getConnection();
    
    // Extract follow-up task
    const followup = record.call_follow_up_task || {};
    
    await conn.run(
      `INSERT INTO calls (
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
      )`,
      [
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
      ]
    );
    
    logger.info(`✅ Call record inserted: ${callPk}`);
    return callPk;
  } catch (error) {
    logger.error('Failed to insert call:', error);
    throw error;
  }
}

/**
 * Get recent calls
 */
export async function getRecentCalls(limit: number = 10): Promise<any[]> {
  try {
    const conn = await getConnection();
    
    const rows = await conn.all(
      'SELECT * FROM calls ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
    
    return rows;
  } catch (error) {
    logger.error('Error fetching calls:', error);
    return [];
  }
}

/**
 * Check database connection
 */
export async function checkConnection(): Promise<boolean> {
  try {
    await getConnection();
    return true;
  } catch (error) {
    logger.error('Database check failed:', error);
    return false;
  }
}

/**
 * Generic query method (PostgreSQL-compatible interface)
 * Converts SQLite results to match Redshift format
 */
export async function query(sql: string, params: any[] = []): Promise<{ rows: any[] }> {
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
    } else {
      // INSERT/UPDATE/DELETE
      const result = await conn.run(sqliteSql, sqliteParams);
      return {
        rows: [{ 
          rowCount: result.changes,
          lastID: result.lastID 
        }]
      };
    }
  } catch (error) {
    logger.error('SQLite query failed:', error);
    throw error;
  }
}

/**
 * Check if database is available
 */
export function isAvailable(): boolean {
  return true; // SQLite is always available locally
}

// Export default object with all methods
export default {
  lookupHcpByName,
  insertCall,
  getRecentCalls,
  checkConnection,
  query,
  isAvailable,
};


