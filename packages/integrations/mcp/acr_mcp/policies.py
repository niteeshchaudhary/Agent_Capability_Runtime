from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from acr import can, method, url
from acr.dsl import PolicyBuilder

from acr_mcp.types import EnforceMode, McpPolicyCatalog, McpToolPolicySpec

DEFAULT_POLICIES_FILENAME = "mcp-policies.yaml"


def default_policies_path() -> Path:
    override = os.environ.get("ACR_MCP_POLICIES_PATH")
    if override:
        return Path(override)
    return Path.cwd() / "policies" / DEFAULT_POLICIES_FILENAME


def load_mcp_policies(path: Path | None = None) -> McpPolicyCatalog:
    """Load MCP tool policies from YAML."""
    policy_file = path or default_policies_path()
    raw = _load_yaml(policy_file)
    if not isinstance(raw, dict):
        raise ValueError(f"Invalid MCP policy file: {policy_file}")

    mode_raw = str(raw.get("mode", "enforce")).lower()
    try:
        mode = EnforceMode(mode_raw)
    except ValueError as exc:
        raise ValueError("mode must be enforce, shadow, or disabled") from exc

    default_action = str(raw.get("default_action", "deny")).lower()
    if default_action not in ("allow", "deny"):
        raise ValueError("default_action must be 'allow' or 'deny'")

    tools_raw: dict[str, Any] = raw.get("tools") or {}
    tools: dict[str, McpToolPolicySpec] = {}
    for name, cfg in tools_raw.items():
        if not isinstance(cfg, dict):
            raise ValueError(f"Tool {name!r} must be a mapping")
        tools[name] = _parse_tool(name, cfg)

    return McpPolicyCatalog(
        version=int(raw.get("version", 1)),
        agent_id=str(raw.get("agent_id", "mcp_agent")),
        mode=mode,
        default_action=default_action,  # type: ignore[arg-type]
        tools=tools,
        refusal_message=str(
            raw.get(
                "refusal_message",
                McpPolicyCatalog.refusal_message,
            )
        ),
    )


def compile_policy(spec: McpToolPolicySpec) -> PolicyBuilder:
    if spec.deny:
        return can(spec.acr_tool).limit(0)

    builder = can(spec.acr_tool)
    if spec.methods:
        builder = builder.where(method.in_(list(spec.methods)))
    if spec.allowed_urls:
        builder = builder.where(url.in_(list(spec.allowed_urls)))
    if spec.max_actions is not None:
        builder = builder.limit(spec.max_actions)
    if spec.expires_in:
        builder = builder.expires_in(spec.expires_in)
    if spec.require_approval:
        builder = builder.require_approval()
    return builder


def build_payload(spec: McpToolPolicySpec, arguments: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "mcpTool": spec.mcp_tool,
        **{str(k): _coerce(v) for k, v in arguments.items()},
    }
    if spec.acr_tool == "http.request":
        _normalize_http_payload(payload)
    if spec.payload_fields:
        payload = {k: payload[k] for k in spec.payload_fields if k in payload}
        payload["mcpTool"] = spec.mcp_tool
        if spec.acr_tool == "http.request":
            _normalize_http_payload(payload)
    return payload


def _normalize_http_payload(payload: dict[str, Any]) -> None:
    if "url" not in payload and "path" in payload:
        path = str(payload["path"])
        payload["url"] = path if "://" in path else f"file://{path}"
    payload.setdefault("method", "GET")


def _parse_tool(name: str, cfg: dict[str, Any]) -> McpToolPolicySpec:
    fields = cfg.get("payload_fields") or cfg.get("include")
    return McpToolPolicySpec(
        mcp_tool=name,
        description=str(cfg.get("description", "")),
        acr_tool=str(cfg.get("acr_tool", "http.request")),
        deny=bool(cfg.get("deny", False)),
        methods=tuple(str(m).upper() for m in (cfg.get("methods") or [])),
        allowed_urls=tuple(str(u) for u in (cfg.get("allowed_urls") or [])),
        max_actions=cfg.get("max_actions"),
        expires_in=cfg.get("expires_in"),
        require_approval=bool(cfg.get("require_approval", False)),
        payload_fields=tuple(str(f) for f in fields) if fields else (),
    )


def _coerce(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, dict):
        return {str(k): _coerce(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_coerce(v) for v in value]
    return str(value)


def _load_yaml(path: Path) -> Any:
    try:
        import yaml
    except ImportError as exc:
        raise ImportError("YAML policies require pyyaml: pip install pyyaml") from exc
    return yaml.safe_load(path.read_text(encoding="utf-8"))
