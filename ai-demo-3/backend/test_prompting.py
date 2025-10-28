#!/usr/bin/env python3
"""
Test script for prompting.py module
Validates slot tracking, HCP lookup, and JSON generation.
"""
import sys
import json
from app.prompting import (
    AGENT_683_SYSTEM_PROMPT,
    ConversationSession,
    lookup_hcp_id,
    validate_hcp_name,
    get_next_question,
    format_json_output,
    get_all_hcp_names,
    REQUIRED_SLOTS
)


def test_hcp_lookup():
    """Test HCP name to ID lookup functionality."""
    print("\n" + "="*60)
    print("TEST: HCP Lookup")
    print("="*60)
    
    # Test exact match
    hcp_id = lookup_hcp_id("Dr. William Harper")
    assert hcp_id == "0013K000013ez2RQAQ", f"Expected 0013K000013ez2RQAQ, got {hcp_id}"
    print("✓ Exact match: Dr. William Harper -> 0013K000013ez2RQAQ")
    
    # Test case-insensitive match
    hcp_id = lookup_hcp_id("dr. william harper")
    assert hcp_id == "0013K000013ez2RQAQ", f"Expected 0013K000013ez2RQAQ, got {hcp_id}"
    print("✓ Case-insensitive: dr. william harper -> 0013K000013ez2RQAQ")
    
    # Test partial match
    hcp_id = lookup_hcp_id("Harper")
    assert hcp_id == "0013K000013ez2RQAQ", f"Expected 0013K000013ez2RQAQ, got {hcp_id}"
    print("✓ Partial match: Harper -> 0013K000013ez2RQAQ")
    
    # Test invalid name
    hcp_id = lookup_hcp_id("Dr. Unknown Doctor")
    assert hcp_id is None, f"Expected None for unknown doctor, got {hcp_id}"
    print("✓ Invalid name returns None")
    
    print("\nAll HCP lookup tests passed! ✓")


def test_hcp_validation():
    """Test HCP name validation."""
    print("\n" + "="*60)
    print("TEST: HCP Validation")
    print("="*60)
    
    # Valid HCP
    is_valid, full_name, hcp_id = validate_hcp_name("Dr. Susan Carter")
    assert is_valid, "Should be valid"
    assert full_name == "Dr. Susan Carter"
    assert hcp_id == "0013K000013ez2SQAQ"
    print(f"✓ Valid HCP: {full_name} -> {hcp_id}")
    
    # Invalid HCP
    is_valid, full_name, hcp_id = validate_hcp_name("Dr. Nobody")
    assert not is_valid, "Should be invalid"
    assert full_name is None
    assert hcp_id is None
    print("✓ Invalid HCP returns False")
    
    print("\nAll HCP validation tests passed! ✓")


def test_conversation_session():
    """Test ConversationSession slot tracking."""
    print("\n" + "="*60)
    print("TEST: Conversation Session")
    print("="*60)
    
    session = ConversationSession("test-session-1")
    
    # Check initial state
    assert not session.all_required_slots_filled(), "Should not be complete initially"
    missing = session.get_missing_required_slots()
    assert set(missing) == set(REQUIRED_SLOTS), f"Expected all slots missing, got {missing}"
    print(f"✓ Initial state: Missing slots = {missing}")
    
    # Fill slots one by one
    session.set_slot("hcp_name", "Dr. William Harper")
    session.set_slot("hcp_id", "0013K000013ez2RQAQ")
    assert not session.all_required_slots_filled(), "Should still have missing slots"
    print(f"✓ After HCP name: Missing slots = {session.get_missing_required_slots()}")
    
    session.set_slot("date", "2025-10-28")
    session.set_slot("time", "14:30")
    assert not session.all_required_slots_filled(), "Should still have missing product"
    print(f"✓ After date/time: Missing slots = {session.get_missing_required_slots()}")
    
    session.set_slot("product", "Product XYZ")
    assert session.all_required_slots_filled(), "Should be complete now"
    print("✓ All required slots filled")
    
    # Add transcript turns
    session.add_turn("USER", "I met with Dr. Harper")
    session.add_turn("ASSISTANT", "Great! What date was the meeting?")
    assert len(session.transcript) == 2, "Should have 2 turns"
    print(f"✓ Transcript has {len(session.transcript)} turns")
    
    # Generate summary
    summary = session.generate_summary()
    assert "Dr. William Harper" in summary, "Summary should contain HCP name"
    assert "0013K000013ez2RQAQ" in summary, "Summary should contain HCP ID"
    print(f"✓ Generated summary: {summary[:100]}...")
    
    print("\nAll conversation session tests passed! ✓")


