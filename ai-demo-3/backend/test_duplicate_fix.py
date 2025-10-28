#!/usr/bin/env python3
"""
Test script to verify duplicate transcript fix.
Tests that only one SSE stream can be active per session.
"""
import asyncio
import httpx
import sys

API_URL = "http://localhost:8000"

async def test_duplicate_stream_prevention():
    """Test that duplicate SSE streams are properly prevented."""
    print("=" * 60)
    print("Testing Duplicate Stream Prevention")
    print("=" * 60)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Step 1: Create a session
        print("\n1. Creating session...")
        response = await client.post(
            f"{API_URL}/session/start",
            json={"system_prompt": "You are a test assistant."}
        )
        
        if response.status_code != 200:
            print(f"❌ Failed to create session: {response.status_code}")
            print(response.text)
            return False
        
        session_data = response.json()
        session_id = session_data["session_id"]
        print(f"✅ Session created: {session_id}")
        
        # Step 2: Connect first SSE stream (should succeed)
        print("\n2. Connecting first SSE stream...")
        try:
            # Start first stream in background
            first_stream_task = asyncio.create_task(
                connect_sse_stream(client, session_id, "Stream #1")
            )
            
            # Give it time to establish
            await asyncio.sleep(2)
            
            # Check if first stream is active
            response = await client.get(f"{API_URL}/session/{session_id}/info")
            if response.status_code == 200:
                print(f"✅ First stream connected successfully")
            else:
                print(f"⚠️  Could not verify first stream")
            
            # Step 3: Try to connect second SSE stream (should fail with 409)
            print("\n3. Attempting to connect second SSE stream (should be rejected)...")
            
            try:
                async with client.stream("GET", f"{API_URL}/events/stream/{session_id}") as stream:
                    if stream.status_code == 409:
                        print("✅ Second stream correctly rejected with 409 Conflict!")
                        print(f"   Response: {await stream.aread()}")
                        # Cancel first stream
                        first_stream_task.cancel()
                        return True
                    else:
                        print(f"❌ Second stream was NOT rejected! Status: {stream.status_code}")
                        first_stream_task.cancel()
                        return False
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 409:
                    print("✅ Second stream correctly rejected with 409 Conflict!")
                    first_stream_task.cancel()
                    return True
                else:
                    raise
            
        except Exception as e:
            print(f"❌ Test failed with error: {e}")
            import traceback
            traceback.print_exc()
            return False
        finally:
            # Cleanup
            print("\n4. Cleaning up session...")
            try:
                await client.delete(f"{API_URL}/session/{session_id}")
                print("✅ Session cleaned up")
            except:
                pass


async def connect_sse_stream(client, session_id, name):
    """Connect to SSE stream and keep it open."""
    print(f"   [{name}] Connecting...")
    try:
        async with client.stream("GET", f"{API_URL}/events/stream/{session_id}") as stream:
            print(f"   [{name}] Connected with status: {stream.status_code}")
            if stream.status_code == 200:
                # Keep stream open
                async for line in stream.aiter_lines():
                    pass  # Just keep connection alive
    except asyncio.CancelledError:
        print(f"   [{name}] Cancelled")
    except Exception as e:
        print(f"   [{name}] Error: {e}")


async def main():
    """Run the test."""
    print("\n🧪 Duplicate Transcript Fix - Verification Test\n")
    
    success = await test_duplicate_stream_prevention()
    
    print("\n" + "=" * 60)
    if success:
        print("✅ TEST PASSED - Duplicate streams are properly prevented!")
    else:
        print("❌ TEST FAILED - Duplicate streams may still be possible!")
    print("=" * 60 + "\n")
    
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

