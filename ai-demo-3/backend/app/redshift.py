"""
Redshift Database Module
Handles Redshift connections, schema initialization, and data operations.
"""
import logging
import uuid
from typing import Optional, Dict, List, Any
from datetime import datetime
import asyncio

try:
    import psycopg2
    from psycopg2 import pool
    from psycopg2.extras import RealDictCursor
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False
    pool = None  # type: ignore
    psycopg2 = None  # type: ignore
    RealDictCursor = None  # type: ignore

from app.config import settings

logger = logging.getLogger(__name__)

# ============================================================================
# Connection Pool
# ============================================================================

_connection_pool: Optional[Any] = None


def get_connection_pool() -> Any:
    """
    Get or create the Redshift connection pool.
    
    Returns:
        psycopg2 connection pool
        
    Raises:
        RuntimeError: If psycopg2 is not installed or connection fails
    """
    global _connection_pool
    
    if not PSYCOPG2_AVAILABLE:
        raise RuntimeError(
            "psycopg2 is not installed. Install with: pip install psycopg2-binary"
        )
    
    if _connection_pool is None:
        try:
            logger.info("Creating Redshift connection pool...")
            
            # Build connection parameters
            conn_params = {
                'host': settings.redshift_host,
                'port': settings.redshift_port,
                'database': settings.redshift_db,
                'user': settings.redshift_user,
                'connect_timeout': settings.redshift_connect_timeout,
            }
            
            # Add SSL for remote Redshift (required by AWS)
            if settings.redshift_host and 'localhost' not in settings.redshift_host:
                conn_params['sslmode'] = 'require'
            
            # Add password or use IAM
            if settings.redshift_use_iam:
                # TODO: Implement IAM token generation
                logger.warning("IAM authentication not yet implemented, falling back to password")
                conn_params['password'] = settings.redshift_password
            else:
                conn_params['password'] = settings.redshift_password
            
            # Create connection pool (min 1, max 10 connections)
            _connection_pool = pool.SimpleConnectionPool(
                minconn=1,
                maxconn=10,
                **conn_params
            )
            
            logger.info("✅ Redshift connection pool created successfully")
            
        except Exception as e:
            logger.error(f"Failed to create Redshift connection pool: {e}")
            raise RuntimeError(f"Failed to connect to Redshift: {e}")
    
    return _connection_pool


def get_connection():
    """
    Get a connection from the pool.
    
    Returns:
        psycopg2 connection
    """
    pool_obj = get_connection_pool()
    return pool_obj.getconn()


def release_connection(conn):
    """
    Release a connection back to the pool.
    
    Args:
        conn: psycopg2 connection to release
    """
    if _connection_pool and conn:
        _connection_pool.putconn(conn)


