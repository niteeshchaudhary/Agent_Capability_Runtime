# RFC-0002: Runtime Execution & Policy Decisions

| Field | Value |
|-------|-------|
| **RFC** | 0002 |
| **Title** | Runtime Execution & Policy Decisions |
| **Version** | 1.0.0 |
| **Status** | Stable |
| **Stabilized** | 2026-05-24 |
| **Depends on** | [RFC-0001](./RFC-0001-capability-token.md) |
| **Authors** | Agent Capability Runtime contributors |
| **Created** | 2026-05-24 |
| **Profile** | `acr-runtime-v1` |

---

## Abstract

This document defines how an **Agent Capability Runtime** consumes a [capability token](./RFC-0001-capability-token.md), evaluates **policy**, enforces **consumption limits**, optionally pauses for **human approval**, and invokes **tool adapters**. It specifies runtime **decisions**, the **execute** operation, idempotency, simulation mode, and the adapter **execution contract**.

---

## 1. Introduction

RFC-0001 defines *what authority* a token encodes. This RFC defines *how a runtime acts on that authority* when an agent submits an execution request.

A conforming runtime is a **capability consumer**: it validates tokens, evaluates constraints against payloads, records outcomes (see [RFC-0003](./RFC-0003-audit-lineage.md)), and only then calls external tools.

---

## 2. Terminology

| Term | Definition |
|------|------------|
| **Runtime** | Capability consumer that implements `execute` (and typically `grant` / `delegate` by delegating to an issuer). |
| **Execute request** | Request to perform one tool invocation under a capability token. |
| **Policy evaluation** | Deterministic mapping from `(tool, constraints, payload, context)` → **decision**. |
| **Decision** | Runtime outcome: `ALLOW`, `DENY`, `REQUIRE_APPROVAL`, `SIMULATE`, or reserved future types. |
| **Consumption** | Incrementing per-`jti` usage counters for `max_actions` enforcement. |
| **Approval** | Human gate stored out-of-band; execution resumes with `approvalId`. |
| **Adapter** | Pluggable module that performs the tool side-effect (`gmail.send`, etc.). |
| **Simulation** | Policy evaluation without adapter invocation or consumption (unless specified). |

RFC 2119 keywords apply.

---

## 3. Architecture

```
                    ┌─────────────────────────────────────┐
  Execute request   │           ACR Runtime               │
 ─────────────────► │  1. Validate token (RFC-0001)       │
                    │  2. Resolve approval (if any)        │
                    │  3. Evaluate policy → decision       │
                    │  4. SIMULATE? → return               │
                    │  5. Consume (max_actions)            │
                    │  6. Invoke adapter                   │
                    │  7. Record audit (RFC-0003)          │
                    └─────────────────────────────────────┘
```

---

## 4. Execute operation

### 4.1 Request

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | Yes | Compact capability JWT |
| `tool` | string | Yes | MUST match token `tool` and adapter |
| `payload` | object | Yes | Tool-specific input |
| `approvalId` | string | No | Resume after approval (§8) |
| `requestId` | string | No | Idempotency key (§7) |
| `intent` | string | No | Execution intent; overrides `metadata.intent` when set |
| `simulate` | boolean | No | If true, policy-only path (§6) |

### 4.2 Processing pipeline (normative order)

1. **Validate token** per RFC-0001 §10. On failure → `DENY` (do not invoke adapter).
2. **Approval binding** — If `approvalId` present, load approval; MUST match `token`, `tool`, and `payload` (deep equality); MUST be `approved`. On failure → `DENY`.
3. **Policy evaluation** — Evaluate compiled policy from token `constraints` + payload + context (`actionCount`, `approvalGranted`, `intent`, `simulate`). See §5.
4. **Decision dispatch:**
   - `DENY` → return denial; audit.
   - `REQUIRE_APPROVAL` → create approval record; return; audit. Do not consume.
   - `SIMULATE` → return simulation result; audit. Do not consume or invoke adapter.
   - `ALLOW` → continue.
5. **Consumption** — `tryConsume(jti, max_actions, requestId)`. On limit → `DENY`. On replay → `ALLOW` with replay marker (§7).
6. **Adapter execution** — Invoke adapter with execution context (§9). On adapter error → `release` consumption, `DENY`.
7. **Audit** — Record final decision per RFC-0003.

### 4.3 Response shapes

#### 4.3.1 ALLOW (success)

```json
{
  "ok": true,
  "decision": "ALLOW",
  "result": { },
  "auditId": "aud_...",
  "claims": { }
}
```

`result` is adapter-defined. `claims` is the validated JWT payload.

