/**
 * Redshift Database Connection Module
 * Provides connection pooling and query execution for Amazon Redshift
 */
import { Pool, PoolClient, QueryResult } from 'pg';
import logger from './logger';
import config from './config';

class RedshiftClient {
  private pool: Pool | null = null;
  private isInitialized = false;

  /**
   * Initialize the connection pool
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (!config.redshift) {
      logger.warn('Redshift configuration not found. Database features will be disabled.');
      return;
    }

    try {
      this.pool = new Pool({
        host: config.redshift.host,
        port: config.redshift.port,
        database: config.redshift.database,
        user: config.redshift.user,
        password: config.redshift.password,
        max: 10, // Maximum number of clients in the pool
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: config.redshift.connectTimeout! * 1000,
        statement_timeout: config.redshift.queryTimeout! * 1000,
        // SSL is required for Redshift
        ssl: {
          rejectUnauthorized: false,
        },
      });

      // Test the connection
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();

      this.isInitialized = true;
      logger.info('✅ Redshift connection pool initialized successfully');
      logger.info(`   Host: ${config.redshift.host}`);
      logger.info(`   Database: ${config.redshift.database}`);
    } catch (error) {
      logger.error('❌ Failed to initialize Redshift connection pool:', error);
      this.pool = null;
      // Don't throw - allow app to continue without database
    }
  }

  /**
   * Check if Redshift is available
   */
  isAvailable(): boolean {
    return this.isInitialized && this.pool !== null;
  }

  /**
   * Execute a query
   */
  async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    if (!this.isAvailable()) {
      throw new Error('Redshift connection not available');
    }

    try {
      logger.debug(`Executing query: ${text}`);
      if (params) {
        logger.debug(`Parameters: ${JSON.stringify(params)}`);
      }

      const result = await this.pool!.query<T>(text, params);
      logger.debug(`Query returned ${result.rowCount} rows`);
      return result;
    } catch (error) {
      logger.error('Query execution failed:', error);
      logger.error(`Query: ${text}`);
      if (params) {
        logger.error(`Parameters: ${JSON.stringify(params)}`);
      }
      throw error;
    }
  }

  /**
   * Get a client from the pool for transaction management
   */
  async getClient(): Promise<PoolClient> {
    if (!this.isAvailable()) {
      throw new Error('Redshift connection not available');
    }
    return await this.pool!.connect();
  }

  /**
   * Lookup HCP by name (fuzzy search)
   */
  async lookupHcp(name: string): Promise<{
    found: boolean;
    name?: string;
    hcp_id?: string;
    hco_id?: string;
    hco_name?: string;
    source: string;
  }> {
    if (!this.isAvailable()) {
      logger.warn('🗄️  Redshift database not available for HCP lookup');
      return {
        found: false,
        source: 'database_unavailable',
      };
    }

    try {
      logger.info(`🔍 Redshift: Searching for HCP with name: "${name}"`);
      
      // Try exact match first
      const exactQuery = `
        SELECT 
          name,
          id as hcp_id,
          account_id as hco_id,
          account_name as hco_name
        FROM hcp_table
        WHERE LOWER(name) = LOWER($1)
        LIMIT 1
      `;

      logger.debug(`Executing exact match query for: "${name}"`);
      let result = await this.query(exactQuery, [name]);

      if (result.rows.length > 0) {
        const row = result.rows[0];
        logger.info(`✅ Redshift: Found HCP (exact match)`);
        logger.info(`   Name: ${row.name}`);
        logger.info(`   HCP ID: ${row.hcp_id}`);
        logger.info(`   HCO ID: ${row.hco_id || 'N/A'}`);
        logger.info(`   HCO Name: ${row.hco_name || 'N/A'}`);
        return {
          found: true,
          name: row.name,
          hcp_id: row.hcp_id,
          hco_id: row.hco_id,
          hco_name: row.hco_name,
          source: 'redshift',
        };
      }

      logger.debug('No exact match, trying fuzzy search...');
      
      // Try fuzzy match with LIKE
      const fuzzyQuery = `
        SELECT 
          name,
          id as hcp_id,
          account_id as hco_id,
          account_name as hco_name
        FROM hcp_table
        WHERE LOWER(name) LIKE LOWER($1)
        ORDER BY 
          CASE 
            WHEN LOWER(name) = LOWER($2) THEN 1
            WHEN LOWER(name) LIKE LOWER($3) THEN 2
            ELSE 3
          END
        LIMIT 1
      `;

      result = await this.query(fuzzyQuery, [
        `%${name}%`,
        name,
        `${name}%`,
      ]);

      if (result.rows.length > 0) {
        const row = result.rows[0];
        logger.info(`✅ Redshift: Found HCP (fuzzy match)`);
        logger.info(`   Name: ${row.name}`);
        logger.info(`   HCP ID: ${row.hcp_id}`);
        logger.info(`   HCO ID: ${row.hco_id || 'N/A'}`);
        logger.info(`   HCO Name: ${row.hco_name || 'N/A'}`);
        return {
          found: true,
          name: row.name,
          hcp_id: row.hcp_id,
          hco_id: row.hco_id,
          hco_name: row.hco_name,
          source: 'redshift',
        };
      }

      logger.info(`❌ Redshift: HCP not found in database: "${name}"`);
      return {
        found: false,
        source: 'redshift_searched_not_found',
      };
    } catch (error) {
      logger.error(`❌ Redshift: Error looking up HCP "${name}":`, error);
      return {
        found: false,
        source: 'redshift_error',
      };
    }
  }

  /**
   * Insert a call record
   */
  async insertCall(record: Record<string, any>): Promise<{
    ok: boolean;
    call_id?: string;
    error?: string;
  }> {
    if (!this.isAvailable()) {
      return {
        ok: false,
        error: 'Database connection not available',
      };
    }

    try {
      const insertQuery = `
        INSERT INTO calls (
          id,
          hcp_id,
          hcp_name,
          rep_name,
          call_date,
          call_time,
          duration_seconds,
          product_discussed,
          key_messages,
          next_steps,
          transcript,
          metadata,
          created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()
        )
        RETURNING id
      `;

      const callId = `CALL-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      const result = await this.query(insertQuery, [
        callId,
        record.hcp_id || null,
        record.hcp_name || null,
        record.rep_name || null,
        record.date || null,
        record.time || null,
        record.duration_seconds || null,
        record.product || null,
        JSON.stringify(record.key_messages || []),
        JSON.stringify(record.next_steps || []),
        JSON.stringify(record.transcript || []),
        JSON.stringify(record),
      ]);

      logger.info(`✅ Call record inserted: ${callId}`);
      return {
        ok: true,
        call_id: callId,
      };
    } catch (error) {
      logger.error('Error inserting call to Redshift:', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Close the connection pool
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.isInitialized = false;
      logger.info('Redshift connection pool closed');
    }
  }
}

// Export singleton instance
const redshiftClient = new RedshiftClient();
export default redshiftClient;

