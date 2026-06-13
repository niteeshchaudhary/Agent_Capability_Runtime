"""Tests for HTTP/SSE proxy transport."""

from __future__ import annotations

import pytest

from acr_mcp.http_transport import HttpServerConfig, route_paths


def test_http_server_config_defaults() -> None:
    cfg = HttpServerConfig()
    assert cfg.host == "127.0.0.1"
    assert cfg.port == 8080
    assert cfg.transport == "sse"
    assert cfg.sse_path == "/sse"
    assert cfg.streamable_http_path == "/mcp"


@pytest.mark.parametrize("transport", ["sse", "streamable-http"])
def test_starlette_routes_include_health_and_mcp_path(transport: str) -> None:
    pytest.importorskip("mcp")
    from acr_mcp.http_transport import build_starlette_app, create_guarded_mcp_server
    from acr_mcp.server import GuardedUpstream

    class FakeSession:
        async def list_tools(self) -> dict:
            return {"tools": []}

        async def call_tool(self, name: str, arguments: dict | None = None) -> str:
            return "ok"

    from acr import LocalAcrClient
    from acr_mcp.guard import McpToolGuard
    from acr_mcp.types import EnforceMode, McpPolicyCatalog, McpToolPolicySpec

    catalog = McpPolicyCatalog(
        version=1,
        agent_id="http_test",
        mode=EnforceMode.DISABLED,
        default_action="allow",
        tools={
            "read_file": McpToolPolicySpec(mcp_tool="read_file"),
        },
    )
    guard = McpToolGuard.from_catalog(
        catalog,
        client=LocalAcrClient(secret="dev-secret-change-in-production-32b-minimum"),
    )
    from acr_mcp.proxy import AcrMcpProxy

    proxy = AcrMcpProxy(guard, scanner=None)
    relay = GuardedUpstream(proxy, FakeSession())
    server = create_guarded_mcp_server(relay, name="test-proxy")
    cfg = HttpServerConfig(transport=transport)  # type: ignore[arg-type]
    app = build_starlette_app(server, cfg)
    paths = route_paths(app)
    assert "/health" in paths
    if transport == "sse":
        assert "/sse" in paths
        assert any(p.rstrip("/") == "/messages" for p in paths)
    else:
        assert "/mcp" in paths


@pytest.mark.asyncio
async def test_health_endpoint_returns_ok() -> None:
    pytest.importorskip("mcp")
    httpx = pytest.importorskip("httpx")
    from acr_mcp.http_transport import HttpServerConfig, build_starlette_app, create_guarded_mcp_server
    from acr_mcp.proxy import AcrMcpProxy
    from acr_mcp.server import GuardedUpstream
    from acr import LocalAcrClient
    from acr_mcp.guard import McpToolGuard
    from acr_mcp.types import EnforceMode, McpPolicyCatalog

    class FakeSession:
        async def list_tools(self) -> dict:
            return {"tools": []}

        async def call_tool(self, name: str, arguments: dict | None = None) -> str:
            return "ok"

    guard = McpToolGuard.from_catalog(
        McpPolicyCatalog(
            version=1,
            agent_id="http_test",
            mode=EnforceMode.DISABLED,
            default_action="allow",
        ),
        client=LocalAcrClient(secret="dev-secret-change-in-production-32b-minimum"),
    )
    relay = GuardedUpstream(AcrMcpProxy(guard, scanner=None), FakeSession())
    app = build_starlette_app(create_guarded_mcp_server(relay, name="t"), HttpServerConfig())
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    assert resp.json()["service"] == "acr-mcp-proxy"
