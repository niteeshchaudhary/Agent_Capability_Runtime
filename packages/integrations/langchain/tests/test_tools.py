"""Tests for acr_langchain tool wrapping."""

from __future__ import annotations

import httpx
import pytest
import respx
from langchain_core.tools import tool

from acr import AcrClient, can, method
from acr_langchain import CapabilityGuard, wrap_tool
from acr_langchain.exceptions import AcrToolDeniedError

GATEWAY = "http://localhost:3000"


@tool
def fetch_page(url: str) -> str:
    """Fetch a webpage."""
    return f"content of {url}"


@pytest.fixture
def guard() -> CapabilityGuard:
    respx.post(f"{GATEWAY}/capabilities/grant").mock(
        return_value=httpx.Response(
            201,
            json={
                "token": "tok_lc",
                "claims": {"sub": "agent_1", "tool": "http.request"},
                "expiresAt": "2026-12-31T23:59:59Z",
            },
        )
    )
    client = AcrClient(base_url=GATEWAY)
    g = CapabilityGuard(client, agent_id="agent_1")
    g.ensure(
        "http.request",
        can("http.request").where(method.in_(["GET"])).limit(10),
    )
    return g


class TestWrapTool:
    @respx.mock
    def test_allow_runs_local_tool(self, guard: CapabilityGuard):
        respx.post(f"{GATEWAY}/runtime/execute").mock(
            return_value=httpx.Response(
                200,
                json={
                    "decision": "SIMULATE",
                    "auditId": "aud_1",
                    "reason": "policy would allow",
                },
            )
        )

        wrapped = wrap_tool(
            fetch_page,
            guard=guard,
            acr_tool="http.request",
            payload_builder=lambda kw: {"url": kw["url"], "method": "GET"},
        )
        result = wrapped.invoke({"url": "https://example.com"})
        assert result == "content of https://example.com"

    @respx.mock
    def test_deny_returns_message(self, guard: CapabilityGuard):
        respx.post(f"{GATEWAY}/runtime/execute").mock(
            return_value=httpx.Response(
                403,
                json={
                    "decision": "DENY",
                    "reason": "URL not in allowed_urls",
                    "auditId": "aud_2",
                    "code": "policy_denied",
                },
            )
        )

        wrapped = wrap_tool(
            fetch_page,
            guard=guard,
            acr_tool="http.request",
            payload_builder=lambda kw: {"url": kw["url"], "method": "GET"},
        )
        result = wrapped.invoke({"url": "https://evil.com"})
        assert "Blocked by Agent Capability Runtime" in result
        assert "URL not in allowed_urls" in result

    @respx.mock
    def test_deny_raises_when_configured(self, guard: CapabilityGuard):
        respx.post(f"{GATEWAY}/runtime/execute").mock(
            return_value=httpx.Response(
                403,
                json={
                    "decision": "DENY",
                    "reason": "denied",
                    "auditId": "aud_3",
                    "code": "policy_denied",
                },
            )
        )

        wrapped = wrap_tool(
            fetch_page,
            guard=guard,
            acr_tool="http.request",
            on_deny="raise",
        )
        with pytest.raises(AcrToolDeniedError, match="denied"):
            wrapped.invoke({"url": "https://evil.com"})
