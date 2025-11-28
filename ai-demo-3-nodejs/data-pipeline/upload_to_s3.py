#!/usr/bin/env python3
"""
Upload HCP/HCO data to S3 for Glue job processing.

Usage:
    python upload_to_s3.py --bucket my-bucket --prefix test-data/
"""

import argparse
import json
import os
import sys
from datetime import datetime
import boto3
from botocore.exceptions import ClientError

# Default S3 configuration (will be replaced with actual values from Prateek)
DEFAULT_S3_BUCKET = "PLACEHOLDER-BUCKET-FROM-PRATEEK"
DEFAULT_S3_PREFIX = "nova-sonic-crm-data/"

# Sample HCP data matching the SQLite schema
SAMPLE_HCPS = [
    {"hcp_id": "0013K000013ez2RQAQ", "name": "Dr. William Harper", "hco_id": None},
    {"hcp_id": "0013K000013ez2SQAQ", "name": "Dr. Susan Carter", "hco_id": None},
    {"hcp_id": "0013K000013ez2TQAQ", "name": "Dr. James Lawson", "hco_id": None},
    {"hcp_id": "0013K000013ez2UQAQ", "name": "Dr. Emily Hughes", "hco_id": None},
    {"hcp_id": "0013K000013ez2VQAQ", "name": "Dr. Richard Thompson", "hco_id": None},
    {"hcp_id": "0013K000013ez2WQAQ", "name": "Dr. Sarah Phillips", "hco_id": None},
    {"hcp_id": "0013K000013ez2XQAQ", "name": "Dr. John Anderson", "hco_id": None},
    {"hcp_id": "0013K000013ez2YQAQ", "name": "Dr. Lisa Collins", "hco_id": None},
    {"hcp_id": "0013K000013ez2ZQAQ", "name": "Dr. David Harris", "hco_id": None},
    {"hcp_id": "0013K000013ez2aQAA", "name": "Dr. Amy Scott", "hco_id": None},
    {"hcp_id": "0013K000013ez2bQAA", "name": "Dr. Olivia Wells", "hco_id": None},
    {"hcp_id": "0013K000013ez2cQAA", "name": "Dr. Benjamin Stone", "hco_id": None},
    {"hcp_id": "0013K000013ez2dQAA", "name": "Dr. Grace Mitchell", "hco_id": None},
    {"hcp_id": "0013K000013ez2eQAA", "name": "Dr. Lucas Chang", "hco_id": None},
    {"hcp_id": "0013K000013ez2fQAA", "name": "Dr. Sophia Patel", "hco_id": None},
    {"hcp_id": "0013K000013ez2gQAA", "name": "Dr. Nathan Rivera", "hco_id": None},
    {"hcp_id": "0013K000013ez2hQAA", "name": "Dr. Karina Soto", "hco_id": None},
]

SAMPLE_HCOS = [
    {"hco_id": "HCO001", "name": "Memorial Hospital"},
    {"hco_id": "HCO002", "name": "City Medical Center"},
    {"hco_id": "HCO003", "name": "Regional Healthcare Group"},
    {"hco_id": "HCO004", "name": "St. Mary's Hospital"},
]

SAMPLE_CALLS = [
    {
        "call_pk": "CALL001",
        "call_channel": "phone",
        "discussion_topic": "Product efficacy discussion",
        "status": "completed",
        "account": "Dr. William Harper",
        "id": "0013K000013ez2RQAQ",
        "adverse_event": False,
        "adverse_event_details": None,
        "noncompliance_event": False,
        "noncompliance_description": None,
        "call_notes": "Discussed latest clinical trials and product benefits",
        "call_date": "2025-01-15",
        "call_time": "14:30",
        "product": "MedProduct A",
        "followup_task_type": "send_literature",
        "followup_description": "Send latest clinical trial results",
        "followup_due_date": "2025-01-20",
        "followup_assigned_to": "Rep Team A",
    }
]


