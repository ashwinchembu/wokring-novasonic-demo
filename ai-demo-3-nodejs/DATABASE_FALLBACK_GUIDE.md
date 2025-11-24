# Database Fallback System Guide

## Overview

The application now includes a **seamless automatic fallback** system that switches between Redshift (cloud) and SQLite (local) databases without interrupting service.

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    API Request                               │
└────────────────┬────────────────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────────────────┐
│              Database Adapter                                │
│  - Tries Redshift first                                     │
│  - Auto-falls back to SQLite if Redshift unavailable       │
│  - Periodic retry of Redshift (every 30 seconds)           │
└────────────────┬────────────────────────────────────────────┘
                 │
         ┌───────┴───────┐
         v               v
┌──────────────┐  ┌──────────────┐
│   Redshift   │  │   SQLite     │
│   (Cloud)    │  │   (Local)    │
│   ☁️ Primary  │  │   💾 Backup   │
└──────────────┘  └──────────────┘
```

### Fallback Logic

1. **Try Redshift First**: Every query attempts Redshift if it was available recently
2. **Automatic Fallback**: If Redshift fails, immediately falls back to SQLite
3. **Health Check**: Checks Redshift availability every 30 seconds
4. **Automatic Recovery**: Once Redshift is back, automatically switches back
5. **Zero Downtime**: Users never see errors, just seamless operation

## Features

### ✅ Automatic Failover
- Detects Redshift failure instantly
- Switches to SQLite without user intervention
- Logs warnings but continues serving requests

### ✅ Automatic Recovery
- Periodically checks if Redshift is back
- Auto-switches back to primary database
- Logs recovery for monitoring

### ✅ Transparent to API
- Same API endpoints work regardless of database
- Response includes `source` field (`redshift` or `sqlite`)
- Frontend can show which database is active

### ✅ Zero Data Loss (Caveat)
- All data written to active database
- **Note**: SQLite and Redshift don't sync automatically
- Consider them separate databases during fallback mode

## API Endpoints

### Database Status

**GET** `/db/status`

Get current database status and health:

```json
{
  "currentSource": "sqlite",
  "sourceEmoji": "💾",
  "sourceName": "SQLite (Local Backup)",
  "databases": {
    "activeSource": "sqlite",
    "redshift": {
      "available": false,
      "message": "Connection timeout"
    },
    "sqlite": {
      "available": true,
      "message": "Connected"
    }
  },
  "message": "⚠️ Running on local backup - Redshift unavailable"
}
```

### Database Health Check

**GET** `/db/healthz`

Health check for both databases:

```json
{
  "status": "healthy",
  "activeSource": "sqlite",
  "databases": {
    "redshift": {
      "available": false,
      "message": "Not configured",
      "emoji": "❌"
    },
    "sqlite": {
      "available": true,
      "message": "Connected",
      "emoji": "✅"
    }
  },
  "message": "💾 Using SQLite (backup)"
}
```

### Force SQLite (Testing)

**POST** `/db/force-sqlite`

Force switch to SQLite for testing:

```bash
curl -X POST http://localhost:8000/db/force-sqlite
```

Response:
```json
{
  "message": "Switched to SQLite backup database",
  "source": "sqlite"
}
```

### Retry Redshift (Testing)

**POST** `/db/retry-redshift`

Force immediate retry of Redshift connection:

```bash
curl -X POST http://localhost:8000/db/retry-redshift
```

Response:
```json
{
  "message": "Retrying Redshift connection",
  "currentSource": "redshift"
}
```

## Usage in API Responses

All database-dependent endpoints now include source information:

### Call History Example

**GET** `/api/calls/history`

```json
{
  "calls": [...],
  "count": 15,
  "source": "sqlite",
  "message": "Using local backup database"
}
```

**Status Indicators**:
- `source: "redshift"` - Using cloud database ☁️
- `source: "sqlite"` - Using local backup 💾
- `source: "unavailable"` - Both databases down (returns empty data)

## Server Logs

### Normal Operation (Redshift)

```
📊 Fetching call history (with automatic fallback)...
✅ Found 15 calls from redshift ☁️
```

### Fallback to SQLite

```
📊 Fetching call history (with automatic fallback)...
⚠️ Redshift unavailable, falling back to local SQLite: Connection timeout
💾 Executing query on local SQLite
✅ Found 15 calls from sqlite 💾
```

### Automatic Recovery

```
✅ Redshift connection restored
📊 Fetching call history (with automatic fallback)...
☁️ Executing query on Redshift
✅ Found 20 calls from redshift ☁️
```

## Configuration

### Environment Variables

```bash
# Redshift (optional - will use SQLite if not configured)
REDSHIFT_HOST=your-redshift-cluster.us-east-1.redshift.amazonaws.com
REDSHIFT_PORT=5439
REDSHIFT_DATABASE=crm_db
REDSHIFT_USER=admin
REDSHIFT_PASSWORD=your-password

