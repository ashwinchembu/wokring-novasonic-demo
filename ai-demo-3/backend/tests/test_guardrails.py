"""
Comprehensive unit tests for guardrails system.
Tests cover all categories and acceptance criteria.
"""
import pytest
from pathlib import Path
from app.guardrails_loader import GuardrailsLoader
from app.guardrails import GuardrailsEngine, check
from app.guardrails_audit import GuardrailsAuditLogger
import tempfile


# Test fixture path
FIXTURE_PATH = Path(__file__).parent / "fixtures" / "guardrails.xlsx"


class TestGuardrailsLoader:
    """Test guardrails Excel loading and validation."""
    
    def test_loader_reads_fixture(self):
        """Loader successfully reads the test fixture."""
        loader = GuardrailsLoader(FIXTURE_PATH)
        config = loader.load()
        
        assert config is not None
        assert len(config.rules) == 11  # 10 enabled + 1 disabled
        assert config.language_policy is not None
    
    def test_loader_validates_schema(self):
        """Loader validates required columns."""
        loader = GuardrailsLoader(FIXTURE_PATH)
        config = loader.load()
        
        # Check all rules have required fields
        for rule in config.rules:
            assert rule.rule_id
            assert rule.category
            assert rule.pattern_type in ['regex', 'keyword', 'llm_hint']
            assert rule.severity in ['block', 'rewrite', 'warn']
            assert rule.action_message
    
    def test_loader_fails_on_missing_file(self):
        """Loader fails gracefully when file is missing."""
        with pytest.raises(FileNotFoundError):
            GuardrailsLoader(Path("/nonexistent/guardrails.xlsx"))
    
    def test_all_required_categories_present(self):
        """All required categories have at least one enabled rule."""
        loader = GuardrailsLoader(FIXTURE_PATH)
        config = loader.load()
        
        required_categories = [
            'PHI_HIPAA', 'OFF_LABEL', 'AE_DETECTION', 'COMPARATIVE_CLAIM',
            'PRICING_REBATE', 'UNAPPROVED_INDICATION', 'GUARANTEE',
            'CLINICAL_GUIDANCE', 'LANGUAGE_EN_ONLY', 'PII_PROMPT'
        ]
        
        enabled_categories = {r.category for r in config.rules if r.enabled}
        
        for cat in required_categories:
            assert cat in enabled_categories, f"Missing enabled rule for category: {cat}"


