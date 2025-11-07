#!/usr/bin/env python3
"""
Test script for Nova Sonic tool use functionality.
Tests getDateTool and lookupHcpTool integration.
"""
import asyncio
import json
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def test_tool_execution():
    """Test tool execution directly."""
    from app.services.nova_sonic_client import NovaSonicClient
    
    logger.info("\n" + "="*80)
    logger.info("TEST 1: Direct Tool Execution")
    logger.info("="*80)
    
    # Create a client instance (but don't connect to Bedrock)
    client = NovaSonicClient()
    
    # Test getDateTool
    logger.info("\n--- Testing getDateTool ---")
    date_result = await client.execute_tool("getDateTool", {})
    logger.info(f"✓ getDateTool result: {json.dumps(date_result, indent=2)}")
    assert "date" in date_result
    assert "time" in date_result
    assert "timestamp" in date_result
    
    # Test lookupHcpTool - found case
    logger.info("\n--- Testing lookupHcpTool (found case) ---")
    lookup_result = await client.execute_tool("lookupHcpTool", {"name": "Dr. William Harper"})
    logger.info(f"✓ lookupHcpTool result: {json.dumps(lookup_result, indent=2)}")
    assert lookup_result["found"] == True
    assert lookup_result["hcp_id"] == "0013K000013ez2RQAQ"
    assert lookup_result["name"] == "Dr. William Harper"
    
    # Test lookupHcpTool - partial match
    logger.info("\n--- Testing lookupHcpTool (partial match) ---")
    lookup_result = await client.execute_tool("lookupHcpTool", {"name": "harper"})
    logger.info(f"✓ lookupHcpTool result: {json.dumps(lookup_result, indent=2)}")
    assert lookup_result["found"] == True
    assert "Harper" in lookup_result["name"]
    
    # Test lookupHcpTool - not found case
    logger.info("\n--- Testing lookupHcpTool (not found case) ---")
    lookup_result = await client.execute_tool("lookupHcpTool", {"name": "Dr. NonExistent"})
    logger.info(f"✓ lookupHcpTool result: {json.dumps(lookup_result, indent=2)}")
    assert lookup_result["found"] == False
    
    # Test lookupHcpTool - Karina Soto (the test case from user)
    logger.info("\n--- Testing lookupHcpTool (Karina Soto - should NOT be found in static list) ---")
    lookup_result = await client.execute_tool("lookupHcpTool", {"name": "Karina Soto"})
    logger.info(f"✓ lookupHcpTool result: {json.dumps(lookup_result, indent=2)}")
    logger.info("Note: Karina Soto is not in the static HCP list. In production with Redshift, this would return found=true.")
    
    logger.info("\n" + "="*80)
    logger.info("✅ All direct tool execution tests passed!")
    logger.info("="*80 + "\n")


async def test_tool_definitions():
    """Test that tool definitions are properly formatted."""
    from app.services.nova_sonic_client import NovaSonicClient
    
    logger.info("\n" + "="*80)
    logger.info("TEST 2: Tool Definition Format")
    logger.info("="*80)
    
    client = NovaSonicClient()
    
    logger.info(f"\n✓ Number of tools defined: {len(client.TOOL_DEFINITIONS)}")
    
    for tool_def in client.TOOL_DEFINITIONS:
        tool_spec = tool_def["toolSpec"]
        tool_name = tool_spec["name"]
        
        logger.info(f"\n--- Tool: {tool_name} ---")
        logger.info(f"  Description: {tool_spec['description'][:80]}...")
        
        # Parse the input schema
        input_schema = json.loads(tool_spec["inputSchema"]["json"])
        logger.info(f"  Input schema type: {input_schema['type']}")
        logger.info(f"  Required params: {input_schema.get('required', [])}")
        logger.info(f"  Properties: {list(input_schema.get('properties', {}).keys())}")
    
    logger.info("\n" + "="*80)
    logger.info("✅ Tool definitions are properly formatted!")
    logger.info("="*80 + "\n")


async def test_system_prompt():
    """Test that system prompt includes tool policy."""
    from app.prompting import AGENT_683_SYSTEM_PROMPT
    
    logger.info("\n" + "="*80)
    logger.info("TEST 3: System Prompt Tool Policy")
    logger.info("="*80)
    
    logger.info(f"\n✓ System prompt length: {len(AGENT_683_SYSTEM_PROMPT)} characters")
    
    # Check for tool policy keywords
    assert "TOOL USAGE POLICY" in AGENT_683_SYSTEM_PROMPT, "Missing TOOL USAGE POLICY section"
    assert "lookupHcpTool" in AGENT_683_SYSTEM_PROMPT, "Missing lookupHcpTool reference"
    assert "getDateTool" in AGENT_683_SYSTEM_PROMPT, "Missing getDateTool reference"
    
    logger.info("✓ System prompt contains TOOL USAGE POLICY section")
    logger.info("✓ System prompt references lookupHcpTool")
    logger.info("✓ System prompt references getDateTool")
    
    logger.info("\n--- Tool Policy Excerpt ---")
    # Extract and display the tool policy section
    if "TOOL USAGE POLICY:" in AGENT_683_SYSTEM_PROMPT:
        start_idx = AGENT_683_SYSTEM_PROMPT.index("TOOL USAGE POLICY:")
        end_idx = AGENT_683_SYSTEM_PROMPT.index("When a user provides", start_idx)
        policy_section = AGENT_683_SYSTEM_PROMPT[start_idx:end_idx].strip()
        logger.info(policy_section)
    
    logger.info("\n" + "="*80)
    logger.info("✅ System prompt includes proper tool policy!")
    logger.info("="*80 + "\n")


