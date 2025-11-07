# Redshift Database Schema

This document describes the Redshift database schema used by the AI Demo 3 voice agent for storing HCO (Healthcare Organizations), HCP (Healthcare Professionals), alignments, and call records.

## Tables

### 1. `hco` (Healthcare Organizations)

Healthcare Organizations (hospitals, clinics, medical groups).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `hco_id` | VARCHAR(50) | PRIMARY KEY | Unique identifier for the HCO |
| `name` | VARCHAR(255) | NOT NULL, UNIQUE | Organization name |

**Indexes:**
- Primary key on `hco_id`
- Unique constraint on `name`

**Sample Rows:**
```sql
INSERT INTO hco (hco_id, name) VALUES
  ('HCO_BAYVIEW', 'Bayview Medical Group'),
  ('HCO_NORTHSIDE', 'Northside Cardiology');
```

---

### 2. `hcp` (Healthcare Professionals)

Healthcare Professionals (doctors, nurses, medical practitioners).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `hcp_id` | VARCHAR(50) | PRIMARY KEY | Unique identifier for the HCP |
| `name` | VARCHAR(255) | NOT NULL | Professional's full name |
| `hco_id` | VARCHAR(50) | FOREIGN KEY → `hco.hco_id` | Primary organization affiliation |

**Indexes:**
- Primary key on `hcp_id`
- Foreign key on `hco_id` references `hco(hco_id)`
- Index on `name` for fast lookups

**Sample Rows:**
```sql
INSERT INTO hcp (hcp_id, name, hco_id) VALUES
  ('HCP_SOTO', 'Dr. Karina Soto', 'HCO_BAYVIEW'),
  ('HCP_RAHMAN', 'Dr. Malik Rahman', 'HCO_NORTHSIDE');
```

---

### 3. `hco_hcp_alignment` (Many-to-Many Alignment)

Tracks HCP affiliations with multiple HCOs.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `hco_id` | VARCHAR(50) | FOREIGN KEY → `hco.hco_id` | Organization ID |
| `hcp_id` | VARCHAR(50) | FOREIGN KEY → `hcp.hcp_id` | Professional ID |

**Constraints:**
- Composite primary key: `(hco_id, hcp_id)`
- Foreign key on `hco_id` references `hco(hco_id)`
- Foreign key on `hcp_id` references `hcp(hcp_id)`

**Sample Rows:**
```sql
INSERT INTO hco_hcp_alignment (hco_id, hcp_id) VALUES
  ('HCO_BAYVIEW', 'HCP_SOTO'),
  ('HCO_NORTHSIDE', 'HCP_RAHMAN');
```

---

### 4. `calls` (Call Records)

Stores CRM call records with adverse event and compliance tracking.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `call_pk` | VARCHAR(50) | PRIMARY KEY | Unique call identifier (UUID) |
| `call_channel` | VARCHAR(50) | DEFAULT 'In-person' | Call channel (In-person, Phone, Video) |
| `discussion_topic` | TEXT | | Main discussion topics |
| `status` | VARCHAR(50) | DEFAULT 'Saved_vod' | Call status (Saved_vod, Planned, Submitted) |
| `account` | VARCHAR(255) | | HCP name (account field) |
| `id` | VARCHAR(50) | | HCP ID (from HCP table or static map) |
| `adverse_event` | BOOLEAN | DEFAULT FALSE | Adverse event flag |
| `adverse_event_details` | TEXT | | AE details (if applicable) |
| `noncompliance_event` | BOOLEAN | DEFAULT FALSE | Noncompliance flag |
| `noncompliance_description` | TEXT | | Noncompliance description (if applicable) |
| `call_notes` | TEXT | | Free-form call notes |
| `call_date` | DATE | | Meeting date |
| `call_time` | TIME | | Meeting time |
| `product` | VARCHAR(255) | | Product discussed |
| `followup_task_type` | VARCHAR(100) | | Follow-up task type (Email, Call, Meeting, Sample Drop) |
| `followup_description` | TEXT | | Task description |
| `followup_due_date` | DATE | | Task due date |
| `followup_assigned_to` | VARCHAR(255) | | Task assignee |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary key on `call_pk`
- Index on `id` (HCP ID) for fast lookups
- Index on `call_date` for time-based queries
- Index on `adverse_event` for compliance reporting
- Index on `noncompliance_event` for compliance reporting
- Index on `created_at` for audit logs

