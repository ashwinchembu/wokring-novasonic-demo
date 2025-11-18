# Bedrock Agent Runtime Session Integration for NovaSonic Voice Demo

## Overview

This implementation integrates AWS Bedrock Agent Runtime session management into the NovaSonic voice demo, enabling **persistent conversation history** and **multi-turn "fill missing info" flows** while keeping the existing audio/streaming logic completely intact.

## Architecture

### Key Design Principles

1. **Two Parallel Sessions**:
   - **NovaSonic Session**: Handles real-time bidirectional voice streaming
   - **Bedrock Session**: Manages conversation history and structured data extraction

2. **Non-Invasive Integration**:
   - All existing NovaSonic audio/streaming code remains unchanged
   - Session logic runs in parallel, triggered by transcript events
   - No breaking changes to the voice pipeline

3. **Text-Based Analysis**:
   - Uses transcripts from NovaSonic for analysis
   - Invokes Claude for structured data extraction
   - Maintains chat history for context-aware follow-ups

## Implementation Details

### Backend Components

#### 1. **Bedrock Session Service** (`src/services/bedrockSessionService.ts`)

Manages Bedrock Agent Runtime sessions and invocations:

- `createSession(userId)` - Creates a new Bedrock session
- `createInvocation(sessionId)` - Creates an invocation within a session
- `putInvocationStep(sessionId, invocationId, role, message)` - Stores conversation turns
- `buildChatHistory(sessionId, invocationId)` - Retrieves full conversation history
- `getLatestInvocationId(sessionId)` - Gets the most recent invocation

**Key Features**:
- Wraps all Bedrock Agent Runtime commands
- Stores conversation turns as JSON in invocation steps
- Builds chat history for context-aware LLM calls

#### 2. **Call Recording Analyzer** (`src/services/callRecordingAnalyzer.ts`)

Analyzes call transcripts and extracts structured data:

- `analyzeCallRecording(sessionId, inputText)` - First-pass analysis
- `fillMissingDetails(sessionId, inputText)` - Follow-up analysis with history
- `analyzeMissingInformation(callRecordingParameters)` - Validates extracted data

**Key Features**:
- Uses exact prompt templates from Lambda implementation
- Invokes Claude for JSON extraction
- Validates HCP names against local knowledge base
- Identifies missing required fields

#### 3. **Prompt Templates** (`src/prompts/callRecording.ts`)

Contains the exact prompt templates from the Lambda:

- `generateCallRecordingPrompt(inputText)` - First-pass extraction prompt
- `generateFillMissingDetailsPrompt(inputText)` - Follow-up prompt

**Features**:
- Handles date resolution (today, tomorrow, yesterday)
- Detects adverse events and non-compliance
- Extracts structured JSON with all required fields

#### 4. **Data Models** (`src/models/callRecording.ts`)

TypeScript interfaces for type safety:

- `CallRecordingPayload` - Complete call data structure
- `CallRecordingParameters` - Intermediate extraction format
- `CallRecordingAnalysisResult` - API response format
- `MissingInformationEvent` - Enum for missing field types

### API Endpoints

#### **POST /api/session/establish**

Creates a new Bedrock Agent Runtime session.

**Request**:
```json
{
  "userId": "voice-user-12345"
}
```

**Response**:
```json
{
  "sessionId": "bedrock-session-id",
  "message": "Session established successfully"
}
```

#### **POST /api/call/analyze**

Analyzes a call recording transcript (first pass).

**Request**:
```json
{
  "sessionId": "bedrock-session-id",
  "input": "user: I met with Dr. Smith today at 2pm to discuss Medication X.\nassistant: Great! Let me record that..."
}
```

