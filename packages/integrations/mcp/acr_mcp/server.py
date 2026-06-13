"""Standalone ACR MCP proxy server.

Runs a guarded MCP relay: it connects to an **upstream** MCP server, scans its
advertised tools for poisoning, and enforces ACR capability policies on every
``tools/call`` before forwarding. Agents connect to *this* proxy instead of the
raw server, so policy + scanning apply transparently.

Two layers live here:

* :class:`GuardedUpstream` — the transport-agnostic relay core. It wraps an
  :class:`~acr_mcp.proxy.AcrMcpProxy` and an upstream session and returns
  MCP-friendly results (refusals become tool errors rather than exceptions), so
  it is fully unit-testable with a fake session.
* :func:`run_stdio_proxy` / :func:`main` — a thin stdio server process that
  wires :class:`GuardedUpstream` into the real ``mcp`` library. ``mcp`` is an
  optional dependency (``pip install "acr-mcp[proxy]"``) imported lazily.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from dataclasses import dataclass
from typing import Any

from acr_mcp.guard import EnforceMode, McpToolDeniedError
from acr_mcp.proxy import AcrMcpProxy, McpSessionLike, McpToolScanBlocked
from acr_mcp.scanner import Severity, _extract_tool_fields


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


# ── stdio runner (requires the optional `mcp` dependency) ─────────────────────


async def run_stdio_proxy(
    *,
    upstream_command: str,
    upstream_args: list[str],
    policies_path: str | None,
    server_name: str = "acr-mcp-proxy",
) -> None:
    """Run the proxy as an stdio MCP server in front of an upstream stdio server."""
    try:
        from mcp import ClientSession, StdioServerParameters, types
        from mcp.client.stdio import stdio_client
        from mcp.server import Server
        from mcp.server.stdio import stdio_server
    except ImportError as exc:  # pragma: no cover - exercised only without mcp
        raise SystemExit(
            "The MCP proxy server needs the 'mcp' package. "
            'Install it with: pip install "acr-mcp[proxy]"'
        ) from exc

    proxy = AcrMcpProxy.from_policies(path=policies_path, block_threshold=Severity.HIGH)
    upstream_params = StdioServerParameters(command=upstream_command, args=upstream_args)

    async with stdio_client(upstream_params) as (read, write):
        async with ClientSession(read, write) as upstream:
            await upstream.initialize()
            relay = GuardedUpstream(proxy, upstream)
            scan = await relay.initialize()
            if scan is not None and not scan.is_safe:
                print(
                    f"[acr-mcp-proxy] scanner blocked tools: {', '.join(scan.blocked_tools)}",
                    file=sys.stderr,
                )

            server: Server = Server(server_name)

            @server.list_tools()
            async def _list_tools() -> list[types.Tool]:  # type: ignore[name-defined]
                return await relay.list_tools()

            @server.call_tool()
            async def _call_tool(name: str, arguments: dict[str, Any]) -> Any:  # type: ignore[name-defined]
                result = await relay.call_tool(name, arguments)
                if result.is_error:
                    return [types.TextContent(type="text", text=result.content)]
                raw = result.raw
                if isinstance(raw, types.CallToolResult):
                    return raw.content
                return raw

            init_options = server.create_initialization_options()
            async with stdio_server() as (srv_read, srv_write):
                await server.run(srv_read, srv_write, init_options)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="acr-mcp-proxy",
        description="ACR-guarded MCP proxy: scan + enforce policy in front of an upstream MCP server.",
    )
    parser.add_argument(
        "--policies",
        default=os.environ.get("ACR_MCP_POLICIES_PATH"),
        help="Path to mcp-policies.yaml (default: $ACR_MCP_POLICIES_PATH or ./policies/mcp-policies.yaml).",
    )
    parser.add_argument(
        "--server-name",
        default="acr-mcp-proxy",
        help="Name advertised by the proxy MCP server.",
    )
    parser.add_argument(
        "upstream",
        nargs=argparse.REMAINDER,
        help="Upstream MCP server command, e.g. -- npx -y @modelcontextprotocol/server-filesystem /data",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    ns = parser.parse_args(argv)

    upstream = list(ns.upstream)
    if upstream and upstream[0] == "--":
        upstream = upstream[1:]
    if not upstream:
        parser.error("missing upstream command (after --)")

    asyncio.run(
        run_stdio_proxy(
            upstream_command=upstream[0],
            upstream_args=upstream[1:],
            policies_path=ns.policies,
            server_name=ns.server_name,
        )
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
