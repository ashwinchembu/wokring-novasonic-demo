"""
AWS Glue Job: Load CRM data from S3 to Redshift/Database

This job:
1. Reads JSON files from S3
2. Transforms data to match database schema
3. Loads data into target database (Redshift or other)
4. Handles incremental updates and full refreshes

To deploy:
    aws glue create-job --name nova-sonic-data-loader \
        --role <glue-service-role> \
        --command Name=glueetl,ScriptLocation=s3://<bucket>/scripts/glue_job.py \
        --default-arguments '{"--S3_BUCKET":"<bucket>","--S3_PREFIX":"nova-sonic-crm-data/"}'
"""

import sys
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job
from pyspark.sql import DataFrame
from pyspark.sql.functions import col, lit, current_timestamp
from datetime import datetime

# Get job parameters
args = getResolvedOptions(sys.argv, [
    'JOB_NAME',
    'S3_BUCKET',
    'S3_PREFIX',
    'TARGET_DB_TYPE',  # 'redshift' or 'sqlite'
    'LOAD_MODE'  # 'full' or 'incremental'
])

# Initialize Glue context
sc = SparkContext()
glueContext = GlueContext(sc)
spark = glueContext.spark_session
job = Job(glueContext)
job.init(args['JOB_NAME'], args)

# Configuration
S3_BUCKET = args['S3_BUCKET']
S3_PREFIX = args['S3_PREFIX']
TARGET_DB_TYPE = args.get('TARGET_DB_TYPE', 'redshift')
LOAD_MODE = args.get('LOAD_MODE', 'full')

# S3 paths
HCP_PATH = f"s3://{S3_BUCKET}/{S3_PREFIX}hcp_data.json"
HCO_PATH = f"s3://{S3_BUCKET}/{S3_PREFIX}hco_data.json"
CALLS_PATH = f"s3://{S3_BUCKET}/{S3_PREFIX}calls_data.json"

print("=" * 80)
print(f"🚀 Starting Glue Job: {args['JOB_NAME']}")
print("=" * 80)
print(f"S3 Bucket: {S3_BUCKET}")
print(f"S3 Prefix: {S3_PREFIX}")
print(f"Target DB: {TARGET_DB_TYPE}")
print(f"Load Mode: {LOAD_MODE}")
print("=" * 80)


def load_json_from_s3(path: str, table_name: str) -> DataFrame:
    """Load JSON data from S3 into a Spark DataFrame."""
    try:
        df = spark.read.json(path)
        record_count = df.count()
        print(f"✅ Loaded {record_count} records from {table_name} ({path})")
        return df
    except Exception as e:
        print(f"❌ Failed to load {table_name} from {path}: {e}")
        return None


def write_to_redshift(df: DataFrame, table_name: str, mode: str = "overwrite"):
    """Write DataFrame to Redshift."""
    try:
        # Add metadata columns
        df_with_meta = df.withColumn("loaded_at", current_timestamp())
        df_with_meta.withColumn("job_name", lit(args['JOB_NAME']))
        
        # Write to Redshift
        glueContext.write_dynamic_frame.from_options(
            frame=DynamicFrame.fromDF(df_with_meta, glueContext, table_name),
            connection_type="redshift",
            connection_options={
                "redshiftTmpDir": f"s3://{S3_BUCKET}/temp/",
                "useConnectionProperties": "true",
                "dbtable": table_name,
                "connectionName": "redshift-connection"
            },
            transformation_ctx=f"write_{table_name}"
        )
        
        print(f"✅ Wrote {df_with_meta.count()} records to Redshift table: {table_name}")
        return True
        
    except Exception as e:
        print(f"❌ Failed to write to Redshift table {table_name}: {e}")
        return False


def write_to_local_db(df: DataFrame, table_name: str, mode: str = "overwrite"):
    """Write DataFrame to local database (for testing)."""
    try:
        # For local testing, could write to SQLite or other local DB
        # This is a placeholder - actual implementation depends on target
        df.write.mode(mode).format("jdbc").option(
            "url", "jdbc:sqlite:/path/to/local_crm.db"
        ).option("dbtable", table_name).save()
        
        print(f"✅ Wrote {df.count()} records to local table: {table_name}")
        return True
        
    except Exception as e:
        print(f"❌ Failed to write to local table {table_name}: {e}")
        return False


def process_hcp_data(df: DataFrame) -> DataFrame:
    """Transform HCP data to match target schema."""
    return df.select(
        col("hcp_id").cast("string"),
        col("name").cast("string"),
        col("hco_id").cast("string")
    )


def process_hco_data(df: DataFrame) -> DataFrame:
    """Transform HCO data to match target schema."""
    return df.select(
        col("hco_id").cast("string"),
        col("name").cast("string")
    )


def process_calls_data(df: DataFrame) -> DataFrame:
    """Transform calls data to match target schema."""
    return df.select(
        col("call_pk").cast("string"),
        col("call_channel").cast("string"),
        col("discussion_topic").cast("string"),
        col("status").cast("string"),
        col("account").cast("string"),
        col("id").cast("string"),
        col("adverse_event").cast("boolean"),
        col("adverse_event_details").cast("string"),
        col("noncompliance_event").cast("boolean"),
        col("noncompliance_description").cast("string"),
        col("call_notes").cast("string"),
        col("call_date").cast("date"),
        col("call_time").cast("string"),
        col("product").cast("string"),
        col("followup_task_type").cast("string"),
        col("followup_description").cast("string"),
        col("followup_due_date").cast("date"),
        col("followup_assigned_to").cast("string")
    )


def main():
    """Main ETL pipeline."""
    
    # Load data from S3
    print("\n📥 Loading data from S3...")
    hcp_df = load_json_from_s3(HCP_PATH, "hcp")
    hco_df = load_json_from_s3(HCO_PATH, "hco")
    calls_df = load_json_from_s3(CALLS_PATH, "calls")
    
    if not hcp_df or not hco_df or not calls_df:
        print("❌ Failed to load all required datasets")
        sys.exit(1)
    
    # Transform data
    print("\n🔄 Transforming data...")
    hcp_transformed = process_hcp_data(hcp_df)
    hco_transformed = process_hco_data(hco_df)
    calls_transformed = process_calls_data(calls_df)
    
    # Write to target database
    print(f"\n💾 Writing to {TARGET_DB_TYPE}...")
    
    write_func = write_to_redshift if TARGET_DB_TYPE == 'redshift' else write_to_local_db
    mode = "overwrite" if LOAD_MODE == "full" else "append"
    
    success = True
    success &= write_func(hco_transformed, "hco", mode)
    success &= write_func(hcp_transformed, "hcp", mode)
    success &= write_func(calls_transformed, "calls", mode)
    
    if success:
        print("\n" + "=" * 80)
        print("✅ Glue job completed successfully!")
        print("=" * 80)
    else:
        print("\n" + "=" * 80)
        print("❌ Glue job completed with errors")
        print("=" * 80)
        sys.exit(1)


if __name__ == "__main__":
    main()
    job.commit()