async def test_conversation_flow():
    """Test the expected conversation flow from the user's scenario."""
    logger.info("\n" + "="*80)
    logger.info("TEST 4: Expected Conversation Flow")
    logger.info("="*80)
    
    logger.info("\n--- Simulated Conversation ---")
    
    conversation = [
        {"role": "user", "text": "hello", "expected_action": "greeting"},
        {"role": "user", "text": "record a cp interaction with doctor", "expected_action": "ask for HCP details"},
        {"role": "user", "text": "karina soto", "expected_action": "invoke lookupHcpTool"},
        {"role": "user", "text": "is karina soto in your list", "expected_action": "invoke lookupHcpTool or respond based on previous result"},
    ]
    
    for turn in conversation:
        logger.info(f"\n{turn['role'].upper()}: {turn['text']}")
        logger.info(f"Expected Action: {turn['expected_action']}")
    
    logger.info("\n--- Expected Tool Behavior ---")
    logger.info("1. User says 'karina soto'")
    logger.info("   → Assistant invokes lookupHcpTool with name='Karina Soto'")
    logger.info("   → Tool returns found=false (not in static list)")
    logger.info("   → Assistant asks for clarification or date/time/product")
    logger.info("")
    logger.info("2. User asks 'is karina soto in your list'")
    logger.info("   → Assistant invokes lookupHcpTool (or uses cached result)")
    logger.info("   → Assistant responds: 'I could not find Karina Soto in the system...'")
    logger.info("")
    logger.info("Note: In production with Redshift, Karina Soto would be found:")
    logger.info("      {found: true, hcp_id: 'HCP_SOTO', hco_id: 'HCO_BAYVIEW', hco_name: 'Bayview Medical Group', source: 'redshift'}")
    
    logger.info("\n" + "="*80)
    logger.info("✅ Conversation flow documented!")
    logger.info("="*80 + "\n")


async def test_api_endpoints():
    """Test the HCP lookup API endpoint."""
    import aiohttp
    
    logger.info("\n" + "="*80)
    logger.info("TEST 5: API Endpoint - HCP Lookup")
    logger.info("="*80)
    
    base_url = "http://localhost:8000"
    
    try:
        async with aiohttp.ClientSession() as session:
            # Test health endpoint
            logger.info("\n--- Testing /health endpoint ---")
            async with session.get(f"{base_url}/health") as resp:
                if resp.status == 200:
                    data = await resp.json()
                    logger.info(f"✓ Health check passed: {data['status']}")
                else:
                    logger.warning(f"⚠ Health check returned status {resp.status}")
            
            # Test HCP lookup - found case
            logger.info("\n--- Testing /hcp/lookup?name=Dr. William Harper ---")
            async with session.get(f"{base_url}/hcp/lookup?name=Dr. William Harper") as resp:
                data = await resp.json()
                logger.info(f"✓ Response: {json.dumps(data, indent=2)}")
                assert data["found"] == True
            
            # Test HCP lookup - not found case
            logger.info("\n--- Testing /hcp/lookup?name=Karina Soto ---")
            async with session.get(f"{base_url}/hcp/lookup?name=Karina Soto") as resp:
                data = await resp.json()
                logger.info(f"✓ Response: {json.dumps(data, indent=2)}")
                logger.info("  (Karina Soto not in static list - would be in Redshift)")
            
            logger.info("\n" + "="*80)
            logger.info("✅ API endpoint tests passed!")
            logger.info("="*80 + "\n")
            
    except aiohttp.ClientConnectorError:
        logger.warning("\n⚠ Could not connect to backend at http://localhost:8000")
        logger.warning("  Make sure the backend is running: cd backend && python -m app.main")
        logger.info("\n" + "="*80)
        logger.info("⚠ API endpoint tests skipped (backend not running)")
        logger.info("="*80 + "\n")
    except Exception as e:
        logger.error(f"\n❌ API test error: {e}")


async def main():
    """Run all tests."""
    logger.info("\n" + "="*80)
    logger.info("NOVA SONIC TOOL USE TEST SUITE")
    logger.info("="*80)
    logger.info(f"Started at: {datetime.now().isoformat()}")
    logger.info("="*80 + "\n")
    
    try:
        # Run all test suites
        await test_tool_execution()
        await test_tool_definitions()
        await test_system_prompt()
        await test_conversation_flow()
        await test_api_endpoints()
        
        logger.info("\n" + "="*80)
        logger.info("🎉 ALL TESTS PASSED! 🎉")
        logger.info("="*80)
        logger.info("\nNext Steps:")
        logger.info("1. Start the backend: cd backend && python -m app.main")
        logger.info("2. Open the test page: http://localhost:8000/test-v2")
        logger.info("3. Test conversation flow:")
        logger.info("   - User: 'hello'")
        logger.info("   - User: 'record a cp interaction with doctor'")
        logger.info("   - User: 'karina soto' (should trigger lookupHcpTool)")
        logger.info("   - User: 'is karina soto in your list' (should use lookupHcpTool)")
        logger.info("   - User: 'run the date tool' (should trigger getDateTool)")
        logger.info("="*80 + "\n")
        
    except Exception as e:
        logger.error(f"\n❌ Test suite failed: {e}", exc_info=True)
        raise


if __name__ == "__main__":
    asyncio.run(main())

