# Runtime API (v1)

HTTP API for the Agent Capability Runtime gateway. Implemented in `apps/gateway` (Hono). Start with `pnpm dev:gateway`.

**Normative (Stable 1.0.0):** [RFC-0001](./rfc/RFC-0001-capability-token.md) · [RFC-0002](./rfc/RFC-0002-runtime-execution.md) · [RFC-0005](./rfc/RFC-0005-admin-authentication.md)

Base URL: `https://runtime.example.com/v1` (self-hosted or cloud)

**Admin authentication (RFC-0005):** When `ACR_ADMIN_API_KEY` or `ACR_ADMIN_API_KEYS` is set, grant and delegate require:

```
Authorization: Bearer <admin_api_key>
```

If no admin key is configured, grant/delegate are open (development only; gateway logs a warning).

---

## POST /capabilities/grant

Issue a signed capability token for an agent and tool.

### Request

**Headers (when admin auth enabled):** `Authorization: Bearer <admin_api_key>`

```json
{
  "agentId": "agent_1",
  "tool": "gmail.send",
  "constraints": {
    "allowedDomains": ["company.com"],
    "maxActions": 5,
    "attachments": false
  },
  "expiresIn": "15m",
  "delegator": "user_42",
  "session": "sess_abc",
  "task": "email_customer_support",
  "metadata": {
    "environment": "production"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agentId` | string | Yes | Agent identity (`sub` claim) |
| `tool` | string | Yes | Tool identifier |
| `constraints` | ConstraintSet | Yes | Runtime constraints |
| `expiresIn` | string \| number | No | Duration (`15m`, `1h`) or seconds; default `15m` |
| `delegator` | string | No | Delegating user/system |
| `session` | string | No | Session binding |
| `task` | string | No | Task label |
| `metadata` | object | No | Opaque metadata |