async def check_connection() -> bool:
    """
    Check if Redshift connection is healthy.
    
    Returns:
        True if connection is healthy, False otherwise
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        result = cursor.fetchone()
        cursor.close()
        release_connection(conn)
        return result is not None
    except Exception as e:
        logger.error(f"Redshift health check failed: {e}")
        return False


# ============================================================================
# Schema Initialization (Idempotent)
# ============================================================================

async def init_schema():
    """
    Initialize Redshift schema (idempotent).
    
    Creates tables, indexes, and foreign keys if they don't exist.
    Safe to run multiple times.
    """
    logger.info("Initializing Redshift schema...")
    
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Table 1: hco (Healthcare Organizations)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS hco (
                hco_id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE
            )
        """)
        logger.info("✅ Table 'hco' created or exists")
        
        # Table 2: hcp (Healthcare Professionals)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS hcp (
                hcp_id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                hco_id VARCHAR(50),
                FOREIGN KEY (hco_id) REFERENCES hco(hco_id)
            )
        """)
        logger.info("✅ Table 'hcp' created or exists")
        
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
        logger.info("✅ Table 'hco_hcp_alignment' created or exists")
        
        # Table 4: calls (Call Records)
        # Note: Redshift doesn't support TEXT or DEFAULT with functions well, use VARCHAR
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
                call_notes VARCHAR(5000),
                call_date DATE,
                call_time VARCHAR(20),
                product VARCHAR(255),
                followup_task_type VARCHAR(100),
                followup_description VARCHAR(1000),
                followup_due_date DATE,
                followup_assigned_to VARCHAR(255),
                created_at TIMESTAMP
            )
        """)
        logger.info("✅ Table 'calls' created or exists")
        
        # Commit all table creations before attempting indexes
        conn.commit()
        logger.info("✅ Tables committed")
        
        # Now create indexes (Redshift doesn't support IF NOT EXISTS for indexes)
        # Index on hcp.name
        try:
            cursor.execute("CREATE INDEX idx_hcp_name ON hcp(name)")
            conn.commit()
            logger.info("✅ Index idx_hcp_name created")
        except Exception as e:
            conn.rollback()
            logger.info(f"⏭️  Index idx_hcp_name skipped: {str(e)[:50]}")
        
        # Indexes on calls table
        for idx_name, idx_col in [
            ('idx_calls_hcp_id', 'id'),
            ('idx_calls_date', 'call_date'),
            ('idx_calls_adverse', 'adverse_event'),
            ('idx_calls_noncompliance', 'noncompliance_event'),
            ('idx_calls_created_at', 'created_at'),
        ]:
            try:
                cursor.execute(f"CREATE INDEX {idx_name} ON calls({idx_col})")
                conn.commit()
                logger.info(f"✅ Index {idx_name} created")
            except Exception as e:
                conn.rollback()
                logger.info(f"⏭️  Index {idx_name} skipped: {str(e)[:50]}")
        
        cursor.close()
        
        logger.info("✅ Redshift schema initialization complete")
        
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Failed to initialize schema: {e}")
        raise
    finally:
        if conn:
            release_connection(conn)


# ============================================================================
# Seed Data (Redshift-only HCOs/HCPs)
# ============================================================================