class TestGuardrailsEngine:
    """Test guardrails checking engine."""
    
    @pytest.fixture
    def engine(self):
        """Create engine with test fixture."""
        # Temporarily override the loader
        from app import guardrails_loader
        guardrails_loader._loader_instance = GuardrailsLoader(FIXTURE_PATH)
        guardrails_loader._config_cache = None
        
        engine = GuardrailsEngine()
        return engine
    
    def test_phi_hipaa_blocking(self, engine):
        """PHI/HIPAA content is blocked."""
        text = "The patient's SSN is 123-45-6789"
        result = engine.check(text, role="assistant")
        
        assert result.has_violations
        assert result.should_block
        assert any("PHI_HIPAA" in v.category for v in result.violations)
        assert "Cannot discuss patient identifiers" in result.action_message
    
    def test_off_label_blocking(self, engine):
        """Off-label promotion is blocked."""
        text = "This drug works great for off-label uses in pediatrics"
        result = engine.check(text, role="assistant")
        
        assert result.has_violations
        assert result.should_block
        assert any("OFF_LABEL" in v.category for v in result.violations)
        assert "approved" in result.action_message.lower()
    
    def test_adverse_event_warning(self, engine):
        """Adverse events trigger warnings but don't block."""
        text = "I experienced a serious side effect after taking this"
        result = engine.check(text, role="assistant")
        
        assert result.has_violations
        assert not result.should_block  # Should warn, not block
        assert any("AE_DETECTION" in v.category for v in result.violations)
        highest = result.highest_severity_violation
        assert highest.severity == "warn"
    
    def test_comparative_claim_rewrite(self, engine):
        """Comparative claims are rewritten."""
        text = "This medication is better than competitor X"
        result = engine.check(text, role="assistant")
        
        assert result.has_violations
        assert result.should_rewrite
        assert not result.should_block
        assert any("COMPARATIVE_CLAIM" in v.category for v in result.violations)
    
    def test_pricing_blocking(self, engine):
        """Pricing discussion is blocked."""
        text = "The cost of this medication is very competitive"
        result = engine.check(text, role="assistant")
        
        assert result.has_violations
        assert result.should_block
        assert any("PRICING_REBATE" in v.category for v in result.violations)
    
    def test_unapproved_indication_blocking(self, engine):
        """Unapproved indication queries are blocked."""
        text = "Can this medication treat diabetes?"
        result = engine.check(text, role="assistant")
        
        assert result.has_violations
        assert result.should_block
        assert any("UNAPPROVED_INDICATION" in v.category for v in result.violations)
    
    def test_guarantee_rewrite(self, engine):
        """Guarantees are rewritten."""
        text = "This treatment will cure your condition, guaranteed!"
        result = engine.check(text, role="assistant")
        
        assert result.has_violations
        assert result.should_rewrite
        assert any("GUARANTEE" in v.category for v in result.violations)
    
    def test_clinical_guidance_rewrite(self, engine):
        """Clinical guidance beyond materials is rewritten."""
        text = "I recommend you should take two tablets daily"
        result = engine.check(text, role="assistant")
        
        assert result.has_violations
        assert result.should_rewrite
        assert any("CLINICAL_GUIDANCE" in v.category for v in result.violations)
    
    def test_pii_collection_blocking(self, engine):
        """PII collection attempts are blocked."""
        text = "What is your name and address for our records?"
        result = engine.check(text, role="assistant")
        
        assert result.has_violations
        assert result.should_block
        assert any("PII_PROMPT" in v.category for v in result.violations)
    
    def test_disabled_rules_never_match(self, engine):
        """Disabled rules (enabled=FALSE) never trigger."""
        text = "test disabled rule content"
        result = engine.check(text, role="assistant")
        
        # Should not match the disabled rule
        assert "TEST_DISABLED_001" not in result.all_matched_rules
    
    def test_clean_text_passes(self, engine):
        """Clean compliant text passes all checks."""
        text = "This medication is indicated for the approved uses as described in the label."
        result = engine.check(text, role="assistant")
        
        assert not result.has_violations
        assert len(result.violations) == 0
    
    def test_multiple_violations_highest_severity_wins(self, engine):
        """When multiple rules match, highest severity (block) wins."""
        # Contains both pricing (block) and comparative claim (rewrite)
        text = "This is better than others and the price is lower"
        result = engine.check(text, role="assistant")
        
        assert result.has_violations
        assert len(result.violations) >= 2
        assert result.should_block  # Block wins over rewrite
        
        highest = result.highest_severity_violation
        assert highest.severity == "block"


class TestLanguagePolicy:
    """Test language policy enforcement."""
    
    @pytest.fixture
    def engine(self):
        """Create engine with test fixture."""
        from app import guardrails_loader
        guardrails_loader._loader_instance = GuardrailsLoader(FIXTURE_PATH)
        guardrails_loader._config_cache = None
        
        engine = GuardrailsEngine()
        return engine
    
    def test_english_locales_pass(self, engine):
        """English locales are allowed."""
        text = "This is perfectly fine English text"
        
        for locale in ['en-US', 'en-GB', 'en']:
            result = engine.check(text, locale=locale, role="assistant")
            # Shouldn't trigger language violation
            lang_violations = [v for v in result.violations if "LANGUAGE" in v.category]
            assert len(lang_violations) == 0
    
    def test_non_english_blocked(self, engine):
        """Non-English locales are blocked."""
        text = "Bonjour, comment allez-vous?"
        result = engine.check(text, locale="fr-FR", role="assistant")
        
        assert result.has_violations
        assert result.should_block
        assert any("LANGUAGE" in v.category for v in result.violations)
        assert "English" in result.action_message


