"""Standalone ACR MCP proxy server.

Runs a guarded MCP relay: it connects to an **upstream** MCP server, scans its
advertised tools for poisoning, and enforces ACR capability policies on every
``tools/call`` before forwarding. Agents connect to *this* proxy instead of the
raw server, so policy + scanning apply transparently.

Layers:

* :class:`GuardedUpstream` — transport-agnostic relay core (unit-testable).
* :func:`run_stdio_proxy` — stdio MCP server (default CLI mode).
* :func:`run_http_proxy` — HTTP/SSE or Streamable HTTP server via uvicorn.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, Literal

from acr_mcp.guard import EnforceMode, McpToolDeniedError
from acr_mcp.proxy import AcrMcpProxy, McpSessionLike, McpToolScanBlocked
from acr_mcp.scanner import Severity, _extract_tool_fields

UpstreamTransport = Literal["stdio", "sse", "streamable-http"]
DownstreamTransport = Literal["stdio", "sse", "streamable-http"]


@dataclass(frozen=True)
class ProxyCallResult:
    """Outcome of a relayed tool call."""

    is_error: bool
    content: str = ""
    raw: Any = None
    blocked_by: str = ""  # "scanner" | "policy" | ""


class GuardedUpstream:
    """Relay core — scan + policy gate in front of an upstream MCP session."""

    def __init__(self, proxy: AcrMcpProxy, session: McpSessionLike) -> None:
        self._proxy = proxy
        self._session = session

    @property
    def proxy(self) -> AcrMcpProxy:
        return self._proxy

    async def initialize(self) -> Any:
        """List + scan upstream tools once on startup."""
        return await self._proxy.connect(self._session)

    async def list_tools(self) -> list[Any]:
        """Return upstream tools, hiding scanner-blocked ones in enforce mode."""
        listed = await self._proxy.list_tools(self._session)
        tools = _tools_from(listed)
        scan = self._proxy.last_scan
        enforcing = self._proxy.guard.mode == EnforceMode.ENFORCE
        if scan is None or not enforcing:
            return tools
        blocked = set(scan.blocked_tools)
        return [t for t in tools if _name_of(t) not in blocked]

    async def call_tool(
        self, name: str, arguments: dict[str, Any] | None = None
    ) -> ProxyCallResult:
        """Enforce scan + policy, forward on allow, return an error on block."""
        try:
            raw = await self._proxy.call_tool(self._session, name, arguments or {})
            return ProxyCallResult(is_error=False, raw=raw)
        except McpToolScanBlocked as exc:
            return ProxyCallResult(is_error=True, content=str(exc), blocked_by="scanner")
        except McpToolDeniedError as exc:
            return ProxyCallResult(is_error=True, content=str(exc), blocked_by="policy")


def _tools_from(listed: Any) -> list[Any]:
    if listed is None:
        return []
    if isinstance(listed, dict):
        return list(listed.get("tools") or [])
    tools = getattr(listed, "tools", None)
    if tools is not None:
        return list(tools)
    if isinstance(listed, (list, tuple)):
        return list(listed)
    return []


def _name_of(tool: Any) -> str:
    name, _desc, _schema = _extract_tool_fields(tool)
    return name


def _require_mcp() -> None:
    try:
        import mcp  # noqa: F401
    except ImportError as exc:
        raise SystemExit(
            "The MCP proxy server needs the 'mcp' package. "
            'Install it with: pip install "acr-mcp[proxy]"'
        ) from exc


def _log_scan_warnings(scan: Any) -> None:
    if scan is not None and not scan.is_safe:
        print(
            f"[acr-mcp-proxy] scanner blocked tools: {', '.join(scan.blocked_tools)}",
            file=sys.stderr,
        )


async def _build_relay(
    session: McpSessionLike,
    *,
    policies_path: str | None,
) -> GuardedUpstream:
    proxy = AcrMcpProxy.from_policies(path=policies_path, block_threshold=Severity.HIGH)
    relay = GuardedUpstream(proxy, session)
    scan = await relay.initialize()
    _log_scan_warnings(scan)
    return relay


@asynccontextmanager
async def upstream_session(
    *,
    command: str | None = None,
    args: list[str] | None = None,
    url: str | None = None,
    transport: UpstreamTransport = "stdio",
) -> AsyncIterator[McpSessionLike]:
    """Open a client session to an upstream MCP server."""
    _require_mcp()
    from mcp import ClientSession

    if command:
        from mcp import StdioServerParameters
        from mcp.client.stdio import stdio_client

        params = StdioServerParameters(command=command, args=args or [])
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                yield session
        return

    if not url:
        raise ValueError("upstream requires a command or --upstream-url")

    if transport == "sse":
        from mcp.client.sse import sse_client

        async with sse_client(url) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                yield session
        return

    if transport == "streamable-http":
        from mcp.client.streamable_http import streamable_http_client

        async with streamable_http_client(url) as (read, write, _get_id):
            async with ClientSession(read, write) as session:
                await session.initialize()
                yield session
        return

    raise ValueError(f"unsupported upstream transport: {transport}")


async def run_stdio_proxy(
    *,
    upstream_command: str,
    upstream_args: list[str],
    policies_path: str | None,
    server_name: str = "acr-mcp-proxy",
) -> None:
    """Run the proxy as an stdio MCP server in front of an upstream stdio server."""
    _require_mcp()
    from mcp.server import Server
    from mcp.server.stdio import stdio_server

    from acr_mcp.http_transport import create_guarded_mcp_server

    async with upstream_session(command=upstream_command, args=upstream_args) as upstream:
        relay = await _build_relay(upstream, policies_path=policies_path)
        server = create_guarded_mcp_server(relay, name=server_name)
        init_options = server.create_initialization_options()
        async with stdio_server() as (srv_read, srv_write):
            await server.run(srv_read, srv_write, init_options)


async def run_http_proxy(
    *,
    host: str,
    port: int,
    transport: Literal["sse", "streamable-http"],
    policies_path: str | None,
    server_name: str = "acr-mcp-proxy",
    upstream_command: str | None = None,
    upstream_args: list[str] | None = None,
    upstream_url: str | None = None,
    upstream_transport: UpstreamTransport = "stdio",
    sse_path: str = "/sse",
    message_path: str = "/messages/",
    streamable_http_path: str = "/mcp",
) -> None:
    """Run the proxy as an HTTP MCP server (SSE or Streamable HTTP)."""
    from acr_mcp.http_transport import HttpServerConfig, create_guarded_mcp_server, serve_http

    config = HttpServerConfig(
        host=host,
        port=port,
        transport=transport,
        sse_path=sse_path,
        message_path=message_path,
        streamable_http_path=streamable_http_path,
        server_name=server_name,
    )

    async with upstream_session(
        command=upstream_command,
        args=upstream_args,
        url=upstream_url,
        transport=upstream_transport if upstream_url else "stdio",
    ) as upstream:
        relay = await _build_relay(upstream, policies_path=policies_path)
        server = create_guarded_mcp_server(relay, name=server_name)
        print(
            f"[acr-mcp-proxy] listening on http://{host}:{port} "
            f"({transport}, upstream={upstream_transport or 'stdio'})",
            file=sys.stderr,
        )
        await serve_http(server, config)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="acr-mcp-proxy",
        description=(
            "ACR-guarded MCP proxy: scan + enforce policy in front of an upstream MCP server."
        ),
    )
    parser.add_argument(
        "--transport",
        choices=("stdio", "sse", "streamable-http"),
        default=os.environ.get("ACR_MCP_TRANSPORT", "stdio"),
        help="Downstream transport exposed to MCP clients (default: stdio).",
    )
    parser.add_argument(
        "--host",
        default=os.environ.get("ACR_MCP_HOST", "127.0.0.1"),
        help="HTTP listen host when --transport is sse or streamable-http.",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("ACR_MCP_PORT", "8080")),
        help="HTTP listen port when --transport is sse or streamable-http.",
    )
    parser.add_argument(
        "--policies",
        default=os.environ.get("ACR_MCP_POLICIES_PATH"),
        help="Path to mcp-policies.yaml.",
    )
    parser.add_argument(
        "--server-name",
        default="acr-mcp-proxy",
        help="Name advertised by the proxy MCP server.",
    )
    parser.add_argument(
        "--upstream-url",
        default=os.environ.get("ACR_MCP_UPSTREAM_URL"),
        help="Upstream MCP server URL (SSE or Streamable HTTP). Omit to use stdio command.",
    )
    parser.add_argument(
        "--upstream-transport",
        choices=("sse", "streamable-http"),
        default=os.environ.get("ACR_MCP_UPSTREAM_TRANSPORT", "sse"),
        help="How to connect to --upstream-url (default: sse).",
    )
    parser.add_argument(
        "--sse-path",
        default="/sse",
        help="SSE endpoint path when --transport sse.",
    )
    parser.add_argument(
        "--message-path",
        default="/messages/",
        help="Client POST path when --transport sse.",
    )
    parser.add_argument(
        "--mcp-path",
        default="/mcp",
        help="Endpoint path when --transport streamable-http.",
    )
    parser.add_argument(
        "upstream",
        nargs=argparse.REMAINDER,
        help="Upstream stdio command after --, e.g. npx -y @modelcontextprotocol/server-filesystem /data",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    ns = parser.parse_args(argv)

    upstream = list(ns.upstream)
    if upstream and upstream[0] == "--":
        upstream = upstream[1:]

    upstream_command: str | None = upstream[0] if upstream else None
    upstream_args: list[str] = upstream[1:] if len(upstream) > 1 else []

    if ns.transport == "stdio":
        if not upstream_command and not ns.upstream_url:
            parser.error("stdio mode requires an upstream command (after --) or --upstream-url")
        if ns.upstream_url:
            asyncio.run(
                run_stdio_proxy_via_url(
                    upstream_url=ns.upstream_url,
                    upstream_transport=ns.upstream_transport,
                    policies_path=ns.policies,
                    server_name=ns.server_name,
                )
            )
        else:
            asyncio.run(
                run_stdio_proxy(
                    upstream_command=upstream_command or "",
                    upstream_args=upstream_args,
                    policies_path=ns.policies,
                    server_name=ns.server_name,
                )
            )
        return 0

    if not upstream_command and not ns.upstream_url:
        parser.error("HTTP mode requires an upstream stdio command (after --) or --upstream-url")

    asyncio.run(
        run_http_proxy(
            host=ns.host,
            port=ns.port,
            transport=ns.transport,
            policies_path=ns.policies,
            server_name=ns.server_name,
            upstream_command=upstream_command,
            upstream_args=upstream_args or None,
            upstream_url=ns.upstream_url,
            upstream_transport=ns.upstream_transport,
            sse_path=ns.sse_path,
            message_path=ns.message_path,
            streamable_http_path=ns.mcp_path,
        )
    )
    return 0


async def run_stdio_proxy_via_url(
    *,
    upstream_url: str,
    upstream_transport: UpstreamTransport,
    policies_path: str | None,
    server_name: str,
) -> None:
    """Stdio downstream with HTTP upstream — for remote upstream + local agent."""
    _require_mcp()
    from mcp.server import Server
    from mcp.server.stdio import stdio_server

    from acr_mcp.http_transport import create_guarded_mcp_server

    async with upstream_session(
        url=upstream_url,
        transport=upstream_transport,
    ) as upstream:
        relay = await _build_relay(upstream, policies_path=policies_path)
        server = create_guarded_mcp_server(relay, name=server_name)
        init_options = server.create_initialization_options()
        async with stdio_server() as (srv_read, srv_write):
            await server.run(srv_read, srv_write, init_options)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