def upload_data_to_s3(bucket, prefix, data, filename):
    """Upload data as JSON to S3."""
    s3_client = boto3.client('s3')
    
    key = f"{prefix}{filename}"
    
    try:
        # Convert data to JSON
        json_data = json.dumps(data, indent=2)
        
        # Upload to S3
        s3_client.put_object(
            Bucket=bucket,
            Key=key,
            Body=json_data.encode('utf-8'),
            ContentType='application/json',
            Metadata={
                'uploaded_at': datetime.utcnow().isoformat(),
                'record_count': str(len(data))
            }
        )
        
        print(f"✅ Uploaded {len(data)} records to s3://{bucket}/{key}")
        return True
        
    except ClientError as e:
        print(f"❌ Failed to upload {filename}: {e}")
        return False


def create_manifest(bucket, prefix, files):
    """Create a manifest file for Glue to track data files."""
    s3_client = boto3.client('s3')
    
    manifest = {
        "version": "1.0",
        "created_at": datetime.utcnow().isoformat(),
        "bucket": bucket,
        "prefix": prefix,
        "files": files,
        "schema_version": "1.0"
    }
    
    key = f"{prefix}manifest.json"
    
    try:
        s3_client.put_object(
            Bucket=bucket,
            Key=key,
            Body=json.dumps(manifest, indent=2).encode('utf-8'),
            ContentType='application/json'
        )
        print(f"✅ Created manifest at s3://{bucket}/{key}")
        return True
    except ClientError as e:
        print(f"❌ Failed to create manifest: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description='Upload CRM data to S3 for Glue processing'
    )
    parser.add_argument(
        '--bucket',
        default=DEFAULT_S3_BUCKET,
        help=f'S3 bucket name (default: {DEFAULT_S3_BUCKET})'
    )
    parser.add_argument(
        '--prefix',
        default=DEFAULT_S3_PREFIX,
        help=f'S3 prefix/folder (default: {DEFAULT_S3_PREFIX})'
    )
    parser.add_argument(
        '--profile',
        help='AWS profile to use (optional)'
    )
    
    args = parser.parse_args()
    
    # Configure AWS session if profile provided
    if args.profile:
        boto3.setup_default_session(profile_name=args.profile)
    
    # Ensure prefix ends with /
    prefix = args.prefix if args.prefix.endswith('/') else f"{args.prefix}/"
    
    print("=" * 80)
    print("📦 Uploading CRM Data to S3")
    print("=" * 80)
    print(f"Bucket: {args.bucket}")
    print(f"Prefix: {prefix}")
    print("=" * 80)
    
    if args.bucket == DEFAULT_S3_BUCKET:
        print("\n⚠️  WARNING: Using placeholder bucket name!")
        print("   Update DEFAULT_S3_BUCKET or use --bucket flag with actual bucket from Prateek\n")
    
    # Upload datasets
    files = []
    
    if upload_data_to_s3(args.bucket, prefix, SAMPLE_HCPS, "hcp_data.json"):
        files.append({"name": "hcp_data.json", "table": "hcp", "records": len(SAMPLE_HCPS)})
    
    if upload_data_to_s3(args.bucket, prefix, SAMPLE_HCOS, "hco_data.json"):
        files.append({"name": "hco_data.json", "table": "hco", "records": len(SAMPLE_HCOS)})
    
    if upload_data_to_s3(args.bucket, prefix, SAMPLE_CALLS, "calls_data.json"):
        files.append({"name": "calls_data.json", "table": "calls", "records": len(SAMPLE_CALLS)})
    
    # Create manifest
    create_manifest(args.bucket, prefix, files)
    
    print("\n" + "=" * 80)
    print("✅ Upload complete!")
    print("=" * 80)
    print(f"\nNext steps:")
    print(f"1. Update S3 bucket in glue_job.py")
    print(f"2. Run Glue job with Prateek & Abhinav")
    print(f"3. Verify data in target database")
    print("=" * 80)


if __name__ == "__main__":
    main()

