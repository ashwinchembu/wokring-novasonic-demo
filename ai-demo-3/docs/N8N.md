# n8n Workflow Integration

This document describes the n8n workflows used to automate CRM call processing, compliance alerting, task creation, and data export.

## Overview

The AI Demo 3 voice agent integrates with n8n to automate post-call workflows:

1. **Call Saved → Alerts**: Trigger compliance/safety alerts when adverse events or noncompliance is detected
2. **Follow-Up Tasks**: Create tasks in PM/CRM systems when follow-up actions are needed
3. **Daily Export**: Export call records to S3/CSV for analysis
4. **HCO/HCP Enrichment**: Enrich and moderate new HCP/HCO names discovered during calls

## Architecture

```
Voice Agent → Backend Tool (emitN8nEventTool) → n8n Webhook → Workflow Actions
```

**Event Flow:**
1. Voice agent completes call recording
2. Agent calls `insertCallTool` to persist to Redshift
3. Agent calls `emitN8nEventTool` with `eventType="call.saved"`
4. n8n webhook receives event and triggers appropriate workflows
5. Workflows execute actions (Slack alerts, task creation, exports, etc.)

## Configuration

### Environment Variables

Set these in `.env` or Kubernetes secrets:

```bash
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/call-events
N8N_WEBHOOK_SECRET=your-shared-secret-here
```

### n8n Webhook Setup

1. Create a new workflow in n8n
2. Add a **Webhook** trigger node
   - Method: POST
   - Path: `/webhook/call-events` (or custom)
   - Authentication: Header Auth
   - Header Name: `X-N8N-Secret`
   - Header Value: `<your secret>`
3. Set `N8N_WEBHOOK_URL` to the webhook URL
4. Set `N8N_WEBHOOK_SECRET` to match the header value

---

## Workflow 1: Call Saved → Alerts

**Trigger:** Webhook receives `eventType="call.saved"`

**Purpose:** Send alerts when adverse events or noncompliance is detected in a call.

### Workflow Steps

1. **Webhook Trigger**
   - Receives POST with event payload
   - Validates `X-N8N-Secret` header

2. **Filter: Adverse Event Check**
   - IF `payload.adverse_event === true`
   - THEN proceed to Adverse Event Branch

3. **Adverse Event Branch**
   - **Slack/Teams Alert**
     - Channel: `#safety-alerts`
     - Message: "🚨 Adverse Event Reported in Call {call_pk}"
     - Include: HCP name, product, AE details
   - **Email to Safety Team**
     - To: safety@company.com
     - Subject: "URGENT: Adverse Event Reported - Call {call_pk}"
     - Body: Full call details + adverse_event_details
   - **Ticket Creation** (Jira/ServiceNow)
     - Project: SAFETY
     - Type: Incident
     - Priority: High
     - Description: AE details + call transcript link

4. **Filter: Noncompliance Check**
   - IF `payload.noncompliance_event === true`
   - THEN proceed to Noncompliance Branch

5. **Noncompliance Branch**
   - **Slack/Teams Alert**
     - Channel: `#compliance-alerts`
     - Message: "⚠️ Noncompliance Event Detected in Call {call_pk}"
     - Include: HCP name, noncompliance_description
   - **Log to Google Sheet / S3**
     - Sheet: "Compliance Log"
     - Row: [timestamp, call_pk, HCP, description, guardrail_rules]
   - **Email to Compliance Team**
     - To: compliance@company.com
     - Subject: "Noncompliance Event - Call {call_pk}"
     - Body: Full details + link to audit logs

### Event Payload Example

```json
{
  "eventType": "call.saved",
  "payload": {
    "call_pk": "CALL_ABC123",
    "account": "Dr. Karina Soto",
    "id": "HCP_SOTO",
    "call_date": "2025-11-06",
    "product": "ProductX",
    "adverse_event": true,
    "adverse_event_details": "Patient reported rash after starting medication",
    "noncompliance_event": false,
    "noncompliance_description": "",
    "call_notes": "Discussed dosing schedule. Patient mentioned side effects.",
    "session_id": "session_xyz",
    "created_at": "2025-11-06T15:30:00Z"
  },
  "timestamp": "2025-11-06T15:30:05Z"
}
```

