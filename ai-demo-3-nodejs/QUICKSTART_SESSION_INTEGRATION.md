# Quick Start: Bedrock Session Integration

## 🚀 Getting Started in 5 Minutes

### 1. Install Dependencies

```bash
cd /Users/ashwin/zs/wokring-novasonic-demo/ai-demo-3-nodejs
npm install
```

This will install the new dependencies:
- `@aws-sdk/client-bedrock-agent-runtime`
- `moment`

### 2. Set Environment Variables

Add to your `.env` file (or create one):

```bash
# AWS Credentials (required)
AWS_ACCESS_KEY_ID=your-access-key-here
AWS_SECRET_ACCESS_KEY=your-secret-key-here
AWS_REGION=us-east-1

# LLM Model for call analysis (optional, defaults to Claude)
LLM_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0

# Server configuration
APP_PORT=8001
```

### 3. Start the Server

```bash
npm run dev
```

You should see:

```
=======================================================================
AI Demo 3 - Nova Sonic API (Node.js)
=======================================================================
Server: http://0.0.0.0:8001
AWS Region: us-east-1
Bedrock Model: amazon.nova-sonic-v1:0
=======================================================================
```

### 4. Open the UI

Navigate to:
```
http://localhost:8001/voice-test.html
```

### 5. Test the Integration

#### **Test 1: Complete Call Recording**

1. Click **"Start Session"**
2. Verify you see both session IDs:
   - Nova Sonic session
   - Bedrock session
3. Click **"Start Recording"**
4. Say into your microphone:
   > "I met with Dr. John Anderson today at 2pm to discuss Aspirin"
