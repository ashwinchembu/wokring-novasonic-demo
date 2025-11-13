import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function testRedshift() {
  console.log('Testing Redshift connection with different SSL modes...\n');
  
  const baseConfig = {
    host: process.env.REDSHIFT_HOST,
    port: parseInt(process.env.REDSHIFT_PORT || '5439'),
    database: process.env.REDSHIFT_DB,
    user: process.env.REDSHIFT_USER,
    password: process.env.REDSHIFT_PASSWORD,
    max: 1,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 15000,
  };

  const sslConfigs = [
    { name: 'SSL with rejectUnauthorized: false', ssl: { rejectUnauthorized: false } },
    { name: 'SSL require mode', ssl: true },
    { name: 'SSL with require mode string', ssl: { require: true } },
    { name: 'SSL disabled', ssl: false },
  ];

  for (const sslConfig of sslConfigs) {
    try {
      console.log(`\n🔄 Trying: ${sslConfig.name}`);
      const config = { ...baseConfig, ssl: sslConfig.ssl };
      const pool = new Pool(config);

      console.log('   Attempting connection...');
      const client = await pool.connect();
      
      console.log('   ✅ Connected! Running test query...');
      const result = await client.query('SELECT 1 as test');
      console.log('   ✅ Query successful:', result.rows);
      
      client.release();
      await pool.end();
      
      console.log(`\n✅✅✅ SUCCESS with: ${sslConfig.name}`);
      console.log('\nUse this SSL configuration in your code:');
      console.log('ssl:', JSON.stringify(sslConfig.ssl, null, 2));
      return;
    } catch (error: any) {
      console.log(`   ❌ Failed: ${error.message}`);
    }
  }

  console.log('\n❌ All SSL configurations failed');
  process.exit(1);
}

testRedshift();

