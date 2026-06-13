"""Tests for acr_langchain.protect — one-call protection."""

from __future__ import annotations

import httpx
import pytest
import respx
from langchain_core.tools import tool

from acr import LocalAcrClient, can, method, url
from acr_langchain import AcrToolDeniedError, protect

GATEWAY = "http://localhost:3000"


@tool
def fetch_page(url: str) -> str:
    """Fetch a webpage."""
    return f"content of {url}"


@tool
def send_mail(to: str, subject: str) -> str:
    """Send an email."""
    return f"sent to {to}"


class TestProtectLocal:
    """Embedded backend — no gateway, no mocking needed."""

    def test_allow_runs_tool(self, monkeypatch):
        monkeypatch.delenv("ACR_GATEWAY_URL", raising=False)
        tools = protect(
            [fetch_page],
            agent_id="t_local",
            policy=can("http.request").where(url.in_(["example.com"])),
        )
        result = tools[0].invoke({"url": "https://example.com/page"})
        assert result == "content of https://example.com/page"

    def test_deny_returns_blocked_message(self, monkeypatch):
        monkeypatch.delenv("ACR_GATEWAY_URL", raising=False)
        tools = protect(
            [fetch_page],
            agent_id="t_local",
            policy=can("http.request").where(url.in_(["example.com"])),
        )
        result = tools[0].invoke({"url": "https://evil.com/steal"})
        assert "Blocked by Agent Capability Runtime" in result

    def test_limit_enforced_in_local_mode(self, monkeypatch):
        monkeypatch.delenv("ACR_GATEWAY_URL", raising=False)
        tools = protect(
            [fetch_page],
            agent_id="t_limit",
            policy=can("http.request").where(url.in_(["example.com"])).limit(2),
        )
        ok = {"url": "https://example.com"}
        assert "content of" in tools[0].invoke(ok)
        assert "content of" in tools[0].invoke(ok)
        third = tools[0].invoke(ok)
        assert "Blocked by Agent Capability Runtime" in third
        assert "max actions" in third

    def test_payload_auto_inference_method(self, monkeypatch):
        """url kwarg implies method=GET, so a GET-only policy passes."""
        monkeypatch.delenv("ACR_GATEWAY_URL", raising=False)
        tools = protect(
            [fetch_page],
            agent_id="t_auto",
            policy=can("http.request").where(method.in_(["GET"])),
        )
        assert "content of" in tools[0].invoke({"url": "https://anything.dev"})

    def test_per_tool_policies(self, monkeypatch):
        monkeypatch.delenv("ACR_GATEWAY_URL", raising=False)
        tools = protect(
            [fetch_page, send_mail],
            agent_id="t_multi",
            policies={
                "fetch_page": can("http.request").where(url.in_(["example.com"])),
                "send_mail": can("gmail.send").only_domain("company.com"),
            },
        )
        by_name = {t.name: t for t in tools}
        assert "content of" in by_name["fetch_page"].invoke({"url": "https://example.com"})
        assert "sent to" in by_name["send_mail"].invoke(
            {"to": "a@company.com", "subject": "hi"}
        )
        blocked = by_name["send_mail"].invoke({"to": "x@gmail.com", "subject": "exfil"})
        assert "Blocked by Agent Capability Runtime" in blocked

    def test_missing_policy_raises(self, monkeypatch):
        monkeypatch.delenv("ACR_GATEWAY_URL", raising=False)
        with pytest.raises(ValueError, match="No policy for tool"):
            protect(
                [fetch_page, send_mail],
                agent_id="t_err",
                policies={"fetch_page": can("http.request")},
            )

    def test_no_policy_at_all_raises(self):
        with pytest.raises(ValueError, match="requires"):
            protect([fetch_page], agent_id="t_err2")

    def test_on_deny_raise(self, monkeypatch):
        monkeypatch.delenv("ACR_GATEWAY_URL", raising=False)
        tools = protect(
            [fetch_page],
            agent_id="t_raise",
            policy=can("http.request").where(url.in_(["example.com"])),
            on_deny="raise",
        )
        with pytest.raises(AcrToolDeniedError):
            tools[0].invoke({"url": "https://evil.com"})

    def test_explicit_client(self):
        client = LocalAcrClient()
        tools = protect(
            [fetch_page],
            agent_id="t_client",
            policy=can("http.request").where(url.in_(["example.com"])),
            client=client,
        )
        assert "content of" in tools[0].invoke({"url": "https://example.com"})
        events = client.list_audit_sync(agent_id="t_client")
        assert any(e.decision == "ALLOW" for e in events)


class TestProtectGateway:
    """HTTP gateway backend via base_url (mocked)."""

    @respx.mock
    def test_gateway_simulate_allow(self):
        respx.post(f"{GATEWAY}/capabilities/grant").mock(
            return_value=httpx.Response(
                201,
                json={
                    "token": "tok_gw",
                    "claims": {"sub": "t_gw", "tool": "http.request"},
                    "expiresAt": "2026-12-31T23:59:59Z",
                },
            )
        )
        respx.post(f"{GATEWAY}/runtime/execute").mock(
            return_value=httpx.Response(
                200,
                json={
                    "decision": "SIMULATE",
                    "auditId": "aud_gw",
                    "reason": "policy would allow",
                },
            )
        )

        tools = protect(
            [fetch_page],
            agent_id="t_gw",
            policy=can("http.request").where(url.in_(["example.com"])),
            base_url=GATEWAY,
        )
        assert "content of" in tools[0].invoke({"url": "https://example.com"})
