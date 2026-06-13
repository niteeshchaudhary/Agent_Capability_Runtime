"""Tests for acr_mcp guard."""

from __future__ import annotations

import pytest

from acr import LocalAcrClient
from acr_mcp.guard import McpToolDeniedError, McpToolGuard
from acr_mcp.types import EnforceMode, McpPolicyCatalog, McpToolPolicySpec


def _catalog(*, mode: EnforceMode = EnforceMode.ENFORCE) -> McpPolicyCatalog:
    return McpPolicyCatalog(
        version=1,
        agent_id="test_agent",
        mode=mode,
        default_action="deny",
        tools={
            "read_file": McpToolPolicySpec(
                mcp_tool="read_file",
                acr_tool="http.request",
                methods=("GET",),
                max_actions=10,
            ),
            "delete_file": McpToolPolicySpec(
                mcp_tool="delete_file",
                deny=True,
            ),
            "search_repositories": McpToolPolicySpec(
                mcp_tool="search_repositories",
                acr_tool="http.request",
                methods=("GET",),
                allowed_urls=("github.com",),
                max_actions=5,
            ),
        },
    )


@pytest.fixture
def guard() -> McpToolGuard:
    client = LocalAcrClient(secret="dev-secret-change-in-production-32b-minimum")
    return McpToolGuard.from_catalog(_catalog(), client=client, simulate=False)


def test_allows_listed_tool(guard: McpToolGuard) -> None:
    result = guard.check("read_file", {"path": "/tmp/x"})
    assert result.allowed is True


def test_denies_explicit_deny(guard: McpToolGuard) -> None:
    result = guard.check("delete_file", {"path": "/tmp/x"})
    assert result.allowed is False
    assert result.decision == "DENY"


def test_denies_unlisted_tool(guard: McpToolGuard) -> None:
    result = guard.check("unknown_tool", {})
    assert result.allowed is False


def test_denies_url_policy(guard: McpToolGuard) -> None:
    bad = guard.check("search_repositories", {"url": "https://evil.com/search"})
    assert bad.allowed is False
    good = guard.check("search_repositories", {"url": "https://github.com/search"})
    assert good.allowed is True


def test_shadow_mode_allows_execution() -> None:
    client = LocalAcrClient(secret="dev-secret-change-in-production-32b-minimum")
    g = McpToolGuard.from_catalog(_catalog(mode=EnforceMode.SHADOW), client=client)
    assert g.check_or_refuse("delete_file") is None


@pytest.mark.asyncio
async def test_wrap_call_tool_blocks(guard: McpToolGuard) -> None:
    async def fake_call(tool_name: str, arguments: dict) -> str:
        return "ok"

    wrapped = guard.wrap_call_tool(fake_call)
    assert await wrapped("read_file", {"path": "x"}) == "ok"
    with pytest.raises(McpToolDeniedError):
        await wrapped("delete_file", {"path": "x"})
