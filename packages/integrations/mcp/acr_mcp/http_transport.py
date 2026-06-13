"""HTTP/SSE transport for the ACR MCP proxy server.

Builds Starlette + uvicorn apps that expose the guarded relay over:

* **SSE** — ``GET /sse`` + ``POST /messages/`` (legacy MCP HTTP transport)
* **Streamable HTTP** — ``POST /mcp`` (modern MCP HTTP transport)

Both modes share the same :func:`register_relay_handlers` wiring used by the
stdio runner in :mod:`acr_mcp.server`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from acr_mcp.server import GuardedUpstream


TransportKind = Literal["sse", "streamable-http"]


@dataclass(frozen=True)
class HttpServerConfig:
    """Configuration for the downstream HTTP MCP server."""

    host: str = "127.0.0.1"
    port: int = 8080
    transport: TransportKind = "sse"
    sse_path: str = "/sse"
    message_path: str = "/messages/"
    streamable_http_path: str = "/mcp"
    mount_path: str = "/"
    server_name: str = "acr-mcp-proxy"
    stateless_http: bool = False


def register_relay_handlers(server: Any, relay: GuardedUpstream) -> None:
    """Attach guarded list_tools / call_tool handlers to an MCP ``Server``."""
    from mcp import types

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


def create_guarded_mcp_server(relay: GuardedUpstream, *, name: str) -> Any:
    """Create an MCP ``Server`` wired to a :class:`GuardedUpstream`."""
    from mcp.server import Server

    server = Server(name)
    register_relay_handlers(server, relay)
    return server


def _normalize_path(mount_path: str, endpoint: str) -> str:
    if mount_path == "/":
        return endpoint
    if mount_path.endswith("/"):
        mount_path = mount_path[:-1]
    if not endpoint.startswith("/"):
        endpoint = "/" + endpoint
    return mount_path + endpoint


def _health_response() -> Any:
    from starlette.responses import JSONResponse

    return JSONResponse({"status": "ok", "service": "acr-mcp-proxy"})


def build_starlette_app(server: Any, config: HttpServerConfig) -> Any:
    """Return a Starlette ASGI app for the configured HTTP transport."""
    try:
        from starlette.applications import Starlette
        from starlette.routing import Mount, Route
    except ImportError as exc:  # pragma: no cover
        raise ImportError(
            'HTTP transport requires starlette. Install with: pip install "acr-mcp[proxy]"'
        ) from exc

    health = Route("/health", endpoint=lambda _request: _health_response(), methods=["GET"])

    if config.transport == "sse":
        sse_routes = _build_sse_routes(server, config)
        return Starlette(routes=[health, *sse_routes])

    streamable_routes, lifespan = _build_streamable_http_routes(server, config)
    return Starlette(routes=[health, *streamable_routes], lifespan=lifespan)


def route_paths(app: Any) -> set[str]:
    """Collect route path patterns from a Starlette app (for tests)."""
    paths: set[str] = set()
    for route in getattr(app, "routes", []):
        path = getattr(route, "path", None)
        if path:
            paths.add(str(path))
        mount_path = getattr(route, "path", None)
        if isinstance(route, type) and mount_path:
            paths.add(str(mount_path))
    return paths


def _build_sse_routes(server: Any, config: HttpServerConfig) -> list[Any]:
    from starlette.requests import Request
    from starlette.responses import Response
    from starlette.routing import Mount, Route
    from starlette.types import Receive, Scope, Send

    from mcp.server.sse import SseServerTransport

    message_endpoint = _normalize_path(config.mount_path, config.message_path)
    sse = SseServerTransport(message_endpoint)

    async def handle_sse(scope: Scope, receive: Receive, send: Send) -> None:
        async with sse.connect_sse(scope, receive, send) as streams:
            await server.run(
                streams[0],
                streams[1],
                server.create_initialization_options(),
            )

    async def sse_endpoint(request: Request) -> Response:
        await handle_sse(request.scope, request.receive, request._send)  # type: ignore[reportPrivateUsage]
        return Response()

    return [
        Route(config.sse_path, endpoint=sse_endpoint, methods=["GET"]),
        Mount(config.message_path, app=sse.handle_post_message),
    ]


def _build_streamable_http_routes(
    server: Any, config: HttpServerConfig
) -> tuple[list[Any], Any]:
    from contextlib import asynccontextmanager

    from starlette.routing import Route

    from mcp.server.streamable_http_manager import StreamableHTTPSessionManager

    session_manager = StreamableHTTPSessionManager(
        app=server,
        stateless=config.stateless_http,
    )

    class _StreamableHttpApp:
        def __init__(self, manager: StreamableHTTPSessionManager) -> None:
            self._manager = manager

        async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
            await self._manager.handle_request(scope, receive, send)

    handler = _StreamableHttpApp(session_manager)

    @asynccontextmanager
    async def lifespan(_app: Any):
        async with session_manager.run():
            yield

    return [Route(config.streamable_http_path, endpoint=handler)], lifespan


async def serve_http(server: Any, config: HttpServerConfig) -> None:
    """Run uvicorn with the Starlette app for ``config``."""
    try:
        import uvicorn
    except ImportError as exc:  # pragma: no cover
        raise ImportError(
            'HTTP transport requires uvicorn. Install with: pip install "acr-mcp[proxy]"'
        ) from exc

    app = build_starlette_app(server, config)
    uvicorn_config = uvicorn.Config(
        app,
        host=config.host,
        port=config.port,
        log_level="info",
    )
    await uvicorn.Server(uvicorn_config).serve()
