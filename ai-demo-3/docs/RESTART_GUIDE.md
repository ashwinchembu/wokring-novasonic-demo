# Restart Guide: Redshift + n8n + Tool Integration

This guide provides step-by-step instructions for restarting all services after implementing Redshift database, n8n workflow automation, and tool-based integration.

## Prerequisites

Before restarting, ensure you have:

- ✅ AWS credentials configured (IAM role or access keys)
- ✅ Redshift cluster running and accessible
- ✅ n8n instance deployed and accessible
- ✅ Python dependencies installed (`psycopg2-binary`, `httpx`)
- ✅ Environment variables configured (`.env` file)

---

## Phase 1: Redshift Setup

### Step 1.1: Verify Redshift Connection

Test connectivity from your backend server:

```bash
# From backend directory
cd backend/

# Activate virtual environment
source venv/bin/activate  # or venv_redshift/bin/activate

# Test connection (Python REPL)
python3
>>> from app.config import settings
>>> print(settings.redshift_host)
>>> print(settings.redshift_db)
>>> exit()
```

Expected output: Your Redshift host and database name.

### Step 1.2: Initialize Schema

Run the schema initialization (idempotent, safe to run multiple times):

```bash
# From backend directory
python3 -c "
import asyncio
from app.redshift import init_schema

asyncio.run(init_schema())
"
```

Expected output:
```
✅ Table 'hco' created or exists
✅ Table 'hcp' created or exists
✅ Table 'hco_hcp_alignment' created or exists
✅ Table 'calls' created or exists
✅ Redshift schema initialization complete
```

### Step 1.3: Seed Test Data

Insert Redshift-only HCOs and HCPs:

```bash
python3 -c "
import asyncio
from app.redshift import seed_data

asyncio.run(seed_data())
"
```

Expected output:
```
✅ Inserted HCO: Bayview Medical Group
✅ Inserted HCO: Northside Cardiology
✅ Inserted HCP: Dr. Karina Soto
✅ Inserted HCP: Dr. Malik Rahman
✅ Inserted alignment: HCO_BAYVIEW ↔ HCP_SOTO
✅ Inserted alignment: HCO_NORTHSIDE ↔ HCP_RAHMAN
✅ Redshift seed data complete
```

### Step 1.4: Quick Read Test

Verify data was inserted correctly:

```bash
python3 -c "
import asyncio
from app.redshift import fetch_hcp_by_name

async def test():
    result = await fetch_hcp_by_name('Karina Soto')
    print(f'Found HCP: {result}')

asyncio.run(test())
"
```

Expected output:
```
Found HCP: {'hcp_id': 'HCP_SOTO', 'name': 'Dr. Karina Soto', 'hco_id': 'HCO_BAYVIEW', 'hco_name': 'Bayview Medical Group', 'source': 'redshift'}
```

---

## Phase 2: Backend Restart

### Step 2.1: Install Dependencies

Ensure all required packages are installed:

```bash
cd backend/
pip install -r requirements.txt

# Install Redshift support (if not in requirements.txt)
pip install psycopg2-binary httpx
```

### Step 2.2: Update Environment Variables

