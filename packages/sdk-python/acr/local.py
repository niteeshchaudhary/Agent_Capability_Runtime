"""Embedded (in-process) ACR runtime — zero-infrastructure alternative to the gateway.

``LocalAcrClient`` exposes the same method surface as ``AcrClient`` (``grant_sync``,
``execute_sync``, ``revoke_sync``, approvals, audit, health, plus async mirrors),
so it is a drop-in backend for ``CapabilityGuard`` and ``protect()``.

Everything runs inside the Python process: HS256 token signing, policy
evaluation, action counters, revocation, approvals, and audit. No Node,
no Docker, no server.

Usage::

    from acr import LocalAcrClient, can

    client = LocalAcrClient()  # ephemeral secret, in-memory state
    grant = client.grant_sync(
        can("gmail.send").only_domain("company.com").to_grant_input(agent_id="a1")
    )
    result = client.execute_sync(
        token=grant.token, tool="gmail.send", payload={"to": "x@company.com"}
    )

Graduate to the HTTP gateway later by swapping in ``AcrClient`` — same calls.
"""

from __future__ import annotations

import json
import os
import secrets
import time
import uuid
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from acr._jwt import decode_hs256, encode_hs256
from acr.client import AcrClient
from acr.opa import build_opa_input, evaluate_opa, load_opa_config_from_env
from acr.models import (
    ApprovalRequest,
    AuditEvent,
    ExecuteApprovalRequired,
    ExecuteDenied,
    ExecuteResult,
    ExecuteSimulated,
    ExecuteSuccess,
    GrantResponse,
    RevokeResponse,
)

_DURATION_UNITS = {"s": 1, "m": 60, "h": 3600, "d": 86400}
_DEFAULT_TTL_SECONDS = 15 * 60


def _parse_duration(value: str | int | None) -> int:
    """Parse '10m' / '1h' / '30s' / '1d' / int seconds into seconds."""
    if value is None:
        return _DEFAULT_TTL_SECONDS
    if isinstance(value, int):
        return value
    v = value.strip().lower()
    if v and v[-1] in _DURATION_UNITS and v[:-1].lstrip("-").isdigit():
        return int(v[:-1]) * _DURATION_UNITS[v[-1]]
    if v.lstrip("-").isdigit():
        return int(v)
    raise ValueError(f"Unsupported duration: {value!r}")


def _host_matches(url: str, allowed: str) -> bool:
    target = url if "://" in url else f"https://{url}"
    host = (urlparse(target).hostname or "").lower()
    if not host:
        return allowed.lower() in url.lower()
    allowed_l = allowed.lower()
    return host == allowed_l or host.endswith("." + allowed_l)


def _evaluate_constraints(
    tool: str,
    constraints: dict[str, Any],
    payload: dict[str, Any],
    intent: str | dict[str, Any] | None,
) -> tuple[list[dict[str, Any]], str | None]:
    """Evaluate constraints against a payload.

    Returns (evaluated_conditions, violation_reason). Conditions mirror the
    gateway's ``evaluatedConditions`` shape. Checks apply only when the
    relevant payload field is present (same leniency as the TS engine).
    """
    conditions: list[dict[str, Any]] = []

    def record(kind: str, passed: bool, reason: str | None = None) -> None:
        entry: dict[str, Any] = {"kind": kind, "passed": passed}
        if reason:
            entry["reason"] = reason
        conditions.append(entry)

    allowed_domains = constraints.get("allowedDomains")
    if isinstance(allowed_domains, list) and allowed_domains and tool == "gmail.send":
        to = payload.get("to")
        if isinstance(to, str) and "@" in to:
            domain = to.rsplit("@", 1)[-1].lower()
            allowed = [str(d).lower() for d in allowed_domains]
            if domain not in allowed:
                reason = f"external domain blocked: {domain}"
                record("domain", False, reason)
                return conditions, reason
            record("domain", True)

    if constraints.get("attachments") is False and payload.get("attachments"):
        reason = "attachments not allowed"
        record("attachments", False, reason)
        return conditions, reason

    allowed_methods = constraints.get("allowedMethods")
    if isinstance(allowed_methods, list) and allowed_methods:
        method = payload.get("method")
        if isinstance(method, str):
            allowed = [str(m).upper() for m in allowed_methods]
            if method.upper() not in allowed:
                reason = f"method not in allowed_methods: {method.upper()}"
                record("http_method", False, reason)
                return conditions, reason
            record("http_method", True)

    allowed_urls = constraints.get("allowedUrls")
    if isinstance(allowed_urls, list) and allowed_urls:
        url = payload.get("url")
        if isinstance(url, str):
            if not any(_host_matches(url, str(a)) for a in allowed_urls):
                reason = f"URL not in allowed_urls: {url}"
                record("http_url", False, reason)
                return conditions, reason
            record("http_url", True)

    allowed_hours = constraints.get("allowedHours")
    if isinstance(allowed_hours, dict):
        start = allowed_hours.get("start")
        end = allowed_hours.get("end")
        if isinstance(start, int) and isinstance(end, int):
            hour = datetime.now().hour
            if not (start <= hour < end):
                reason = f"outside allowed hours ({start}-{end}, now {hour})"
                record("hours", False, reason)
                return conditions, reason
            record("hours", True)

    allowed_categories = constraints.get("allowedIntentCategories")
    if isinstance(allowed_categories, list) and allowed_categories and intent is not None:
        category = intent if isinstance(intent, str) else intent.get("category")
        if isinstance(category, str):
            allowed = [str(c).lower() for c in allowed_categories]
            if category.lower() not in allowed:
                reason = f"intent category not allowed: {category}"
                record("intent", False, reason)
                return conditions, reason
            record("intent", True)

    return conditions, None