### n8n Nodes

- **Webhook** (Trigger)
- **IF** (Adverse Event Check)
- **Slack** (AE Alert)
- **Email** (AE Notification)
- **HTTP Request** (Jira API)
- **IF** (Noncompliance Check)
- **Slack** (Compliance Alert)
- **Google Sheets** (Log Entry)
- **Email** (Compliance Notification)

### Export

See: `ops/n8n/workflow-1-call-saved-alerts.json`

---

## Workflow 2: Follow-Up Tasks

**Trigger:** Webhook receives `eventType="task.created"`

**Purpose:** Create follow-up tasks in PM/CRM systems when agent identifies action items.

### Workflow Steps

1. **Webhook Trigger**
   - Receives POST with task payload

2. **Extract Task Details**
   - task_type: Email, Call, Meeting, Sample Drop, etc.
   - description: Task description
   - due_date: Task due date
   - assigned_to: Task assignee

3. **Router: Task Type**
   - Route based on task_type

4. **Branch: Email Task**
   - **HTTP Request** (Asana API)
     - POST /tasks
     - Body: Create task in "Email Follow-Ups" project
     - Assign to user

5. **Branch: Call Task**
   - **HTTP Request** (Salesforce API)
     - POST /sobjects/Task
     - Body: Create task with type="Call"

6. **Branch: Meeting Task**
   - **HTTP Request** (Google Calendar API)
     - POST /calendars/primary/events
     - Create calendar invite with attendees

7. **Branch: Sample Drop**
   - **HTTP Request** (CRM API)
     - Create sample order request
     - Notify logistics team

8. **Slack Notification**
   - Channel: `#task-updates`
   - Message: "✅ Follow-up task created: {task_type} for {assigned_to}"

### Event Payload Example

```json
{
  "eventType": "task.created",
  "payload": {
    "task": {
      "task_type": "Email",
      "description": "Send clinical trial enrollment materials",
      "due_date": "2025-11-13",
      "assigned_to": "Sales Rep 1"
    },
    "call_pk": "CALL_ABC123",
    "account": "Dr. Karina Soto",
    "created_at": "2025-11-06T15:30:05Z"
  },
  "timestamp": "2025-11-06T15:30:06Z"
}
```

### n8n Nodes

- **Webhook** (Trigger)
- **Switch** (Route by task_type)
- **HTTP Request** (Asana - Email)
- **HTTP Request** (Salesforce - Call)
- **HTTP Request** (Google Calendar - Meeting)
- **HTTP Request** (CRM - Sample Drop)
- **Slack** (Task Confirmation)

### Export

See: `ops/n8n/workflow-2-followup-tasks.json`

---

## Workflow 3: Daily Export

**Trigger:** Cron schedule (daily at 6:00 AM UTC)

**Purpose:** Export last 24 hours of call records to S3/CSV for analysis and archival.

### Workflow Steps

1. **Cron Trigger**
   - Schedule: `0 6 * * *` (6:00 AM UTC daily)

2. **Redshift Query**
   - Node: **Postgres** (Redshift compatible)
   - Connection: Use Redshift credentials
   - Query:
     ```sql
     SELECT *
     FROM calls
     WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
     ORDER BY created_at DESC
     ```

3. **Convert to CSV**
   - Node: **Spreadsheet File**
   - Format: CSV
   - Options: Include headers, UTF-8 encoding

4. **Upload to S3**
   - Node: **AWS S3**
   - Bucket: `company-crm-exports`
   - Key: `calls/exports/calls_export_{{ $now.format('YYYY-MM-DD') }}.csv`
   - ACL: private

