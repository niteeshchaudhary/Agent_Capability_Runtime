from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Literal


class EnforceMode(str, Enum):
    """How policy decisions affect MCP tool execution."""

    ENFORCE = "enforce"
    SHADOW = "shadow"
    DISABLED = "disabled"


@dataclass(frozen=True)
class McpToolPolicySpec:
    """Policy for one MCP tool name."""

    mcp_tool: str
    description: str = ""
    acr_tool: str = "http.request"
    deny: bool = False
    methods: tuple[str, ...] = ()
    allowed_urls: tuple[str, ...] = ()
    max_actions: int | None = None
    expires_in: str | None = None
    require_approval: bool = False
    payload_fields: tuple[str, ...] = ()


@dataclass(frozen=True)
class McpPolicyCatalog:
    version: int
    agent_id: str
    mode: EnforceMode
    default_action: Literal["allow", "deny"]
    tools: dict[str, McpToolPolicySpec] = field(default_factory=dict)
    refusal_message: str = (
        "Blocked by Agent Capability Runtime: this MCP tool call is not permitted."
    )


@dataclass(frozen=True)
class McpCheckResult:
    allowed: bool
    reason: str = ""
    mcp_tool: str = ""
    acr_tool: str = ""
    decision: str = ""
    shadow_only: bool = False
    audit_id: str | None = None
