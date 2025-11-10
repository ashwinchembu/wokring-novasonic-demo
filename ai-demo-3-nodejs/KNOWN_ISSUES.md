# Known Issues

## ✅ RESOLVED: Bedrock Bidirectional Streaming

### Status: ✅ **WORKING**

The AWS SDK v3 for JavaScript **DOES support** bidirectional streaming with Nova Sonic!

### Solution Found

The issue was using the wrong implementation pattern. The correct approach requires:

1. **NodeHttp2Handler** - Use HTTP/2 handler instead of default HTTP handler
2. **AsyncIterable as `body`** - Pass async iterable as `body` parameter (not `inputStream`)
3. **Queue-based system** - Use RxJS Subjects for event queueing
4. **Proper event format** - Events must be wrapped as `{ chunk: { bytes: Uint8Array } }`

### Working Implementation

```typescript
import { NodeHttp2Handler } from '@smithy/node-http-handler';
import { Subject, firstValueFrom } from 'rxjs';

// Use HTTP/2 handler
const nodeHttp2Handler = new NodeHttp2Handler({
  requestTimeout: 300000,
  sessionTimeout: 300000,
  disableConcurrentStreams: false,
  maxConcurrentStreams: 20,
});

const bedrockClient = new BedrockRuntimeClient({
  region: 'us-east-1',
  credentials: { ... },
  requestHandler: nodeHttp2Handler, // Critical!
});

// Create async iterable with queue
const asyncIterable = {
  [Symbol.asyncIterator]: () => ({
    next: async () => {
      // Wait for events in queue
      const event = await getNextEvent();
      return {
        value: {
          chunk: {
            bytes: new TextEncoder().encode(JSON.stringify(event))
          }
        },
        done: false
      };
    }
  })
};

// Send command
const response = await bedrockClient.send(
  new InvokeModelWithBidirectionalStreamCommand({
    modelId: 'amazon.nova-sonic-v1:0',
    body: asyncIterable, // Not inputStream!
  })
);
```

### Key Learnings

1. **Documentation Gap**: The AWS SDK documentation doesn't clearly explain the HTTP/2 handler requirement
2. **Sample Code is Essential**: The amazon-nova-samples repository contains the correct implementation
3. **Error Message Misleading**: "Eventstream payload must be a Readable stream" actually means "use HTTP/2 handler and proper format"

### Credits

Solution found by examining the official AWS sample implementation:
- Repository: `amazon-nova-samples/speech-to-speech/sample-codes/websocket-nodejs`
- File: `src/client.ts`

### Current Status

✅ **Fully Functional**
- Bidirectional streaming works perfectly
- Tool invocation supported
- Audio streaming operational
- Event processing working
- Session management complete

### Remaining Requirements

To use the Node.js implementation, you only need:
1. Valid AWS credentials in `.env`
2. Bedrock access with Nova Sonic enabled
3. That's it!

### Test It

```bash
# Add credentials to .env
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1

# Start server
npm run dev

# Open test page
open http://localhost:8001/test

# Click "Start Session" and start talking!
```

### Performance Notes

The Node.js implementation using HTTP/2 handler:
- ✅ Low latency
- ✅ Handles concurrent sessions
- ✅ Memory efficient with queue-based streaming
- ✅ Proper cleanup on session end

### Comparison with Python

Both implementations are now fully functional:

| Feature | Python | Node.js |
|---------|--------|---------|
| Bidirectional Streaming | ✅ | ✅ |
| Tool Invocation | ✅ | ✅ |
| Audio Processing | ✅ | ✅ |
| Session Management | ✅ | ✅ |
| Documentation | ✅ | ✅ |
| Test UI | ✅ | ✅ (Better!) |

### Recommendation Update

**Previous**: Use Python version only

**Current**: ✅ **Use either Python or Node.js!**

Both are production-ready. Choose based on:
- **Python**: If team is Python-focused or existing Python infrastructure
- **Node.js**: If team is JavaScript-focused or building full-stack JS apps

### Related Links

- AWS SDK v3: https://github.com/aws/aws-sdk-js-v3
- Nova Samples: https://github.com/aws-samples/amazon-nova-samples
- Bedrock Runtime Docs: https://docs.aws.amazon.com/bedrock/latest/userguide/api.html

### Last Updated
November 7, 2025 - **RESOLVED**

---

## No Other Known Issues

The Node.js implementation is complete and fully functional! 🎉
