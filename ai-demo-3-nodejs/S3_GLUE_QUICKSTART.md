# S3 + Glue Quick Start Guide

**Purpose**: Set up automated data refresh from S3 to your database using AWS Glue.

## For the Setup Session with Prateek & Abhinav

### Prerequisites (Before the Meeting)

1. **AWS Access**
   - Ensure you have AWS credentials configured
   - Test with: `aws sts get-caller-identity`

2. **Python Setup**
   ```bash
   pip install boto3
   ```

3. **Get Bucket Info**
   - Ask Prateek for the S3 bucket name
   - Write it down: `__________________`

### During the Meeting

#### Step 1: Verify S3 Access (2 minutes)

```bash
# Test access to the bucket
export S3_BUCKET=<bucket-from-prateek>
aws s3 ls s3://$S3_BUCKET/
```

**Expected**: You should see a list of files/folders
**If Error**: Check AWS credentials or ask for bucket permissions

#### Step 2: Upload Test Data (5 minutes)

```bash
cd /Users/ashwin/zs/wokring-novasonic-demo/ai-demo-3-nodejs/data-pipeline

# Upload sample data
python upload_to_s3.py --bucket $S3_BUCKET --prefix nova-sonic-crm-data/
```

**Expected Output**:
```
✅ Uploaded 17 records to s3://bucket/nova-sonic-crm-data/hcp_data.json
✅ Uploaded 4 records to s3://bucket/nova-sonic-crm-data/hco_data.json
✅ Uploaded 1 records to s3://bucket/nova-sonic-crm-data/calls_data.json
✅ Created manifest at s3://bucket/nova-sonic-crm-data/manifest.json
```

#### Step 3: Run Glue Job (10 minutes)

They will either:

**Option A**: Run the job from AWS Console
- You watch and take notes
- Note the Job Run ID: `__________________`

**Option B**: Run via command line
```bash
# They'll provide the exact command
aws glue start-job-run --job-name <job-name> --arguments '{"--S3_BUCKET":"..."}'
```

Monitor progress:
```bash
# Check job status
aws glue get-job-run --job-name <job-name> --run-id <run-id>
```

#### Step 4: Verify Data (5 minutes)

Connect to database and check:
```sql
SELECT COUNT(*) FROM hcp;    -- Should be 17
SELECT COUNT(*) FROM hco;    -- Should be 4
SELECT COUNT(*) FROM calls;  -- Should be 1
```

### After the Meeting

#### Update Backend Configuration

Edit `upload_to_s3.py`:
```python
# Line 11-12
DEFAULT_S3_BUCKET = "your-actual-bucket-name"  # Replace this!
DEFAULT_S3_PREFIX = "nova-sonic-crm-data/"
```

Edit `refresh_data.sh`:
```bash
# Line 7-8
S3_BUCKET="${S3_BUCKET:-your-actual-bucket-name}"  # Replace this!
S3_PREFIX="${S3_PREFIX:-nova-sonic-crm-data/}"
```

#### Test Data Refresh

```bash
cd data-pipeline

# Test full refresh
./refresh_data.sh full
```

This should:
1. Upload fresh data to S3
2. Run Glue job
3. Wait for completion
4. Show success message

## Ongoing Usage

### When Test Data Changes in S3

Just run:
```bash
./refresh_data.sh full
```

The script will:
- Detect changes in S3
- Run Glue job to reload data
- Update your database
- Show completion status

### Schedule Automatic Refreshes

Add to crontab:
```bash
# Edit crontab
crontab -e

# Add this line (runs daily at 2 AM):
0 2 * * * cd /path/to/data-pipeline && ./refresh_data.sh full >> /var/log/data-refresh.log 2>&1
```

## Troubleshooting

### Upload Fails

**Error**: `NoSuchBucket` or `AccessDenied`

**Fix**:
```bash
# Check bucket name
aws s3 ls s3://$S3_BUCKET/

# Check credentials
aws sts get-caller-identity
```

### Glue Job Fails

**Check logs**:
```bash
# View Glue job logs
aws logs tail /aws-glue/jobs/<job-name> --follow
```

**Common issues**:
- Wrong S3 path → Check S3_PREFIX
- No Redshift access → Verify VPC/security groups
- Schema mismatch → Check data format matches schema

### Data Not Appearing

**Check**:
1. Glue job succeeded (not just started)
2. Database connection is to correct endpoint
3. Schema/table names match exactly

## Questions to Ask During Setup

- [ ] What's the exact S3 bucket name?
- [ ] What's the Glue job name?
- [ ] Do we need VPN/bastion to access Redshift?
- [ ] What's the refresh schedule? (daily, weekly, on-demand)
- [ ] Who gets notified if job fails?
- [ ] What's the retention policy for S3 data?

## Files Created

```
data-pipeline/
├── upload_to_s3.py          # Uploads data to S3
├── glue_job.py              # AWS Glue ETL script
├── refresh_data.sh          # Orchestration script
└── S3_GLUE_SETUP.md         # Detailed documentation
```

## Next Steps After Setup

1. ✅ Test manual refresh: `./refresh_data.sh full`
2. ✅ Update backend to use refreshed data
3. ✅ Set up automated schedule (cron or EventBridge)
4. ✅ Configure monitoring/alerts
5. ✅ Document for team

## Quick Reference

```bash
# Upload data
python upload_to_s3.py --bucket <bucket>

# Run Glue job
aws glue start-job-run --job-name <job-name>

# Check status
aws glue get-job-run --job-name <name> --run-id <id>

# Full refresh
./refresh_data.sh full

# Incremental load
./refresh_data.sh incremental
```

---

**During Setup Session**: Keep this file open and check off items as you complete them!