**Response**:
```json
{
  "callRecordingPayload": {
    "accountName": "Dr. John Smith",
    "accountId": "0013K000013ez2XQAQ",
    "call_date": "2025-11-15",
    "call_time": "14:00:00",
    "product_description": "Medication X",
    "call_channel": "In Person",
    "discussion_notes": "Product discussion",
    "call_notes": "Discussed benefits of Medication X",
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

#### **POST /api/call/fill-missing**

Fills missing details using conversation history.

**Request**:
```json
{
  "sessionId": "bedrock-session-id",
  "input": "The product was Aspirin"
}
```

**Response**:
```json
{
  "callRecordingPayload": {
    "product_description": "Aspirin",
    ...
  },
  "missingInformationEvents": ["CALL_DATE_NOT_FOUND"]
}
```

### Frontend Integration

The frontend (`public/voice-test.html`) has been enhanced with:

#### **New State Variables**:
```javascript
let bedrockSessionId = null;  // Separate from NovaSonic sessionId
let transcriptBuffer = [];     // Collects transcripts
let hasAnalyzed = false;       // Prevents duplicate analysis
```

#### **Session Establishment Flow**:
1. User clicks "Start Session"
2. System creates NovaSonic session (existing)
3. System creates Bedrock session (new)
4. Both sessions run in parallel

#### **Analysis Trigger**:
- Transcripts are buffered as they arrive from NovaSonic
- After 2+ transcripts and a 3-second delay, analysis is triggered
- Transcripts are combined and sent to `/api/call/analyze`
- Extracted data is displayed in the UI

#### **Missing Info Handling**:
- If `missingInformationEvents` is returned, user is prompted
- User can provide missing info via voice
- New transcripts trigger `/api/call/fill-missing`
- Chat history is automatically included

## Data Flow

### Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         User Speaks                          │
└────────────┬────────────────────────────────────────────────┘
             │
             v
┌─────────────────────────────────────────────────────────────┐
│            NovaSonic Client (Existing)                       │
│  - Captures audio                                            │
│  - Sends to Bedrock Nova Sonic model                         │
│  - Streams back audio + transcripts                          │
└────────────┬────────────────────────────────────────────────┘
             │
             v
┌─────────────────────────────────────────────────────────────┐
│              SSE Stream (Existing)                           │
│  - Emits transcript events                                   │
│  - Emits audio events                                        │
│  - Emits tool events                                         │
└────────────┬────────────────────────────────────────────────┘
             │
             v
┌─────────────────────────────────────────────────────────────┐
│           Frontend (Enhanced)                                │
│  1. Receives transcript events                               │
│  2. Buffers transcripts in memory                            │
│  3. After 2+ transcripts, triggers analysis                  │
└────────────┬────────────────────────────────────────────────┘
             │
             v
┌─────────────────────────────────────────────────────────────┐
│      POST /api/call/analyze (New)                            │
│  - Receives combined transcript text                         │
│  - Creates invocation                                        │
│  - Stores user input as invocation step                      │
└────────────┬────────────────────────────────────────────────┘
             │
             v
┌─────────────────────────────────────────────────────────────┐
│     Call Recording Analyzer (New)                            │
│  - Generates extraction prompt                               │
│  - Calls Claude with prompt                                  │
│  - Parses JSON response                                      │
│  - Validates HCP names                                       │
│  - Identifies missing fields                                 │
│  - Stores assistant response as invocation step              │
└────────────┬────────────────────────────────────────────────┘
             │
             v
┌─────────────────────────────────────────────────────────────┐
│         Frontend Receives Analysis Result                    │
│  - Updates call log table with extracted data                │
│  - Shows missing information events                          │
│  - Triggers auto-save if all required fields present         │
└─────────────────────────────────────────────────────────────┘
```

### Multi-Turn Fill Missing Flow

```
User: "I met with Dr. Smith"
  ↓
Analysis: Missing date, time, product
  ↓
UI: Shows "Missing: CALL_DATE_NOT_FOUND, CALL_TIME_NOT_FOUND, ..."
  ↓
User: "It was today at 2pm"
  ↓
POST /api/call/fill-missing
  ↓
Analyzer:
  - Fetches chat history from Bedrock session
  - Combines history with new input
  - Calls Claude with fill-missing prompt
  - Updates JSON with filled fields
  ↓
UI: Shows updated data, remaining missing fields
  ↓
Repeat until all fields filled
```

## Session Semantics

### Lambda Compatibility

This implementation preserves the exact session semantics from the Lambda:

1. **SESSION_ESTABLISHMENT** → `/api/session/establish`
2. **CALL_RECORDING** → `/api/call/analyze`
3. **FILL_MISSING_DETAILS** → `/api/call/fill-missing`

### Invocation Steps

Each conversation turn is stored as an invocation step:

```typescript
{
  role: "user" | "assistant",
  text: "message content"
}
```

### Chat History Format

Chat history is built in the format expected by Claude:

```typescript
[
  {
    role: "user",
    content: [{ text: "I met with Dr. Smith..." }]
  },
  {
    role: "assistant",
    content: [{ text: '{"accountName": "Dr. John Smith", ...}' }]
  }
]
```

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
# LLM Model for call analysis (defaults to Claude)
LLM_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0

