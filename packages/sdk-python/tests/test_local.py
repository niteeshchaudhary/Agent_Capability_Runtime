"""Tests for acr.local — embedded in-process runtime."""

from __future__ import annotations

from acr import LocalAcrClient, can, create_client, method, url
from acr.client import AcrClient
from acr.models import (
    ExecuteApprovalRequired,
    ExecuteDenied,
    ExecuteSimulated,
    ExecuteSuccess,
)


def _grant(client: LocalAcrClient, builder, agent_id: str = "agent_local"):
    return client.grant_sync(builder.to_grant_input(agent_id=agent_id))


class TestGrantAndExecute:
    def test_grant_returns_token_and_claims(self):
        client = LocalAcrClient()
        grant = _grant(client, can("gmail.send").only_domain("company.com").expires_in("10m"))
        assert grant.token.count(".") == 2
        assert grant.claims.sub == "agent_local"
        assert grant.claims.tool == "gmail.send"
        assert grant.expires_at

    def test_allow_internal_domain(self):
        client = LocalAcrClient()
        grant = _grant(client, can("gmail.send").only_domain("company.com"))
        result = client.execute_sync(
            token=grant.token, tool="gmail.send", payload={"to": "a@company.com"}
        )
        assert isinstance(result, ExecuteSuccess)

    def test_deny_external_domain(self):
        client = LocalAcrClient()
        grant = _grant(client, can("gmail.send").only_domain("company.com"))
        result = client.execute_sync(
            token=grant.token, tool="gmail.send", payload={"to": "x@gmail.com"}
        )
        assert isinstance(result, ExecuteDenied)
        assert "gmail.com" in result.reason

    def test_deny_url_not_allowed(self):
        client = LocalAcrClient()
        grant = _grant(client, can("http.request").where(url.in_(["api.example.com"])))
        result = client.execute_sync(
            token=grant.token,
            tool="http.request",
            payload={"url": "https://evil.com/x", "method": "GET"},
        )
        assert isinstance(result, ExecuteDenied)

    def test_allow_url_subdomain(self):
        client = LocalAcrClient()
        grant = _grant(client, can("http.request").where(url.in_(["example.com"])))
        result = client.execute_sync(
            token=grant.token,
            tool="http.request",
            payload={"url": "https://api.example.com/x", "method": "GET"},
        )
        assert isinstance(result, ExecuteSuccess)

    def test_deny_method(self):
        client = LocalAcrClient()
        grant = _grant(client, can("http.request").where(method.in_(["GET"])))
        result = client.execute_sync(
            token=grant.token,
            tool="http.request",
            payload={"url": "https://example.com", "method": "DELETE"},
        )
        assert isinstance(result, ExecuteDenied)

    def test_tool_mismatch(self):
        client = LocalAcrClient()
        grant = _grant(client, can("gmail.send"))
        result = client.execute_sync(
            token=grant.token, tool="http.request", payload={"url": "https://x.com"}
        )
        assert isinstance(result, ExecuteDenied)
        assert result.code == "tool_mismatch"

    def test_expired_token(self):
        client = LocalAcrClient()
        grant = _grant(client, can("gmail.send").expires_in(-5))
        result = client.execute_sync(
            token=grant.token, tool="gmail.send", payload={"to": "a@b.com"}
        )
        assert isinstance(result, ExecuteDenied)
        assert result.code == "token_expired"

    def test_invalid_token(self):
        client = LocalAcrClient()
        result = client.execute_sync(
            token="not.a.jwt", tool="gmail.send", payload={}
        )
        assert isinstance(result, ExecuteDenied)
        assert result.code == "invalid_token"

    def test_wrong_secret_rejected(self):
        a = LocalAcrClient(secret="secret-a-32-characters-long-min!!")
        b = LocalAcrClient(secret="secret-b-32-characters-long-min!!")
        grant = _grant(a, can("gmail.send"))
        result = b.execute_sync(token=grant.token, tool="gmail.send", payload={})
        assert isinstance(result, ExecuteDenied)
        assert result.code == "invalid_token"


class TestMaxActionsAndSimulate:
    def test_max_actions_enforced(self):
        client = LocalAcrClient()
        grant = _grant(client, can("gmail.send").only_domain("co.com").limit(2))
        payload = {"to": "a@co.com"}
        for _ in range(2):
            result = client.execute_sync(token=grant.token, tool="gmail.send", payload=payload)
            assert isinstance(result, ExecuteSuccess)
        result = client.execute_sync(token=grant.token, tool="gmail.send", payload=payload)
        assert isinstance(result, ExecuteDenied)
        assert "max actions" in result.reason

    def test_simulate_does_not_consume(self):
        client = LocalAcrClient()
        grant = _grant(client, can("gmail.send").only_domain("co.com").limit(1))
        payload = {"to": "a@co.com"}
        sim = client.execute_sync(
            token=grant.token, tool="gmail.send", payload=payload, simulate=True
        )
        assert isinstance(sim, ExecuteSimulated)
        real = client.execute_sync(token=grant.token, tool="gmail.send", payload=payload)
        assert isinstance(real, ExecuteSuccess)

    def test_simulate_reports_deny(self):
        client = LocalAcrClient()
        grant = _grant(client, can("gmail.send").only_domain("co.com"))
        result = client.execute_sync(
            token=grant.token, tool="gmail.send",
            payload={"to": "x@evil.com"}, simulate=True,
        )
        assert isinstance(result, ExecuteDenied)


