#!/usr/bin/env python3
"""
Test client for AI Demo 3 Backend
Demonstrates round-trip audio streaming with Nova Sonic.
"""
import asyncio
import base64
import json
import sys
import os
from pathlib import Path
import httpx
from sseclient import SSEClient

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))


class NovaSonicTestClient:
    """Test client for Nova Sonic API."""
    
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.session_id = None
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def start_session(self, system_prompt: str = None):
        """Start a new session."""
        url = f"{self.base_url}/session/start"
        payload = {}
        if system_prompt:
            payload["system_prompt"] = system_prompt
        
        print(f"Starting session...")
        response = await self.client.post(url, json=payload)
        response.raise_for_status()
        
        data = response.json()
        self.session_id = data["session_id"]
        print(f"✓ Session started: {self.session_id}")
        print(f"  Status: {data['status']}")
        print(f"  Created: {data['created_at']}")
        return self.session_id
    
    async def send_audio_file(self, audio_file_path: str):
        """Send an audio file in chunks."""
        if not self.session_id:
            raise ValueError("No active session")
        
        print(f"\nSending audio file: {audio_file_path}")
        
        # Read audio file
        with open(audio_file_path, 'rb') as f:
            audio_data = f.read()
        
        # Send in chunks (simulate streaming)
        chunk_size = 4096  # 4KB chunks
        url = f"{self.base_url}/audio/chunk"
        
        for i in range(0, len(audio_data), chunk_size):
            chunk = audio_data[i:i + chunk_size]
            audio_base64 = base64.b64encode(chunk).decode('utf-8')
            
            payload = {
                "session_id": self.session_id,
                "audio_data": audio_base64,
                "format": "pcm",
                "sample_rate": 16000,
                "channels": 1
            }
            
            response = await self.client.post(url, json=payload)
            response.raise_for_status()
            
            result = response.json()
            print(f"  Sent chunk {i//chunk_size + 1}: {result['bytes_sent']} bytes")
            
            # Small delay to simulate real-time streaming
            await asyncio.sleep(0.05)
        
        print(f"✓ Audio file sent completely")
    
    async def send_simulated_audio(self, duration_seconds: float = 2.0):
        """Send simulated audio data (silence)."""
        if not self.session_id:
            raise ValueError("No active session")
        
        print(f"\nSending {duration_seconds}s of simulated audio...")
        
        # Generate silence (16-bit PCM, 16kHz mono)
        sample_rate = 16000
        samples_per_chunk = 512
        num_chunks = int((sample_rate * duration_seconds) / samples_per_chunk)
        
        url = f"{self.base_url}/audio/chunk"
        
        for i in range(num_chunks):
            # Create silent audio chunk (zeros)
            chunk = b'\x00\x00' * samples_per_chunk
            audio_base64 = base64.b64encode(chunk).decode('utf-8')
            
            payload = {
                "session_id": self.session_id,
                "audio_data": audio_base64,
                "format": "pcm",
                "sample_rate": 16000,
                "channels": 1
            }
            
            response = await self.client.post(url, json=payload)
            response.raise_for_status()
            
            # Small delay to simulate real-time
            await asyncio.sleep(samples_per_chunk / sample_rate)
        
        print(f"✓ Simulated audio sent")
    
    async def end_audio(self):
        """Signal end of audio input."""
        if not self.session_id:
            raise ValueError("No active session")
        
        url = f"{self.base_url}/audio/end"
        payload = {"session_id": self.session_id}
        
        print(f"\nEnding audio input...")
        response = await self.client.post(url, json=payload)
        response.raise_for_status()
        
        print(f"✓ Audio input ended")
    
    async def stream_events(self, output_dir: str = "output"):
        """Stream events from the server."""
        if not self.session_id:
            raise ValueError("No active session")
        
        # Create output directory
        Path(output_dir).mkdir(exist_ok=True)
        
        url = f"{self.base_url}/events/stream/{self.session_id}"
        print(f"\n=== Streaming Events ===")
        print(f"Listening for responses from Nova Sonic...")
        print()
        
        audio_chunks = []
        transcript_parts = []
        
        async with self.client.stream('GET', url) as response:
            response.raise_for_status()
            
            async for line in response.aiter_lines():
                if not line:
                    continue
                
                # Parse SSE format
                if line.startswith('event:'):
                    event_type = line.split(':', 1)[1].strip()
                elif line.startswith('data:'):
                    data_str = line.split(':', 1)[1].strip()
                    
                    try:
                        data = json.loads(data_str)
                        
                        if data.get('type') == 'transcript':
                            speaker = data['speaker'].upper()
                            text = data['text']
                            print(f"[{speaker}]: {text}")
                            transcript_parts.append(f"{speaker}: {text}")
                        
                        elif data.get('type') == 'audio_response':
                            audio_data = data['audio_data']
                            audio_bytes = base64.b64decode(audio_data)
                            audio_chunks.append(audio_bytes)
                            print(f"  🔊 Audio chunk received: {len(audio_bytes)} bytes")
                        
                        elif data.get('type') == 'content_start':
                            role = data.get('role', 'unknown')
                            print(f"\n--- Content Start ({role}) ---")
                        
                        elif data.get('type') == 'content_end':
                            print(f"--- Content End ---\n")
                        
                        elif data.get('type') == 'error':
                            print(f"❌ Error: {data['message']}")
                            break
                    
                    except json.JSONDecodeError:
                        pass
        
        # Save audio output
        if audio_chunks:
            output_file = Path(output_dir) / f"response_{self.session_id[:8]}.raw"
            with open(output_file, 'wb') as f:
                for chunk in audio_chunks:
                    f.write(chunk)
            print(f"\n✓ Audio response saved: {output_file}")
            print(f"  Format: PCM, 24kHz, mono, 16-bit")
            print(f"  Total size: {sum(len(c) for c in audio_chunks)} bytes")
        
        # Save transcript
        if transcript_parts:
            transcript_file = Path(output_dir) / f"transcript_{self.session_id[:8]}.txt"
            with open(transcript_file, 'w') as f:
                f.write('\n'.join(transcript_parts))
            print(f"✓ Transcript saved: {transcript_file}")
    
    async def get_session_info(self):
        """Get session information."""
        if not self.session_id:
            raise ValueError("No active session")
        
        url = f"{self.base_url}/session/{self.session_id}/info"
        response = await self.client.get(url)
        response.raise_for_status()
        
        info = response.json()
        print(f"\n=== Session Info ===")
        print(f"Session ID: {info['session_id']}")
        print(f"Status: {info['status']}")
        print(f"Created: {info['created_at']}")
        print(f"Last Activity: {info.get('last_activity', 'N/A')}")
        print(f"Audio Sent: {info.get('audio_bytes_sent', 0)} bytes")
        print(f"Audio Received: {info.get('audio_bytes_received', 0)} bytes")
        print(f"Messages: {info.get('message_count', 0)}")
    
    async def end_session(self):
        """End the session."""
        if not self.session_id:
            return
        
        url = f"{self.base_url}/session/{self.session_id}"
        print(f"\nEnding session {self.session_id}...")
        
        response = await self.client.delete(url)
        response.raise_for_status()
        
        print(f"✓ Session ended")
        self.session_id = None
    
    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()