Edit `.env` file (create if doesn't exist):

```bash
# AWS Configuration
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1

# Redshift Configuration
REDSHIFT_HOST=your-cluster.region.redshift.amazonaws.com
REDSHIFT_PORT=5439
REDSHIFT_DB=crm_db
REDSHIFT_USER=app_user
REDSHIFT_PASSWORD=your-password
REDSHIFT_USE_IAM=false
REDSHIFT_CONNECT_TIMEOUT=10
REDSHIFT_QUERY_TIMEOUT=30

# n8n Configuration
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/call-events
N8N_WEBHOOK_SECRET=your-shared-secret-here

# Bedrock Configuration
BEDROCK_MODEL_ID=amazon.nova-sonic-v1:0
```

### Step 2.3: Rebuild Backend (if needed)

If running in Docker:

```bash
cd backend/
docker build -t ai-demo-3-backend:latest .
```

### Step 2.4: Restart Backend Server

#### Option A: Local Development

```bash
cd backend/
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### Option B: Production (systemd)

```bash
sudo systemctl restart ai-demo-3-backend
sudo systemctl status ai-demo-3-backend
```

#### Option C: Kubernetes

```bash
kubectl rollout restart deployment/backend -n ai-demo-3
kubectl get pods -n ai-demo-3 -w  # Watch for new pods to come up
```

### Step 2.5: Verify Backend Health

Check health endpoints:

```bash
# Basic health
curl http://localhost:8000/health

# Database health
curl http://localhost:8000/db/healthz
```

Expected output:
```json
{
  "status": "healthy",
  "database": "redshift",
  "connected": true,
  "timestamp": "2025-11-06T15:30:00.000Z"
}
```

### Step 2.6: Verify Tool Definitions

Check that promptStart includes tools:

```bash
# This requires inspecting the Nova Sonic client setup
# Tools should be defined in app/tools.py and passed to promptStart
```

Expected tools in `promptStart.toolConfiguration.tools`:
- `lookupHcpTool`
- `insertCallTool`
- `emitN8nEventTool`
- `createFollowUpTaskTool`

---

## Phase 3: n8n Setup

### Step 3.1: Start n8n Instance

#### Option A: Docker Compose (Self-Hosted)

```bash
cd ops/n8n/
docker-compose up -d
```

#### Option B: Kubernetes

```bash
kubectl apply -f ops/n8n/k8s/
kubectl get pods -n n8n -w
```

#### Option C: n8n Cloud

Access your n8n cloud instance at https://app.n8n.cloud

### Step 3.2: Import Workflows

1. Log into n8n UI
2. Go to **Workflows** → **Import from File**
3. Import each workflow:
   - `ops/n8n/workflow-1-call-saved-alerts.json`
   - `ops/n8n/workflow-2-followup-tasks.json`
   - `ops/n8n/workflow-3-daily-export.json`
   - `ops/n8n/workflow-4-hcp-enrichment.json`

### Step 3.3: Configure Credentials

Set up credentials in n8n:

1. **Redshift (Postgres)**
   - Type: Postgres
   - Host: `your-cluster.region.redshift.amazonaws.com`
   - Port: 5439
   - Database: `crm_db`
   - User: `app_user`
   - Password: (from secrets)
   - SSL: `require`

2. **Slack**
   - Type: Slack OAuth2
   - OAuth Token: (from Slack app)

3. **AWS S3**
   - Type: AWS
   - Access Key ID: (from AWS)
   - Secret Access Key: (from secrets)
   - Region: `us-east-1`

4. **Webhook Authentication**
   - Type: Header Auth
   - Name: `X-N8N-Secret`
   - Value: (must match `N8N_WEBHOOK_SECRET` in backend)

### Step 3.4: Update Workflow Settings

For each workflow, update:

- **Sheet IDs** (Google Sheets nodes)
- **Channel names** (Slack nodes)
- **S3 bucket names** (AWS S3 nodes)
- **Jira project keys** (Jira nodes)
- **Email addresses** (Email nodes)

### Step 3.5: Activate Workflows

Toggle each workflow to "Active" (green toggle in top right).

### Step 3.6: Fire Test Webhook

Test the Call Saved workflow:

```bash
curl -X POST https://your-n8n-instance.com/webhook/call-events \
  -H "Content-Type: application/json" \
  -H "X-N8N-Secret: your-secret" \
  -d '{
    "eventType": "call.saved",
    "payload": {
      "call_pk": "TEST_123",
      "account": "Dr. Test HCP",
      "product": "ProductX",
      "adverse_event": false,
      "noncompliance_event": false,
      "call_date": "2025-11-06",
      "call_time": "15:30:00",
      "call_notes": "Test webhook integration"
    },
    "timestamp": "2025-11-06T15:30:00Z"
  }'
```

Expected: 200 OK response, check n8n Executions for success.

---

## Phase 4: Frontend Restart

### Step 4.1: Rebuild Frontend (if changed)

```bash
cd frontend/
npm install
npm run build
```

### Step 4.2: Refresh Frontend Grid

Update frontend to fetch call records from backend (which now includes Redshift data):

```javascript
// In frontend code
const fetchCalls = async () => {
  const response = await fetch('http://localhost:8000/api/calls');
  const calls = await response.json();
  // Display in grid
};
```

### Step 4.3: Verify HCP Search

Test that Redshift-only HCPs appear in search:

1. Open frontend UI
2. Search for "Karina Soto"
3. Confirm it appears in autocomplete/dropdown
4. Select and verify `account` and `id` fields populate correctly

---

## Phase 5: End-to-End Validation

### Test 1: Conversation with Redshift-only HCP

1. Start a voice conversation
2. Say: "I met with Dr. Karina Soto"
3. Agent should call `lookupHcpTool` and find HCP in Redshift
4. Complete conversation (provide date, time, product)
5. Agent reads back summary
6. Confirm summary

**Expected:**
- Agent calls `insertCallTool` → persists to Redshift
- Agent calls `emitN8nEventTool` → triggers n8n webhook
- Frontend grid updates with new row
- n8n workflow executes (check Executions tab)

### Test 2: Adverse Event Flow

1. Start conversation
2. Mention: "Patient reported rash after starting medication"
3. Complete conversation
4. Confirm summary

**Expected:**
- Call persisted with `adverse_event=true`
- n8n workflow 1 fires
- Slack alert in `#safety-alerts`
- Email to safety@company.com
- Jira ticket created

### Test 3: Follow-Up Task Flow

1. Start conversation
2. Say: "I need to email clinical trial materials"
3. Complete conversation

**Expected:**
- Call persisted with `followup_task_type="Email"`
- Agent calls `createFollowUpTaskTool`
- n8n workflow 2 fires
- Task created in Asana/Salesforce
- Slack notification in `#task-updates`

### Test 4: Daily Export (Manual Trigger)

1. Go to n8n UI
2. Open "Workflow 3: Daily Export"
3. Click "Execute Workflow"

