"""Tests for acr.client — AcrClient HTTP interactions."""

import httpx
import pytest
import respx

from acr.client import AcrClient
from acr.exceptions import GrantError, RevokeError
from acr.models import ExecuteApprovalRequired, ExecuteDenied, ExecuteSimulated, ExecuteSuccess


GATEWAY = "http://localhost:3000"


# ── Grant ────────────────────────────────────────────────────────────────────


class TestGrant:
    @respx.mock
    @pytest.mark.asyncio
    async def test_grant_success(self):
        respx.post(f"{GATEWAY}/capabilities/grant").mock(
            return_value=httpx.Response(
                201,
                json={
                    "token": "tok_123",
                    "claims": {"sub": "agent_1", "tool": "gmail.send"},
                    "expiresAt": "2026-12-31T23:59:59Z",
                },
            )
        )

        async with AcrClient(base_url=GATEWAY) as client:
            grant = await client.grant(
                {"agentId": "agent_1", "tool": "gmail.send", "constraints": {}}
            )

        assert grant.token == "tok_123"
        assert grant.claims.sub == "agent_1"
        assert grant.expires_at == "2026-12-31T23:59:59Z"

    @respx.mock
    @pytest.mark.asyncio
    async def test_grant_error(self):
        respx.post(f"{GATEWAY}/capabilities/grant").mock(
            return_value=httpx.Response(400, json={"message": "bad request"})
        )

        async with AcrClient(base_url=GATEWAY) as client:
            with pytest.raises(GrantError, match="bad request"):
                await client.grant(
                    {"agentId": "a", "tool": "gmail.send", "constraints": {}}
                )

    @respx.mock
    @pytest.mark.asyncio
    async def test_grant_with_admin_api_key(self):
        route = respx.post(f"{GATEWAY}/capabilities/grant").mock(
            return_value=httpx.Response(
                201,
                json={
                    "token": "tok_123",
                    "claims": {},
                    "expiresAt": "2026-12-31T23:59:59Z",
                },
            )
        )

        async with AcrClient(
            base_url=GATEWAY, admin_api_key="admin-secret-key"
        ) as client:
            await client.grant(
                {"agentId": "a", "tool": "gmail.send", "constraints": {}}
            )

        request = route.calls[0].request
        assert request.headers["authorization"] == "Bearer admin-secret-key"


# ── Execute ──────────────────────────────────────────────────────────────────


class TestExecute:
    @respx.mock
    @pytest.mark.asyncio
    async def test_execute_allow(self):
        respx.post(f"{GATEWAY}/runtime/execute").mock(
            return_value=httpx.Response(
                200,
                json={
                    "decision": "ALLOW",
                    "result": {"status": "sent"},
                    "auditId": "aud_1",
                },
            )
        )

        async with AcrClient(base_url=GATEWAY) as client:
            result = await client.execute(
                token="tok", tool="gmail.send", payload={"to": "a@co.com"}
            )

        assert isinstance(result, ExecuteSuccess)
        assert result.ok is True
        assert result.result == {"status": "sent"}

    @respx.mock
    @pytest.mark.asyncio
    async def test_execute_deny(self):
        respx.post(f"{GATEWAY}/runtime/execute").mock(
            return_value=httpx.Response(
                403,
                json={
                    "decision": "DENY",
                    "reason": "external domain blocked",
                    "auditId": "aud_2",
                    "code": "policy_denied",
                },
            )
        )

        async with AcrClient(base_url=GATEWAY) as client:
            result = await client.execute(
                token="tok", tool="gmail.send", payload={"to": "a@gmail.com"}
            )

        assert isinstance(result, ExecuteDenied)
        assert result.ok is False
        assert result.reason == "external domain blocked"
        assert result.code == "policy_denied"

    @respx.mock
    @pytest.mark.asyncio
    async def test_execute_require_approval(self):
        respx.post(f"{GATEWAY}/runtime/execute").mock(
            return_value=httpx.Response(
                202,
                json={
                    "decision": "REQUIRE_APPROVAL",
                    "approvalId": "appr_1",
                    "reason": "spend over limit",
                    "auditId": "aud_3",
                },
            )
        )

        async with AcrClient(base_url=GATEWAY) as client:
            result = await client.execute(
                token="tok", tool="gmail.send", payload={}
            )

        assert isinstance(result, ExecuteApprovalRequired)
        assert result.ok is False
        assert result.approval_id == "appr_1"

    @respx.mock
    @pytest.mark.asyncio
    async def test_execute_simulate(self):
        respx.post(f"{GATEWAY}/runtime/execute").mock(
            return_value=httpx.Response(
                200,
                json={
                    "decision": "SIMULATE",
                    "auditId": "aud_4",
                    "reason": "simulation only",
                    "evaluatedConditions": [
                        {"kind": "domain", "passed": True}
                    ],
                },
            )
        )

        async with AcrClient(base_url=GATEWAY) as client:
            result = await client.execute(
                token="tok", tool="gmail.send", payload={}, simulate=True
            )

        assert isinstance(result, ExecuteSimulated)
        assert result.ok is True
        assert result.evaluated_conditions is not None
        assert len(result.evaluated_conditions) == 1

    @respx.mock
    @pytest.mark.asyncio
    async def test_execute_token_expired(self):
        respx.post(f"{GATEWAY}/runtime/execute").mock(
            return_value=httpx.Response(
                401,
                json={
                    "decision": "DENY",
                    "reason": "expired",
                    "auditId": "aud_5",
                    "code": "token_expired",
                },
            )
        )

        async with AcrClient(base_url=GATEWAY) as client:
            result = await client.execute(
                token="tok", tool="gmail.send", payload={}
            )

        assert isinstance(result, ExecuteDenied)
        assert result.code == "token_expired"