async def test_round_trip():
    """Test round-trip audio streaming."""
    print("=" * 60)
    print("AI Demo 3 - Nova Sonic Test Client")
    print("=" * 60)
    
    client = NovaSonicTestClient()
    
    try:
        # 1. Start session
        await client.start_session(
            system_prompt="You are a friendly assistant. Keep your responses to 2-3 sentences."
        )
        
        # 2. Check if we have a test audio file
        test_audio_file = "test_audio.raw"
        if Path(test_audio_file).exists():
            await client.send_audio_file(test_audio_file)
        else:
            print(f"\nNote: No test audio file found at '{test_audio_file}'")
            print("Sending simulated audio instead...")
            await client.send_simulated_audio(duration_seconds=2.0)
        
        # 3. End audio input
        await client.end_audio()
        
        # 4. Stream events (this will wait for Nova Sonic responses)
        await client.stream_events()
        
        # 5. Get session info
        await client.get_session_info()
        
        # 6. End session
        await client.end_session()
        
        print("\n" + "=" * 60)
        print("✓ Test completed successfully!")
        print("=" * 60)
    
    except httpx.HTTPStatusError as e:
        print(f"\n❌ HTTP Error: {e.response.status_code}")
        print(f"   {e.response.text}")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await client.close()


async def test_health_check():
    """Test health check endpoint."""
    print("Testing health check endpoint...")
    
    async with httpx.AsyncClient() as client:
        response = await client.get("http://localhost:8000/health")
        response.raise_for_status()
        
        data = response.json()
        print(f"✓ Service is healthy")
        print(f"  Status: {data['status']}")
        print(f"  Version: {data['version']}")
        print(f"  Timestamp: {data['timestamp']}")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Test Nova Sonic API')
    parser.add_argument('--health', action='store_true', help='Test health check only')
    parser.add_argument('--url', default='http://localhost:8000', help='API base URL')
    args = parser.parse_args()
    
    try:
        if args.health:
            asyncio.run(test_health_check())
        else:
            asyncio.run(test_round_trip())
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
    except Exception as e:
        print(f"\nFatal error: {e}")
        sys.exit(1)