**Expected:**
- Redshift query executes
- CSV file created
- Uploaded to S3
- Email sent to analytics@company.com
- Slack notification in `#data-exports`

---

## Phase 6: Monitor & Verify

### Check Logs

#### Backend Logs
```bash
# Local
tail -f backend/server.log

# Kubernetes
kubectl logs -f deployment/backend -n ai-demo-3

# Docker
docker logs -f ai-demo-3-backend
```

Look for:
- ✅ "Tool: lookupHcpTool - searching for: ..."
- ✅ "Tool: insertCallTool - persisting call record"
- ✅ "Call persisted: CALL_..."
- ✅ "n8n event emitted: call.saved"

#### n8n Logs

1. Go to n8n UI
2. Click **Executions**
3. Check recent executions (should show success ✅)
4. Click on execution to see detailed steps

#### Redshift Query Logs

```sql
-- In Redshift query editor
SELECT * FROM calls
ORDER BY created_at DESC
LIMIT 10;

-- Check for adverse events
SELECT * FROM calls
WHERE adverse_event = true
ORDER BY created_at DESC;
```

---

## Troubleshooting

### Issue: Backend can't connect to Redshift

**Symptoms:** `/db/healthz` returns 503

**Solutions:**
1. Verify security group allows backend IP
2. Check Redshift credentials in `.env`
3. Enable VPC peering if needed
4. Test connection from backend host:
   ```bash
   psql -h your-cluster.region.redshift.amazonaws.com \
        -p 5439 -d crm_db -U app_user
   ```

### Issue: n8n webhook not receiving events

**Symptoms:** Agent completes but no n8n execution

**Solutions:**
1. Check `N8N_WEBHOOK_URL` in backend `.env`
2. Verify n8n webhook is active (green toggle)
3. Check webhook authentication (`X-N8N-Secret`)
4. Test with curl (see Phase 3.6)
5. Check backend logs for HTTP errors

### Issue: Tools not appearing in agent

**Symptoms:** Agent doesn't call tools

**Solutions:**
1. Verify `app/tools.py` exists and is imported
2. Check that Nova Sonic client passes tools in `promptStart`
3. Verify tool definitions are correct (see `get_tool_definitions()`)
4. Check backend logs for tool-related errors
5. Restart backend after changes

### Issue: HCP lookup returns wrong results

**Symptoms:** Static HCP used instead of Redshift HCP

**Solutions:**
1. Verify `fetch_hcp_by_name()` is called first
2. Check Redshift data: `SELECT * FROM hcp WHERE name LIKE '%Karina%';`
3. Check tool handler logs: "Found HCP in Redshift" vs "Found HCP in static map"
4. If both exist, agent should prefer Redshift (check tool logic)

### Issue: Follow-up tasks not created

**Symptoms:** No task in PM/CRM system

**Solutions:**
1. Check n8n workflow 2 is active
2. Verify PM/CRM API credentials in n8n
3. Check n8n execution logs for API errors
4. Test API manually (Postman/curl)
5. Check task webhook URL matches backend

---

## Rollback Plan

If issues occur, rollback in reverse order:

### 1. Disable n8n Workflows
- Toggle workflows to "Inactive" in n8n UI

### 2. Rollback Backend
```bash
# Kubernetes
kubectl rollout undo deployment/backend -n ai-demo-3

# Docker
docker stop ai-demo-3-backend
docker run -d <previous-image-id>
```

### 3. Disable Redshift Integration
Comment out Redshift imports in `app/main.py` and restart.

---

## Success Criteria

✅ All components restarted without errors  
✅ `/health` and `/db/healthz` return 200 OK  
✅ Redshift schema initialized and seeded  
✅ n8n workflows imported and active  
✅ End-to-end test completes successfully:
  - Voice conversation with Redshift-only HCP
  - Call persisted to Redshift
  - n8n webhook triggered
  - Frontend grid updated
  - Slack/email notifications sent

---

## Next Steps

After successful restart:

1. **Update Documentation**
   - Add Redshift schema changes to RUNBOOK
   - Document new environment variables
   - Update deployment guides

2. **Set Up Monitoring**
   - CloudWatch alarms for Redshift connection errors
   - n8n execution failure alerts
   - Backend tool execution metrics

3. **Performance Tuning**
   - Add Redshift query caching
   - Optimize HCP lookup queries
   - Tune n8n workflow concurrency

4. **Security Hardening**
   - Rotate `N8N_WEBHOOK_SECRET`
   - Enable IAM authentication for Redshift
   - Audit tool permissions

---

## Support Contacts

- **Backend Issues:** Backend team
- **Redshift Issues:** Database team / AWS Support
- **n8n Issues:** Automation team / n8n support
- **Integration Issues:** Platform team

---

## References

- [Schema Documentation](./SCHEMA.md)
- [n8n Workflow Guide](./N8N.md)
- [Tool Implementation](../backend/app/tools.py)
- [Prompting Guide](../backend/app/PROMPTING_GUIDE.md)

