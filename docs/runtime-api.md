# Runtime API (v1)

HTTP API for the Agent Capability Runtime gateway. Implemented in `apps/gateway` (Hono). Start with `pnpm dev:gateway`.

Base URL: `https://runtime.example.com/v1` (self-hosted or cloud)

Authentication (gateway admin): `Authorization: Bearer <admin_api_key>` for grant endpoints in hosted mode. Self-hosted dev mode may omit admin auth initially.

---

## POST /capabilities/grant

Issue a signed capability token for an agent and tool.

### Request

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
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | Yes | Capability JWT |
| `tool` | string | Yes | Must match token `tool` claim |
| `payload` | object | Yes | Tool-specific input |
| `approvalId` | string | No | Resume after human approval (Week 3) |

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
| `REDACT` | Execute with sanitized payload (future) |
| `SANDBOX` | Execute in isolated environment (future) |

---

## SDK mapping

```ts
import { grantCapability, validateCapability } from "@acr/capability-token";

// Grant (maps to POST /capabilities/grant)
const { token } = await grantCapability(options, signerOptions);

// Validate before execute (gateway internal)
const validation = await validateCapability(token, { ...options, expectedTool: tool });
```

Full `runtime.execute()` SDK ships with `@acr/runtime` in Days 4–7.

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