### Response `201 Created`

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "claims": {
    "iss": "acr-runtime",
    "sub": "agent_1",
    "tool": "gmail.send",
    "constraints": {
      "allowed_domains": ["company.com"],
      "max_actions": 5,
      "attachments": false
    },
    "iat": 1748200000,
    "exp": 1748200900,
    "jti": "cap_..."
  },
  "expiresAt": "2026-05-24T10:15:00.000Z"
}
```

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | `invalid_request` | Malformed body or invalid constraints |
| 400 | `unsupported_tool` | Tool not registered |
| 401 | `unauthorized` | Missing or invalid admin credentials |

---

## POST /capabilities/delegate

Issue a child capability token derived from a parent token. Child constraints must be a **subset** of the parent (narrower domains, lower `maxActions`, etc.). JWT includes `parent_jti`, `delegation_depth`, and `delegator_chain`.

### Request

```json
{
  "parentToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "agentId": "agent_child",
  "tool": "gmail.send",
  "constraints": {
    "allowedDomains": ["company.com"],
    "maxActions": 2
  },
  "expiresIn": "15m",
  "delegator": "user_42",
  "intent": "delegate_to_subagent"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `parentToken` | string | Yes | Parent capability JWT |
| `agentId` | string | Yes | Child agent identity |
| `tool` | string | Yes | Must match parent tool |
| `constraints` | ConstraintSet | Yes | Subset of parent constraints |
| `expiresIn` | string \| number | No | Cannot exceed parent `exp` |
| `delegator` | string | No | Who performed the delegation |
| `session` | string | No | Session binding |
| `task` | string | No | Task label |
| `intent` | string | No | Human-readable intent label |
| `metadata` | object | No | Opaque metadata |

### Response `201 Created`

Same shape as [POST /capabilities/grant](#post-capabilitiesgrant), with delegation claims on `claims` (`parent_jti`, `delegation_depth`, `delegator_chain`).

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | `invalid_request` | Malformed body, expired parent, or constraints not a subset |

---

## POST /runtime/execute

Execute a tool through the runtime gateway with policy enforcement.

### Request

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tool": "gmail.send",
  "payload": {
    "to": "user@company.com",
    "subject": "Hello",
    "body": "Message body"
  },
  "approvalId": "appr_789",
  "requestId": "req_uuid_v4",
  "intent": "reply_to_customer",
  "simulate": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | Yes | Capability JWT |
| `tool` | string | Yes | Must match token `tool` claim |
| `payload` | object | Yes | Tool-specific input |
| `approvalId` | string | No | Resume after human approval |
| `requestId` | string | No | Idempotency key; replays return the same outcome without double consumption |
| `intent` | string | No | Execution intent label (audit + metadata) |
| `simulate` | boolean | No | If `true`, evaluate policy only (`SIMULATE`); no adapter call |

### Response `200 OK` (allowed)

```json
{
  "decision": "ALLOW",
  "result": {
    "messageId": "msg_123",
    "status": "sent"
  },
  "auditId": "aud_456"
}
```

### Response `403 Forbidden` (denied)

```json
{
  "decision": "DENY",
  "reason": "external domain blocked: recipient not in allowed_domains",
  "auditId": "aud_457"
}
```

### Response `202 Accepted` (approval required)

```json
{
  "decision": "REQUIRE_APPROVAL",
  "approvalId": "appr_789",
  "reason": "approval_required_if_external constraint triggered"
}
```

### Response `200 OK` (simulated)

When `simulate: true` and policy would allow:

```json
{
  "decision": "SIMULATE",
  "reason": "policy would allow execution",
  "auditId": "aud_sim_1",
  "evaluatedConditions": []
}
```

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | `invalid_token` | Malformed JWT |
| 401 | `token_expired` | Token past `exp` |
| 403 | `tool_mismatch` | Request tool ≠ token tool |
| 403 | `policy_denied` | Constraint evaluation failed |

---

## GET /health

Liveness check.

```json
{ "status": "ok", "version": "0.1.0" }
```

---

## Runtime decisions

| Decision | Meaning |
|----------|---------|
| `ALLOW` | Execute tool adapter |
| `DENY` | Block execution; return reason |
| `REQUIRE_APPROVAL` | Pause until human approves; resume with `approvalId` |
| `SIMULATE` | Policy check only (`simulate: true`); includes `evaluatedConditions` |
| `REDACT` | Execute with sanitized payload (future) |
| `SANDBOX` | Execute in isolated environment (future) |

---

## SDK mapping

### TypeScript

```ts
import { AcrClient } from "@acr/sdk";

const client = new AcrClient({
  baseUrl: "http://localhost:3000",
  // or local: { secret, adapters: { mode: "stub" } },
});

const { token } = await client.grant({
  agentId: "agent_1",
  tool: "gmail.send",
  constraints: { allowedDomains: ["company.com"], maxActions: 5 },
});

const child = await client.delegate(token, {
  agentId: "agent_child",
  tool: "gmail.send",
  constraints: { allowedDomains: ["company.com"], maxActions: 2 },
});

const dryRun = await client.execute({
  token: child.token,
  tool: "gmail.send",
  payload: { to: "user@company.com", subject: "Hi" },
  simulate: true,
});

const result = await client.execute({
  token: child.token,
  tool: "gmail.send",
  payload: { to: "user@company.com", subject: "Hi" },
  requestId: "req_unique_id",
  intent: "customer_reply",
});
```

Lower-level token helpers: `grantCapability`, `delegateCapability`, `validateCapability` from `@acr/capability-token`. In-process runtime: `AgentCapabilityRuntime` from `@acr/runtime`.

### Python

```python
from acr import AcrClient, can

async with AcrClient(base_url="http://localhost:3000") as client:
    grant = await client.grant(
        can("gmail.send")
        .only_domain("company.com")
        .limit(5)
        .to_grant_input(agent_id="agent_1")
    )

    child = await client.delegate(
        grant.token,
        can("gmail.send")
        .only_domain("company.com")
        .limit(2)
        .to_grant_input(agent_id="agent_child"),
    )

    dry_run = await client.execute(
        token=child.token,
        tool="gmail.send",
        payload={"to": "user@company.com", "subject": "Hi"},
        simulate=True,
    )

    result = await client.execute(
        token=child.token,
        tool="gmail.send",
        payload={"to": "user@company.com", "subject": "Hi"},
        request_id="req_unique_id",
        intent="customer_reply",
    )
```

Install: `pip install -e packages/sdk-python` (PyPI publish pending). Sync wrappers: `grant_sync`, `execute_sync`, etc. Audit chain: `verify_audit_chain()`. See [packages/sdk-python/README.md](../packages/sdk-python/README.md).

---

## GET /audit

List audit events with optional filters. See [audit-and-approvals.md](./audit-and-approvals.md).

## GET /approvals

List approval requests (`?status=pending`).

## POST /approvals/:id/approve

Approve a pending request. Optional body: `{ "resolvedBy": "user_42" }`.

## POST /approvals/:id/reject

Reject a pending request.

See [audit-and-approvals.md](./audit-and-approvals.md) for the full approval resume flow.