#### 4.3.2 DENY

```json
{
  "ok": false,
  "decision": "DENY",
  "reason": "external domain blocked",
  "auditId": "aud_...",
  "code": "policy_denied"
}
```

| `code` | When |
|--------|------|
| `invalid_token` | Signature, format, issuer, unsupported tool |
| `token_expired` | Past `exp` |
| `tool_mismatch` | Request `tool` ≠ token `tool` |
| `policy_denied` | Policy, consumption, approval, or adapter failure |

#### 4.3.3 REQUIRE_APPROVAL

```json
{
  "ok": false,
  "decision": "REQUIRE_APPROVAL",
  "reason": "external domain requires approval",
  "auditId": "aud_...",
  "approvalId": "appr_..."
}
```

#### 4.3.4 SIMULATE

```json
{
  "ok": true,
  "decision": "SIMULATE",
  "reason": "policy would allow execution",
  "auditId": "aud_...",
  "evaluatedConditions": [
    { "kind": "gmail_allowed_domains", "passed": true }
  ]
}
```

---

## 5. Policy decisions

### 5.1 Decision enum (v1)

| Decision | Meaning | Adapter called | Consumes `max_actions` |
|----------|---------|----------------|------------------------|
| `ALLOW` | Execute | Yes | Yes |
| `DENY` | Block | No | No |
| `REQUIRE_APPROVAL` | Pause for human | No | No |
| `SIMULATE` | Dry-run policy | No | No |

### 5.2 Reserved decisions (future)

Implementations MAY define but MUST NOT return by default in v1:

| Decision | Intended use |
|----------|----------------|
| `REDACT` | Execute with sanitized payload |
| `SANDBOX` | Isolated adapter environment |
| `LIMIT` | Partial allow (rate/field limits) |
| `ESCALATE` | Route to higher authority |

### 5.3 Policy compilation

Constraints from the token (RFC-0001 §6) compile to a normalized **policy document**:

- Root node: `AND` of **condition leaves**
- Each leaf has a `kind` and optional `params`
- Evaluation walks the tree; first failing leaf in v1 reference implementation determines `DENY` or `REQUIRE_APPROVAL`

Condition kinds (v1):

| Kind | Source constraint |
|------|-------------------|
| `allowed_hours` | `allowed_hours` |
| `max_actions` | `max_actions` (pre-check uses `actionCount`; final enforcement in §7) |
| `approval_required` | `approval_required` |
| `approval_required_if_external` | `approval_required_if_external` + domains |
| `gmail_allowed_domains` | `allowed_domains` |
| `gmail_attachments` | `attachments: false` |
| `http_method` | `allowed_methods` |
| `http_url` | `allowed_urls` |

### 5.4 Evaluation context

| Input | Description |
|-------|-------------|
| `tool` | From token |
| `constraints` | Decoded constraint set |
| `payload` | Execute request payload |
| `actionCount` | Current consumption for `jti` |
| `approvalGranted` | True if valid `approvalId` on request |
| `simulate` | Request simulation flag |
| `intent` | Request or token metadata intent |
| `nowUtcHour` | 0–23 for `allowed_hours` (default: system UTC) |

### 5.5 Evaluation order (informative)

Reference implementation order matches compiled `AND` leaf order:

1. `allowed_hours`
2. `max_actions` (policy-level pre-check)
3. `approval_required` / `approval_required_if_external`
4. Tool-specific leaves (`gmail_*`, `http_*`)

First failure → `DENY` or `REQUIRE_APPROVAL` (approval kinds only).

---

## 6. Simulation mode

When `simulate: true` on the execute request:

1. Runtime MUST run token validation and policy evaluation.
2. Runtime MUST NOT invoke adapters.
3. Runtime MUST NOT increment consumption for `max_actions`.
4. If policy would yield `ALLOW`, runtime MUST return `SIMULATE` with `evaluatedConditions` when available.
5. If policy would yield `DENY` or `REQUIRE_APPROVAL`, runtime MUST return that decision (not `SIMULATE`).

Use cases: agent dry-runs, policy dashboards, pre-flight UX.

---

## 7. Consumption & idempotency

### 7.1 Consumption ledger

Each `jti` has a consumption counter for `max_actions`. Before adapter invocation on `ALLOW`:

```
tryConsume(jti, limit, requestId) → { allowed, count, replay, reason? }
```

| Outcome | Behavior |
|---------|----------|
| `allowed: false` | `DENY` — limit exceeded |
| `replay: true` | `ALLOW` without adapter — same `requestId` already completed |
| `allowed: true`, `replay: false` | Proceed to adapter |