**Sample Row:**
```sql
INSERT INTO calls (
  call_pk, call_channel, discussion_topic, status, account, id,
  adverse_event, adverse_event_details, noncompliance_event, noncompliance_description,
  call_notes, call_date, call_time, product,
  followup_task_type, followup_description, followup_due_date, followup_assigned_to
) VALUES (
  'CALL_12345',
  'In-person',
  'Product efficacy and dosing',
  'Saved_vod',
  'Dr. Karina Soto',
  'HCP_SOTO',
  FALSE,
  NULL,
  FALSE,
  '',
  'Discussed new clinical trial results. HCP showed interest in enrolling patients.',
  '2025-11-06',
  '10:30:00',
  'ProductX',
  'Email',
  'Send clinical trial enrollment materials',
  '2025-11-13',
  'Sales Rep 1'
);
```

---

## Example Data (Redshift-only, not in static map)

The following entries are stored **only in Redshift** and are not present in the in-memory static HCP/HCO map (`backend/app/prompting.py`):

### HCOs (Redshift-only)
```sql
INSERT INTO hco (hco_id, name) VALUES
  ('HCO_BAYVIEW', 'Bayview Medical Group'),
  ('HCO_NORTHSIDE', 'Northside Cardiology');
```

### HCPs (Redshift-only)
```sql
INSERT INTO hcp (hcp_id, name, hco_id) VALUES
  ('HCP_SOTO', 'Dr. Karina Soto', 'HCO_BAYVIEW'),
  ('HCP_RAHMAN', 'Dr. Malik Rahman', 'HCO_NORTHSIDE');
```

### Alignments (Redshift-only)
```sql
INSERT INTO hco_hcp_alignment (hco_id, hcp_id) VALUES
  ('HCO_BAYVIEW', 'HCP_SOTO'),
  ('HCO_NORTHSIDE', 'HCP_RAHMAN');
```

**Note:** These HCPs are discoverable via `fetch_hcp_by_name()` in `backend/app/redshift.py` and will appear in HCP search results. When a user selects a Redshift-only HCP, the system will populate the `account` (HCO name) and `id` (HCP id) fields from Redshift.

---

## Schema Migration & Initialization

The schema is created and maintained by `backend/app/redshift.py` using the `init_schema()` function, which is **idempotent** (safe to run multiple times).

```python
from app.redshift import init_schema

# Initialize or update schema
await init_schema()
```

---

## Foreign Key Relationships

```
hco (hco_id) ← hcp (hco_id)
              ↖
                hco_hcp_alignment (hco_id, hcp_id)
              ↗
hcp (hcp_id) ←
```

---

## Compliance & Audit Fields

The `calls` table includes special fields for regulatory compliance:

- **`adverse_event`** + **`adverse_event_details`**: Flag and describe any adverse events reported during the call
- **`noncompliance_event`** + **`noncompliance_description`**: Flag and describe any regulatory or policy violations detected by guardrails
- **`created_at`**: Timestamp for audit trail

These fields are automatically populated by the voice agent's guardrails system and trigger n8n workflows for alerting and compliance workflows.

---

## Query Examples

### Fetch HCP by name (case-insensitive)
```sql
SELECT hcp_id, name, hco_id
FROM hcp
WHERE LOWER(name) LIKE LOWER('%Karina%');
```

### Fetch alignments for an HCO
```sql
SELECT h.hcp_id, h.name, h.hco_id
FROM hcp h
JOIN hco_hcp_alignment a ON h.hcp_id = a.hcp_id
WHERE a.hco_id = 'HCO_BAYVIEW';
```

### Fetch recent calls with adverse events
```sql
SELECT call_pk, account, call_date, adverse_event_details
FROM calls
WHERE adverse_event = TRUE
  AND call_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY call_date DESC;
```

### Fetch calls with noncompliance events
```sql
SELECT call_pk, account, call_date, noncompliance_description
FROM calls
WHERE noncompliance_event = TRUE
  AND call_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY call_date DESC;
```

---

## Environment Variables

Configure Redshift connection in `.env` or Kubernetes secrets:

```bash
REDSHIFT_HOST=your-cluster.region.redshift.amazonaws.com
REDSHIFT_PORT=5439
REDSHIFT_DB=crm_db
REDSHIFT_USER=app_user
REDSHIFT_PASSWORD=secure_password_or_use_iam

# Optional: Use IAM authentication instead of password
REDSHIFT_USE_IAM=true
```

**Security:** Never hardcode credentials. Use IAM roles (IRSA in EKS) or AWS Secrets Manager in production.

