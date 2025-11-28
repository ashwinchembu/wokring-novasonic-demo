# S3 + AWS Glue Data Pipeline Setup

This guide covers setting up the automated data pipeline from S3 to your database using AWS Glue.

## Overview

The pipeline consists of:
1. **S3 Storage**: JSON data files stored in S3 bucket
2. **AWS Glue Job**: ETL job that reads from S3 and loads to target database
3. **Refresh Script**: Orchestrates upload and Glue job execution

```
┌─────────────┐      ┌──────────────┐      ┌──────────────┐
│   Local     │      │      S3      │      │  AWS Glue    │      ┌────────────┐
│   Data      │─────>│   Bucket     │─────>│     Job      │─────>│  Redshift  │
│   (JSON)    │upload│              │read  │   (ETL)      │write │            │
└─────────────┘      └──────────────┘      └──────────────┘      └────────────┘
```

## Prerequisites

### 1. AWS Credentials
```bash
# Ensure AWS CLI is configured
aws configure

# Or use environment variables
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export AWS_REGION=us-east-1
```

### 2. S3 Bucket Access
Get the S3 bucket name and prefix from Prateek/Abhinav:
```bash
export S3_BUCKET=<bucket-name-from-prateek>
export S3_PREFIX=nova-sonic-crm-data/
```

### 3. Install Python Dependencies
```bash
pip install boto3
```

## Quick Start

### Step 1: Update Configuration

Edit the S3 bucket in `upload_to_s3.py`:
```python
DEFAULT_S3_BUCKET = "your-actual-bucket-name"  # Replace placeholder
```

### Step 2: Upload Data to S3

Upload sample data:
```bash
python upload_to_s3.py --bucket <bucket-name> --prefix nova-sonic-crm-data/
```

Or use environment variables:
```bash
export S3_BUCKET=your-bucket
python upload_to_s3.py
```

### Step 3: Deploy Glue Job

#### Option A: Using AWS Console
1. Go to AWS Glue Console
2. Create new ETL job
3. Upload `glue_job.py` as the script
4. Configure job parameters (see below)

#### Option B: Using AWS CLI
```bash
# Upload Glue script to S3
aws s3 cp glue_job.py s3://your-bucket/scripts/glue_job.py

# Create Glue job
aws glue create-job \
  --name nova-sonic-data-loader \
  --role <your-glue-service-role-arn> \
  --command Name=glueetl,ScriptLocation=s3://your-bucket/scripts/glue_job.py,PythonVersion=3 \
  --default-arguments '{
    "--S3_BUCKET":"your-bucket",
    "--S3_PREFIX":"nova-sonic-crm-data/",
    "--TARGET_DB_TYPE":"redshift",
    "--LOAD_MODE":"full",
    "--enable-metrics":"",
    "--enable-continuous-cloudwatch-log":"true"
  }' \
  --max-capacity 2.0 \
  --timeout 60
```

### Step 4: Run the Pipeline

Full refresh (replaces all data):
```bash
./refresh_data.sh full
```

Incremental load (appends new data):
```bash
./refresh_data.sh incremental
```

## Working with Prateek & Abhinav

### During the Setup Session

1. **Get S3 bucket details**:
   ```bash
   # They will provide:
   S3_BUCKET=<actual-bucket-name>
   S3_PREFIX=<prefix-path>/
   ```

2. **Verify S3 access**:
   ```bash
   aws s3 ls s3://$S3_BUCKET/$S3_PREFIX
   ```

3. **Upload test data together**:
   ```bash
   python upload_to_s3.py --bucket $S3_BUCKET --prefix $S3_PREFIX
   ```

4. **Run Glue job**:
   ```bash
   # They will trigger the job or help you run:
   ./refresh_data.sh full
   ```

5. **Verify data loaded**:
   ```sql
   -- Connect to Redshift and run:
   SELECT COUNT(*) FROM hcp;
   SELECT COUNT(*) FROM hco;
   SELECT COUNT(*) FROM calls;
   ```

