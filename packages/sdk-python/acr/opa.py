"""OPA/Rego policy backend for embedded LocalAcrClient."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Literal

OpaMode = Literal["enforce", "shadow", "disabled"]


@dataclass(frozen=True)
class OpaConfig:
    url: str | None = None
    bundle_path: str | None = None
    decision_path: str = "acr/decision"
    mode: OpaMode = "enforce"
    timeout_sec: float = 3.0


def load_opa_config_from_env() -> OpaConfig | None:
    url = os.environ.get("ACR_OPA_URL", "").strip() or None
    bundle = os.environ.get("ACR_OPA_BUNDLE_PATH", "").strip() or None
    mode_raw = os.environ.get("ACR_OPA_MODE", "").strip().lower()
    if not url and not bundle and not mode_raw:
        return None
    mode: OpaMode = "enforce"
    if mode_raw in ("enforce", "shadow", "disabled"):
        mode = mode_raw  # type: ignore[assignment]
    elif mode_raw:
        raise ValueError("ACR_OPA_MODE must be enforce, shadow, or disabled")
    timeout = float(os.environ.get("ACR_OPA_TIMEOUT_MS", "3000")) / 1000.0
    return OpaConfig(
        url=url,
        bundle_path=bundle,
        decision_path=os.environ.get("ACR_OPA_DECISION_PATH", "acr/decision").strip()
        or "acr/decision",
        mode=mode if (url or bundle) else "disabled",
        timeout_sec=timeout,
    )


def build_opa_input(
    *,
    agent_id: str,
    tool: str,
    payload: dict[str, Any],
    constraints: dict[str, Any],
    action_count: int,
    approval_granted: bool = False,
    simulate: bool = False,
    jti: str | None = None,
    task: str | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "agentId": agent_id,
        "tool": tool,
        "payload": payload,
        "constraints": constraints,
        "actionCount": action_count,
        "approvalGranted": approval_granted,
        "simulate": simulate,
    }
    if jti:
        body["jti"] = jti
    if task:
        body["task"] = task
    return body


def _parse_decision(value: Any) -> tuple[str, str | None] | None:
    if value is None:
        return None
    if isinstance(value, str):
        decision = value.upper()
        if decision in ("ALLOW", "DENY", "REQUIRE_APPROVAL", "SIMULATE"):
            return decision, None
        return None
    if isinstance(value, dict):
        raw = value.get("decision")
        if isinstance(raw, str):
            decision = raw.upper()
            reason = value.get("reason")
            if decision in ("ALLOW", "DENY", "REQUIRE_APPROVAL", "SIMULATE"):
                return decision, str(reason) if reason else None
        if value.get("allow") is True:
            return "ALLOW", None
        if value.get("allow") is False:
            reason = value.get("reason")
            return "DENY", str(reason) if reason else "denied by OPA policy"
    return None


def _walk_result(body: dict[str, Any], decision_path: str) -> Any:
    current: Any = body.get("result")
    for segment in decision_path.split("/"):
        if not segment:
            continue
        if not isinstance(current, dict):
            return None
        current = current.get(segment)
    return current


def query_opa_http(config: OpaConfig, opa_input: dict[str, Any]) -> tuple[str, str | None] | None:
    if not config.url:
        return None
    base = config.url.rstrip("/")
    path = config.decision_path.strip("/")
    url = f"{base}/v1/data/{path}"
    data = json.dumps({"input": opa_input}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=config.timeout_sec) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        raise RuntimeError(f"OPA HTTP request failed: {exc}") from exc
    if not isinstance(body, dict):
        return None
    return _parse_decision(_walk_result(body, config.decision_path))


def evaluate_opa(
    config: OpaConfig | None,
    opa_input: dict[str, Any],
) -> tuple[bool, str, str | None, bool]:
    """Returns (allowed, decision, reason, shadow_only)."""
    if config is None or config.mode == "disabled":
        return True, "ALLOW", None, False
    if not config.url and not config.bundle_path:
        return True, "ALLOW", None, False

    parsed: tuple[str, str | None] | None = None
    if config.url:
        parsed = query_opa_http(config, opa_input)
    # Local bundle via opa CLI is gateway/Node-first; Python embedded uses HTTP.

    if parsed is None:
        return True, "ALLOW", None, False

    decision, reason = parsed
    if decision in ("ALLOW", "SIMULATE"):
        return True, decision, reason, False
    if config.mode == "shadow":
        return True, decision, reason, True
    return False, decision, reason, False