5. **Optional: Email Summary**
   - Node: **Email**
   - To: analytics@company.com
   - Subject: "Daily Call Export - {{ $now.format('YYYY-MM-DD') }}"
   - Body: "Exported {{ $items.length }} calls from the last 24 hours."
   - Attachment: CSV file

6. **Slack Notification**
   - Channel: `#data-exports`
   - Message: "📊 Daily call export complete: {count} records exported to S3"

### Redshift Connection

Configure in n8n:
- **Type:** Postgres
- **Host:** `your-cluster.region.redshift.amazonaws.com`
- **Port:** 5439
- **Database:** `crm_db`
- **User:** `export_user` (read-only recommended)
- **Password:** From n8n credentials store
- **SSL:** Enabled

### n8n Nodes

- **Cron** (Trigger)
- **Postgres** (Redshift Query)
- **Spreadsheet File** (CSV Conversion)
- **AWS S3** (Upload)
- **Email** (Summary)
- **Slack** (Notification)

### Export

See: `ops/n8n/workflow-3-daily-export.json`

---

## Workflow 4: HCO/HCP Enrichment (Optional)

**Trigger:** Webhook receives `eventType="hcp.unmapped"`

**Purpose:** Enrich and moderate new HCP/HCO names that aren't found in Redshift or static maps.

### Workflow Steps

1. **Webhook Trigger**
   - Receives POST when agent encounters unknown HCP name

2. **Redshift Lookup**
   - Node: **Postgres**
   - Query:
     ```sql
     SELECT * FROM hcp WHERE LOWER(name) LIKE LOWER('%{{ $json.name }}%')
     ```

3. **Filter: Already Exists**
   - IF record found
   - THEN skip (false positive)

4. **Slack Alert: Manual Review**
   - Channel: `#hcp-moderation`
   - Message: "🔍 New HCP mentioned: {{ $json.name }}"
   - Include: Call context, session_id
   - Action buttons:
     - ✅ Add to Redshift
     - ❌ Ignore
     - 🔍 Research

5. **Optional: External API Lookup**
   - Node: **HTTP Request**
   - Call external HCP database (NPI registry, etc.)
   - Enrich with HCO affiliation, specialty, address

6. **Optional: Auto-Insert to Redshift**
   - If high confidence match
   - Node: **Postgres**
   - Query:
     ```sql
     INSERT INTO hcp (hcp_id, name, hco_id)
     VALUES ('HCP_{{ $now.toUnixInteger() }}', '{{ $json.name }}', NULL)
     ```

7. **Log to Google Sheet**
   - Sheet: "HCP Discovery Log"
   - Row: [timestamp, name, call_pk, action_taken]

### Event Payload Example

```json
{
  "eventType": "hcp.unmapped",
  "payload": {
    "name": "Dr. Jane Unknown",
    "call_pk": "CALL_XYZ789",
    "session_id": "session_abc",
    "context": "User mentioned meeting with Dr. Jane Unknown at City Hospital",
    "timestamp": "2025-11-06T15:30:00Z"
  },
  "timestamp": "2025-11-06T15:30:01Z"
}
```

### n8n Nodes

- **Webhook** (Trigger)
- **Postgres** (Redshift Lookup)
- **IF** (Exists Check)
- **Slack** (Moderation Alert)
- **HTTP Request** (NPI Lookup)
- **Postgres** (Insert HCP)
- **Google Sheets** (Log Entry)

### Export

See: `ops/n8n/workflow-4-hcp-enrichment.json`

---

## Security Best Practices

### Webhook Authentication

Always use `X-N8N-Secret` header authentication:

```javascript
// Backend (tools.py)
headers["X-N8N-Secret"] = settings.n8n_webhook_secret

// n8n Webhook Node
Authentication: Header Auth
Header Name: X-N8N-Secret
Header Value: <your secret>
```

### Sensitive Data

- **Never log sensitive PII** in n8n logs
- **Redact** call transcripts in public channels
- **Use private channels** for compliance/safety alerts
- **Encrypt** S3 exports (use SSE-S3 or SSE-KMS)