## Data Schema

### HCP (Healthcare Professionals)
```json
{
  "hcp_id": "string",
  "name": "string",
  "hco_id": "string (nullable)"
}
```

### HCO (Healthcare Organizations)
```json
{
  "hco_id": "string",
  "name": "string"
}
```

### Calls
```json
{
  "call_pk": "string",
  "call_channel": "string",
  "discussion_topic": "string",
  "status": "string",
  "account": "string",
  "id": "string",
  "adverse_event": "boolean",
  "call_notes": "string",
  "call_date": "date",
  "product": "string",
  "followup_task_type": "string",
  "followup_due_date": "date"
}
```

## Updating Data When S3 Changes

### Option 1: Automated Refresh (Recommended)
Set up a cron job or AWS EventBridge to run the refresh script daily:

```bash
# Add to crontab (run daily at 2 AM)
0 2 * * * /path/to/refresh_data.sh full >> /var/log/data-refresh.log 2>&1
```

### Option 2: Manual Refresh
When test data changes in S3:
```bash
# Just re-run the refresh script
./refresh_data.sh full
```

### Option 3: Lambda Trigger
Create an S3 Lambda trigger that runs Glue job when files change:

```python
# lambda_function.py
import boto3

def lambda_handler(event, context):
    glue = boto3.client('glue')
    
    # Start Glue job
    response = glue.start_job_run(
        JobName='nova-sonic-data-loader',
        Arguments={
            '--S3_BUCKET': 'your-bucket',
            '--S3_PREFIX': 'nova-sonic-crm-data/',
            '--LOAD_MODE': 'full'
        }
    )
    
    return {'statusCode': 200, 'body': f"Started job: {response['JobRunId']}"}
```

## Backend Integration

The Node.js backend automatically handles database fallback:

```javascript
// Backend already configured to use Redshift or SQLite
// No changes needed when Glue job refreshes Redshift data

// Check which database is active:
curl http://localhost:8000/db/healthz
```

When Glue job completes, backend will automatically use the refreshed Redshift data.

## Troubleshooting

### Upload Fails
```bash
# Check S3 permissions
aws s3 ls s3://$S3_BUCKET/

# Verify AWS credentials
aws sts get-caller-identity
```

### Glue Job Fails
```bash
# View Glue job logs
aws glue get-job-run \
  --job-name nova-sonic-data-loader \
  --run-id <run-id>

# Check CloudWatch logs
aws logs tail /aws-glue/jobs/nova-sonic-data-loader --follow
```

### Data Not Loading
```sql
-- Check if tables exist in Redshift
SELECT * FROM information_schema.tables 
WHERE table_schema = 'public';

-- Check row counts
SELECT 
  'hcp' as table_name, COUNT(*) as rows FROM hcp
UNION ALL
SELECT 'hco', COUNT(*) FROM hco
UNION ALL
SELECT 'calls', COUNT(*) FROM calls;
```

## Files Overview

- `upload_to_s3.py` - Uploads JSON data to S3
- `glue_job.py` - AWS Glue ETL job script
- `refresh_data.sh` - Orchestration script for full pipeline
- `S3_GLUE_SETUP.md` - This documentation

## Next Steps

1. ✅ Get S3 bucket details from Prateek
2. ✅ Run upload script to populate S3
3. ✅ Deploy Glue job with team
4. ✅ Run first data load together
5. ✅ Set up automated refresh schedule
6. ✅ Test backend with refreshed data

## Questions for Team

- [ ] What's the actual S3 bucket name and prefix?
- [ ] Which AWS region should we use?
- [ ] What's the Glue service role ARN?
- [ ] Do we need VPC configuration for Redshift access?
- [ ] What's the refresh schedule? (daily, weekly, on-demand?)
- [ ] Should we set up SNS alerts for job failures?