# ── Delegate ─────────────────────────────────────────────────────────────────


class TestDelegate:
    @respx.mock
    @pytest.mark.asyncio
    async def test_delegate_success(self):
        respx.post(f"{GATEWAY}/capabilities/delegate").mock(
            return_value=httpx.Response(
                201,
                json={
                    "token": "child_tok",
                    "claims": {"sub": "child", "parent_jti": "cap_parent"},
                    "expiresAt": "2026-12-31T23:59:59Z",
                },
            )
        )

        async with AcrClient(base_url=GATEWAY) as client:
            result = await client.delegate(
                "parent_tok",
                {
                    "agentId": "child",
                    "tool": "gmail.send",
                    "constraints": {"allowedDomains": ["company.com"]},
                },
            )

        assert result.token == "child_tok"


# ── Approvals ────────────────────────────────────────────────────────────────


class TestApprovals:
    @respx.mock
    @pytest.mark.asyncio
    async def test_list_approvals(self):
        respx.get(f"{GATEWAY}/approvals").mock(
            return_value=httpx.Response(
                200,
                json={
                    "approvals": [
                        {
                            "id": "appr_1",
                            "agentId": "agent_1",
                            "tool": "gmail.send",
                            "status": "pending",
                        }
                    ]
                },
            )
        )

        async with AcrClient(base_url=GATEWAY) as client:
            approvals = await client.list_approvals(status="pending")

        assert len(approvals) == 1
        assert approvals[0].id == "appr_1"

    @respx.mock
    @pytest.mark.asyncio
    async def test_approve(self):
        respx.post(f"{GATEWAY}/approvals/appr_1/approve").mock(
            return_value=httpx.Response(200, json={"approval": {"id": "appr_1"}})
        )

        async with AcrClient(base_url=GATEWAY) as client:
            result = await client.approve("appr_1", resolved_by="reviewer")

        assert result["approval"]["id"] == "appr_1"

    @respx.mock
    @pytest.mark.asyncio
    async def test_reject(self):
        respx.post(f"{GATEWAY}/approvals/appr_1/reject").mock(
            return_value=httpx.Response(200, json={"approval": {"id": "appr_1"}})
        )

        async with AcrClient(base_url=GATEWAY) as client:
            result = await client.reject("appr_1")

        assert result["approval"]["id"] == "appr_1"


# ── Revoke ───────────────────────────────────────────────────────────────────