### Error Handling

Add **Error Trigger** nodes to each workflow:
- Catch failed nodes
- Alert to `#n8n-errors` Slack channel
- Retry with exponential backoff
- Log to error tracking (Sentry, etc.)

---

## Testing Workflows

### Manual Test (Postman / curl)

```bash
curl -X POST https://your-n8n-instance.com/webhook/call-events \
  -H "Content-Type: application/json" \
  -H "X-N8N-Secret: your-secret" \
  -d '{
    "eventType": "call.saved",
    "payload": {
      "call_pk": "TEST_123",
      "account": "Dr. Test HCP",
      "adverse_event": true,
      "adverse_event_details": "Test AE for workflow validation"
    },
    "timestamp": "2025-11-06T15:30:00Z"
  }'
```

### Backend Test

```python
# In backend shell or test script
from app.tools import handle_emit_n8n_event_tool

result = await handle_emit_n8n_event_tool({
    "eventType": "call.saved",
    "payload": {
        "call_pk": "TEST_123",
        "adverse_event": True
    }
})

print(result)  # Should show {"ok": True, "status_code": 200}
```

---

## Monitoring & Observability

### n8n Workflow Metrics

Monitor in n8n UI:
- Execution count (by workflow)
- Success/failure rate
- Average execution time
- Error types and frequencies

### Slack Channels

- `#safety-alerts`: Adverse event notifications
- `#compliance-alerts`: Noncompliance events
- `#task-updates`: Follow-up task creations
- `#data-exports`: Daily export confirmations
- `#hcp-moderation`: HCP enrichment requests
- `#n8n-errors`: Workflow error alerts

### Logs

n8n execution logs are available in:
- n8n UI: Executions tab
- n8n logs: `/root/.n8n/logs/` (if self-hosted)
- CloudWatch (if deployed to AWS)

---

## Deployment

### Self-Hosted (Docker)

```bash
cd ops/n8n
docker-compose up -d
```

See: `ops/n8n/docker-compose.yml`

### Kubernetes

```bash
kubectl apply -f ops/n8n/k8s/
```

See: `ops/n8n/k8s/deployment.yaml`

### n8n Cloud

1. Sign up at https://n8n.io
2. Import workflows from `ops/n8n/*.json`
3. Configure credentials (Redshift, Slack, etc.)
4. Set webhook URLs in backend `.env`

---

## Workflow Exports

All workflows are exported to:

```
ops/n8n/
├── workflow-1-call-saved-alerts.json
├── workflow-2-followup-tasks.json
├── workflow-3-daily-export.json
└── workflow-4-hcp-enrichment.json
```

Import these in n8n:
1. Settings → Import from File
2. Select JSON file
3. Configure credentials
4. Activate workflow

---

## Troubleshooting

### Webhook Not Receiving Events

1. Check `N8N_WEBHOOK_URL` in backend `.env`
2. Verify n8n webhook is active (green toggle in UI)
3. Test with curl (see Testing section)
4. Check backend logs for HTTP errors

### Redshift Connection Failed

1. Verify Redshift security group allows n8n IP
2. Check Redshift credentials in n8n
3. Test connection in n8n Postgres node
4. Enable VPC peering if n8n is in different VPC

### Slack Alerts Not Sending

1. Verify Slack OAuth token in n8n credentials
2. Check channel name (must match exactly)
3. Ensure Slack app has `chat:write` permission
4. Test with n8n Slack node in isolation

---

## Future Enhancements

- **Real-time streaming**: Use WebSocket or SSE for live call updates
- **ML enrichment**: Auto-categorize calls with sentiment analysis
- **Salesforce sync**: Bidirectional sync with Salesforce CRM
- **Voice analytics**: Integrate with call recording analysis (AWS Transcribe Medical)
- **Dashboard**: Create real-time dashboard with call metrics (Grafana/Tableau)

