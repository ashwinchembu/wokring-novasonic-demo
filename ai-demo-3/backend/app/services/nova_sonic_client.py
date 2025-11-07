r"""
Nova Sonic Client Service
Manages bidirectional streaming with AWS Bedrock Nova Sonic model.
Adapted from amazon-nova-samples/speech-to-speech patterns.
"""
import asyncio
import base64
import json
import uuid
import logging
from datetime import datetime
from typing import Optional, Callable, AsyncIterator
from rx.subject import Subject
from rx import operators as ops
from rx.scheduler.eventloop import AsyncIOScheduler

from aws_sdk_bedrock_runtime.client import (
    BedrockRuntimeClient,
    InvokeModelWithBidirectionalStreamOperationInput
)
from aws_sdk_bedrock_runtime.models import (
    InvokeModelWithBidirectionalStreamInputChunk,
    BidirectionalInputPayloadPart
)
from aws_sdk_bedrock_runtime.config import Config
from smithy_aws_core.identity.environment import EnvironmentCredentialsResolver

from app.config import settings
from app.prompting import AGENT_683_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class NovaSonicClient:
    """Manages bidirectional streaming with AWS Bedrock Nova Sonic."""
    
    # Event templates from Nova Sonic reference implementation
    START_SESSION_EVENT = '''{
        "event": {
            "sessionStart": {
                "inferenceConfiguration": {
                    "maxTokens": %d,
                    "topP": %.1f,
                    "temperature": %.1f
                }
            }
        }
    }'''
    
    # Tool definitions for Nova Sonic
    TOOL_DEFINITIONS = [
        {
            "toolSpec": {
                "name": "getDateTool",
                "description": "Return current date/time for sanity checks. Use this tool when the user asks about the current date or time.",
                "inputSchema": {
                    "json": json.dumps({
                        "type": "object",
                        "properties": {},
                        "required": []
                    })
                }
            }
        },
        {
            "toolSpec": {
                "name": "lookupHcpTool",
                "description": "Lookup an HCP (Healthcare Professional) by name in the system. Use this tool when the user mentions a doctor's name or asks if an HCP exists. Returns {found:Boolean, hcp_id:String|null, hco_id:String|null, hco_name:String|null, name:String|null, source:String|null}.",
                "inputSchema": {
                    "json": json.dumps({
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "minLength": 2,
                                "description": "The name of the healthcare professional to look up"
                            }
                        },
                        "required": ["name"]
                    })
                }
            }
        },
        {
            "toolSpec": {
                "name": "insertCallTool",
                "description": "Persist the final call JSON to Redshift calls table. Use this tool after the user confirms the call summary to save the record to the database.",
                "inputSchema": {
                    "json": json.dumps({
                        "type": "object",
                        "properties": {
                            "record": {
                                "type": "object",
                                "description": "Complete call record JSON with all fields"
                            }
                        },
                        "required": ["record"]
                    })
                }
            }
        },
        {
            "toolSpec": {
                "name": "emitN8nEventTool",
                "description": "POST the saved calls row + session metadata to an n8n Webhook. Use this tool after successfully inserting a call to trigger automation workflows.",
                "inputSchema": {
                    "json": json.dumps({
                        "type": "object",
                        "properties": {
                            "eventType": {
                                "type": "string",
                                "description": "Event type (e.g., 'call.saved', 'call.updated')"
                            },
                            "payload": {
                                "type": "object",
                                "description": "Event payload data"
                            }
                        },
                        "required": ["eventType", "payload"]
                    })
                }
            }
        },
        {
            "toolSpec": {
                "name": "createFollowUpTaskTool",
                "description": "Create a follow-up task in PM/CRM when call_follow_up_task.task_type is present. Use this tool after persisting a call that includes a follow-up task.",
                "inputSchema": {
                    "json": json.dumps({
                        "type": "object",
                        "properties": {
                            "task": {
                                "type": "object",
                                "description": "Task details (task_type, description, due_date, assigned_to)"
                            }
                        },
                        "required": ["task"]
                    })
                }
            }
        }
    ]
    
    START_PROMPT_EVENT_TEMPLATE = '''{
        "event": {
            "promptStart": {
                "promptName": "%s",
                "textOutputConfiguration": {
                    "mediaType": "text/plain"
                },
                "audioOutputConfiguration": {
                    "mediaType": "audio/lpcm",
                    "sampleRateHertz": %d,
                    "sampleSizeBits": %d,
                    "channelCount": %d,
                    "voiceId": "%s",
                    "encoding": "base64",
                    "audioType": "SPEECH"
                },
                "toolUseOutputConfiguration": {
                    "mediaType": "application/json"
                },
                "toolConfiguration": {
                    "tools": %s
                }
            }
        }
    }'''

    CONTENT_START_EVENT = '''{
        "event": {
            "contentStart": {
                "promptName": "%s",
                "contentName": "%s",
                "type": "AUDIO",
                "interactive": true,
                "role": "USER",
                "audioInputConfiguration": {
                    "mediaType": "audio/lpcm",
                    "sampleRateHertz": %d,
                    "sampleSizeBits": %d,
                    "channelCount": %d,
                    "audioType": "SPEECH",
                    "encoding": "base64"
                }
            }
        }
    }'''

    AUDIO_EVENT_TEMPLATE = '''{
        "event": {
            "audioInput": {
                "promptName": "%s",
                "contentName": "%s",
                "content": "%s"
            }
        }
    }'''

    TEXT_CONTENT_START_EVENT = '''{
        "event": {
            "contentStart": {
                "promptName": "%s",
                "contentName": "%s",
                "role": "%s",
                "type": "TEXT",
                "interactive": true,
                "textInputConfiguration": {
                    "mediaType": "text/plain"
                }
            }
        }
    }'''

    TEXT_INPUT_EVENT = '''{
        "event": {
            "textInput": {
                "promptName": "%s",
                "contentName": "%s",
                "content": "%s"
            }
        }
    }'''

    CONTENT_END_EVENT = '''{
        "event": {
            "contentEnd": {
                "promptName": "%s",
                "contentName": "%s"
            }
        }
    }'''

    PROMPT_END_EVENT = '''{
        "event": {
            "promptEnd": {
                "promptName": "%s"
            }
        }
    }'''

    SESSION_END_EVENT = '''{
        "event": {
            "sessionEnd": {}
        }
    }'''
    
    TOOL_RESULT_CONTENT_START_EVENT = '''{
        "event": {
            "contentStart": {
                "promptName": "%s",
                "contentName": "%s",
                "role": "TOOL",
                "type": "TOOL",
                "interactive": false,
                "toolResultInputConfiguration": {
                    "toolUseId": "%s",
                    "type": "TEXT",
                    "textInputConfiguration": {
                        "mediaType": "text/plain"
                    }
                }
            }
        }
    }'''
    
    TOOL_RESULT_EVENT = '''{
        "event": {
            "toolResult": {
                "promptName": "%s",
                "contentName": "%s",
                "content": "%s"
            }
        }
    }'''

    def __init__(
        self,
        model_id: Optional[str] = None,
        region: Optional[str] = None,
        system_prompt: Optional[str] = None
    ):
        """Initialize the Nova Sonic client."""
        self.model_id = model_id or settings.bedrock_model_id
        self.region = region or settings.region
        # Use Agent-683 system prompt by default for CRM call recording
        self.system_prompt = system_prompt or AGENT_683_SYSTEM_PROMPT
        
        self.input_subject = Subject()
        self.output_subject = Subject()
        self.audio_subject = Subject()
        
        self.response_task: Optional[asyncio.Task] = None
        self.stream_response = None
        self.is_active = False
        self.barge_in = False
        self.bedrock_client: Optional[BedrockRuntimeClient] = None
        self.scheduler: Optional[AsyncIOScheduler] = None
        
        # Audio output queue
        self.audio_output_queue: asyncio.Queue = asyncio.Queue()
        
        # Text response tracking
        self.display_assistant_text = False
        self.role: Optional[str] = None
        
        # Session information
        self.session_id = str(uuid.uuid4())
        self.prompt_name = str(uuid.uuid4())
        self.content_name = str(uuid.uuid4())
        self.audio_content_name = str(uuid.uuid4())
        
        # Tool use tracking
        self.tool_use_handler: Optional[Callable] = None
        
        logger.info(f"NovaSonicClient initialized with session_id: {self.session_id}")
        logger.info(f"System prompt length: {len(self.system_prompt)} chars")
        logger.debug(f"System prompt preview: {self.system_prompt[:200]}...")
    
    def _initialize_client(self):
        """Initialize the Bedrock client."""
        config = Config(
            endpoint_uri=settings.endpoint_url,
            region=self.region,
            aws_credentials_identity_resolver=EnvironmentCredentialsResolver(),
        )
        self.bedrock_client = BedrockRuntimeClient(config=config)
        logger.info(f"Bedrock client initialized for region: {self.region}")
    
    async def initialize_stream(self):
        """Initialize the bidirectional stream with Bedrock."""
        if not self.bedrock_client:
            self._initialize_client()
        
        self.scheduler = AsyncIOScheduler(asyncio.get_event_loop())
        
        try:
            # Create bidirectional stream with timeout
            logger.info(f"Attempting to connect to Bedrock model: {self.model_id}")
            self.stream_response = await asyncio.wait_for(
                self.bedrock_client.invoke_model_with_bidirectional_stream(
                    InvokeModelWithBidirectionalStreamOperationInput(model_id=self.model_id)
                ),
                timeout=10.0  # 10 second timeout
            )
            logger.info("Successfully connected to Bedrock")
            
            self.is_active = True
            
            # Send initialization events
            session_event = self.START_SESSION_EVENT % (
                settings.max_tokens,
                settings.top_p,
                settings.temperature
            )
            
            # Serialize tool definitions to JSON
            tools_json = json.dumps(self.TOOL_DEFINITIONS)
            
            prompt_event = self.START_PROMPT_EVENT_TEMPLATE % (
                self.prompt_name,
                settings.output_sample_rate,
                settings.audio_bit_depth,
                settings.audio_channels,
                settings.voice_id,
                tools_json
            )
            
            text_content_start = self.TEXT_CONTENT_START_EVENT % (
                self.prompt_name,
                self.content_name,
                "SYSTEM"
            )
            
            # Properly JSON-escape the system prompt
            escaped_system_prompt = json.dumps(self.system_prompt)[1:-1]  # Remove outer quotes
            text_content = self.TEXT_INPUT_EVENT % (
                self.prompt_name,
                self.content_name,
                escaped_system_prompt
            )
            
            text_content_end = self.CONTENT_END_EVENT % (
                self.prompt_name,
                self.content_name
            )
            
            init_events = [
                session_event,
                prompt_event,
                text_content_start,
                text_content,
                text_content_end
            ]
            
            logger.info(f"Sending system prompt to Bedrock (length: {len(self.system_prompt)} chars)")
            logger.debug(f"System prompt content: {self.system_prompt[:300]}...")
            
            for event in init_events:
                await self.send_raw_event(event)
            
            # Start listening for responses
            self.response_task = asyncio.create_task(self._process_responses())
            
            # Set up subscription for input events
            self.input_subject.pipe(
                ops.subscribe_on(self.scheduler)
            ).subscribe(
                on_next=lambda event: asyncio.create_task(self.send_raw_event(event)),
                on_error=lambda e: logger.error(f"Input stream error: {e}")
            )
            
            # Set up subscription for audio chunks
            self.audio_subject.pipe(
                ops.subscribe_on(self.scheduler)
            ).subscribe(
                on_next=lambda audio_data: asyncio.create_task(self._handle_audio_input(audio_data)),
                on_error=lambda e: logger.error(f"Audio stream error: {e}")
            )
            
            logger.info("Stream initialized successfully")
            return self
            
        except asyncio.TimeoutError:
            self.is_active = False
            logger.error(f"Timeout connecting to Bedrock model {self.model_id}. Check AWS credentials and network connectivity.")
            raise Exception(f"Failed to connect to Bedrock: Connection timeout after 10 seconds")
        except Exception as e:
            self.is_active = False
            logger.error(f"Failed to initialize stream: {str(e)}", exc_info=True)
            raise
    
    async def send_raw_event(self, event_json: str):
        """Send a raw event JSON to the Bedrock stream."""
        if not self.stream_response or not self.is_active:
            logger.warning("Stream not initialized or closed")
            return
        
        event = InvokeModelWithBidirectionalStreamInputChunk(
            value=BidirectionalInputPayloadPart(bytes_=event_json.encode('utf-8'))
        )
        
        try:
            await self.stream_response.input_stream.send(event)
            if settings.debug and len(event_json) > 200:
                event_type = json.loads(event_json).get("event", {}).keys()
                logger.debug(f"Sent event type: {list(event_type)}")
        except Exception as e:
            logger.error(f"Error sending event: {str(e)}")
            self.input_subject.on_error(e)
    
    async def send_audio_content_start_event(self):
        """Send audio content start event."""
        content_start_event = self.CONTENT_START_EVENT % (
            self.prompt_name,
            self.audio_content_name,
            settings.input_sample_rate,
            settings.audio_bit_depth,
            settings.audio_channels
        )
        await self.send_raw_event(content_start_event)
        logger.debug("Audio content start event sent")
    
    async def _handle_audio_input(self, data: dict):
        """Process audio input before sending it to the stream."""
        audio_bytes = data.get('audio_bytes')
        if not audio_bytes:
            logger.warning("No audio bytes received")
            return
        
        try:
            # Base64 encode the audio data
            blob = base64.b64encode(audio_bytes)
            audio_event = self.AUDIO_EVENT_TEMPLATE % (
                self.prompt_name,
                self.audio_content_name,
                blob.decode('utf-8')
            )
            
            await self.send_raw_event(audio_event)
            logger.debug(f"Audio chunk sent: {len(audio_bytes)} bytes")
        except Exception as e:
            logger.error(f"Error processing audio: {e}")
    
    def add_audio_chunk(self, audio_bytes: bytes):
        """Add an audio chunk to the stream."""
        self.audio_subject.on_next({
            'audio_bytes': audio_bytes,
            'prompt_name': self.prompt_name,
            'content_name': self.audio_content_name
        })
    
    async def send_audio_content_end_event(self):
        """Send audio content end event."""
        if not self.is_active:
            return
        
        content_end_event = self.CONTENT_END_EVENT % (
            self.prompt_name,
            self.audio_content_name
        )
        await self.send_raw_event(content_end_event)
        logger.debug("Audio content end event sent")
    
    async def send_prompt_end_event(self):
        """Send prompt end event."""
        if not self.is_active:
            return
        
        prompt_end_event = self.PROMPT_END_EVENT % self.prompt_name
        await self.send_raw_event(prompt_end_event)
        logger.debug("Prompt end event sent")
    
    async def send_session_end_event(self):
        """Send session end event."""
        if not self.is_active:
            return
        
        await self.send_raw_event(self.SESSION_END_EVENT)
        self.is_active = False
        logger.info("Session end event sent")
    
    async def _process_responses(self):
        """Process incoming responses from Bedrock."""
        try:
            while self.is_active:
                try:
                    output = await self.stream_response.await_output()
                    result = await output[1].receive()
                    
                    if result.value and result.value.bytes_:
                        try:
                            response_data = result.value.bytes_.decode('utf-8')
                            json_data = json.loads(response_data)
                            
                            # Check for errors from Bedrock
                            if 'error' in json_data:
                                logger.error(f"Bedrock error: {json_data['error']}")
                                self.output_subject.on_next(json_data)
                                continue
                            
                            # Handle different response types
                            if 'event' in json_data:
                                await self._handle_response_event(json_data['event'])
                            
                            # Debug: Log when pushing to output_subject
                            event_type = list(json_data.get('event', {}).keys())[0] if 'event' in json_data else 'unknown'
                            logger.debug(f"Pushing event to output_subject: {event_type}")
                            
                            self.output_subject.on_next(json_data)
                        except json.JSONDecodeError as e:
                            logger.error(f"Failed to decode JSON response: {e}, data: {response_data[:200]}")
                            self.output_subject.on_next({"raw_data": response_data})
                            
                except StopAsyncIteration:
                    break
                except Exception as e:
                    logger.error(f"Error receiving response: {e}")
                    self.output_subject.on_error(e)
                    break
                    
        except Exception as e:
            logger.error(f"Response processing error: {e}")
            self.output_subject.on_error(e)
        finally:
            if self.is_active:
                self.output_subject.on_completed()
    
    async def execute_tool(self, tool_name: str, tool_input: dict) -> dict:
        """
        Execute a tool and return the result.
        
        Args:
            tool_name: Name of the tool to execute
            tool_input: Input parameters for the tool
            
        Returns:
            Tool execution result as a dictionary
        """
        logger.info(f"⚙️  execute_tool() called")
        logger.info(f"  - Tool: {tool_name}")
        logger.info(f"  - Input: {json.dumps(tool_input, indent=4)}")
        
        try:
            # Handle getDateTool locally (simple, no external dependencies)
            if tool_name == "getDateTool":
                logger.info(f"📅 Executing getDateTool (built-in)...")
                result = {
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "time": datetime.now().strftime("%H:%M:%S"),
                    "timezone": "UTC",
                    "timestamp": datetime.now().isoformat()
                }
                logger.info(f"✅ getDateTool result: {json.dumps(result, indent=4)}")
                return result
            
            # Use centralized tool dispatcher for all other tools
            logger.info(f"🔀 Dispatching to tool handler: {tool_name}...")
            # Import here to avoid circular dependency
            from app.tools import dispatch_tool_call
            
            result = await dispatch_tool_call(tool_name, tool_input)
            logger.info(f"✅ {tool_name} executed successfully")
            logger.info(f"  - Result: {json.dumps(result, indent=4)}")
            return result
                
        except Exception as e:
            logger.error(f"❌ Error executing tool {tool_name}: {e}", exc_info=True)
            error_result = {
                "error": str(e),
                "tool_name": tool_name,
                "tool_input": tool_input
            }
            logger.error(f"  - Error result: {json.dumps(error_result, indent=4)}")
            return error_result
    
    async def send_tool_result(self, tool_use_id: str, tool_result: dict, status: str = "success"):
        """
        Send tool execution result back to Nova Sonic.
        
        Args:
            tool_use_id: The ID of the tool use request
            tool_result: The result from tool execution
            status: Status of the tool execution (success or error)
        """
        logger.info(f"📤 send_tool_result() called")
        logger.info(f"  - Tool Use ID: {tool_use_id}")
        logger.info(f"  - Status: {status}")
        logger.info(f"  - Result Preview: {json.dumps(tool_result, indent=4)[:500]}...")
        
        if not self.is_active:
            logger.warning("⚠️  Cannot send tool result - stream not active")
            return
        
        try:
            # Generate a new content name for tool result
            tool_result_content_name = str(uuid.uuid4())
            logger.info(f"📦 Generated content name: {tool_result_content_name}")
            
            # Use the predefined template for TOOL content start (per AWS samples)
            # The template now includes toolUseId in the configuration
            logger.info(f"📤 Step 1: Sending contentStart event for TOOL result...")
            content_start_event = self.TOOL_RESULT_CONTENT_START_EVENT % (
                self.prompt_name,
                tool_result_content_name,
                tool_use_id  # Added for toolResultInputConfiguration
            )
            await self.send_raw_event(content_start_event)
            logger.info(f"✅ contentStart sent")
            
            # Tool result event with proper format (per AWS samples)
            # Content should be JSON string, properly escaped for outer JSON
            logger.info(f"📤 Step 2: Sending tool result data...")
            result_content = json.dumps(tool_result)
            # Escape the JSON string for insertion into the template
            escaped_result = json.dumps(result_content)[1:-1]  # Remove outer quotes
            tool_result_event = self.TOOL_RESULT_EVENT % (
                self.prompt_name,
                tool_result_content_name,
                escaped_result
            )
            await self.send_raw_event(tool_result_event)
            logger.info(f"✅ Tool result data sent (length: {len(result_content)} chars)")
            
            # Content end
            logger.info(f"📤 Step 3: Sending contentEnd event...")
            content_end_event = self.CONTENT_END_EVENT % (
                self.prompt_name,
                tool_result_content_name
            )
            await self.send_raw_event(content_end_event)
            logger.info(f"✅ contentEnd sent")
            
            logger.info(f"=" * 80)
            logger.info(f"✅ TOOL RESULT FULLY TRANSMITTED")
            logger.info(f"  - Tool Use ID: {tool_use_id}")
            logger.info(f"  - Content Name: {tool_result_content_name}")
            logger.info(f"  - Result Length: {len(result_content)} chars")
            logger.info(f"  - Result: {result_content[:200]}...")
            logger.info(f"=" * 80)
            
        except Exception as e:
            logger.error(f"=" * 80)
            logger.error(f"❌ ERROR SENDING TOOL RESULT")
            logger.error(f"  - Tool Use ID: {tool_use_id}")
            logger.error(f"  - Error: {e}", exc_info=True)
            logger.error(f"=" * 80)
    
    async def _handle_response_event(self, event: dict):
        """Handle specific response event types."""
        if 'contentStart' in event:
            content_start = event['contentStart']
            self.role = content_start.get('role')
            
            # Check for speculative content
            if 'additionalModelFields' in content_start:
                try:
                    additional_fields = json.loads(content_start['additionalModelFields'])
                    if additional_fields.get('generationStage') == 'SPECULATIVE':
                        self.display_assistant_text = True
                    else:
                        self.display_assistant_text = False
                except json.JSONDecodeError:
                    pass
        
        elif 'textOutput' in event:
            text_content = event['textOutput']['content']
            
            # Check for barge-in
            if '{ "interrupted" : true }' in text_content:
                logger.info("Barge-in detected")
                self.barge_in = True
            
            if self.role == "ASSISTANT" and self.display_assistant_text:
                logger.info(f"Assistant: {text_content}")
            elif self.role == "USER":
                logger.info(f"User: {text_content}")
        
        elif 'toolUse' in event:
            # Handle tool use request from Nova Sonic
            tool_use = event['toolUse']
            
            # Debug: Log the full toolUse structure
            logger.info(f"=" * 80)
            logger.info(f"🔧 TOOL USE EVENT RECEIVED")
            logger.info(f"Full toolUse structure: {json.dumps(tool_use, indent=2)}")
            logger.info(f"=" * 80)
            
            tool_use_id = tool_use.get('toolUseId')
            tool_name = tool_use.get('toolName')  # Changed from 'name' to 'toolName'
            # Tool input is in the 'content' field, not 'input'
            tool_input_str = tool_use.get('content', '{}')
            
            try:
                tool_input = json.loads(tool_input_str) if isinstance(tool_input_str, str) else tool_input_str
            except json.JSONDecodeError:
                logger.error(f"❌ Failed to parse tool input: {tool_input_str}")
                tool_input = {}
            
            logger.info(f"🔧 TOOL INVOCATION:")
            logger.info(f"  - Tool Name: {tool_name}")
            logger.info(f"  - Tool Use ID: {tool_use_id}")
            logger.info(f"  - Tool Input: {json.dumps(tool_input, indent=4)}")
            
            # Emit tool invocation event to frontend
            self.output_subject.on_next({
                'event': {
                    'toolLog': {
                        'type': 'invocation',
                        'toolName': tool_name,
                        'toolUseId': tool_use_id,
                        'input': tool_input
                    }
                }
            })
            
            # Execute the tool
            logger.info(f"⚙️  Executing tool: {tool_name}...")
            tool_result = await self.execute_tool(tool_name, tool_input)
            
            logger.info(f"✅ Tool execution complete!")
            logger.info(f"  - Tool Result: {json.dumps(tool_result, indent=4)}")
            logger.info(f"=" * 80)
            
            # Emit tool result event to frontend
            self.output_subject.on_next({
                'event': {
                    'toolLog': {
                        'type': 'result',
                        'toolName': tool_name,
                        'toolUseId': tool_use_id,
                        'result': tool_result
                    }
                }
            })
            
            # Send the result back
            logger.info(f"📤 Sending tool result back to agent...")
            await self.send_tool_result(tool_use_id, tool_result)
            logger.info(f"✅ Tool result sent successfully!")
            logger.info(f"=" * 80)
        
        elif 'audioOutput' in event:
            audio_content = event['audioOutput']['content']
            audio_bytes = base64.b64decode(audio_content)
            await self.audio_output_queue.put(audio_bytes)
            logger.debug(f"Audio output received: {len(audio_bytes)} bytes")
    
    async def get_events_stream(self) -> AsyncIterator[dict]:
        """Get an async iterator of events from the output subject."""
        queue = asyncio.Queue()
        subscription = None
        
        def on_next(event):
            asyncio.create_task(queue.put(event))
        
        def on_error(error):
            asyncio.create_task(queue.put({"error": str(error)}))
        
        def on_completed():
            asyncio.create_task(queue.put(None))
        
        try:
            subscription = self.output_subject.subscribe(
                on_next=on_next,
                on_error=on_error,
                on_completed=on_completed
            )
            
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield event
        finally:
            # Clean up subscription when stream closes
            if subscription is not None:
                subscription.dispose()
                logger.debug("Event stream subscription disposed")
    
    async def close(self):
        """Close the stream properly."""
        if not self.is_active:
            return
        
        logger.info("Closing Nova Sonic client")
        
        # Complete the subjects
        self.input_subject.on_completed()
        self.audio_subject.on_completed()
        
        if self.response_task and not self.response_task.done():
            self.response_task.cancel()
            try:
                await self.response_task
            except asyncio.CancelledError:
                pass
        
        await self.send_audio_content_end_event()
        await self.send_prompt_end_event()
        await self.send_session_end_event()
        
        if self.stream_response:
            await self.stream_response.input_stream.close()
        
        logger.info("Nova Sonic client closed")