### 7.2 Idempotent `requestId`

- Clients SHOULD send a unique `requestId` per logical operation (UUID recommended).
- Re-submitting the same `token`, `tool`, `payload`, and `requestId` after success MUST NOT double side-effects.
- Reference implementation returns `{ status: "replay", requestId }` as `result`.

### 7.3 Release on adapter failure

If consumption was reserved but the adapter throws, runtime MUST call `release(jti, requestId)` so failed attempts do not permanently consume quota.

### 7.4 Distributed deployments

In-memory ledgers are valid for single-process runtimes only. Multi-instance deployments MUST use a shared store — see [RFC-0004](./RFC-0004-distributed-consumption.md) (`ConsumptionStore`, Redis).

---

## 8. Human approval workflow

### 8.1 Creation

When policy returns `REQUIRE_APPROVAL`, runtime creates an **approval request**:

| Field | Description |
|-------|-------------|
| `id` | `appr_<uuid>` |
| `status` | `pending` |
| `agentId`, `tool`, `token`, `payload` | Bound execution |
| `reason` | Policy reason |
| `auditId` | Linked audit event |
| `jti` | Token id |

Runtime MAY invoke `onApprovalRequired` hook for notifications.

### 8.2 Resolution

Reviewers set `status` to `approved` or `rejected` via implementation-defined API.

### 8.3 Resume

Agent re-submits execute with **identical** `token`, `tool`, `payload` and `approvalId` of an `approved` request. Mismatch → `DENY`.

Rejected approvals MUST NOT resume.

---

## 9. Adapter execution contract

Adapters SHOULD implement `executeWithContext(ctx)`:

```ts
interface ExecutionContext {
  capability: {
    jti: string;
    agentId: string;      // token sub
    tool: ToolId;
    delegator?: string;
    parentJti?: string;
    delegationDepth?: number;
    delegatorChain?: string[];
  };
  intent?: string;
  payload: Record<string, unknown>;
  simulate: boolean;      // false during real ALLOW path
  requestId?: string;
}
```

Legacy `execute(payload)` MAY be supported; runtimes SHOULD prefer `executeWithContext` for new adapters.

Adapters MUST NOT broaden authority beyond token constraints; enforcement remains in policy layer.

---

## 10. HTTP mapping (informative)

| Operation | Method | Path |
|-----------|--------|------|
| Execute | `POST` | `/runtime/execute` |
| Grant | `POST` | `/capabilities/grant` |
| Delegate | `POST` | `/capabilities/delegate` |

| Decision | Suggested HTTP status |
|----------|----------------------|
| `ALLOW` | 200 |
| `SIMULATE` | 200 |
| `REQUIRE_APPROVAL` | 202 |
| `DENY` (token) | 401 if expired/invalid; else 403 |

See [runtime-api.md](../runtime-api.md) for full HTTP schemas.

---

## 11. Security considerations

1. **Fail closed** — Any validation or policy failure denies execution.
2. **Approval binding** — Prevents swapping payload after approval.
3. **Consumption before adapter** — Limits successful side-effects, not attempts (adapter errors release quota).
4. **Simulation is not authorization** — `SIMULATE` must not be mistaken for grant; no side-effects.
5. **Intent** — v1 intent is audit metadata only; policy MUST NOT treat intent as authority unless a future RFC defines intent-aware rules.

---

## 12. Implementation status

| Feature | Reference path | Status |
|---------|----------------|--------|
| Execute pipeline | `packages/runtime/src/runtime.ts` | Implemented |
| Policy AST | `packages/policy-engine` | Implemented |
| `SIMULATE` | runtime + gateway | Implemented |
| Consumption + `requestId` | `consumption-ledger.ts` | In-memory |
| Approvals | `approval-store.ts` | Implemented |
| `executeWithContext` | `packages/adapters` | Implemented |
| `REDACT` / `SANDBOX` | policy-engine types | Reserved |
| Distributed ledger | RFC-0004 / `RedisConsumptionStore` | Implemented |

---

## 13. References

- [RFC-0001](./RFC-0001-capability-token.md) — Capability Token Specification
- [RFC-0003](./RFC-0003-audit-lineage.md) — Audit Event Lineage
- [policy-constraints.md](../policy-constraints.md) — Constraint guide
- [policy-ast.md](../policy-ast.md) — AST compilation guide

---

## Appendix A: Changelog

| Date | Version | Change |
|------|---------|--------|
| 2026-05-24 | 1.0.0-draft | Initial RFC |
| 2026-05-24 | 1.0.0 | Promoted to **Stable** with reference implementation release 0.1.0 |
