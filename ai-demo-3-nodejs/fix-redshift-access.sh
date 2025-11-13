#!/bin/bash
# Automatic Redshift Security Group Fix Script

set -e

echo "🔧 Fixing Redshift Access..."
echo ""

# Get current IP
echo "Getting your IP address..."
MY_IP=$(curl -s https://checkip.amazonaws.com)
echo "✅ Your IP: $MY_IP"
echo ""

# Get the security group ID
echo "Finding Redshift security group..."
SG_ID=$(aws redshift-serverless get-workgroup \
  --workgroup-name pharma-agent-wg \
  --region us-east-1 \
  --query 'workgroup.securityGroupIds[0]' \
  --output text 2>&1)

if [ $? -ne 0 ]; then
  echo "❌ Failed to get workgroup info. Make sure:"
  echo "   1. AWS CLI is configured (aws configure)"
  echo "   2. You have permissions to access Redshift"
  echo "   3. The workgroup 'pharma-agent-wg' exists"
  echo ""
  echo "Error: $SG_ID"
  exit 1
fi

echo "✅ Security Group ID: $SG_ID"
echo ""

# Add the rule
echo "Adding your IP to security group..."
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 5439 \
  --cidr ${MY_IP}/32 \
  --region us-east-1 \
  --description "Dev machine - $(whoami)" 2>&1

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Security group updated successfully!"
  echo ""
  echo "Testing connection in 5 seconds..."
  sleep 5
  
  if nc -zv -w 5 pharma-agent-wg.505679504671.us-east-1.redshift-serverless.amazonaws.com 5439 2>&1; then
    echo ""
    echo "✅ Connection successful!"
    echo ""
    echo "Now testing Redshift with Node.js..."
    npx tsx test-redshift-debug.ts
  else
    echo ""
    echo "⚠️  Connection still failing. You may need to:"
    echo "   1. Wait a few more seconds for AWS to propagate changes"
    echo "   2. Check if there are multiple security groups"
    echo "   3. Check VPC network ACLs"
  fi
else
  echo ""
  echo "⚠️  Note: The rule might already exist (this is OK)"
  echo "Testing connection..."
  sleep 2
  
  if nc -zv -w 5 pharma-agent-wg.505679504671.us-east-1.redshift-serverless.amazonaws.com 5439 2>&1; then
    echo ""
    echo "✅ Connection successful!"
    echo ""
    echo "Testing Redshift with Node.js..."
    npx tsx test-redshift-debug.ts
  else
    echo ""
    echo "❌ Connection still failing"
  fi
fi

