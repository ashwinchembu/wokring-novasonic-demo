"""
Local SQLite Database Module
Provides same interface as redshift.py but uses SQLite.
"""
import sqlite3
import logging
from typing import Dict, List, Optional, Any
import os

logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "local_crm.db")

def get_connection():
    """Get SQLite connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

async def lookup_hcp_by_name(name: str) -> Optional[Dict[str, Any]]:
    """Look up HCP by name (case-insensitive)."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            "SELECT hcp_id, name, hco_id FROM hcp WHERE LOWER(name) = LOWER(?)",
            (name,)
        )
        
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return {
                "hcp_id": row["hcp_id"],
                "name": row["name"],
                "hco_id": row["hco_id"],
                "found": True
            }
        
        return None
        
    except Exception as e:
        logger.error(f"Error looking up HCP: {e}")
        return None

async def insert_call(record: Dict[str, Any]) -> str:
    """Insert call record into SQLite."""
    import uuid
    
    call_pk = f"CALL_{uuid.uuid4().hex[:12].upper()}"
    
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Extract follow-up task
        followup = record.get('call_follow_up_task', {})
        
        cursor.execute("""
            INSERT INTO calls (
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
            )
        """, (
            call_pk,
            record.get('call_channel', 'In-person'),
            record.get('discussion_topic', ''),
            record.get('status', 'Saved_vod'),
            record.get('account', ''),
            record.get('id', ''),
            record.get('adverse_event', False),
            record.get('adverse_event_details', ''),
            record.get('noncompliance_event', False),
            record.get('noncompliance_description', ''),
            record.get('call_notes', ''),
            record.get('call_date', ''),
            record.get('call_time', ''),
            record.get('product', ''),
            followup.get('task_type', ''),
            followup.get('description', ''),
            followup.get('due_date', ''),
            followup.get('assigned_to', '')
        ))
        
        conn.commit()
        conn.close()
        
        logger.info(f"✅ Call record inserted: {call_pk}")
        return call_pk
        
    except Exception as e:
        logger.error(f"Failed to insert call: {e}")
        raise

async def get_recent_calls(limit: int = 10) -> List[Dict[str, Any]]:
    """Get recent calls."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            "SELECT * FROM calls ORDER BY created_at DESC LIMIT ?",
            (limit,)
        )
        
        rows = cursor.fetchall()
        conn.close()
        
        return [dict(row) for row in rows]
        
    except Exception as e:
        logger.error(f"Error fetching calls: {e}")
        return []

async def check_connection() -> bool:
    """Check database connection."""
    try:
        conn = get_connection()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Database check failed: {e}")
        return False


