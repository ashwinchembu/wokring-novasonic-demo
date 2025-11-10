/**
 * Setup Database Tables
 * Creates hcp_table and calls table if they don't exist
 */
import redshiftClient from './src/redshift';

async function setupDatabase() {
  console.log('='.repeat(80));
  console.log('DATABASE SETUP');
  console.log('='.repeat(80));

  // Initialize Redshift
  console.log('\n1. Connecting to Redshift...');
  await redshiftClient.initialize();

  if (!redshiftClient.isAvailable()) {
    console.error('❌ Redshift is NOT available!');
    process.exit(1);
  }

  console.log('✅ Connected!\n');

  // Check existing tables
  console.log('2. Checking existing tables...');
  try {
    const result = await redshiftClient.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log(`Found ${result.rowCount} tables:`);
    result.rows.forEach((row) => {
      console.log(`   - ${row.table_name}`);
    });
    console.log('');
  } catch (error) {
    console.error('Error checking tables:', error);
  }

  // Create hcp_table if it doesn't exist
  console.log('3. Creating hcp_table...');
  try {
    await redshiftClient.query(`
      CREATE TABLE IF NOT EXISTS hcp_table (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        account_id VARCHAR(255),
        account_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ hcp_table created (or already exists)\n');
  } catch (error) {
    console.error('❌ Error creating hcp_table:', error);
  }

  // Create calls table if it doesn't exist
  console.log('4. Creating calls table...');
  try {
    await redshiftClient.query(`
      CREATE TABLE IF NOT EXISTS calls (
        id VARCHAR(255) PRIMARY KEY,
        hcp_id VARCHAR(255),
        hcp_name VARCHAR(255),
        rep_name VARCHAR(255),
        call_date DATE,
        call_time TIME,
        duration_seconds INTEGER,
        product_discussed VARCHAR(255),
        key_messages TEXT,
        next_steps TEXT,
        transcript TEXT,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ calls table created (or already exists)\n');
  } catch (error) {
    console.error('❌ Error creating calls table:', error);
  }

  // Insert sample HCPs if table is empty
  console.log('5. Checking if hcp_table has data...');
  try {
    const countResult = await redshiftClient.query('SELECT COUNT(*) as total FROM hcp_table');
    const count = parseInt(countResult.rows[0].total);
    
    console.log(`Current HCP count: ${count}`);
    
    if (count === 0) {
      console.log('\n6. Inserting sample HCP data...');
      
      const sampleHcps = [
        { id: '0013K000013ez2RQAQ', name: 'Dr. William Harper', account_id: 'ACC001', account_name: 'Memorial Hospital' },
        { id: '0013K000013ez2SQAQ', name: 'Dr. Susan Carter', account_id: 'ACC002', account_name: 'City Medical Center' },
        { id: '0013K000013ez2TQAQ', name: 'Dr. James Lawson', account_id: 'ACC003', account_name: 'Regional Health Clinic' },
        { id: '0013K000013ez2UQAQ', name: 'Dr. Emily Hughes', account_id: 'ACC004', account_name: 'University Hospital' },
        { id: '0013K000013ez2VQAQ', name: 'Dr. Richard Thompson', account_id: 'ACC005', account_name: 'Central Medical' },
        { id: '0013K000013ez2WQAQ', name: 'Dr. Sarah Phillips', account_id: 'ACC006', account_name: 'Downtown Clinic' },
        { id: '0013K000013ez2XQAQ', name: 'Dr. John Anderson', account_id: 'ACC007', account_name: 'Northside Hospital' },
        { id: '0013K000013ez2YQAQ', name: 'Dr. Lisa Collins', account_id: 'ACC008', account_name: 'Westside Medical' },
        { id: '0013K000013ez2ZQAQ', name: 'Dr. David Harris', account_id: 'ACC009', account_name: 'Eastside Clinic' },
        { id: '0013K000013ez2aQAA', name: 'Dr. Amy Scott', account_id: 'ACC010', account_name: 'Southside Hospital' },
        { id: 'HCP_KSOTO_001', name: 'Karina Soto', account_id: 'ACC011', account_name: 'Soto Family Practice' },
        { id: 'HCP_MARTINEZ_001', name: 'Dr. Maria Martinez', account_id: 'ACC012', account_name: 'Martinez Clinic' },
      ];

      for (const hcp of sampleHcps) {
        try {
          await redshiftClient.query(
            `INSERT INTO hcp_table (id, name, account_id, account_name) VALUES ($1, $2, $3, $4)`,
            [hcp.id, hcp.name, hcp.account_id, hcp.account_name]
          );
          console.log(`   ✅ Inserted: ${hcp.name}`);
        } catch (error: any) {
          if (error.code === '23505') {
            console.log(`   ⚠️  Already exists: ${hcp.name}`);
          } else {
            console.error(`   ❌ Error inserting ${hcp.name}:`, error.message);
          }
        }
      }
      console.log('');
    } else {
      console.log('   Table already has data, skipping insert\n');
    }
  } catch (error) {
    console.error('Error checking/inserting data:', error);
  }

  // Show final stats
  console.log('7. Final database status...');
  try {
    const hcpCount = await redshiftClient.query('SELECT COUNT(*) as total FROM hcp_table');
    const callsCount = await redshiftClient.query('SELECT COUNT(*) as total FROM calls');
    
    console.log(`   HCP records: ${hcpCount.rows[0].total}`);
    console.log(`   Call records: ${callsCount.rows[0].total}`);
    
    // Show sample HCPs
    console.log('\n   Sample HCPs in database:');
    const sampleResult = await redshiftClient.query('SELECT name, id FROM hcp_table LIMIT 5');
    sampleResult.rows.forEach((row, i) => {
      console.log(`      ${i + 1}. ${row.name} (${row.id})`);
    });
  } catch (error) {
    console.error('Error getting stats:', error);
  }

  // Close connection
  console.log('\n8. Closing connection...');
  await redshiftClient.close();
  console.log('✅ Done!\n');

  console.log('='.repeat(80));
  console.log('DATABASE SETUP COMPLETE');
  console.log('='.repeat(80));
}

// Run setup
setupDatabase().catch((error) => {
  console.error('Setup failed:', error);
  process.exit(1);
});

