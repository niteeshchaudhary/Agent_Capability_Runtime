"""ACR MCP proxy — a guard-enforcing relay in front of an upstream MCP server.

``AcrMcpProxy`` sits between an agent's MCP client and an upstream MCP
``ClientSession``. On connect it **scans** advertised tools for poisoning and,
on every ``tools/call``, it **enforces** the ACR capability policy before
forwarding. This delivers the "MCP proxy server" pattern (Sentinel / AgentWard /
Microsoft AGT) on top of ACR's capability model.

The proxy is transport-agnostic: any object exposing ``list_tools()`` and
``call_tool(name, arguments)`` works (the real ``mcp.ClientSession``, or a fake
in tests), so it is fully testable without spawning a server.
"""

from __future__ import annotations

from typing import Any, Protocol

from acr_mcp.guard import EnforceMode, McpToolDeniedError, McpToolGuard
from acr_mcp.scanner import McpToolScanner, ScanReport, Severity


class McpSessionLike(Protocol):
    async def list_tools(self) -> Any: ...

    async def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> Any: ...


class McpToolScanBlocked(PermissionError):
    """Raised when a tool is blocked by the scanner before execution."""

    def __init__(self, message: str, *, tool: str, report: Any) -> None:
        super().__init__(message)
        self.tool = tool
        self.report = report


class AcrMcpProxy:
    """Policy-enforcing proxy around an upstream MCP session."""

    def __init__(
        self,
        guard: McpToolGuard,
        *,
        scanner: McpToolScanner | None = None,
        block_scanned_tools: bool = True,
    ) -> None:
        self._guard = guard
        self._scanner = scanner
        self._block_scanned_tools = block_scanned_tools
        self._scan: ScanReport | None = None

    @property
    def guard(self) -> McpToolGuard:
        return self._guard

    @property
    def scanner(self) -> McpToolScanner | None:
        return self._scanner

    @property
    def last_scan(self) -> ScanReport | None:
        return self._scan

    @classmethod
    def from_policies(
        cls,
        *,
        path: str | None = None,
        client: Any | None = None,
        simulate: bool | None = None,
        scan: bool = True,
        block_scanned_tools: bool = True,
        block_threshold: Severity = Severity.HIGH,
    ) -> AcrMcpProxy:
        """Load policies from YAML and build a ready proxy.

        When ``scan`` is true the scanner is seeded with the policy's listed
        tools as the trusted set (for typosquat detection).
        """
        guard = McpToolGuard.load(path, client=client, simulate=simulate)
        scanner = None
        if scan:
            scanner = McpToolScanner(
                trusted_tools=guard.catalog.tools.keys(),
                block_threshold=block_threshold,
            )
        return cls(guard, scanner=scanner, block_scanned_tools=block_scanned_tools)

    async def connect(self, session: McpSessionLike) -> ScanReport | None:
        """List + scan upstream tools. Returns the scan report (or ``None``)."""
        if self._scanner is None:
            return None
        listed = await session.list_tools()
        tools = _extract_tools(listed)
        self._scan = self._scanner.scan_tools(tools)
        return self._scan

    async def list_tools(self, session: McpSessionLike) -> Any:
        """Forward ``list_tools`` after scanning the advertised tools."""
        listed = await session.list_tools()
        if self._scanner is not None:
            self._scan = self._scanner.scan_tools(_extract_tools(listed))
        return listed

    async def call_tool(
        self,
        session: McpSessionLike,
        name: str,
        arguments: dict[str, Any] | None = None,
    ) -> Any:
        """Scan-gate + policy-gate a tool call, then forward to the upstream."""
        args = arguments or {}
        self._enforce_scan(name)

        check = self._guard.check(name, args)
        if not check.allowed and self._guard.mode == EnforceMode.ENFORCE:
            raise McpToolDeniedError(
                self._guard._format_refusal(check),  # noqa: SLF001 — intentional reuse
                check=check,
            )
        return await session.call_tool(name, args)

    def _enforce_scan(self, name: str) -> None:
        if self._scan is None or not self._block_scanned_tools:
            return
        if self._guard.mode != EnforceMode.ENFORCE:
            return
        report = self._scan.report_for(name)
        if report is not None and report.is_blocked(self._scan.block_threshold):
            codes = ", ".join(f.code for f in report.findings)
            raise McpToolScanBlocked(
                f"MCP tool {name!r} blocked by scanner "
                f"(severity={report.max_severity.value}; {codes})",
                tool=name,
                report=report,
            )


def _extract_tools(listed: Any) -> list[Any]:
    if listed is None:
        return []
    if isinstance(listed, dict):
        tools = listed.get("tools")
        return list(tools) if tools else []
    tools = getattr(listed, "tools", None)
    if tools is not None:
        return list(tools)
    if isinstance(listed, (list, tuple)):
        return list(listed)
    return []
