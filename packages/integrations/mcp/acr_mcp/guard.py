"""Enforce ACR capabilities on MCP ``tools/call`` requests."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any, Protocol, TypeVar

from acr import create_client
from acr.dsl import PolicyBuilder
from acr.local import LocalAcrClient
from acr.models import ExecuteApprovalRequired, ExecuteDenied, ExecuteSuccess, GrantResponse

from acr_mcp.policies import build_payload, compile_policy, load_mcp_policies
from acr_mcp.types import EnforceMode, McpCheckResult, McpPolicyCatalog, McpToolPolicySpec

T = TypeVar("T")


class AcrClientLike(Protocol):
    def grant_sync(self, input: dict[str, Any]) -> GrantResponse: ...

    def execute_sync(
        self,
        *,
        token: str,
        tool: str,
        payload: dict[str, Any],
        approval_id: str | None = None,
        request_id: str | None = None,
        trace_id: str | None = None,
        session_id: str | None = None,
        intent: str | dict[str, Any] | None = None,
        simulate: bool | None = None,
    ) -> Any: ...


class _CapabilitySession:
    def __init__(self, client: AcrClientLike, *, agent_id: str) -> None:
        self.client = client
        self.agent_id = agent_id
        self._tokens: dict[str, str] = {}  # mcp_tool -> token

    def ensure(self, mcp_tool: str, policy: PolicyBuilder) -> GrantResponse:
        if mcp_tool in self._tokens:
            return GrantResponse.model_validate({
                "token": self._tokens[mcp_tool],
                "claims": {"sub": self.agent_id, "tool": policy.tool},
                "expiresAt": "",
            })
        grant_input = policy.to_grant_input(agent_id=self.agent_id)
        grant = self.client.grant_sync(grant_input)
        self._tokens[mcp_tool] = grant.token
        return grant

    def get_token(self, mcp_tool: str) -> str:
        if mcp_tool not in self._tokens:
            raise RuntimeError(
                f"No capability token for MCP tool {mcp_tool!r}. Call ensure() during guard setup."
            )
        return self._tokens[mcp_tool]


class McpToolGuard:
    """Evaluate MCP tool calls against ACR before forwarding to a server."""

    def __init__(
        self,
        catalog: McpPolicyCatalog,
        session: _CapabilitySession,
        *,
        simulate: bool | None = None,
    ) -> None:
        self._catalog = catalog
        self._session = session
        is_local = isinstance(session.client, LocalAcrClient)
        self._simulate = simulate if simulate is not None else not is_local

        for spec in catalog.tools.values():
            if not spec.deny:
                session.ensure(spec.mcp_tool, compile_policy(spec))

    @property
    def catalog(self) -> McpPolicyCatalog:
        return self._catalog

    @property
    def mode(self) -> EnforceMode:
        return self._catalog.mode

    @classmethod
    def from_catalog(
        cls,
        catalog: McpPolicyCatalog,
        *,
        client: AcrClientLike | None = None,
        simulate: bool | None = None,
    ) -> McpToolGuard:
        resolved = client or create_client()
        session = _CapabilitySession(resolved, agent_id=catalog.agent_id)
        return cls(catalog, session, simulate=simulate)

    @classmethod
    def load(
        cls,
        path: str | Path | None = None,
        *,
        client: AcrClientLike | None = None,
        simulate: bool | None = None,
    ) -> McpToolGuard:
        catalog = load_mcp_policies(Path(path) if path else None)
        return cls.from_catalog(catalog, client=client, simulate=simulate)

    def check(self, tool_name: str, arguments: dict[str, Any] | None = None) -> McpCheckResult:
        args = arguments or {}
        if self._catalog.mode == EnforceMode.DISABLED:
            return McpCheckResult(allowed=True, reason="MCP guard disabled", mcp_tool=tool_name)

        spec = self._catalog.tools.get(tool_name)
        if spec is None:
            if self._catalog.default_action == "allow":
                return McpCheckResult(
                    allowed=True,
                    reason="unlisted tool allowed by default_action",
                    mcp_tool=tool_name,
                )
            return McpCheckResult(
                allowed=False,
                reason=f"no policy for MCP tool {tool_name!r}",
                mcp_tool=tool_name,
                decision="DENY",
            )

        return self._check_spec(spec, args)

    def _check_spec(self, spec: McpToolPolicySpec, args: dict[str, Any]) -> McpCheckResult:
        if spec.deny:
            return McpCheckResult(
                allowed=False,
                reason=f"tool {spec.mcp_tool!r} explicitly denied",
                mcp_tool=spec.mcp_tool,
                acr_tool=spec.acr_tool,
                decision="DENY",
            )

        payload = build_payload(spec, args)
        token = self._session.get_token(spec.mcp_tool)
        result = self._session.client.execute_sync(
            token=token,
            tool=spec.acr_tool,
            payload=payload,
            simulate=self._simulate,
        )

        if isinstance(result, ExecuteSuccess):
            return McpCheckResult(
                allowed=True,
                reason="policy allowed",
                mcp_tool=spec.mcp_tool,
                acr_tool=spec.acr_tool,
                decision=result.decision or "ALLOW",
                audit_id=result.audit_id,
            )

        if isinstance(result, ExecuteApprovalRequired):
            return McpCheckResult(
                allowed=False,
                reason=result.reason or "approval required",
                mcp_tool=spec.mcp_tool,
                acr_tool=spec.acr_tool,
                decision="REQUIRE_APPROVAL",
                audit_id=result.audit_id,
            )

        if isinstance(result, ExecuteDenied):
            return McpCheckResult(
                allowed=False,
                reason=result.reason or "denied by policy",
                mcp_tool=spec.mcp_tool,
                acr_tool=spec.acr_tool,
                decision="DENY",
                audit_id=result.audit_id,
            )

        return McpCheckResult(
            allowed=False,
            reason="unexpected execute result",
            mcp_tool=spec.mcp_tool,
            acr_tool=spec.acr_tool,
            decision="DENY",
        )

    def check_or_refuse(self, tool_name: str, arguments: dict[str, Any] | None = None) -> str | None:
        result = self.check(tool_name, arguments)
        if result.allowed or self._catalog.mode == EnforceMode.SHADOW:
            return None
        return self._format_refusal(result)

    async def call_tool(
        self,
        session: Any,
        tool_name: str,
        arguments: dict[str, Any] | None = None,
    ) -> Any:
        args = arguments or {}
        result = self.check(tool_name, args)
        if not result.allowed and self._catalog.mode == EnforceMode.ENFORCE:
            raise McpToolDeniedError(self._format_refusal(result), check=result)
        return await session.call_tool(tool_name, args)

    def wrap_call_tool(
        self,
        call_tool: Callable[..., Awaitable[T]],
    ) -> Callable[..., Awaitable[T]]:
        async def wrapped(
            tool_name: str,
            arguments: dict[str, Any] | None = None,
            *args: Any,
            **kwargs: Any,
        ) -> T:
            check = self.check(tool_name, arguments or {})
            if not check.allowed and self._catalog.mode == EnforceMode.ENFORCE:
                raise McpToolDeniedError(self._format_refusal(check), check=check)
            return await call_tool(tool_name, arguments or {}, *args, **kwargs)

        return wrapped

    def _format_refusal(self, result: McpCheckResult) -> str:
        code = f" ({result.decision})" if result.decision else ""
        return f"{self._catalog.refusal_message}{code}: {result.reason}"


class McpToolDeniedError(PermissionError):
    def __init__(self, message: str, *, check: McpCheckResult) -> None:
        super().__init__(message)
        self.check = check


def protect_mcp_tools(
    *,
    catalog: McpPolicyCatalog | None = None,
    path: str | Path | None = None,
    client: AcrClientLike | None = None,
    simulate: bool | None = None,
) -> McpToolGuard:
    """One-call factory — load policies and return a ready guard."""
    if catalog is None:
        catalog = load_mcp_policies(Path(path) if path else None)
    return McpToolGuard.from_catalog(catalog, client=client, simulate=simulate)
