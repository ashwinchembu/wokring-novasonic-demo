import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function testRedshift() {
  console.log('Testing Redshift connection...\n');
  
  const config = {
    host: process.env.REDSHIFT_HOST,
    port: parseInt(process.env.REDSHIFT_PORT || '5439'),
    database: process.env.REDSHIFT_DB,
    user: process.env.REDSHIFT_USER,
    password: process.env.REDSHIFT_PASSWORD,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
    ssl: {
      rejectUnauthorized: false,
    },
  };

  console.log('Configuration:');
  console.log('  Host:', config.host);
  console.log('  Port:', config.port);
  console.log('  Database:', config.database);
  console.log('  User:', config.user);
  console.log('  Password:', config.password ? '***set***' : 'NOT SET');
  console.log('');

  try {
    console.log('Creating connection pool...');
    const pool = new Pool(config);

    console.log('Testing connection...');
    const client = await pool.connect();
    
    console.log('✅ Connected! Running test query...');
    const result = await client.query('SELECT 1 as test');
    console.log('Test query result:', result.rows);
    
    console.log('\nTesting HCP table...');
    const hcpResult = await client.query('SELECT COUNT(*) as count FROM hcp_table');
    console.log('HCP count:', hcpResult.rows[0].count);
    
    client.release();
    await pool.end();
    
    console.log('\n✅ All tests passed!');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Connection failed!');
    console.error('Error:', error.message);
    console.error('Code:', error.code);
    console.error('Full error:', error);
    process.exit(1);
  }
}

testRedshift();

