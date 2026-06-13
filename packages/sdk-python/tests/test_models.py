"""Tests for acr.models — Pydantic model validation."""

from acr.models import (
    ConstraintSet,
    ExecuteApprovalRequired,
    ExecuteDenied,
    ExecuteSimulated,
    ExecuteSuccess,
    GrantCapabilityInput,
    GrantResponse,
    RevokeInput,
)


class TestConstraintSet:
    def test_from_camel_case(self):
        cs = ConstraintSet.model_validate({
            "allowedDomains": ["company.com"],
            "maxActions": 5,
            "approvalRequired": True,
        })
        assert cs.allowed_domains == ["company.com"]
        assert cs.max_actions == 5
        assert cs.approval_required is True

    def test_to_camel_case(self):
        cs = ConstraintSet(allowed_domains=["company.com"], max_actions=5)
        dumped = cs.model_dump(by_alias=True, exclude_none=True)
        assert dumped["allowedDomains"] == ["company.com"]
        assert dumped["maxActions"] == 5


class TestGrantCapabilityInput:
    def test_from_dict(self):
        gi = GrantCapabilityInput.model_validate({
            "agentId": "agent_1",
            "tool": "gmail.send",
            "constraints": {"allowedDomains": ["company.com"]},
            "expiresIn": "10m",
        })
        assert gi.agent_id == "agent_1"
        assert gi.tool == "gmail.send"
        assert gi.expires_in == "10m"


class TestGrantResponse:
    def test_parse(self):
        gr = GrantResponse.model_validate({
            "token": "tok_123",
            "claims": {"sub": "agent_1", "tool": "gmail.send"},
            "expiresAt": "2026-12-31T23:59:59Z",
        })
        assert gr.token == "tok_123"
        assert gr.claims.sub == "agent_1"
        assert gr.expires_at == "2026-12-31T23:59:59Z"


class TestExecuteResults:
    def test_success(self):
        s = ExecuteSuccess.model_validate({
            "ok": True,
            "decision": "ALLOW",
            "result": {"status": "sent"},
            "auditId": "aud_1",
        })
        assert s.ok is True
        assert s.result == {"status": "sent"}

    def test_denied(self):
        d = ExecuteDenied.model_validate({
            "ok": False,
            "decision": "DENY",
            "reason": "external domain blocked",
            "auditId": "aud_2",
            "code": "policy_denied",
        })
        assert d.ok is False
        assert d.code == "policy_denied"

    def test_approval_required(self):
        ar = ExecuteApprovalRequired.model_validate({
            "ok": False,
            "decision": "REQUIRE_APPROVAL",
            "reason": "needs approval",
            "auditId": "aud_3",
            "approvalId": "appr_1",
        })
        assert ar.approval_id == "appr_1"

    def test_simulated(self):
        sim = ExecuteSimulated.model_validate({
            "ok": True,
            "decision": "SIMULATE",
            "auditId": "aud_4",
            "evaluatedConditions": [
                {"kind": "domain", "passed": True},
            ],
        })
        assert sim.evaluated_conditions is not None
        assert len(sim.evaluated_conditions) == 1


class TestRevokeInput:
    def test_from_dict(self):
        ri = RevokeInput.model_validate({
            "capabilityId": "cap_123",
            "reason": "compromised",
            "revokedBy": "admin",
        })
        assert ri.capability_id == "cap_123"
        assert ri.reason == "compromised"
