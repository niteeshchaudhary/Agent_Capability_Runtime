"""Async and sync HTTP client for the ACR gateway.

Usage::

    from acr import AcrClient, can

    # Async usage (FastAPI, LangChain, etc.)
    async with AcrClient(base_url="http://localhost:3000") as client:
        grant = await client.grant(
            can("gmail.send").only_domain("company.com").to_grant_input(agent_id="agent_1")
        )
        result = await client.execute(token=grant.token, tool="gmail.send", payload={...})

    # Sync usage
    client = AcrClient(base_url="http://localhost:3000")
    grant = client.grant_sync(
        can("gmail.send").only_domain("company.com").to_grant_input(agent_id="agent_1")
    )
    result = client.execute_sync(token=grant.token, tool="gmail.send", payload={...})
"""

from __future__ import annotations

from typing import Any, cast

import httpx

from acr.exceptions import (
    ApprovalError,
    DelegateError,
    ExecuteError,
    GrantError,
    RevokeError,
)
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


class AcrClient:
    """HTTP client for the ACR gateway.

    Provides both **async** methods (``grant``, ``execute``, …) and
    **sync** convenience wrappers (``grant_sync``, ``execute_sync``, …).

    Args:
        base_url: Gateway URL, e.g. ``"http://localhost:3000"``.
        admin_api_key: Optional Bearer token for grant/delegate endpoints.
        timeout: Request timeout in seconds (default 30).
        headers: Extra headers to send with every request.
    """

    def __init__(
        self,
        base_url: str,
        *,
        admin_api_key: str | None = None,
        timeout: float = 30.0,
        headers: dict[str, str] | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._admin_api_key = admin_api_key
        self._timeout = timeout
        self._extra_headers = headers or {}

        # Lazy-created clients
        self._async_client: httpx.AsyncClient | None = None
        self._sync_client: httpx.Client | None = None

    # ── Lifecycle ────────────────────────────────────────────────────────

    def _get_async_client(self) -> httpx.AsyncClient:
        if self._async_client is None:
            self._async_client = httpx.AsyncClient(
                base_url=self._base_url,
                timeout=self._timeout,
                headers=self._default_headers(),
            )
        return self._async_client

    def _get_sync_client(self) -> httpx.Client:
        if self._sync_client is None:
            self._sync_client = httpx.Client(
                base_url=self._base_url,
                timeout=self._timeout,
                headers=self._default_headers(),
            )
        return self._sync_client

    def _default_headers(self) -> dict[str, str]:
        h: dict[str, str] = {"Content-Type": "application/json", **self._extra_headers}
        return h

    def _issuance_headers(self) -> dict[str, str]:
        h: dict[str, str] = {"Content-Type": "application/json", **self._extra_headers}
        if self._admin_api_key:
            h["Authorization"] = f"Bearer {self._admin_api_key}"
        return h

    async def __aenter__(self) -> AcrClient:
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        """Close the async HTTP client."""
        if self._async_client is not None:
            await self._async_client.aclose()
            self._async_client = None

    def close(self) -> None:
        """Close the sync HTTP client."""
        if self._sync_client is not None:
            self._sync_client.close()
            self._sync_client = None

    # ── Grant ────────────────────────────────────────────────────────────

    async def grant(self, input: dict[str, Any]) -> GrantResponse:
        """Grant a capability token (async).

        Args:
            input: Grant parameters — use ``can(...).to_grant_input(agent_id=...)``
                   or a raw dict with ``agentId``, ``tool``, ``constraints``, etc.
        """
        client = self._get_async_client()
        try:
            resp = await client.post(
                "/capabilities/grant",
                json=input,
                headers=self._issuance_headers(),
            )
        except httpx.HTTPError as e:
            raise GrantError(f"Grant request failed: {e}") from e

        if resp.status_code >= 400:
            body = resp.json()
            raise GrantError(
                body.get("message", f"Grant failed: {resp.status_code}"),
                status_code=resp.status_code,
            )

        return GrantResponse.model_validate(resp.json())

    def grant_sync(self, input: dict[str, Any]) -> GrantResponse:
        """Grant a capability token (sync)."""
        client = self._get_sync_client()
        try:
            resp = client.post(
                "/capabilities/grant",
                json=input,
                headers=self._issuance_headers(),
            )
        except httpx.HTTPError as e:
            raise GrantError(f"Grant request failed: {e}") from e

        if resp.status_code >= 400:
            body = resp.json()
            raise GrantError(
                body.get("message", f"Grant failed: {resp.status_code}"),
                status_code=resp.status_code,
            )

        return GrantResponse.model_validate(resp.json())

    # ── Execute ──────────────────────────────────────────────────────────

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
        """Execute a tool through the ACR runtime (async)."""
        body = _build_execute_body(
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
        client = self._get_async_client()
        try:
            resp = await client.post("/runtime/execute", json=body)
        except httpx.HTTPError as e:
            raise ExecuteError(f"Execute request failed: {e}") from e

        return _parse_execute_response(resp)

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
        """Execute a tool through the ACR runtime (sync)."""
        body = _build_execute_body(
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
        client = self._get_sync_client()
        try:
            resp = client.post("/runtime/execute", json=body)
        except httpx.HTTPError as e:
            raise ExecuteError(f"Execute request failed: {e}") from e

        return _parse_execute_response(resp)

    # ── Delegate ─────────────────────────────────────────────────────────

    async def delegate(
        self,
        parent_token: str,
        input: dict[str, Any],
    ) -> GrantResponse:
        """Delegate a capability to a child agent (async)."""
        body = {"parentToken": parent_token, **input}
        client = self._get_async_client()
        try:
            resp = await client.post(
                "/capabilities/delegate",
                json=body,
                headers=self._issuance_headers(),
            )
        except httpx.HTTPError as e:
            raise DelegateError(f"Delegate request failed: {e}") from e

        if resp.status_code >= 400:
            data = resp.json()
            raise DelegateError(
                data.get("message", f"Delegate failed: {resp.status_code}"),
                status_code=resp.status_code,
            )

        return GrantResponse.model_validate(resp.json())

    def delegate_sync(
        self,
        parent_token: str,
        input: dict[str, Any],
    ) -> GrantResponse:
        """Delegate a capability to a child agent (sync)."""
        body = {"parentToken": parent_token, **input}
        client = self._get_sync_client()
        try:
            resp = client.post(
                "/capabilities/delegate",
                json=body,
                headers=self._issuance_headers(),
            )
        except httpx.HTTPError as e:
            raise DelegateError(f"Delegate request failed: {e}") from e

        if resp.status_code >= 400:
            data = resp.json()
            raise DelegateError(
                data.get("message", f"Delegate failed: {resp.status_code}"),
                status_code=resp.status_code,
            )

        return GrantResponse.model_validate(resp.json())

    # ── Revoke ───────────────────────────────────────────────────────────

    async def revoke(
        self,
        capability_id: str,
        *,
        reason: str | None = None,
        revoked_by: str | None = None,
    ) -> RevokeResponse:
        """Revoke a capability token (async)."""
        body: dict[str, Any] = {"capabilityId": capability_id}
        if reason is not None:
            body["reason"] = reason
        if revoked_by is not None:
            body["revokedBy"] = revoked_by

        client = self._get_async_client()
        try:
            resp = await client.post(
                "/capabilities/revoke",
                json=body,
                headers=self._issuance_headers(),
            )
        except httpx.HTTPError as e:
            raise RevokeError(f"Revoke request failed: {e}") from e

        if resp.status_code >= 400:
            data = resp.json()
            raise RevokeError(
                data.get("message", f"Revoke failed: {resp.status_code}"),
                status_code=resp.status_code,
            )

        return RevokeResponse.model_validate(resp.json())

    def revoke_sync(
        self,
        capability_id: str,
        *,
        reason: str | None = None,
        revoked_by: str | None = None,
    ) -> RevokeResponse:
        """Revoke a capability token (sync)."""
        body: dict[str, Any] = {"capabilityId": capability_id}
        if reason is not None:
            body["reason"] = reason
        if revoked_by is not None:
            body["revokedBy"] = revoked_by

        client = self._get_sync_client()
        try:
            resp = client.post(
                "/capabilities/revoke",
                json=body,
                headers=self._issuance_headers(),
            )
        except httpx.HTTPError as e:
            raise RevokeError(f"Revoke request failed: {e}") from e

        if resp.status_code >= 400:
            data = resp.json()
            raise RevokeError(
                data.get("message", f"Revoke failed: {resp.status_code}"),
                status_code=resp.status_code,
            )

        return RevokeResponse.model_validate(resp.json())

    # ── Approvals ────────────────────────────────────────────────────────

    async def list_approvals(
        self,
        *,
        status: str | None = None,
        agent_id: str | None = None,
        tool: str | None = None,
    ) -> list[ApprovalRequest]:
        """List approval requests (async)."""
        params: dict[str, str] = {}
        if status:
            params["status"] = status
        if agent_id:
            params["agentId"] = agent_id
        if tool:
            params["tool"] = tool

        client = self._get_async_client()
        resp = await client.get("/approvals", params=params)
        if resp.status_code >= 400:
            raise ApprovalError(
                f"List approvals failed: {resp.status_code}", status_code=resp.status_code
            )
        data = resp.json()
        return [ApprovalRequest.model_validate(a) for a in data.get("approvals", [])]

    def list_approvals_sync(
        self,
        *,
        status: str | None = None,
        agent_id: str | None = None,
        tool: str | None = None,
    ) -> list[ApprovalRequest]:
        """List approval requests (sync)."""
        params: dict[str, str] = {}
        if status:
            params["status"] = status
        if agent_id:
            params["agentId"] = agent_id
        if tool:
            params["tool"] = tool

        client = self._get_sync_client()
        resp = client.get("/approvals", params=params)
        if resp.status_code >= 400:
            raise ApprovalError(
                f"List approvals failed: {resp.status_code}", status_code=resp.status_code
            )
        data = resp.json()
        return [ApprovalRequest.model_validate(a) for a in data.get("approvals", [])]

    async def approve(self, approval_id: str, resolved_by: str | None = None) -> dict[str, Any]:
        """Approve a pending approval (async)."""
        body: dict[str, Any] = {}
        if resolved_by:
            body["resolvedBy"] = resolved_by

        client = self._get_async_client()
        resp = await client.post(f"/approvals/{approval_id}/approve", json=body)
        if resp.status_code >= 400:
            data = resp.json()
            raise ApprovalError(
                data.get("message", f"Approve failed: {resp.status_code}"),
                status_code=resp.status_code,
            )
        return cast(dict[str, Any], resp.json())

    def approve_sync(self, approval_id: str, resolved_by: str | None = None) -> dict[str, Any]:
        """Approve a pending approval (sync)."""
        body: dict[str, Any] = {}
        if resolved_by:
            body["resolvedBy"] = resolved_by

        client = self._get_sync_client()
        resp = client.post(f"/approvals/{approval_id}/approve", json=body)
        if resp.status_code >= 400:
            data = resp.json()
            raise ApprovalError(
                data.get("message", f"Approve failed: {resp.status_code}"),
                status_code=resp.status_code,
            )
        return cast(dict[str, Any], resp.json())

    async def reject(self, approval_id: str, resolved_by: str | None = None) -> dict[str, Any]:
        """Reject a pending approval (async)."""
        body: dict[str, Any] = {}
        if resolved_by:
            body["resolvedBy"] = resolved_by

        client = self._get_async_client()
        resp = await client.post(f"/approvals/{approval_id}/reject", json=body)
        if resp.status_code >= 400:
            data = resp.json()
            raise ApprovalError(
                data.get("message", f"Reject failed: {resp.status_code}"),
                status_code=resp.status_code,
            )
        return cast(dict[str, Any], resp.json())

    def reject_sync(self, approval_id: str, resolved_by: str | None = None) -> dict[str, Any]:
        """Reject a pending approval (sync)."""
        body: dict[str, Any] = {}
        if resolved_by:
            body["resolvedBy"] = resolved_by

        client = self._get_sync_client()
        resp = client.post(f"/approvals/{approval_id}/reject", json=body)
        if resp.status_code >= 400:
            data = resp.json()
            raise ApprovalError(
                data.get("message", f"Reject failed: {resp.status_code}"),
                status_code=resp.status_code,
            )
        return cast(dict[str, Any], resp.json())

    # ── Audit ────────────────────────────────────────────────────────────

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
        """Query audit log (async)."""
        params: dict[str, str] = {}
        if agent_id:
            params["agentId"] = agent_id
        if tool:
            params["tool"] = tool
        if decision:
            params["decision"] = decision
        if since:
            params["since"] = since
        if until:
            params["until"] = until
        if limit is not None:
            params["limit"] = str(limit)

        client = self._get_async_client()
        resp = await client.get("/audit", params=params)
        data = resp.json()
        return [AuditEvent.model_validate(e) for e in data.get("events", [])]

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
        """Query audit log (sync)."""
        params: dict[str, str] = {}
        if agent_id:
            params["agentId"] = agent_id
        if tool:
            params["tool"] = tool
        if decision:
            params["decision"] = decision
        if since:
            params["since"] = since
        if until:
            params["until"] = until
        if limit is not None:
            params["limit"] = str(limit)

        client = self._get_sync_client()
        resp = client.get("/audit", params=params)
        data = resp.json()
        return [AuditEvent.model_validate(e) for e in data.get("events", [])]

    async def verify_audit_chain(self) -> dict[str, Any]:
        """Verify tamper-evident audit hash chain (async).

        Returns gateway JSON — ``enabled: false`` when hash chain is not configured.
        """
        client = self._get_async_client()
        resp = await client.get("/audit/verify")
        if resp.status_code >= 400:
            raise ExecuteError(f"Audit verify failed: {resp.status_code}")
        return cast(dict[str, Any], resp.json())

    def verify_audit_chain_sync(self) -> dict[str, Any]:
        """Verify tamper-evident audit hash chain (sync)."""
        client = self._get_sync_client()
        resp = client.get("/audit/verify")
        if resp.status_code >= 400:
            raise ExecuteError(f"Audit verify failed: {resp.status_code}")
        return cast(dict[str, Any], resp.json())

    # ── Health ───────────────────────────────────────────────────────────

    async def health(self) -> dict[str, Any]:
        """Check gateway health (async)."""
        client = self._get_async_client()
        resp = await client.get("/health")
        return cast(dict[str, Any], resp.json())

    def health_sync(self) -> dict[str, Any]:
        """Check gateway health (sync)."""
        client = self._get_sync_client()
        resp = client.get("/health")
        return cast(dict[str, Any], resp.json())


# ── Private helpers ──────────────────────────────────────────────────────────


def _build_execute_body(
    *,
    token: str,
    tool: str,
    payload: dict[str, Any],
    approval_id: str | None,
    request_id: str | None,
    trace_id: str | None,
    session_id: str | None,
    intent: str | dict[str, Any] | None,
    simulate: bool | None,
) -> dict[str, Any]:
    body: dict[str, Any] = {"token": token, "tool": tool, "payload": payload}
    if approval_id is not None:
        body["approvalId"] = approval_id
    if request_id is not None:
        body["requestId"] = request_id
    if trace_id is not None:
        body["traceId"] = trace_id
    if session_id is not None:
        body["sessionId"] = session_id
    if intent is not None:
        body["intent"] = intent
    if simulate is not None:
        body["simulate"] = simulate
    return body


def _parse_execute_response(resp: httpx.Response) -> ExecuteResult:
    """Map gateway HTTP response to typed ExecuteResult."""
    data = resp.json()
    decision = data.get("decision", "")
    audit_id = data.get("auditId", "")

    if resp.status_code == 200 and decision == "SIMULATE":
        return ExecuteSimulated.model_validate({
            "auditId": audit_id,
            "reason": data.get("reason"),
            "evaluatedConditions": data.get("evaluatedConditions"),
        })

    if resp.status_code == 200 and decision == "ALLOW":
        return ExecuteSuccess.model_validate({
            "auditId": audit_id,
            "result": data.get("result"),
        })

    if resp.status_code == 202 and decision == "REQUIRE_APPROVAL":
        return ExecuteApprovalRequired.model_validate({
            "auditId": audit_id,
            "reason": data.get("reason", "approval required"),
            "approvalId": data.get("approvalId", ""),
        })

    # DENY (401, 403, or other)
    return ExecuteDenied.model_validate({
        "auditId": audit_id,
        "reason": data.get("reason", "denied"),
        "code": data.get("code", "policy_denied"),
    })
