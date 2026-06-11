"""Pydantic models mirroring the ACR gateway REST API types."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


# ── Constraint & Grant Input ─────────────────────────────────────────────────


class AllowedHours(BaseModel):
    """Time-window constraint for tool execution."""

    start: int
    end: int


class ConstraintSet(BaseModel):
    """Constraints embedded in a capability token."""

    allowed_domains: list[str] | None = Field(None, alias="allowedDomains")
    max_actions: int | None = Field(None, alias="maxActions")
    attachments: bool | None = None
    spending_limit: int | None = Field(None, alias="spendingLimit")
    allowed_hours: AllowedHours | None = Field(None, alias="allowedHours")
    approval_required: bool | None = Field(None, alias="approvalRequired")
    approval_required_if_external: bool | None = Field(
        None, alias="approvalRequiredIfExternal"
    )
    allowed_methods: list[str] | None = Field(None, alias="allowedMethods")
    allowed_urls: list[str] | None = Field(None, alias="allowedUrls")
    allowed_intent_categories: list[str] | None = Field(
        None, alias="allowedIntentCategories"
    )
    allowed_intent_actions: list[str] | None = Field(None, alias="allowedIntentActions")

    model_config = {"populate_by_name": True}


class ExecutionIntent(BaseModel):
    """Semantic execution intent for intent-aware policy evaluation."""

    category: str
    action: str | None = None
    confidence: float | None = None

    model_config = {"populate_by_name": True}


class GrantCapabilityInput(BaseModel):
    """Input for granting a capability token."""

    agent_id: str = Field(..., alias="agentId")
    tool: str
    constraints: dict[str, Any] = Field(default_factory=dict)
    expires_in: str | int | None = Field(None, alias="expiresIn")
    session: str | None = None
    task: str | None = None
    intent: ExecutionIntent | str | None = None
    metadata: dict[str, Any] | None = None

    model_config = {"populate_by_name": True}


class DelegateCapabilityInput(BaseModel):
    """Input for delegating a capability to a child agent."""

    agent_id: str = Field(..., alias="agentId")
    tool: str
    constraints: dict[str, Any] = Field(default_factory=dict)
    expires_in: str | int | None = Field(None, alias="expiresIn")
    delegator: str | None = None
    session: str | None = None
    task: str | None = None
    intent: ExecutionIntent | str | None = None
    metadata: dict[str, Any] | None = None

    model_config = {"populate_by_name": True}


# ── Grant Response ───────────────────────────────────────────────────────────


class CapabilityTokenClaims(BaseModel):
    """JWT claims from a capability token."""

    iss: str | None = None
    sub: str | None = None
    jti: str | None = None
    tool: str | None = None
    task: str | None = None
    constraints: dict[str, Any] | None = None
    iat: int | None = None
    exp: int | None = None
    parent_jti: str | None = None

    model_config = {"extra": "allow", "populate_by_name": True}


class GrantResponse(BaseModel):
    """Response from a successful grant or delegate operation."""

    token: str
    claims: CapabilityTokenClaims
    expires_at: str = Field(..., alias="expiresAt")

    model_config = {"populate_by_name": True}


# ── Execute Input / Result ───────────────────────────────────────────────────


class ExecuteInput(BaseModel):
    """Input for executing a tool via the runtime."""

    token: str
    tool: str
    payload: dict[str, Any]
    approval_id: str | None = Field(None, alias="approvalId")
    request_id: str | None = Field(None, alias="requestId")
    trace_id: str | None = Field(None, alias="traceId")
    session_id: str | None = Field(None, alias="sessionId")
    intent: ExecutionIntent | str | None = None
    simulate: bool | None = None

    model_config = {"populate_by_name": True}


class EvaluatedCondition(BaseModel):
    """Result of a single policy condition evaluation."""

    kind: str
    passed: bool
    reason: str | None = None


class ExecuteSuccess(BaseModel):
    """Successful execution result (ALLOW)."""

    ok: Literal[True] = True
    decision: Literal["ALLOW"] = "ALLOW"
    result: Any = None
    audit_id: str = Field(..., alias="auditId")

    model_config = {"populate_by_name": True}


class ExecuteSimulated(BaseModel):
    """Simulated execution result (SIMULATE)."""

    ok: Literal[True] = True
    decision: Literal["SIMULATE"] = "SIMULATE"
    reason: str | None = None
    audit_id: str = Field(..., alias="auditId")
    evaluated_conditions: list[EvaluatedCondition] | None = Field(
        None, alias="evaluatedConditions"
    )

    model_config = {"populate_by_name": True}


class ExecuteDenied(BaseModel):
    """Denied execution result (DENY)."""

    ok: Literal[False] = False
    decision: Literal["DENY"] = "DENY"
    reason: str
    audit_id: str = Field(..., alias="auditId")
    code: str | None = None

    model_config = {"populate_by_name": True}


class ExecuteApprovalRequired(BaseModel):
    """Execution requires human approval (REQUIRE_APPROVAL)."""

    ok: Literal[False] = False
    decision: Literal["REQUIRE_APPROVAL"] = "REQUIRE_APPROVAL"
    reason: str
    audit_id: str = Field(..., alias="auditId")
    approval_id: str = Field(..., alias="approvalId")

    model_config = {"populate_by_name": True}


ExecuteResult = ExecuteSuccess | ExecuteSimulated | ExecuteDenied | ExecuteApprovalRequired


# ── Approvals ────────────────────────────────────────────────────────────────


class ApprovalRequest(BaseModel):
    """An approval request record."""

    id: str
    agent_id: str = Field(..., alias="agentId")
    tool: str
    payload: dict[str, Any] | None = None
    status: str
    created_at: str | None = Field(None, alias="createdAt")
    resolved_at: str | None = Field(None, alias="resolvedAt")
    resolved_by: str | None = Field(None, alias="resolvedBy")

    model_config = {"extra": "allow", "populate_by_name": True}


# ── Audit ────────────────────────────────────────────────────────────────────


class AuditEvent(BaseModel):
    """An audit log event."""

    id: str | None = None
    agent_id: str | None = Field(None, alias="agentId")
    tool: str | None = None
    decision: str | None = None
    reason: str | None = None
    timestamp: str | None = None
    payload: dict[str, Any] | None = None

    model_config = {"extra": "allow", "populate_by_name": True}


# ── Revocation ───────────────────────────────────────────────────────────────


class RevokeInput(BaseModel):
    """Input for revoking a capability."""

    capability_id: str = Field(..., alias="capabilityId")
    reason: str | None = None
    revoked_by: str | None = Field(None, alias="revokedBy")

    model_config = {"populate_by_name": True}


class RevokeResponse(BaseModel):
    """Response from a revocation."""

    revoked: bool
    record: dict[str, Any] | None = None

    model_config = {"populate_by_name": True}
