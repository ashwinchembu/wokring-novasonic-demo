#!/usr/bin/env python3
"""
Test script for Prompting API endpoints
Demonstrates slot-filling workflow via REST API.
"""
import requests
import json
import sys
import time


BASE_URL = "http://localhost:8000"
SESSION_ID = f"test-session-{int(time.time())}"


def print_section(title):
    """Print a formatted section header."""
    print("\n" + "="*70)
    print(f"  {title}")
    print("="*70)


def print_response(response):
    """Pretty print a response."""
    if response.status_code >= 400:
        print(f"❌ Error {response.status_code}: {response.text}")
        return False
    
    try:
        data = response.json()
        print(json.dumps(data, indent=2))
        return True
    except:
        print(response.text)
        return True


def test_health_check():
    """Test basic health check."""
    print_section("1. Health Check")
    response = requests.get(f"{BASE_URL}/health")
    if print_response(response):
        print("✅ API is healthy")
        return True
    return False


def test_list_hcps():
    """Test HCP listing."""
    print_section("2. List All HCPs")
    response = requests.get(f"{BASE_URL}/hcp/list")
    if print_response(response):
        print("✅ HCP list retrieved")
        return True
    return False


def test_hcp_lookup():
    """Test HCP lookup with various inputs."""
    print_section("3. HCP Lookup Tests")
    
    # Test exact match
    print("\n3a. Exact match: 'Dr. William Harper'")
    response = requests.get(f"{BASE_URL}/hcp/lookup", params={"name": "Dr. William Harper"})
    print_response(response)
    
    # Test partial match
    print("\n3b. Partial match: 'Harper'")
    response = requests.get(f"{BASE_URL}/hcp/lookup", params={"name": "Harper"})
    print_response(response)
    
    # Test case-insensitive
    print("\n3c. Case-insensitive: 'dr. susan carter'")
    response = requests.get(f"{BASE_URL}/hcp/lookup", params={"name": "dr. susan carter"})
    print_response(response)
    
    # Test invalid name
    print("\n3d. Invalid name: 'Dr. Nobody'")
    response = requests.get(f"{BASE_URL}/hcp/lookup", params={"name": "Dr. Nobody"})
    print_response(response)
    
    print("✅ HCP lookup tests completed")
    return True


def test_conversation_flow():
    """Test complete conversation flow."""
    print_section(f"4. Conversation Flow (Session: {SESSION_ID})")
    
    # Step 1: Get initial state (should be empty)
    print("\n4a. Get initial conversation state")
    response = requests.get(f"{BASE_URL}/conversation/{SESSION_ID}/state")
    if not print_response(response):
        # Session doesn't exist yet, which is expected
        print("ℹ️  Session doesn't exist yet (expected)")
    
    # Step 2: Set HCP name
    print("\n4b. Set HCP name: 'Dr. William Harper'")
    response = requests.post(
        f"{BASE_URL}/conversation/{SESSION_ID}/slot",
        params={"slot_name": "hcp_name", "value": "Dr. William Harper"}
    )
    if not print_response(response):
        return False
    print("✅ HCP name set (ID should be automatically populated)")
    
    # Step 3: Get state after HCP name
    print("\n4c. Get state after setting HCP name")
    response = requests.get(f"{BASE_URL}/conversation/{SESSION_ID}/state")
    if not print_response(response):
        return False
    
    # Step 4: Set date
    print("\n4d. Set date: '2025-10-28'")
    response = requests.post(
        f"{BASE_URL}/conversation/{SESSION_ID}/slot",
        params={"slot_name": "date", "value": "2025-10-28"}
    )
    if not print_response(response):
        return False
    
    # Step 5: Set time
    print("\n4e. Set time: '14:30'")
    response = requests.post(
        f"{BASE_URL}/conversation/{SESSION_ID}/slot",
        params={"slot_name": "time", "value": "14:30"}
    )
    if not print_response(response):
        return False
    
    # Step 6: Set product
    print("\n4f. Set product: 'Medication XYZ'")
    response = requests.post(
        f"{BASE_URL}/conversation/{SESSION_ID}/slot",
        params={"slot_name": "product", "value": "Medication XYZ"}
    )
    if not print_response(response):
        return False
    print("✅ All required slots filled")
    
    # Step 7: Add optional call notes
    print("\n4g. Set call notes")
    response = requests.post(
        f"{BASE_URL}/conversation/{SESSION_ID}/slot",
        params={
            "slot_name": "call_notes", 
            "value": "Discussed efficacy and safety profile. HCP showed interest in clinical trial data."
        }
    )
    if not print_response(response):
        return False
    
    # Step 8: Get summary
    print("\n4h. Get conversation summary")
    response = requests.get(f"{BASE_URL}/conversation/{SESSION_ID}/summary")
    if not print_response(response):
        return False
    print("✅ Summary generated")
    
    # Step 9: Get final output JSON
    print("\n4i. Generate final JSON output")
    response = requests.get(f"{BASE_URL}/conversation/{SESSION_ID}/output")
    if not print_response(response):
        return False
    print("✅ Final JSON output generated")
    
    # Step 10: Get complete state
    print("\n4j. Get complete conversation state")
    response = requests.get(f"{BASE_URL}/conversation/{SESSION_ID}/state")
    if not print_response(response):
        return False
    
    print("✅ Complete conversation flow tested successfully")
    return True