# Bedrock Agent Runtime region (uses AWS_REGION by default)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

### Dependencies

New dependencies added:

```json
{
  "@aws-sdk/client-bedrock-agent-runtime": "^3.666.0",
  "moment": "^2.30.1"
}
```

Install with:

```bash
npm install
```

## Testing

### Manual Testing Flow

1. **Start the server**:
   ```bash
   npm run dev
   ```

2. **Open the voice test UI**:
   ```
   http://localhost:8001/voice-test.html
   ```

3. **Start a session**:
   - Click "Start Session"
   - Verify both "Nova Sonic" and "Bedrock Session" IDs appear

4. **Test voice recording**:
   - Click "Start Recording"
   - Say: "I met with Dr. John Anderson today at 2pm to discuss Aspirin"
   - Click "Stop Recording"

5. **Verify analysis**:
   - Wait 3 seconds after transcript appears
   - Check console for "🔍 Analyzing call recording..."
   - Verify call log table populates with extracted data
   - Check "Call Log Data (Live)" section

6. **Test missing info flow**:
   - Start a new session
   - Say: "I met with Dr. Smith"
   - Verify missing events appear
   - Say: "It was today at 2pm"
   - Verify missing fields get filled

### API Testing

Test endpoints directly:

```bash
# Establish session
curl -X POST http://localhost:8001/api/session/establish \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user"}'

# Analyze call
curl -X POST http://localhost:8001/api/call/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "YOUR_SESSION_ID",
    "input": "I met with Dr. John Anderson today at 2pm to discuss Aspirin"
  }'

# Fill missing
curl -X POST http://localhost:8001/api/call/fill-missing \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "YOUR_SESSION_ID",
    "input": "The product was Aspirin"
  }'
```

## Key Features

### ✅ Implemented

- [x] Bedrock Agent Runtime session management
- [x] CreateSessionCommand, CreateInvocationCommand, PutInvocationStepCommand
- [x] ListInvocationStepsCommand, GetInvocationStepCommand
- [x] Chat history building from invocation steps
- [x] First-pass call analysis with exact Lambda prompts
- [x] Fill missing details with conversation history
- [x] HCP name validation and lookup
- [x] Missing information event detection
- [x] Adverse event and non-compliance detection
- [x] Date/time resolution (today, tomorrow, yesterday)
- [x] Frontend integration with transcript buffering
- [x] Auto-analysis trigger after voice input
- [x] Call log table updates with extracted data
- [x] Parallel session management (NovaSonic + Bedrock)

### 🚫 Not Changed

- NovaSonic audio streaming logic (untouched)
- NovaSonic bidirectional streaming
- Audio playback pipeline
- Tool calling infrastructure
- Existing conversation policy endpoints

## Troubleshooting

### Common Issues

**Issue**: Bedrock session not created
- **Solution**: Check AWS credentials in `.env`
- **Verify**: `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are set

**Issue**: Analysis not triggering
- **Solution**: Check console for transcript buffer size
- **Verify**: At least 2 transcripts collected before timeout

**Issue**: HCP name not found
- **Solution**: Check `src/prompting.ts` HCP_NAME_TO_ID_MAP
- **Verify**: HCP name matches format "Dr. FirstName LastName"

**Issue**: Claude returns malformed JSON
- **Solution**: Check LLM_MODEL_ID is correct
- **Verify**: Using Claude 3 Sonnet or compatible model

## Future Enhancements

### Potential Improvements

1. **Streaming Analysis**: Instead of buffering transcripts, analyze incrementally
2. **Redshift Integration**: Store extracted call data directly to Redshift
3. **N8N Webhooks**: Emit events to N8N for downstream workflows
4. **Multi-Language Support**: Add prompts for different languages
5. **Custom Knowledge Base**: Replace local HCP map with actual KB queries
6. **Session Persistence**: Store Bedrock sessions in database
7. **Resume Sessions**: Allow resuming interrupted conversations

## Conclusion

This integration successfully combines NovaSonic's real-time voice capabilities with Bedrock Agent Runtime's session management, enabling:

- **Persistent conversation history** across multiple turns
- **Context-aware analysis** using full conversation context
- **Multi-turn slot filling** for incomplete information
- **Structured data extraction** from voice transcripts
- **Zero breaking changes** to existing voice pipeline

The architecture is modular, maintainable, and production-ready.