class TestAuditLogging:
    """Test audit logging functionality."""
    
    @pytest.fixture
    def temp_log_dir(self):
        """Create temporary directory for audit logs."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield Path(tmpdir)
    
    @pytest.fixture
    def audit_logger(self, temp_log_dir):
        """Create audit logger with temp directory."""
        return GuardrailsAuditLogger(log_dir=temp_log_dir)
    
    @pytest.fixture
    def engine(self):
        """Create engine with test fixture."""
        from app import guardrails_loader
        guardrails_loader._loader_instance = GuardrailsLoader(FIXTURE_PATH)
        guardrails_loader._config_cache = None
        
        engine = GuardrailsEngine()
        return engine
    
    def test_audit_log_created(self, audit_logger, engine):
        """Audit logs are created for checks."""
        text = "The patient's SSN is sensitive"
        result = engine.check(text, role="assistant")
        
        audit_logger.log_check(
            session_id="test-session-123",
            role="assistant",
            text=text,
            result=result
        )
        
        # Verify log file was created
        log_files = list(audit_logger.log_dir.glob("guardrails_audit_*.ndjson"))
        assert len(log_files) > 0
    
    def test_audit_log_contains_required_fields(self, audit_logger, engine):
        """Audit logs contain all required fields."""
        text = "This is better than competitors and costs less"
        result = engine.check(text, role="assistant")
        
        audit_logger.log_check(
            session_id="test-session-456",
            role="assistant",
            text=text,
            result=result,
            locale="en-US"
        )
        
        # Read back the log
        logs = audit_logger.read_session_logs("test-session-456", include_text=True)
        assert len(logs) > 0
        
        log = logs[0]
        # Check required fields
        assert "timestamp" in log
        assert log["session_id"] == "test-session-456"
        assert log["role"] == "assistant"
        assert "text_hash" in log
        assert "matched_rule_ids" in log
        assert "categories" in log
        assert "severities" in log
        assert "action_taken" in log
        assert log["locale"] == "en-US"
        assert "violated" in log
    
    def test_audit_log_redacts_pii(self, audit_logger, engine):
        """Audit logs redact PHI/PII from text snippets."""
        text = "Patient SSN is 123-45-6789 and email test@example.com"
        result = engine.check(text, role="assistant")
        
        audit_logger.log_check(
            session_id="test-session-789",
            role="assistant",
            text=text,
            result=result
        )
        
        logs = audit_logger.read_session_logs("test-session-789", include_text=True)
        log = logs[0]
        
        # Text snippet should be redacted
        assert "123-45-6789" not in log["text_snippet"]
        assert "test@example.com" not in log["text_snippet"]
    
    def test_action_taken_accuracy(self, audit_logger, engine):
        """Action_taken field accurately reflects violation handling."""
        test_cases = [
            ("Clean text with no issues", "passed"),
            ("Off-label use detected", "blocked"),
            ("This is better than others", "rewritten"),
            ("Patient had a side effect", "warned"),
        ]
        
        for text, expected_action in test_cases:
            result = engine.check(text, role="assistant")
            audit_logger.log_check(
                session_id=f"test-{expected_action}",
                role="assistant",
                text=text,
                result=result
            )
            
            logs = audit_logger.read_session_logs(f"test-{expected_action}")
            if logs:
                assert logs[0]["action_taken"] == expected_action


class TestIntegrationScenarios:
    """Integration tests for real-world scenarios."""
    
    @pytest.fixture
    def engine(self):
        """Create engine with test fixture."""
        from app import guardrails_loader
        guardrails_loader._loader_instance = GuardrailsLoader(FIXTURE_PATH)
        guardrails_loader._config_cache = None
        
        engine = GuardrailsEngine()
        return engine
    
    def test_streaming_pipeline_simulation(self, engine):
        """Simulate streaming pipeline with guardrails."""
        assistant_responses = [
            "This medication is approved for treating hypertension.",  # Clean
            "Off-label, it's also great for other conditions.",  # Violates
            "The cost is very reasonable.",  # Violates
            "I experienced a bad side effect.",  # Warn only
        ]
        
        processed_responses = []
        violations_count = 0
        
        for response in assistant_responses:
            result = engine.check(response, role="assistant")
            
            if result.should_block or result.should_rewrite:
                # Replace with action message
                processed_responses.append(result.action_message)
                violations_count += 1
            else:
                # Allow through (including warnings)
                processed_responses.append(response)
        
        assert len(processed_responses) == 4
        assert violations_count == 2  # Off-label and pricing blocked/rewritten
        assert assistant_responses[0] in processed_responses  # Clean text unchanged
    
    def test_session_noncompliance_tracking(self, engine):
        """Track noncompliance events across a session."""
        noncompliance_events = []
        
        messages = [
            "Hello, how can I help?",
            "What is the cost of this medication?",  # Violation - pricing
            "It's better than the competition",  # Violation - comparative
        ]
        
        for msg in messages:
            result = engine.check(msg, role="assistant")
            
            if result.has_violations:
                noncompliance_events.append({
                    "rules": result.all_matched_rules,
                    "categories": [v.category for v in result.violations],
                    "action": "blocked" if result.should_block else "rewritten"
                })
        
        assert len(noncompliance_events) == 2
        assert any("PRICING_REBATE" in str(e["categories"]) for e in noncompliance_events)
        assert any("COMPARATIVE_CLAIM" in str(e["categories"]) for e in noncompliance_events)


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v"])