class TestRevoke:
    @respx.mock
    @pytest.mark.asyncio
    async def test_revoke_success(self):
        respx.post(f"{GATEWAY}/capabilities/revoke").mock(
            return_value=httpx.Response(
                200,
                json={"revoked": True, "record": {"capabilityId": "cap_123"}},
            )
        )

        async with AcrClient(base_url=GATEWAY) as client:
            result = await client.revoke("cap_123", reason="compromised", revoked_by="admin")

        assert result.revoked is True

    @respx.mock
    @pytest.mark.asyncio
    async def test_revoke_error(self):
        respx.post(f"{GATEWAY}/capabilities/revoke").mock(
            return_value=httpx.Response(404, json={"message": "capability not found"})
        )

        async with AcrClient(base_url=GATEWAY) as client:
            with pytest.raises(RevokeError, match="capability not found"):
                await client.revoke("cap_missing")

    @respx.mock
    def test_revoke_sync(self):
        respx.post(f"{GATEWAY}/capabilities/revoke").mock(
            return_value=httpx.Response(200, json={"revoked": True})
        )

        client = AcrClient(base_url=GATEWAY)
        result = client.revoke_sync("cap_123")
        assert result.revoked is True
        client.close()


# ── Audit ────────────────────────────────────────────────────────────────────


class TestAudit:
    @respx.mock
    @pytest.mark.asyncio
    async def test_list_audit(self):
        respx.get(f"{GATEWAY}/audit").mock(
            return_value=httpx.Response(
                200,
                json={
                    "events": [
                        {
                            "id": "aud_1",
                            "agentId": "agent_1",
                            "tool": "gmail.send",
                            "decision": "ALLOW",
                        }
                    ]
                },
            )
        )

        async with AcrClient(base_url=GATEWAY) as client:
            events = await client.list_audit(agent_id="agent_1", limit=10)

        assert len(events) == 1
        assert events[0].decision == "ALLOW"
        request = respx.calls[0].request
        assert request.url.params["agentId"] == "agent_1"
        assert request.url.params["limit"] == "10"

    @respx.mock
    def test_list_audit_sync(self):
        respx.get(f"{GATEWAY}/audit").mock(
            return_value=httpx.Response(200, json={"events": []})
        )

        client = AcrClient(base_url=GATEWAY)
        events = client.list_audit_sync(tool="gmail.send")
        assert events == []
        client.close()


# ── Health ───────────────────────────────────────────────────────────────────


class TestHealth:
    @respx.mock
    @pytest.mark.asyncio
    async def test_health(self):
        respx.get(f"{GATEWAY}/health").mock(
            return_value=httpx.Response(200, json={"status": "ok", "version": "0.1.0"})
        )

        async with AcrClient(base_url=GATEWAY) as client:
            result = await client.health()

        assert result["status"] == "ok"
        assert result["version"] == "0.1.0"

    @respx.mock
    def test_health_sync(self):
        respx.get(f"{GATEWAY}/health").mock(
            return_value=httpx.Response(200, json={"status": "ok"})
        )

        client = AcrClient(base_url=GATEWAY)
        result = client.health_sync()
        assert result["status"] == "ok"
        client.close()


# ── Sync wrappers ────────────────────────────────────────────────────────────


class TestSyncClient:
    @respx.mock
    def test_grant_sync(self):
        respx.post(f"{GATEWAY}/capabilities/grant").mock(
            return_value=httpx.Response(
                201,
                json={
                    "token": "tok_sync",
                    "claims": {"sub": "agent_sync"},
                    "expiresAt": "2026-12-31T23:59:59Z",
                },
            )
        )

        client = AcrClient(base_url=GATEWAY)
        grant = client.grant_sync(
            {"agentId": "agent_sync", "tool": "gmail.send", "constraints": {}}
        )
        assert grant.token == "tok_sync"
        client.close()

    @respx.mock
    def test_execute_sync(self):
        respx.post(f"{GATEWAY}/runtime/execute").mock(
            return_value=httpx.Response(
                200,
                json={
                    "decision": "ALLOW",
                    "result": {"ok": True},
                    "auditId": "aud_sync",
                },
            )
        )

        client = AcrClient(base_url=GATEWAY)
        result = client.execute_sync(
            token="tok", tool="gmail.send", payload={"to": "a@co.com"}
        )
        assert isinstance(result, ExecuteSuccess)
        client.close()
