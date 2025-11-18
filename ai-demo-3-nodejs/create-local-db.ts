#!/usr/bin/env node
/**
 * Create local SQLite database with HCP data and schema
 */
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';
import * as fs from 'fs';

const DB_PATH = path.join(__dirname, 'local_crm.db');

// HCP data from prompting.ts
const HCPS: Record<string, string> = {
  'Dr. William Harper': '0013K000013ez2RQAQ',
  'Dr. Susan Carter': '0013K000013ez2SQAQ',
  'Dr. James Lawson': '0013K000013ez2TQAQ',
  'Dr. Emily Hughes': '0013K000013ez2UQAQ',
  'Dr. Richard Thompson': '0013K000013ez2VQAQ',
  'Dr. Sarah Phillips': '0013K000013ez2WQAQ',
  'Dr. John Anderson': '0013K000013ez2XQAQ',
  'Dr. Lisa Collins': '0013K000013ez2YQAQ',
  'Dr. David Harris': '0013K000013ez2ZQAQ',
  'Dr. Amy Scott': '0013K000013ez2aQAA',
  'Dr. Olivia Wells': '0013K000013ez2bQAA',
  'Dr. Benjamin Stone': '0013K000013ez2cQAA',
  'Dr. Grace Mitchell': '0013K000013ez2dQAA',
  'Dr. Lucas Chang': '0013K000013ez2eQAA',
  'Dr. Sophia Patel': '0013K000013ez2fQAA',
  'Dr. Nathan Rivera': '0013K000013ez2gQAA',
  'Dr. Karina Soto': '0013K000013ez2hQAA',
};

async function createDatabase(): Promise<string> {
  console.log('='.repeat(80));
  console.log('📊 Creating Local CRM Database');
  console.log('='.repeat(80));

  // Remove existing database
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log(`🗑️  Removed existing database: ${DB_PATH}`);
  }

  // Open database connection
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  // Table 1: hco (Healthcare Organizations)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS hco (
      hco_id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE
    )
  `);
  console.log("✅ Table 'hco' created");

  // Table 2: hcp (Healthcare Professionals)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS hcp (
      hcp_id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      hco_id VARCHAR(50),
      FOREIGN KEY (hco_id) REFERENCES hco(hco_id)
    )
  `);
  console.log("✅ Table 'hcp' created");

  // Table 3: hco_hcp_alignment (Many-to-Many)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS hco_hcp_alignment (
      hco_id VARCHAR(50),
      hcp_id VARCHAR(50),
      PRIMARY KEY (hco_id, hcp_id),
      FOREIGN KEY (hco_id) REFERENCES hco(hco_id),
      FOREIGN KEY (hcp_id) REFERENCES hcp(hcp_id)
    )
  `);
  console.log("✅ Table 'hco_hcp_alignment' created");

  // Table 4: calls (Call Records)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS calls (
      call_pk VARCHAR(50) PRIMARY KEY,
      call_channel VARCHAR(50),
      discussion_topic VARCHAR(1000),
      status VARCHAR(50),
      account VARCHAR(255),
      id VARCHAR(50),
      adverse_event BOOLEAN,
      adverse_event_details VARCHAR(1000),
      noncompliance_event BOOLEAN,
      noncompliance_description VARCHAR(1000),
      call_notes TEXT,
      call_date DATE,
      call_time VARCHAR(20),
      product VARCHAR(255),
      followup_task_type VARCHAR(100),
      followup_description VARCHAR(1000),
      followup_due_date DATE,
      followup_assigned_to VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("✅ Table 'calls' created");

  // Create indexes
  await db.exec('CREATE INDEX idx_hcp_name ON hcp(name)');
  await db.exec('CREATE INDEX idx_calls_account ON calls(account)');
  await db.exec('CREATE INDEX idx_calls_date ON calls(call_date)');
  await db.exec('CREATE INDEX idx_calls_created ON calls(created_at)');
  console.log('✅ Indexes created');

  // Insert HCP data
  console.log('\n📝 Inserting HCP data...');
  const insertStmt = await db.prepare(
    'INSERT INTO hcp (hcp_id, name, hco_id) VALUES (?, ?, NULL)'
  );

  for (const [name, hcp_id] of Object.entries(HCPS)) {
    await insertStmt.run(hcp_id, name);
    console.log(`  ✅ ${name} (${hcp_id})`);
  }

  await insertStmt.finalize();
  await db.close();

  console.log('\n' + '='.repeat(80));
  console.log(`✅ Database created successfully: ${DB_PATH}`);
  console.log(`📊 Total HCPs: ${Object.keys(HCPS).length}`);
  console.log('='.repeat(80));

  return DB_PATH;
}

// Run if executed directly
if (require.main === module) {
  createDatabase()
    .then((dbPath) => {
      console.log(`\n🎉 Local database ready at: ${path.resolve(dbPath)}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Error creating database:', err);
      process.exit(1);
    });
}

export { createDatabase, DB_PATH };


