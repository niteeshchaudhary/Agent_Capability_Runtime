"""ACR MCP integration — enforce capability policies on MCP tool calls."""

from acr_mcp.guard import EnforceMode, McpCheckResult, McpToolGuard, protect_mcp_tools
from acr_mcp.policies import McpPolicyCatalog, load_mcp_policies
from acr_mcp.proxy import AcrMcpProxy, McpToolScanBlocked
from acr_mcp.scanner import (
    McpToolScanner,
    ScanReport,
    Severity,
    ToolFinding,
    ToolScanReport,
)
from acr_mcp.server import GuardedUpstream, ProxyCallResult
from acr_mcp.http_transport import HttpServerConfig, build_starlette_app, create_guarded_mcp_server

__all__ = [
    "EnforceMode",
    "McpCheckResult",
    "McpToolGuard",
    "McpPolicyCatalog",
    "load_mcp_policies",
    "protect_mcp_tools",
    "AcrMcpProxy",
    "McpToolScanBlocked",
    "McpToolScanner",
    "ScanReport",
    "Severity",
    "ToolFinding",
    "ToolScanReport",
    "GuardedUpstream",
    "ProxyCallResult",
    "HttpServerConfig",
    "build_starlette_app",
    "create_guarded_mcp_server",
]