def _payload_matches(a: dict[str, Any], b: dict[str, Any]) -> bool:
    return json.dumps(a, sort_keys=True, default=str) == json.dumps(b, sort_keys=True, default=str)


def _spend_amount_cents(payload: dict[str, Any]) -> int | None:
    amount = payload.get("amountCents", payload.get("amount"))
    if isinstance(amount, (int, float)) and not isinstance(amount, bool):
        return int(amount)
    return None


class LocalAcrClient:
    """In-process ACR runtime with the same surface as ``AcrClient``.

    Args:
        secret: HS256 signing secret. Defaults to ``ACR_SIGNING_SECRET`` env
            or an ephemeral random secret (tokens valid only in this process).
        issuer: ``iss`` claim for granted tokens.
        audit_path: Optional JSONL file to append audit events to.
    """

    def __init__(
        self,
        *,
        secret: str | None = None,
        issuer: str = "acr-local",
        audit_path: str | None = None,
    ) -> None:
        self._secret = secret or os.environ.get("ACR_SIGNING_SECRET") or secrets.token_hex(32)
        self._issuer = issuer
        self._audit_path = audit_path or os.environ.get("ACR_AUDIT_PATH")
        self._revoked: set[str] = set()
        self._actions: dict[str, int] = {}
        self._completed_requests: dict[str, set[str]] = {}
        self._approvals: dict[str, dict[str, Any]] = {}
        self._audit: list[dict[str, Any]] = []
        self._audit_counter = 0
        self._opa = load_opa_config_from_env()

    # ── Grant ────────────────────────────────────────────────────────────

    def grant_sync(self, input: dict[str, Any]) -> GrantResponse:
        """Grant a capability token (sync, in-process)."""
        agent_id = str(input.get("agentId", ""))
        tool = str(input.get("tool", ""))
        constraints_raw = input.get("constraints")
        constraints: dict[str, Any] = (
            dict(constraints_raw) if isinstance(constraints_raw, dict) else {}
        )

        now = int(time.time())
        ttl = _parse_duration(input.get("expiresIn"))
        exp = now + ttl
        jti = f"cap_{uuid.uuid4().hex[:12]}"

        claims: dict[str, Any] = {
            "iss": self._issuer,
            "sub": agent_id,
            "jti": jti,
            "tool": tool,
            "constraints": constraints,
            "iat": now,
            "exp": exp,
        }
        if input.get("task") is not None:
            claims["task"] = input["task"]

        token = encode_hs256(claims, self._secret)
        expires_at = datetime.fromtimestamp(exp, tz=timezone.utc).isoformat()
        return GrantResponse.model_validate(
            {"token": token, "claims": claims, "expiresAt": expires_at}
        )

    # ── Execute ──────────────────────────────────────────────────────────

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
    ) -> ExecuteResult:
        """Evaluate policy and execute (sync, in-process).

        Local mode has no tool adapters: an ALLOW consumes an action and
        records audit — your own code performs the actual work.
        """
        try:
            claims = decode_hs256(token, self._secret)
        except ValueError:
            return self._deny("", tool, payload, "invalid token", "invalid_token")

        agent_id = str(claims.get("sub", ""))
        jti = str(claims.get("jti", ""))

        if jti in self._revoked:
            return self._deny(agent_id, tool, payload, "capability revoked", "token_revoked")

        exp = claims.get("exp")
        if isinstance(exp, int) and int(time.time()) >= exp:
            return self._deny(agent_id, tool, payload, "token expired", "token_expired")

        token_tool = claims.get("tool")
        if token_tool != tool:
            return self._deny(
                agent_id, tool, payload,
                f"token tool {token_tool!r} does not match request tool {tool!r}",
                "tool_mismatch",
            )

        constraints_raw = claims.get("constraints")
        constraints: dict[str, Any] = (
            constraints_raw if isinstance(constraints_raw, dict) else {}
        )

        conditions, violation = _evaluate_constraints(tool, constraints, payload, intent)
        if violation is not None:
            return self._deny(agent_id, tool, payload, violation, "policy_denied")

        used = self._actions.get(jti, 0)
        opa_input = build_opa_input(
            agent_id=agent_id,
            tool=tool,
            payload=payload,
            constraints=constraints,
            action_count=used,
            approval_granted=approval_id is not None,
            simulate=bool(simulate),
            jti=jti,
            task=str(claims.get("task")) if claims.get("task") else None,
        )
        opa_allowed, opa_decision, opa_reason, _shadow = evaluate_opa(self._opa, opa_input)
        if not opa_allowed:
            if opa_decision == "REQUIRE_APPROVAL":
                appr_id = f"appr_{uuid.uuid4().hex[:12]}"
                self._approvals[appr_id] = {
                    "id": appr_id,
                    "agentId": agent_id,
                    "tool": tool,
                    "payload": payload,
                    "status": "pending",
                    "jti": jti,
                    "createdAt": datetime.now(tz=timezone.utc).isoformat(),
                    "reason": opa_reason or "OPA policy requires approval",
                }
                audit_id = self._record(
                    agent_id, tool, "REQUIRE_APPROVAL", opa_reason, payload
                )
                return ExecuteApprovalRequired.model_validate({
                    "auditId": audit_id,
                    "reason": opa_reason or "OPA policy requires approval",
                    "approvalId": appr_id,
                })
            return self._deny(
                agent_id,
                tool,
                payload,
                opa_reason or "denied by OPA policy",
                "policy_denied",
            )

        if simulate:
            audit_id = self._record(agent_id, tool, "SIMULATE", "policy would allow", payload)
            return ExecuteSimulated.model_validate({
                "auditId": audit_id,
                "reason": "policy would allow execution",
                "evaluatedConditions": conditions,
            })

        if request_id:
            seen = self._completed_requests.setdefault(jti, set())
            if request_id in seen:
                audit_id = self._record(
                    agent_id, tool, "ALLOW", "idempotent replay — request already consumed", payload
                )
                return ExecuteSuccess.model_validate({
                    "auditId": audit_id,
                    "result": {"status": "replay", "requestId": request_id},
                })

        max_actions = constraints.get("maxActions")
        used = self._actions.get(jti, 0)
        if isinstance(max_actions, int) and used >= max_actions:
            return self._deny(
                agent_id, tool, payload,
                f"max actions exceeded ({used}/{max_actions})",
                "policy_denied",
            )

        approval_reason = self._approval_gate(constraints, payload)
        if approval_reason is not None:
            resolved = self._resolve_approval(approval_id, jti, tool, payload)
            if resolved is not None:
                if isinstance(resolved, ExecuteDenied):
                    return resolved
                return self._allow(agent_id, tool, payload, jti, request_id)
            appr_id = f"appr_{uuid.uuid4().hex[:12]}"
            self._approvals[appr_id] = {
                "id": appr_id,
                "agentId": agent_id,
                "tool": tool,
                "payload": payload,
                "status": "pending",
                "jti": jti,
                "createdAt": datetime.now(tz=timezone.utc).isoformat(),
            }
            audit_id = self._record(agent_id, tool, "REQUIRE_APPROVAL", approval_reason, payload)
            return ExecuteApprovalRequired.model_validate({
                "auditId": audit_id,
                "reason": approval_reason,
                "approvalId": appr_id,
            })

        return self._allow(agent_id, tool, payload, jti, request_id)

    def _approval_gate(self, constraints: dict[str, Any], payload: dict[str, Any]) -> str | None:
        """Return a reason string when execution needs human approval."""
        if constraints.get("approvalRequired") is True:
            return "approval required by policy"
        limit = constraints.get("spendingLimit")
        if isinstance(limit, int):
            amount = _spend_amount_cents(payload)
            if amount is not None and amount > limit:
                dollars = amount / 100
                limit_dollars = limit / 100
                return f"spending ${dollars:.2f} exceeds limit ${limit_dollars:.2f} — approval required"
        return None

    def _resolve_approval(
        self,
        approval_id: str | None,
        jti: str,
        tool: str,
        payload: dict[str, Any],
    ) -> ExecuteDenied | bool | None:
        """Check a supplied approval id. True = approved; ExecuteDenied = hard stop;
        None = no usable approval (caller creates a pending one)."""
        if not approval_id:
            return None
        record = self._approvals.get(approval_id)
        if record is None or record.get("jti") != jti:
            return None
        if record.get("tool") != tool or not _payload_matches(
            record.get("payload", {}), payload
        ):
            return self._deny(
                str(record.get("agentId", "")),
                tool,
                payload,
                "approval does not match execute request",
                "policy_denied",
            )
        status = record.get("status")
        if status == "approved":
            record["status"] = "consumed"
            return True
        if status == "rejected":
            return self._deny(
                str(record.get("agentId", "")), str(record.get("tool", "")), {},
                "approval rejected", "policy_denied",
            )
        if status == "consumed":
            return self._deny(
                str(record.get("agentId", "")), str(record.get("tool", "")), {},
                "approval already used", "policy_denied",
            )
        return None

    def _allow(
        self,
        agent_id: str,
        tool: str,
        payload: dict[str, Any],
        jti: str,
        request_id: str | None = None,
    ) -> ExecuteSuccess:
        if request_id:
            self._completed_requests.setdefault(jti, set()).add(request_id)
        self._actions[jti] = self._actions.get(jti, 0) + 1
        audit_id = self._record(agent_id, tool, "ALLOW", None, payload)
        return ExecuteSuccess.model_validate({
            "auditId": audit_id,
            "result": {"status": "ok", "mode": "local"},
        })

    def _deny(
        self, agent_id: str, tool: str, payload: dict[str, Any], reason: str, code: str
    ) -> ExecuteDenied:
        audit_id = self._record(agent_id, tool, "DENY", reason, payload)
        return ExecuteDenied.model_validate({
            "auditId": audit_id,
            "reason": reason,
            "code": code,
        })

    # ── Revoke ───────────────────────────────────────────────────────────

    def revoke_sync(
        self,
        capability_id: str,
        *,
        reason: str | None = None,
        revoked_by: str | None = None,
    ) -> RevokeResponse:
        """Revoke a capability by jti (sync, in-process)."""
        self._revoked.add(capability_id)
        record: dict[str, Any] = {"capabilityId": capability_id}
        if reason:
            record["reason"] = reason
        if revoked_by:
            record["revokedBy"] = revoked_by
        return RevokeResponse.model_validate({"revoked": True, "record": record})

    # ── Approvals ────────────────────────────────────────────────────────

    def list_approvals_sync(
        self,
        *,
        status: str | None = None,
        agent_id: str | None = None,
        tool: str | None = None,
    ) -> list[ApprovalRequest]:
        """List approval requests (sync, in-process)."""
        results: list[ApprovalRequest] = []
        for record in self._approvals.values():
            if status and record.get("status") != status:
                continue
            if agent_id and record.get("agentId") != agent_id:
                continue
            if tool and record.get("tool") != tool:
                continue
            results.append(ApprovalRequest.model_validate(record))
        return results

    def approve_sync(self, approval_id: str, resolved_by: str | None = None) -> dict[str, Any]:
        """Approve a pending approval (sync, in-process)."""
        record = self._approvals.get(approval_id)
        if record is None:
            raise KeyError(f"Unknown approval: {approval_id}")
        record["status"] = "approved"
        record["resolvedAt"] = datetime.now(tz=timezone.utc).isoformat()
        if resolved_by:
            record["resolvedBy"] = resolved_by
        return {"approval": dict(record)}

    def reject_sync(self, approval_id: str, resolved_by: str | None = None) -> dict[str, Any]:
        """Reject a pending approval (sync, in-process)."""
        record = self._approvals.get(approval_id)
        if record is None:
            raise KeyError(f"Unknown approval: {approval_id}")
        record["status"] = "rejected"
        record["resolvedAt"] = datetime.now(tz=timezone.utc).isoformat()
        if resolved_by:
            record["resolvedBy"] = resolved_by
        return {"approval": dict(record)}

    # ── Audit ────────────────────────────────────────────────────────────

    def list_audit_sync(
        self,
        *,
        agent_id: str | None = None,
        tool: str | None = None,
        decision: str | None = None,
        since: str | None = None,
        until: str | None = None,
        limit: int | None = None,
    ) -> list[AuditEvent]:
        """Query the in-memory audit log (sync, in-process)."""
        events: list[AuditEvent] = []
        for entry in self._audit:
            if agent_id and entry.get("agentId") != agent_id:
                continue
            if tool and entry.get("tool") != tool:
                continue
            if decision and entry.get("decision") != decision:
                continue
            events.append(AuditEvent.model_validate(entry))
        if limit is not None:
            events = events[-limit:]
        return events

    def _record(
        self,
        agent_id: str,
        tool: str,
        decision: str,
        reason: str | None,
        payload: dict[str, Any],
    ) -> str:
        self._audit_counter += 1
        audit_id = f"aud_local_{self._audit_counter}"
        entry: dict[str, Any] = {
            "id": audit_id,
            "agentId": agent_id,
            "tool": tool,
            "decision": decision,
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        }
        if reason:
            entry["reason"] = reason
        self._audit.append({**entry, "payload": payload})
        if self._audit_path:
            with open(self._audit_path, "a", encoding="utf-8") as fh:
                fh.write(json.dumps({**entry, "payload": payload}) + "\n")
        return audit_id

    # ── Health / lifecycle ───────────────────────────────────────────────

    def health_sync(self) -> dict[str, Any]:
        """Health check (always ok for in-process runtime)."""
        return {"status": "ok", "version": "0.1.0", "mode": "local"}

    def close(self) -> None:
        """No-op (parity with AcrClient)."""

    async def aclose(self) -> None:
        """No-op (parity with AcrClient)."""

    async def __aenter__(self) -> LocalAcrClient:
        return self

    async def __aexit__(self, *args: Any) -> None:
        return None

    # ── Async mirrors ────────────────────────────────────────────────────

    async def grant(self, input: dict[str, Any]) -> GrantResponse:
        return self.grant_sync(input)

    async def execute(
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
    ) -> ExecuteResult:
        return self.execute_sync(
            token=token,
            tool=tool,
            payload=payload,
            approval_id=approval_id,
            request_id=request_id,
            trace_id=trace_id,
            session_id=session_id,
            intent=intent,
            simulate=simulate,
        )

    async def revoke(
        self,
        capability_id: str,
        *,
        reason: str | None = None,
        revoked_by: str | None = None,
    ) -> RevokeResponse:
        return self.revoke_sync(capability_id, reason=reason, revoked_by=revoked_by)

    async def list_approvals(
        self,
        *,
        status: str | None = None,
        agent_id: str | None = None,
        tool: str | None = None,
    ) -> list[ApprovalRequest]:
        return self.list_approvals_sync(status=status, agent_id=agent_id, tool=tool)

    async def approve(self, approval_id: str, resolved_by: str | None = None) -> dict[str, Any]:
        return self.approve_sync(approval_id, resolved_by)

    async def reject(self, approval_id: str, resolved_by: str | None = None) -> dict[str, Any]:
        return self.reject_sync(approval_id, resolved_by)

    async def list_audit(
        self,
        *,
        agent_id: str | None = None,
        tool: str | None = None,
        decision: str | None = None,
        since: str | None = None,
        until: str | None = None,
        limit: int | None = None,
    ) -> list[AuditEvent]:
        return self.list_audit_sync(
            agent_id=agent_id, tool=tool, decision=decision,
            since=since, until=until, limit=limit,
        )

    async def health(self) -> dict[str, Any]:
        return self.health_sync()


def create_client(
    base_url: str | None = None,
    *,
    admin_api_key: str | None = None,
    secret: str | None = None,
) -> AcrClient | LocalAcrClient:
    """Create the right client from arguments or environment.

    - ``base_url`` arg or ``ACR_GATEWAY_URL`` env set → HTTP ``AcrClient``
    - otherwise → embedded ``LocalAcrClient`` (zero infrastructure)
    """
    url = base_url or os.environ.get("ACR_GATEWAY_URL")
    if url:
        return AcrClient(
            base_url=url,
            admin_api_key=admin_api_key or os.environ.get("ACR_ADMIN_API_KEY"),
        )
    return LocalAcrClient(secret=secret)
