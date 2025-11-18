#!/usr/bin/env python3
"""
Create local SQLite database with HCP data and schema.
"""
import sqlite3
import os

DB_PATH = "local_crm.db"

# HCP data from prompting.py
HCPS = {
    "Dr. William Harper": "0013K000013ez2RQAQ",
    "Dr. Susan Carter": "0013K000013ez2SQAQ",
    "Dr. James Lawson": "0013K000013ez2TQAQ",
    "Dr. Emily Hughes": "0013K000013ez2UQAQ",
    "Dr. Richard Thompson": "0013K000013ez2VQAQ",
    "Dr. Sarah Phillips": "0013K000013ez2WQAQ",
    "Dr. John Anderson": "0013K000013ez2XQAQ",
    "Dr. Lisa Collins": "0013K000013ez2YQAQ",
    "Dr. David Harris": "0013K000013ez2ZQAQ",
    "Dr. Amy Scott": "0013K000013ez2aQAA",
    "Dr. Olivia Wells": "0013K000013ez2bQAA",
    "Dr. Benjamin Stone": "0013K000013ez2cQAA",
    "Dr. Grace Mitchell": "0013K000013ez2dQAA",
    "Dr. Lucas Chang": "0013K000013ez2eQAA",
    "Dr. Sophia Patel": "0013K000013ez2fQAA",
    "Dr. Nathan Rivera": "0013K000013ez2gQAA",
    "Dr. Karina Soto": "0013K000013ez2hQAA",
}

def create_database():
    """Create and populate the local SQLite database."""
    
    # Remove existing database
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        print(f"🗑️  Removed existing database: {DB_PATH}")
    
    # Connect to SQLite
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    print("=" * 80)
    print("📊 Creating Local CRM Database")
    print("=" * 80)
    
    # Table 1: hco (Healthcare Organizations)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS hco (
            hco_id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE
        )
    """)
    print("✅ Table 'hco' created")
    
    # Table 2: hcp (Healthcare Professionals)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS hcp (
            hcp_id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            hco_id VARCHAR(50),
            FOREIGN KEY (hco_id) REFERENCES hco(hco_id)
        )
    """)
    print("✅ Table 'hcp' created")
    
    # Table 3: hco_hcp_alignment (Many-to-Many)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS hco_hcp_alignment (
            hco_id VARCHAR(50),
            hcp_id VARCHAR(50),
            PRIMARY KEY (hco_id, hcp_id),
            FOREIGN KEY (hco_id) REFERENCES hco(hco_id),
            FOREIGN KEY (hcp_id) REFERENCES hcp(hcp_id)
        )
    """)
    print("✅ Table 'hco_hcp_alignment' created")
    
    # Table 4: calls (Call Records)
    cursor.execute("""
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
    """)
    print("✅ Table 'calls' created")
    
    # Create indexes
    cursor.execute("CREATE INDEX idx_hcp_name ON hcp(name)")
    cursor.execute("CREATE INDEX idx_calls_account ON calls(account)")
    cursor.execute("CREATE INDEX idx_calls_date ON calls(call_date)")
    cursor.execute("CREATE INDEX idx_calls_created ON calls(created_at)")
    print("✅ Indexes created")
    
    # Insert HCP data
    print("\n📝 Inserting HCP data...")
    for name, hcp_id in HCPS.items():
        cursor.execute(
            "INSERT INTO hcp (hcp_id, name, hco_id) VALUES (?, ?, NULL)",
            (hcp_id, name)
        )
        print(f"  ✅ {name} ({hcp_id})")
    
    # Commit and close
    conn.commit()
    conn.close()
    
    print("\n" + "=" * 80)
    print(f"✅ Database created successfully: {DB_PATH}")
    print(f"📊 Total HCPs: {len(HCPS)}")
    print("=" * 80)
    
    return DB_PATH

if __name__ == "__main__":
    db_path = create_database()
    print(f"\n🎉 Local database ready at: {os.path.abspath(db_path)}")

