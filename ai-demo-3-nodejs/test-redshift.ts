/**
 * Test Redshift Connection and HCP Lookup
 * Run this to verify Redshift is working correctly
 */
import redshiftClient from './src/redshift';
import { handleLookupHcpTool } from './src/tools';
import logger from './src/logger';

async function testRedshift() {
  console.log('='.repeat(80));
  console.log('REDSHIFT CONNECTION & HCP LOOKUP TEST');
  console.log('='.repeat(80));

  // Initialize Redshift
  console.log('\n1. Initializing Redshift connection...');
  await redshiftClient.initialize();

  if (!redshiftClient.isAvailable()) {
    console.error('❌ Redshift is NOT available!');
    console.error('   Check your .env file and ensure Redshift credentials are set:');
    console.error('   - REDSHIFT_HOST');
    console.error('   - REDSHIFT_PORT');
    console.error('   - REDSHIFT_DB');
    console.error('   - REDSHIFT_USER');
    console.error('   - REDSHIFT_PASSWORD');
    process.exit(1);
  }

  console.log('✅ Redshift connection established!\n');

  // Test direct query
  console.log('2. Testing direct query to hcp_table...');
  try {
    const result = await redshiftClient.query('SELECT COUNT(*) as total FROM hcp_table');
    console.log(`✅ Found ${result.rows[0].total} HCPs in database\n`);

    // Show sample HCPs
    const sampleResult = await redshiftClient.query('SELECT name, id FROM hcp_table LIMIT 5');
    console.log('Sample HCPs in database:');
    sampleResult.rows.forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.name} (${row.id})`);
    });
    console.log('');
  } catch (error) {
    console.error('❌ Error querying hcp_table:', error);
    console.error('   Make sure the hcp_table exists in your Redshift database');
  }

  // Test HCP lookup through tool handler
  console.log('\n3. Testing HCP lookup through tool handler...\n');

  const testNames = [
    'Karina Soto',
    'Dr. William Harper', // From static map
    'John Anderson',
    'Smith',
  ];

  for (const name of testNames) {
    console.log(`\n--- Testing: "${name}" ---`);
    const result = await handleLookupHcpTool({ name });
    console.log('Result:', JSON.stringify(result, null, 2));
  }

  // Close connection
  console.log('\n4. Closing Redshift connection...');
  await redshiftClient.close();
  console.log('✅ Connection closed\n');

  console.log('='.repeat(80));
  console.log('TEST COMPLETE');
  console.log('='.repeat(80));
}

// Run test
testRedshift().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});

