# n8n Workflow Exports

This directory contains example n8n workflow exports for the AI Demo 3 voice agent integration.

## Workflows

1. **workflow-1-call-saved-alerts.json** - Adverse event and noncompliance alerting
2. **workflow-2-followup-tasks.json** - Task creation in PM/CRM systems
3. **workflow-3-daily-export.json** - Daily call record export to S3
4. **workflow-4-hcp-enrichment.json** - HCP/HCO discovery and enrichment

## Import Instructions

1. Open your n8n instance
2. Go to **Workflows** → **Import from File**
3. Select a workflow JSON file
4. Configure credentials:
   - Slack API
   - Email (SMTP)
   - Redshift (Postgres connection)
   - AWS S3
   - Google Sheets
   - Jira/Asana/Salesforce APIs
5. Update webhook authentication:
   - Set `X-N8N-Secret` header value
   - Update webhook path if needed
6. Update IDs and URLs:
   - Google Sheet IDs
   - Jira project keys
   - Asana project IDs
   - S3 bucket names
   - Slack channel names
7. Activate the workflow (toggle in top right)

## Configuration

### Redshift Connection

Type: **Postgres**

Settings:
- Host: `your-cluster.region.redshift.amazonaws.com`
- Port: `5439`
- Database: `crm_db`
- User: `app_user`
- Password: (from credentials store)
- SSL: `require`

### Webhook Authentication

All webhooks use **Header Auth**:
- Header Name: `X-N8N-Secret`
- Header Value: `<your secret from backend .env>`

Set in backend `.env`:
```bash
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/call-events
N8N_WEBHOOK_SECRET=your-shared-secret-here
```

## Testing

Test workflows with curl:

```bash
# Workflow 1: Call Saved
curl -X POST https://your-n8n.com/webhook/call-events \
  -H "Content-Type: application/json" \
  -H "X-N8N-Secret: your-secret" \
  -d '{
    "eventType": "call.saved",
    "payload": {
      "call_pk": "TEST_123",
      "adverse_event": true,
      "adverse_event_details": "Test AE"
    }
  }'

# Workflow 2: Task Created
curl -X POST https://your-n8n.com/webhook/task-events \
  -H "Content-Type: application/json" \
  -H "X-N8N-Secret: your-secret" \
  -d '{
    "eventType": "task.created",
    "payload": {
      "task": {
        "task_type": "Email",
        "description": "Follow up with HCP"
      }
    }
  }'
```

## Customization

These are example workflows. Customize them to match your:
- PM/CRM systems (Asana, Jira, Salesforce, etc.)
- Notification channels (Slack, Teams, Email)
- Data export destinations (S3, FTP, Google Drive)
- Compliance requirements
- Alert escalation paths

## Troubleshooting

### Webhook not triggered
- Check webhook is active (green toggle)
- Verify `N8N_WEBHOOK_URL` in backend
- Test with curl
- Check n8n logs: Executions → Failed

### Redshift connection failed
- Verify security group allows n8n IP
- Test connection in n8n UI
- Check credentials
- Enable VPC peering if needed

### Slack alerts not sending
- Verify OAuth token has `chat:write` permission
- Check channel name (case-sensitive)
- Test Slack node in isolation

## Support

For issues, see:
- n8n Documentation: https://docs.n8n.io
- Backend Integration: `docs/N8N.md`
- Redshift Schema: `docs/SCHEMA.md`

