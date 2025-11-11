# Fix: Claude "Operation not allowed" Error

## Problem
Claude models are listed as available but API calls fail with `ValidationException: Operation not allowed`.

## Root Cause
While models appear in the list, **API access has not been granted** in AWS Bedrock console.

## Solution

### Option 1: Enable Claude Access in AWS Console (Recommended)

1. **Go to AWS Bedrock Console**:
   ```
   https://console.aws.amazon.com/bedrock/
   ```

2. **Navigate to Model Access**:
   - Click "Model access" in the left sidebar
   - Look for the "Access status" column

3. **Request Access for Claude Models**:
   - Find "Anthropic" section
   - Check if status shows "Access granted" or "Available to request"
   - If "Available to request", click "Manage model access"
   - Select the Claude models you want (recommended: Claude 3.5 Sonnet)
   - Click "Request model access"
   - Access is usually instant for Claude models

4. **Verify Access**:
   - Wait 1-2 minutes
   - Status should change to "Access granted" 
   - Now the APIs will work!

### Option 2: Use Nova Pro (Alternative)

Since Nova Sonic works, you can use Amazon Nova Pro for text conversations instead:

```bash
# In your .env file or environment:
export CLAUDE_MODEL_ID="amazon.nova-pro-v1:0"
```

### Option 3: Check IAM Permissions

If you have "Access granted" but still get errors, check IAM permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "arn:aws:bedrock:*::foundation-model/anthropic.*"
    }
  ]
}
```

## Testing

After enabling access, test with:

```bash
cd /Users/ashwin/zs/wokring-novasonic-demo/ai-demo-3-nodejs
node test-claude-invoke.js
```

You should see:
```
✅ Success! Streaming response:
Hi! [response from Claude]
```

## Quick Fix: Use Nova Pro Instead

If you want text mode to work immediately, I can modify the code to use Amazon Nova Pro (which you already have access to) instead of Claude.

Would you like me to:
1. Wait while you enable Claude access (takes 2-3 minutes)
2. Switch to Nova Pro for text mode (works immediately)

