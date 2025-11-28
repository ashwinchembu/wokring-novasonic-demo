#!/bin/bash
# Refresh CRM data from S3 using AWS Glue
# Usage: ./refresh_data.sh [full|incremental]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Configuration (update these after getting values from Prateek)
S3_BUCKET="${S3_BUCKET:-PLACEHOLDER-BUCKET-FROM-PRATEEK}"
S3_PREFIX="${S3_PREFIX:-nova-sonic-crm-data/}"
GLUE_JOB_NAME="${GLUE_JOB_NAME:-nova-sonic-data-loader}"
TARGET_DB_TYPE="${TARGET_DB_TYPE:-redshift}"
LOAD_MODE="${1:-full}"  # full or incremental

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "================================================================================"
echo "🔄 Refreshing CRM Data from S3"
echo "================================================================================"
echo "S3 Bucket: $S3_BUCKET"
echo "S3 Prefix: $S3_PREFIX"
echo "Glue Job: $GLUE_JOB_NAME"
echo "Target DB: $TARGET_DB_TYPE"
echo "Load Mode: $LOAD_MODE"
echo "================================================================================"

# Check if bucket is still placeholder
if [ "$S3_BUCKET" = "PLACEHOLDER-BUCKET-FROM-PRATEEK" ]; then
    echo -e "${YELLOW}⚠️  WARNING: Using placeholder S3 bucket!${NC}"
    echo -e "${YELLOW}   Update S3_BUCKET environment variable or edit this script${NC}"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Step 1: Upload fresh data to S3 (optional)
echo ""
echo "📤 Step 1: Upload data to S3"
echo "--------------------------------------------------------------------------------"
read -p "Upload fresh data to S3? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    python3 "$SCRIPT_DIR/upload_to_s3.py" \
        --bucket "$S3_BUCKET" \
        --prefix "$S3_PREFIX"
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Failed to upload data to S3${NC}"
        exit 1
    fi
else
    echo "⏭️  Skipping S3 upload"
fi

# Step 2: Run Glue job
echo ""
echo "🚀 Step 2: Run Glue Job"
echo "--------------------------------------------------------------------------------"
echo "Starting Glue job: $GLUE_JOB_NAME"

# Start Glue job
JOB_RUN_ID=$(aws glue start-job-run \
    --job-name "$GLUE_JOB_NAME" \
    --arguments "{
        \"--S3_BUCKET\":\"$S3_BUCKET\",
        \"--S3_PREFIX\":\"$S3_PREFIX\",
        \"--TARGET_DB_TYPE\":\"$TARGET_DB_TYPE\",
        \"--LOAD_MODE\":\"$LOAD_MODE\"
    }" \
    --query 'JobRunId' \
    --output text)

if [ -z "$JOB_RUN_ID" ]; then
    echo -e "${RED}❌ Failed to start Glue job${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Glue job started: $JOB_RUN_ID${NC}"

# Step 3: Monitor job progress
echo ""
echo "👀 Step 3: Monitor Job Progress"
echo "--------------------------------------------------------------------------------"

while true; do
    STATUS=$(aws glue get-job-run \
        --job-name "$GLUE_JOB_NAME" \
        --run-id "$JOB_RUN_ID" \
        --query 'JobRun.JobRunState' \
        --output text)
    
    echo "Status: $STATUS"
    
    case $STATUS in
        SUCCEEDED)
            echo -e "${GREEN}✅ Glue job completed successfully!${NC}"
            break
            ;;
        FAILED|STOPPED|TIMEOUT)
            echo -e "${RED}❌ Glue job failed with status: $STATUS${NC}"
            
            # Get error message
            ERROR=$(aws glue get-job-run \
                --job-name "$GLUE_JOB_NAME" \
                --run-id "$JOB_RUN_ID" \
                --query 'JobRun.ErrorMessage' \
                --output text)
            
            echo "Error: $ERROR"
            exit 1
            ;;
        RUNNING|STARTING|STOPPING)
            sleep 10
            ;;
    esac
done

# Step 4: Verify data
echo ""
echo "✓ Step 4: Verify Data"
echo "--------------------------------------------------------------------------------"
echo "Run verification queries to check data loaded correctly"
echo ""
echo "Example SQL queries:"
echo "  SELECT COUNT(*) FROM hcp;"
echo "  SELECT COUNT(*) FROM hco;"
echo "  SELECT COUNT(*) FROM calls;"
echo ""

# Get job execution details
aws glue get-job-run \
    --job-name "$GLUE_JOB_NAME" \
    --run-id "$JOB_RUN_ID" \
    --query 'JobRun.[StartedOn,CompletedOn,ExecutionTime]' \
    --output table

echo ""
echo "================================================================================"
echo -e "${GREEN}✅ Data refresh complete!${NC}"
echo "================================================================================"
echo "Job Run ID: $JOB_RUN_ID"
echo "View logs: https://console.aws.amazon.com/glue/home#/job/runs/$JOB_RUN_ID"
echo "================================================================================"