# SQLite (always available)
# Location: ./local_crm.db
```

### Fallback Behavior Settings

In `src/databaseAdapter.ts`:

```typescript
private redshiftCheckInterval: number = 30000; // Check every 30 seconds
```

Adjust this value to change how often the system retries Redshift.

## Testing the Fallback

### Test 1: Simulate Redshift Failure

1. **Force SQLite mode**:
   ```bash
   curl -X POST http://localhost:8000/db/force-sqlite
   ```

2. **Check status**:
   ```bash
   curl http://localhost:8000/db/status
   ```

3. **Fetch data** (will come from SQLite):
   ```bash
   curl http://localhost:8000/api/calls/history
   ```

4. **Verify response** shows `"source": "sqlite"`

### Test 2: Automatic Recovery

1. **Start with SQLite** (from Test 1)

2. **Retry Redshift**:
   ```bash
   curl -X POST http://localhost:8000/db/retry-redshift
   ```

3. **Check status**:
   ```bash
   curl http://localhost:8000/db/status
   ```

4. **If Redshift available**, should show `"currentSource": "redshift"`

### Test 3: Monitor Logs

Watch logs during fallback:

```bash
cd /Users/ashwin/zs/wokring-novasonic-demo/ai-demo-3-nodejs
tail -f server.log
```

Look for:
- `⚠️ Redshift unavailable, falling back to local SQLite`
- `💾 Executing query on local SQLite`
- `✅ Redshift connection restored`
- `☁️ Executing query on Redshift`

## Production Considerations

### ✅ Pros

1. **Zero Downtime**: Service continues even if Redshift fails
2. **Automatic Recovery**: No manual intervention needed
3. **Transparent**: Users may not even notice
4. **Monitoring**: All events logged for alerting

### ⚠️ Cons

1. **Data Divergence**: SQLite and Redshift don't sync
   - Calls recorded during fallback only in SQLite
   - Once Redshift recovers, new calls go there
   - Historical data may differ between databases

2. **Limited Capacity**: SQLite suitable for backup, not primary
   - Good for temporary outages
   - Not ideal for high-volume production long-term

3. **No Replication**: Changes in one DB don't replicate to other

### 💡 Recommendations

**For Development/Testing**:
- ✅ This fallback system is perfect
- Use SQLite as primary, Redshift optional

**For Production (Low Volume)**:
- ✅ Use this system as is
- Monitor `source` field in responses
- Alert if fallback lasts > 5 minutes
- Manually sync critical data if needed

**For Production (High Volume)**:
- ⚠️ Consider alternatives:
  - Redshift standby replica
  - RDS Multi-AZ
  - DynamoDB (no fallback needed)
  - Database connection pooling with retry

## Monitoring & Alerts

### Key Metrics to Monitor

1. **Current Database Source**
   - Check `/db/status` endpoint
   - Alert if SQLite for > 5 minutes

2. **Fallback Events**
   - Count "falling back to SQLite" log messages
   - Alert on repeated failures

3. **Recovery Events**
   - Count "Redshift connection restored" logs
   - Track recovery time

### CloudWatch / Datadog Setup

```javascript
// Pseudo-code for monitoring
setInterval(async () => {
  const status = await fetch('http://localhost:8000/db/status').then(r => r.json());
  
  // Send metric
  cloudwatch.putMetric({
    MetricName: 'DatabaseSource',
    Value: status.currentSource === 'redshift' ? 1 : 0,
    Unit: 'None',
  });
  
  // Alert if backup for too long
  if (status.currentSource === 'sqlite') {
    if (backupDuration > 5 * 60 * 1000) { // 5 minutes
      alerting.send('Database running on backup for >5 minutes');
    }
  }
}, 60000); // Check every minute
```

## Frontend Integration

### Show Database Status

```javascript
async function checkDatabaseStatus() {
  const response = await fetch('/db/status');
  const status = await response.json();
  
  const indicator = document.getElementById('db-indicator');
  
  if (status.currentSource === 'redshift') {
    indicator.innerHTML = '☁️ Cloud Database';
    indicator.className = 'status-primary';
  } else {
    indicator.innerHTML = '💾 Local Backup';
    indicator.className = 'status-backup';
  }
}

// Check every 30 seconds
setInterval(checkDatabaseStatus, 30000);
```

### Show Warning in UI

```javascript
async function loadCallHistory() {
  const response = await fetch('/api/calls/history');
  const data = await response.json();
  
  // Show warning if using backup
  if (data.source === 'sqlite') {
    showWarning('⚠️ Using local backup database - Some data may be out of sync');
  }
  
  displayCalls(data.calls);
}
```

## Troubleshooting

### Issue: Always using SQLite

**Check**:
```bash
curl http://localhost:8000/db/status
```

**Possible causes**:
1. Redshift not configured (check `.env`)
2. Redshift credentials wrong
3. Network/firewall blocking connection
4. Redshift cluster stopped/deleted

**Solution**:
1. Check `.env` has all REDSHIFT_* variables
2. Test connection manually:
   ```bash
   psql -h your-cluster.redshift.amazonaws.com -U admin -d crm_db
   ```
3. Check AWS console - is cluster running?
4. Check security groups allow your IP

### Issue: Both databases unavailable

**Check logs**:
```bash
tail -100 server.log | grep -i error
```

**Likely causes**:
1. SQLite file missing or corrupted
2. File permissions issue
3. Disk full

**Solution**:
```bash
# Check SQLite file exists
ls -la local_crm.db

# Try recreating database
npm run setup-db  # If this script exists
```

### Issue: Switching back and forth rapidly

**Symptom**: Logs show constant switching between databases

**Cause**: Intermittent network issues or Redshift instability

**Solution**:
1. Increase `redshiftCheckInterval` to 60000 (1 minute)
2. Force SQLite mode during troubleshooting:
   ```bash
   curl -X POST http://localhost:8000/db/force-sqlite
   ```

## Summary

✅ **Seamless Fallback**: Automatically switches to SQLite if Redshift fails  
✅ **Automatic Recovery**: Switches back when Redshift is available  
✅ **Zero Downtime**: Service never stops  
✅ **Transparent**: API responses include source information  
✅ **Monitorable**: All events logged and exposed via API  
✅ **Testable**: Endpoints to force fallback for testing  

The fallback system ensures your Nova Sonic API remains operational even during AWS outages or network issues, providing a robust and reliable service for users.