5. Click **"Stop Recording"**
6. Wait 3 seconds
7. Check the **"Call Log Data (Live)"** table
   - You should see all fields populated
   - HCP Name: Dr. John Anderson
   - HCP ID: 0013K000013ez2XQAQ
   - Date: (today's date)
   - Time: 14:00:00
   - Product: Aspirin

#### **Test 2: Fill Missing Information**

1. Click **"Start Session"** (new session)
2. Click **"Start Recording"**
3. Say:
   > "I met with Dr. Sarah Phillips"
4. Click **"Stop Recording"**
5. Wait 3 seconds
6. Check the transcript area - you should see:
   > ⚠️ Missing: CALL_DATE_NOT_FOUND, CALL_TIME_NOT_FOUND, PRODUCT_INFO_NOT_FOUND
7. Click **"Start Recording"** again
8. Say:
   > "It was today at 3pm and we discussed aspirin"
9. Click **"Stop Recording"**
10. Wait 3 seconds
11. Check the **"Call Log Data (Live)"** table - missing fields should now be filled

## 📊 What's Happening Behind the Scenes

```
User speaks → NovaSonic transcribes → Transcript buffered → Analysis triggered
                                                                    ↓
                                                          Bedrock Agent Runtime
                                                                    ↓
                                                    Claude extracts structured data
                                                                    ↓
                                                          UI updates with JSON
```

## 🔍 Verify It's Working

### Check Console Logs

Open browser console (F12) and look for:

```javascript
✅ Bedrock session established: <session-id>
📋 Buffering transcript: user: "I met with Dr. John Anderson..."
🔍 Analyzing call recording...
✅ Call analysis result: {callRecordingPayload: {...}, missingInformationEvents: []}
```

### Check Server Logs

In your terminal where you ran `npm run dev`, look for:

```
[info] BedrockSessionService initialized
[info] CallRecordingAnalyzer initialized with model: anthropic.claude-3-sonnet-20240229-v1:0
[info] Created Bedrock session: <session-id> for user: voice-user-<timestamp>
[info] Analyzing call recording for session: <session-id>
[info] Call recording analysis complete
```

### Check API Endpoints

Test endpoints directly:

```bash
# Test session establishment
curl -X POST http://localhost:8001/api/session/establish \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user"}'

# Should return:
# {"sessionId":"<session-id>","message":"Session established successfully"}
```

## 🎯 Expected Behavior

### First Pass Analysis

When you say: "I met with Dr. John Anderson today at 2pm to discuss Aspirin"

**Expected Output**:
```json
{
  "callRecordingPayload": {
    "accountName": "Dr. John Anderson",
    "accountId": "0013K000013ez2XQAQ",
    "call_date": "2025-11-15",
    "call_time": "14:00:00",
    "product_description": "Aspirin",
    "call_channel": "In Person",
    "discussion_notes": "Product discussion",
    "call_notes": "Met to discuss Aspirin",
    "status": "Saved",
    "activity": "",
    "attendees": [],
    "adverse_event": false,
    "adverse_event_details": null,
    "non_compliance_event": false,
    "non_compliance_description": "",
    "follow_up_description": "",
    "assigned_to": "",
    "due_date": ""
  },
  "missingInformationEvents": []
}
```

### Fill Missing Flow

**First utterance**: "I met with Dr. Smith"

**Response**:
```json
{
  "missingInformationEvents": [
    "CALL_DATE_NOT_FOUND",
    "CALL_TIME_NOT_FOUND",
    "PRODUCT_INFO_NOT_FOUND"
  ]
}
```

**Second utterance**: "It was today at 2pm"

**Response**:
```json
{
  "missingInformationEvents": [
    "PRODUCT_INFO_NOT_FOUND"
  ]
}
```

**Third utterance**: "We discussed Aspirin"

**Response**:
```json
{
  "missingInformationEvents": []
}
```

## 🛠️ Troubleshooting

### Problem: "Bedrock session not available"

**Solution**: Check your `.env` file has correct AWS credentials

```bash
# Verify credentials
echo $AWS_ACCESS_KEY_ID
echo $AWS_SECRET_ACCESS_KEY
```

### Problem: "Failed to analyze call recording"

**Solutions**:
1. Check you have access to Bedrock in your AWS account
2. Verify the model ID is correct in your region
3. Check IAM permissions for Bedrock Agent Runtime

### Problem: "HCP not found"

**Solution**: The HCP name must be in the predefined list. Available HCPs:
- Dr. William Harper
- Dr. Susan Carter
- Dr. James Lawson
- Dr. Emily Hughes
- Dr. Richard Thompson
- Dr. Sarah Phillips
- Dr. John Anderson
- Dr. Lisa Collins
- Dr. David Harris
- Dr. Amy Scott
- Dr. Olivia Wells
- Dr. Benjamin Stone
- Dr. Grace Mitchell
- Dr. Lucas Chang
- Dr. Sophia Patel
- Dr. Nathan Rivera
- Dr. Karina Soto

### Problem: Analysis not triggering

**Check**:
1. Are you seeing transcripts in the transcript area?
2. Are you waiting at least 3 seconds after stopping recording?
3. Check browser console for errors

## 📁 File Structure

Here's what was added/modified:

```
ai-demo-3-nodejs/
├── src/
│   ├── services/
│   │   ├── bedrockSessionService.ts      [NEW] - Session management
│   │   └── callRecordingAnalyzer.ts      [NEW] - Call analysis
│   ├── models/
│   │   └── callRecording.ts              [NEW] - Data models
│   ├── prompts/
│   │   └── callRecording.ts              [NEW] - Prompt templates
│   └── index.ts                          [MODIFIED] - Added 3 new endpoints
├── public/
│   └── voice-test.html                   [MODIFIED] - Added session integration
├── package.json                          [MODIFIED] - Added dependencies
└── SESSION_INTEGRATION.md                [NEW] - Full documentation
```

## 🎓 Next Steps

1. **Customize Prompts**: Edit `src/prompts/callRecording.ts` to change extraction logic
2. **Add HCPs**: Edit `src/prompting.ts` to add more healthcare professionals
3. **Store Data**: Add Redshift integration to persist extracted data
4. **Enhance UI**: Customize `public/voice-test.html` to show more details
5. **Production Deploy**: Add error handling, logging, and monitoring

## 📚 Learn More

- Full documentation: `SESSION_INTEGRATION.md`
- Architecture details: See "Architecture" section in full docs
- API reference: See "API Endpoints" section in full docs

## ✅ Success Checklist

- [ ] Server starts without errors
- [ ] UI loads at http://localhost:8001/voice-test.html
- [ ] Both sessions (Nova Sonic + Bedrock) are created
- [ ] Transcripts appear in transcript area
- [ ] Call log table populates automatically
- [ ] Missing information prompts appear correctly
- [ ] Follow-up utterances fill missing fields
- [ ] Console shows analysis logs

If all checked ✅ - you're good to go! 🎉