def test_json_generation():
    """Test JSON output generation."""
    print("\n" + "="*60)
    print("TEST: JSON Output Generation")
    print("="*60)
    
    session = ConversationSession("test-session-2")
    
    # Fill required slots
    session.set_slot("hcp_name", "Dr. Susan Carter")
    session.set_slot("hcp_id", "0013K000013ez2SQAQ")
    session.set_slot("date", "2025-10-28")
    session.set_slot("time", "15:00")
    session.set_slot("product", "Medication ABC")
    session.set_slot("call_notes", "Discussed efficacy and patient outcomes")
    session.set_slot("discussion_topic", "Clinical trial results")
    
    # Generate JSON
    output = session.generate_output_json()
    
    # Validate structure
    assert "call_channel" in output, "Should have call_channel"
    assert output["call_channel"] == "In-person", "Default should be In-person"
    assert output["account"] == "Dr. Susan Carter", f"Expected Dr. Susan Carter, got {output['account']}"
    assert output["id"] == "0013K000013ez2SQAQ", f"Expected ID, got {output['id']}"
    assert output["call_date"] == "2025-10-28", f"Expected date, got {output['call_date']}"
    assert output["call_time"] == "15:00", f"Expected time, got {output['call_time']}"
    assert output["product"] == "Medication ABC", f"Expected product, got {output['product']}"
    assert output["status"] == "Saved_vod", "Default status should be Saved_vod"
    assert "call_follow_up_task" in output, "Should have follow_up_task"
    
    print("✓ JSON structure validated")
    
    # Pretty print
    json_str = format_json_output(output, pretty=True)
    print("\n✓ Generated JSON:")
    print(json_str)
    
    print("\nAll JSON generation tests passed! ✓")


def test_next_question():
    """Test next question generation."""
    print("\n" + "="*60)
    print("TEST: Next Question Generation")
    print("="*60)
    
    session = ConversationSession("test-session-3")
    
    # First question should be about HCP name
    question = get_next_question(session)
    assert question is not None, "Should have a next question"
    assert "healthcare professional" in question.lower() or "hcp" in question.lower(), \
        f"First question should be about HCP: {question}"
    print(f"✓ First question: {question}")
    
    # Fill HCP name
    session.set_slot("hcp_name", "Dr. James Lawson")
    session.set_slot("hcp_id", "0013K000013ez2TQAQ")
    
    # Next should be about date
    question = get_next_question(session)
    assert question is not None, "Should still have questions"
    assert "date" in question.lower(), f"Second question should be about date: {question}"
    print(f"✓ Second question: {question}")
    
    # Fill all slots
    session.set_slot("date", "2025-10-28")
    session.set_slot("time", "16:00")
    session.set_slot("product", "Product 123")
    
    # Should have no more questions
    question = get_next_question(session)
    assert question is None, f"Should have no more questions, got: {question}"
    print("✓ No more questions after all slots filled")
    
    print("\nAll next question tests passed! ✓")


def test_system_prompt():
    """Test that system prompt is properly defined."""
    print("\n" + "="*60)
    print("TEST: System Prompt")
    print("="*60)
    
    assert AGENT_683_SYSTEM_PROMPT is not None, "System prompt should be defined"
    assert len(AGENT_683_SYSTEM_PROMPT) > 100, "System prompt should be substantial"
    assert "Veeva CRM" in AGENT_683_SYSTEM_PROMPT, "Should mention Veeva CRM"
    assert "HCP name" in AGENT_683_SYSTEM_PROMPT, "Should mention HCP name"
    assert "Dr. William Harper" in AGENT_683_SYSTEM_PROMPT, "Should contain HCP examples"
    
    print(f"✓ System prompt is defined ({len(AGENT_683_SYSTEM_PROMPT)} characters)")
    print(f"\nFirst 200 characters:")
    print(AGENT_683_SYSTEM_PROMPT[:200] + "...")
    
    print("\nSystem prompt test passed! ✓")


def test_list_hcps():
    """Test listing all HCPs."""
    print("\n" + "="*60)
    print("TEST: List All HCPs")
    print("="*60)
    
    hcp_names = get_all_hcp_names()
    assert len(hcp_names) == 16, f"Expected 16 HCPs, got {len(hcp_names)}"
    print(f"✓ Found {len(hcp_names)} HCPs")
    
    print("\nAll HCP names:")
    for i, name in enumerate(hcp_names, 1):
        hcp_id = lookup_hcp_id(name)
        print(f"  {i:2d}. {name:25s} -> {hcp_id}")
    
    print("\nList HCPs test passed! ✓")


def main():
    """Run all tests."""
    print("\n" + "="*60)
    print("PROMPTING MODULE TEST SUITE")
    print("="*60)
    
    try:
        test_system_prompt()
        test_hcp_lookup()
        test_hcp_validation()
        test_list_hcps()
        test_conversation_session()
        test_json_generation()
        test_next_question()
        
        print("\n" + "="*60)
        print("ALL TESTS PASSED! ✅")
        print("="*60 + "\n")
        return 0
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        return 1
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())