def test_missing_slots():
    """Test behavior with missing slots."""
    print_section("5. Test Missing Slots Handling")
    
    incomplete_session = f"test-incomplete-{int(time.time())}"
    
    # Set only HCP name
    print(f"\n5a. Create incomplete session (only HCP name)")
    response = requests.post(
        f"{BASE_URL}/conversation/{incomplete_session}/slot",
        params={"slot_name": "hcp_name", "value": "Dr. Susan Carter"}
    )
    if not print_response(response):
        return False
    
    # Try to get summary (should fail or show incomplete)
    print("\n5b. Try to get summary (should show incomplete)")
    response = requests.get(f"{BASE_URL}/conversation/{incomplete_session}/summary")
    print_response(response)
    
    # Try to get output (should fail)
    print("\n5c. Try to get output JSON (should fail)")
    response = requests.get(f"{BASE_URL}/conversation/{incomplete_session}/output")
    print_response(response)
    print("ℹ️  Expected error for incomplete slots")
    
    # Clean up
    print("\n5d. Clean up incomplete session")
    response = requests.delete(f"{BASE_URL}/conversation/{incomplete_session}")
    print_response(response)
    
    print("✅ Missing slots handling tested")
    return True


def test_invalid_hcp():
    """Test invalid HCP name handling."""
    print_section("6. Test Invalid HCP Name")
    
    invalid_session = f"test-invalid-{int(time.time())}"
    
    print("\n6a. Try to set invalid HCP name")
    response = requests.post(
        f"{BASE_URL}/conversation/{invalid_session}/slot",
        params={"slot_name": "hcp_name", "value": "Dr. Invalid Doctor"}
    )
    print_response(response)
    print("ℹ️  Expected error for invalid HCP name")
    
    print("✅ Invalid HCP handling tested")
    return True


def test_cleanup():
    """Clean up test session."""
    print_section("7. Cleanup")
    
    print(f"\n7a. Delete test session: {SESSION_ID}")
    response = requests.delete(f"{BASE_URL}/conversation/{SESSION_ID}")
    if print_response(response):
        print("✅ Test session cleaned up")
        return True
    return False


def main():
    """Run all tests."""
    print("\n" + "="*70)
    print("  PROMPTING API TEST SUITE")
    print("="*70)
    print(f"\nBase URL: {BASE_URL}")
    print(f"Test Session ID: {SESSION_ID}")
    
    try:
        # Check if server is running
        if not test_health_check():
            print("\n❌ Server is not responding. Please start the server first:")
            print("   cd backend && python -m app.main")
            return 1
        
        # Run tests
        tests = [
            test_list_hcps,
            test_hcp_lookup,
            test_conversation_flow,
            test_missing_slots,
            test_invalid_hcp,
            test_cleanup
        ]
        
        passed = 0
        failed = 0
        
        for test in tests:
            try:
                if test():
                    passed += 1
                else:
                    failed += 1
            except Exception as e:
                print(f"\n❌ Test failed with exception: {e}")
                import traceback
                traceback.print_exc()
                failed += 1
        
        print("\n" + "="*70)
        print("  TEST SUMMARY")
        print("="*70)
        print(f"  Passed: {passed}/{len(tests)}")
        print(f"  Failed: {failed}/{len(tests)}")
        
        if failed == 0:
            print("\n  ✅ ALL TESTS PASSED!")
            print("="*70 + "\n")
            return 0
        else:
            print("\n  ❌ SOME TESTS FAILED")
            print("="*70 + "\n")
            return 1
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Tests interrupted by user")
        return 1
    except Exception as e:
        print(f"\n\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())