class TestRevocation:
    def test_revoked_token_denied(self):
        client = LocalAcrClient()
        grant = _grant(client, can("gmail.send").only_domain("co.com"))
        jti = grant.claims.jti
        assert jti
        client.revoke_sync(jti, reason="compromised")
        result = client.execute_sync(
            token=grant.token, tool="gmail.send", payload={"to": "a@co.com"}
        )
        assert isinstance(result, ExecuteDenied)
        assert result.code == "token_revoked"


class TestApprovals:
    def test_approval_flow(self):
        client = LocalAcrClient()
        grant = _grant(client, can("gmail.send").require_approval())
        payload = {"to": "a@co.com"}

        pending = client.execute_sync(token=grant.token, tool="gmail.send", payload=payload)
        assert isinstance(pending, ExecuteApprovalRequired)

        approvals = client.list_approvals_sync(status="pending")
        assert len(approvals) == 1

        client.approve_sync(pending.approval_id, resolved_by="reviewer")
        result = client.execute_sync(
            token=grant.token, tool="gmail.send",
            payload=payload, approval_id=pending.approval_id,
        )
        assert isinstance(result, ExecuteSuccess)

    def test_rejected_approval_denied(self):
        client = LocalAcrClient()
        grant = _grant(client, can("gmail.send").require_approval())
        pending = client.execute_sync(token=grant.token, tool="gmail.send", payload={})
        assert isinstance(pending, ExecuteApprovalRequired)
        client.reject_sync(pending.approval_id)
        result = client.execute_sync(
            token=grant.token, tool="gmail.send",
            payload={}, approval_id=pending.approval_id,
        )
        assert isinstance(result, ExecuteDenied)

    def test_spend_over_limit_requires_approval(self):
        client = LocalAcrClient()
        grant = _grant(client, can("gmail.send").max_spend(100_00))
        result = client.execute_sync(
            token=grant.token, tool="gmail.send",
            payload={"to": "a@b.com", "amountCents": 250_00},
        )
        assert isinstance(result, ExecuteApprovalRequired)

    def test_request_id_idempotent_replay(self):
        client = LocalAcrClient()
        grant = _grant(client, can("gmail.send").only_domain("co.com").limit(5))
        payload = {"to": "a@co.com"}
        first = client.execute_sync(
            token=grant.token, tool="gmail.send", payload=payload, request_id="req_1"
        )
        second = client.execute_sync(
            token=grant.token, tool="gmail.send", payload=payload, request_id="req_1"
        )
        assert isinstance(first, ExecuteSuccess)
        assert isinstance(second, ExecuteSuccess)
        assert second.result is not None and second.result.get("status") == "replay"
        assert client._actions[grant.claims.jti or ""] == 1

    def test_approval_payload_mismatch_denied(self):
        client = LocalAcrClient()
        grant = _grant(client, can("gmail.send").require_approval())
        pending = client.execute_sync(
            token=grant.token, tool="gmail.send", payload={"to": "a@co.com"}
        )
        assert isinstance(pending, ExecuteApprovalRequired)
        client.approve_sync(pending.approval_id)
        result = client.execute_sync(
            token=grant.token,
            tool="gmail.send",
            payload={"to": "other@co.com"},
            approval_id=pending.approval_id,
        )
        assert isinstance(result, ExecuteDenied)


class TestAuditAndHealth:
    def test_audit_records_decisions(self):
        client = LocalAcrClient()
        grant = _grant(client, can("gmail.send").only_domain("co.com"))
        client.execute_sync(token=grant.token, tool="gmail.send", payload={"to": "a@co.com"})
        client.execute_sync(token=grant.token, tool="gmail.send", payload={"to": "x@evil.com"})
        events = client.list_audit_sync(agent_id="agent_local")
        decisions = [e.decision for e in events]
        assert "ALLOW" in decisions
        assert "DENY" in decisions

    def test_health(self):
        client = LocalAcrClient()
        health = client.health_sync()
        assert health["status"] == "ok"
        assert health["mode"] == "local"


class TestCreateClient:
    def test_returns_local_without_url(self, monkeypatch):
        monkeypatch.delenv("ACR_GATEWAY_URL", raising=False)
        client = create_client()
        assert isinstance(client, LocalAcrClient)

    def test_returns_http_with_url(self):
        client = create_client("http://localhost:3000")
        assert isinstance(client, AcrClient)

    def test_returns_http_from_env(self, monkeypatch):
        monkeypatch.setenv("ACR_GATEWAY_URL", "http://gw:3000")
        client = create_client()
        assert isinstance(client, AcrClient)


class TestAsyncMirrors:
    async def test_async_grant_execute(self):
        async with LocalAcrClient() as client:
            grant = await client.grant(
                can("gmail.send").only_domain("co.com").to_grant_input(agent_id="a1")
            )
            result = await client.execute(
                token=grant.token, tool="gmail.send", payload={"to": "x@co.com"}
            )
            assert isinstance(result, ExecuteSuccess)
            health = await client.health()
            assert health["status"] == "ok"