async def seed_data():
    """
    Seed Redshift with test data (Redshift-only HCOs/HCPs).
    
    Inserts entries NOT in the static in-memory map:
    - Bayview Medical Group (HCO_BAYVIEW)
    - Northside Cardiology (HCO_NORTHSIDE)
    - Dr. Karina Soto (HCP_SOTO) → Bayview
    - Dr. Malik Rahman (HCP_RAHMAN) → Northside
    
    Idempotent: Uses INSERT ... ON CONFLICT pattern or INSERT IGNORE.
    """
    logger.info("Seeding Redshift with test data...")
    
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Insert HCOs (Redshift doesn't support ON CONFLICT, use manual check)
        hcos = [
            ('HCO_BAYVIEW', 'Bayview Medical Group'),
            ('HCO_NORTHSIDE', 'Northside Cardiology'),
        ]
        
        for hco_id, name in hcos:
            cursor.execute(
                "SELECT 1 FROM hco WHERE hco_id = %s",
                (hco_id,)
            )
            if not cursor.fetchone():
                cursor.execute(
                    "INSERT INTO hco (hco_id, name) VALUES (%s, %s)",
                    (hco_id, name)
                )
                logger.info(f"  ✅ Inserted HCO: {name}")
            else:
                logger.info(f"  ⏭️  HCO already exists: {name}")
        
        # Insert HCPs
        hcps = [
            ('HCP_SOTO', 'Dr. Karina Soto', 'HCO_BAYVIEW'),
            ('HCP_RAHMAN', 'Dr. Malik Rahman', 'HCO_NORTHSIDE'),
        ]
        
        for hcp_id, name, hco_id in hcps:
            cursor.execute(
                "SELECT 1 FROM hcp WHERE hcp_id = %s",
                (hcp_id,)
            )
            if not cursor.fetchone():
                cursor.execute(
                    "INSERT INTO hcp (hcp_id, name, hco_id) VALUES (%s, %s, %s)",
                    (hcp_id, name, hco_id)
                )
                logger.info(f"  ✅ Inserted HCP: {name}")
            else:
                logger.info(f"  ⏭️  HCP already exists: {name}")
        
        # Insert alignments
        alignments = [
            ('HCO_BAYVIEW', 'HCP_SOTO'),
            ('HCO_NORTHSIDE', 'HCP_RAHMAN'),
        ]
        
        for hco_id, hcp_id in alignments:
            cursor.execute(
                "SELECT 1 FROM hco_hcp_alignment WHERE hco_id = %s AND hcp_id = %s",
                (hco_id, hcp_id)
            )
            if not cursor.fetchone():
                cursor.execute(
                    "INSERT INTO hco_hcp_alignment (hco_id, hcp_id) VALUES (%s, %s)",
                    (hco_id, hcp_id)
                )
                logger.info(f"  ✅ Inserted alignment: {hco_id} ↔ {hcp_id}")
            else:
                logger.info(f"  ⏭️  Alignment already exists: {hco_id} ↔ {hcp_id}")
        
        conn.commit()
        cursor.close()
        
        logger.info("✅ Redshift seed data complete")
        
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Failed to seed data: {e}")
        raise
    finally:
        if conn:
            release_connection(conn)


# ============================================================================
# Data Operations
# ============================================================================

async def fetch_hcp_by_name(name: str) -> Optional[Dict[str, Any]]:
    """
    Fetch HCP by name (exact or case-insensitive ILIKE).
    
    Args:
        name: HCP name to search for
        
    Returns:
        Dictionary with hcp_id, name, hco_id, hco_name, source='redshift'
        None if not found
    """
    logger.info(f"Fetching HCP from Redshift: {name}")
    
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Try exact match first
        cursor.execute("""
            SELECT h.hcp_id, h.name, h.hco_id, o.name AS hco_name
            FROM hcp h
            LEFT JOIN hco o ON h.hco_id = o.hco_id
            WHERE h.name = %s
        """, (name,))
        
        result = cursor.fetchone()
        
        # If no exact match, try case-insensitive ILIKE
        if not result:
            cursor.execute("""
                SELECT h.hcp_id, h.name, h.hco_id, o.name AS hco_name
                FROM hcp h
                LEFT JOIN hco o ON h.hco_id = o.hco_id
                WHERE LOWER(h.name) LIKE LOWER(%s)
                LIMIT 1
            """, (f'%{name}%',))
            
            result = cursor.fetchone()
        
        cursor.close()
        
        if result:
            return {
                'hcp_id': result['hcp_id'],
                'name': result['name'],
                'hco_id': result['hco_id'],
                'hco_name': result['hco_name'],
                'source': 'redshift'
            }
        
        logger.info(f"HCP not found in Redshift: {name}")
        return None
        
    except Exception as e:
        logger.error(f"Failed to fetch HCP: {e}")
        return None
    finally:
        if conn:
            release_connection(conn)


async def fetch_alignments(hco_id: str) -> List[Dict[str, Any]]:
    """
    Fetch all HCPs aligned with a given HCO.
    
    Args:
        hco_id: HCO identifier
        
    Returns:
        List of dictionaries with hcp_id, name, hco_id
    """
    logger.info(f"Fetching alignments for HCO: {hco_id}")
    
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT h.hcp_id, h.name, h.hco_id
            FROM hcp h
            JOIN hco_hcp_alignment a ON h.hcp_id = a.hcp_id
            WHERE a.hco_id = %s
            ORDER BY h.name
        """, (hco_id,))
        
        results = cursor.fetchall()
        cursor.close()
        
        alignments = [dict(row) for row in results]
        logger.info(f"Found {len(alignments)} aligned HCPs for {hco_id}")
        
        return alignments
        
    except Exception as e:
        logger.error(f"Failed to fetch alignments: {e}")
        return []
    finally:
        if conn:
            release_connection(conn)


async def insert_call(record: Dict[str, Any]) -> str:
    """
    Insert a call record into Redshift.
    
    Maps the final conversation JSON to a calls table row.
    
    Args:
        record: Dictionary with call data (follows OUTPUT_JSON_SCHEMA format)
        
    Returns:
        call_pk (newly created UUID)
        
    Raises:
        Exception if insert fails
    """
    logger.info("Inserting call record into Redshift...")
    
    # Generate unique call_pk
    call_pk = f"CALL_{uuid.uuid4().hex[:12].upper()}"
    
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Helper function to convert empty strings to None
        def clean_value(val):
            if val == '' or val == 'null' or val is None:
                return None
            return val
        
        # Helper function to convert string booleans to actual booleans
        def to_bool(val):
            if isinstance(val, bool):
                return val
            if isinstance(val, str):
                return val.lower() in ('true', '1', 'yes')
            return bool(val)
        
        # Extract follow-up task fields
        followup_task = record.get('call_follow_up_task', {})
        followup_task_type = clean_value(followup_task.get('task_type', ''))
        followup_description = clean_value(followup_task.get('description', ''))
        followup_due_date = clean_value(followup_task.get('due_date'))
        followup_assigned_to = clean_value(followup_task.get('assigned_to', ''))
        
        # Convert date/time strings to proper format (empty strings to None)
        call_date = clean_value(record.get('call_date'))
        call_time = clean_value(record.get('call_time'))
        
        # Convert adverse_event and noncompliance_event to booleans
        adverse_event = to_bool(record.get('adverse_event', False))
        noncompliance_event = to_bool(record.get('noncompliance_event', False))
        adverse_event_details = clean_value(record.get('adverse_event_details'))
        
        cursor.execute("""
            INSERT INTO calls (
                call_pk, call_channel, discussion_topic, status, account, id,
                adverse_event, adverse_event_details,
                noncompliance_event, noncompliance_description,
                call_notes, call_date, call_time, product,
                followup_task_type, followup_description, followup_due_date, followup_assigned_to,
                created_at
            ) VALUES (
                %s, %s, %s, %s, %s, %s,
                %s, %s,
                %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s,
                GETDATE()
            )
        """, (
            call_pk,
            record.get('call_channel', 'In-person'),
            clean_value(record.get('discussion_topic', '')) or None,
            record.get('status', 'Saved_vod'),
            record.get('account', '') or None,  # HCP name
            record.get('id', '') or None,  # HCP ID
            adverse_event if adverse_event is not None else False,
            adverse_event_details,
            noncompliance_event if noncompliance_event is not None else False,
            clean_value(record.get('noncompliance_description', '')),
            clean_value(record.get('call_notes', '')),
            call_date,
            call_time,
            record.get('product', '') or None,
            followup_task_type,
            followup_description,
            followup_due_date,
            followup_assigned_to
        ))
        
        conn.commit()
        cursor.close()
        
        logger.info(f"✅ Call record inserted: {call_pk}")
        
        return call_pk
        
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Failed to insert call: {e}")
        raise
    finally:
        if conn:
            release_connection(conn)


async def get_recent_calls(limit: int = 10) -> List[Dict[str, Any]]:
    """
    Get recent call records.
    
    Args:
        limit: Maximum number of records to return
        
    Returns:
        List of call records
    """
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT * FROM calls
            ORDER BY created_at DESC
            LIMIT %s
        """, (limit,))
        
        results = cursor.fetchall()
        cursor.close()
        
        return [dict(row) for row in results]
        
    except Exception as e:
        logger.error(f"Failed to fetch recent calls: {e}")
        return []
    finally:
        if conn:
            release_connection(conn)


async def get_call_by_pk(call_pk: str) -> Optional[Dict[str, Any]]:
    """
    Get a specific call record by primary key.
    
    Args:
        call_pk: Call primary key
        
    Returns:
        Call record dictionary or None if not found
    """
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT * FROM calls
            WHERE call_pk = %s
        """, (call_pk,))
        
        result = cursor.fetchone()
        cursor.close()
        
        return dict(result) if result else None
        
    except Exception as e:
        logger.error(f"Failed to fetch call: {e}")
        return None
    finally:
        if conn:
            release_connection(conn)

