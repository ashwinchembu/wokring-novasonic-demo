# Redshift HCP Lookup - Source Display Fix

## Changes Made

### ✅ Fixed Audio Overlap Issue
**File**: `public/voice-test.html`

Replaced the time-based audio scheduling system with a proper queue-based sequential playback:
- Audio chunks now play one at a time without overlapping
- Each chunk waits for the previous one to finish before starting
- No more race conditions or audio interruptions

### ✅ Enhanced HCP Lookup Tool
**File**: `src/tools.ts`

The `lookupHcpTool` now always returns the `source` field showing where it searched:

**Before**:
```json
{
  "found": false,
  "hcp_id": null,
  "hco_id": null,
  "hco_name": null,
  "source": null
}
```

**After**:
```json
{
  "found": false,
  "hcp_id": null,
  "hco_id": null,
  "hco_name": null,
  "source": "searched_in: redshift, static_map"
}
```

**When HCP is found**:
```json
{
  "found": true,
  "name": "Dr. John Smith",
  "hcp_id": "0013K000013ez2XQAQ",
  "hco_id": "001XYZ",
  "hco_name": "Memorial Hospital",
  "source": "redshift"
}
```

Or from static map:
```json
{
  "found": true,
  "name": "Dr. William Harper",
  "hcp_id": "0013K000013ez2RQAQ",
  "hco_id": null,
  "hco_name": null,
  "source": "static_map"
}
```

### ✅ Enhanced Redshift Logging
**File**: `src/redshift.ts`

Added detailed logging for every Redshift HCP lookup:
- Shows the exact name being searched
- Logs exact match attempts
- Logs fuzzy match attempts
- Shows full HCP details when found (name, HCP ID, HCO ID, HCO Name)
- Clear indication when not found

**Example logs**:
```
🔍 Redshift: Searching for HCP with name: "Karina Soto"
Executing exact match query for: "Karina Soto"
No exact match, trying fuzzy search...
❌ Redshift: HCP not found in database: "Karina Soto"
```

When found:
```
🔍 Redshift: Searching for HCP with name: "Dr. John Smith"
✅ Redshift: Found HCP (exact match)
   Name: Dr. John Smith
   HCP ID: 0013K000013ez2XQAQ
   HCO ID: 001XYZ123
   HCO Name: Memorial Hospital
```

## How to Test

### 1. Test Redshift Connection

Run the test script:
```bash
cd /Users/ashwin/zs/wokring-novasonic-demo/ai-demo-3-nodejs
npx tsx test-redshift.ts
```

This will:
1. Connect to Redshift
2. Count total HCPs in database
3. Show 5 sample HCP names
4. Test lookup for several names including "Karina Soto"
5. Show the source for each result

### 2. Test via Voice Interface

1. Start the server:
```bash
npm run dev
```

2. Open the test page:
```
http://localhost:8000/test
```

3. Start a session and say:
```
"Is Karina Soto in the database?"
```

4. Check the tool log in the transcript - you'll now see:
```
🔧 Tool: lookupHcpTool
Input: { "name": "Karina Soto" }

✅ Result: lookupHcpTool
{
  "found": false,
  "hcp_id": null,
  "hco_id": null,
  "hco_name": null,
  "source": "searched_in: redshift, static_map"
}
```

### 3. Test with an HCP that exists

Try saying:
```
"Is Dr. William Harper in the database?"
```

You should see:
```
✅ Result: lookupHcpTool
{
  "found": true,
  "name": "Dr. William Harper",
  "hcp_id": "0013K000013ez2RQAQ",
  "hco_id": null,
  "hco_name": null,
  "source": "static_map"
}
```

## What Changed

### Source Field Always Populated

The tool now tracks which sources it searched and returns that information:

1. **`redshift`** - Found in Redshift database
2. **`static_map`** - Found in static in-memory map
3. **`searched_in: redshift, static_map`** - Not found, but searched both
4. **`searched_in: static_map`** - Not found, Redshift unavailable
5. **`database_unavailable`** - Redshift configuration missing
6. **`redshift_error`** - Error querying Redshift

### Enhanced Logging

Every HCP lookup now logs:
- The exact name being searched
- Which database/source is being queried
- The query results
- Full details when found
- Clear indication when not found

## Verifying Redshift Data

To check if "Karina Soto" exists in your Redshift database:

```sql
-- Connect to Redshift
psql -h pharma-agent-wg.505679504671.us-east-1.redshift-serverless.amazonaws.com \
     -p 5439 -d dev -U admin

-- Search for Karina Soto
SELECT * FROM hcp_table WHERE LOWER(name) LIKE '%karina%soto%';

-- List all HCPs
SELECT name, id FROM hcp_table ORDER BY name LIMIT 20;
```

## Server Logs to Watch

When testing, watch the server logs for:

```
🔍 LOOKUP HCP TOOL HANDLER
  - Input name: 'Karina Soto'
  - Name length: 11 chars
🗄️  Trying Redshift database lookup...
🔍 Redshift: Searching for HCP with name: "Karina Soto"
Executing exact match query for: "Karina Soto"
No exact match, trying fuzzy search...
❌ Redshift: HCP not found in database: "Karina Soto"
   Not found in Redshift, trying static map...
📋 Trying static map lookup...
❌ HCP NOT FOUND in any source
  - Searched name: 'Karina Soto'
  - Sources checked: searched_in: redshift, static_map
```

## Next Steps

If "Karina Soto" should be in the database but isn't found:

1. **Verify the name spelling** - Check exact spelling in Redshift
2. **Check the table** - Run: `SELECT * FROM hcp_table WHERE name ILIKE '%soto%'`
3. **Add to database** - Insert if missing:
```sql
INSERT INTO hcp_table (id, name, account_id, account_name)
VALUES ('HCP_KSOTO_001', 'Karina Soto', 'ACC_001', 'Sample Hospital');
```

## Summary

✅ **Audio overlap fixed** - Sequential playback prevents overlapping speech
✅ **Source tracking** - Always shows where the lookup searched
✅ **Better logging** - Detailed logs for debugging
✅ **Redshift integration** - Fully functional with fallback to static map

Test the changes and you'll now see the source field populated in all HCP lookup results!

