# RFC-0003: Audit Event Lineage

| Field | Value |
|-------|-------|
| **RFC** | 0003 |
| **Title** | Audit Event Lineage |
| **Version** | 1.0.0 |
| **Status** | Stable |
| **Stabilized** | 2026-05-24 |
| **Depends on** | [RFC-0001](./RFC-0001-capability-token.md), [RFC-0002](./RFC-0002-runtime-execution.md) |
| **Authors** | Agent Capability Runtime contributors |
| **Created** | 2026-05-24 |
| **Profile** | `acr-audit-v1` |

---

## Abstract

This document defines **audit events** produced by an Agent Capability Runtime: schema, required fields, delegation **lineage**, policy snapshots, and query semantics. Audit logs provide a tamper-evident *intent* for compliance and forensics; v1 specifies structure and correlation IDs, not cryptographic chaining (future work).

---

## 1. Introduction

Every execution path through the runtime (RFC-0002) SHOULD emit an audit event capturing **who** (`agentId`), **what** (`tool`, payload summary), **under which authority** (capability `jti`, lineage), **policy context** (`policySnapshot`), and **outcome** (`decision`, `reason`).

This RFC enables:

- Per-action forensics without logging full JWTs
- Correlation via `requestId`, `approvalId`, `auditId`
- Delegation chain reconstruction

---

## 2. Terminology

| Term | Definition |
|------|------------|
| **Audit event** | Immutable record of one runtime decision point. |
| **Audit store** | Append-only persistence (memory, JSONL file, etc.). |
| **Lineage** | Delegation metadata copied from token claims. |
| **Policy snapshot** | Constraint set evaluated at decision time. |
| **Payload summary** | Redacted or full payload copy per deployment policy. |

---

## 3. Event schema

### 3.1 AuditEvent (v1)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique event id (`aud_<uuid>`) |
| `timestamp` | string | Yes | ISO 8601 UTC |
| `agentId` | string | Yes | Agent (`sub`) |
| `tool` | string | Yes | Tool identifier |
| `decision` | AuditDecision | Yes | See §4 |
| `reason` | string | No | Human-readable denial / approval / simulation reason |
| `delegator` | string | No | From token `delegator` |
| `jti` | string | No | Capability token id |
| `task` | string | No | From token `task` |
| `intent` | string | No | Execution or token intent |
| `requestId` | string | No | Client idempotency key |
| `approvalId` | string | No | Linked approval |
| `payloadSummary` | object | No | Payload or redacted subset |
| `policySnapshot` | ConstraintSet | No | Constraints at evaluation time |
| `lineage` | CapabilityLineage | No | Delegation chain metadata |

### 3.2 CapabilityLineage

| Field | Type | Description |
|-------|------|-------------|
| `parentJti` | string | Parent token `jti` |
| `delegationDepth` | number | Depth in chain |
| `delegatorChain` | string[] | Ordered delegators |

Maps from JWT claims `parent_jti`, `delegation_depth`, `delegator_chain` (RFC-0001 §5.2).

### 3.3 AuditDecision

| Value | When recorded |
|-------|----------------|
| `ALLOW` | Execution allowed or idempotent replay |
| `DENY` | Token, policy, consumption, approval, or adapter failure |
| `REQUIRE_APPROVAL` | Paused for human approval |
| `SIMULATE` | Policy dry-run |

---

## 4. Emission rules (normative)

1. **Every execute terminal state** MUST produce exactly one primary audit event for that attempt (validation failure, policy deny, approval pending, simulate, allow, adapter error).
2. **Token validation failure** — `agentId` MAY be `unknown`; `jti` omitted.
3. **Policy snapshot** — On policy evaluation paths, store decoded constraint set at decision time (camelCase in SDK stores; snake_case acceptable in JSONL if consistent).
4. **Lineage** — When token contains delegation claims, `lineage` MUST be populated.
5. **Intent** — Use execute `intent` if provided; else `metadata.intent` from token.
6. **Secrets** — MUST NOT store full capability JWTs or OAuth tokens in audit events.

### 4.1 Payload handling

| Deployment | `payloadSummary` |
|------------|------------------|
| Development | Full payload permitted |
| Production | SHOULD redact PII (email bodies, message content) per data policy |

Redaction rules are deployment-specific; this RFC does not mandate a redaction algorithm.

---

## 5. Identifiers & correlation

| ID | Format | Role |
|----|--------|------|
| `id` (audit) | `aud_<uuid>` | Primary event reference |
| `jti` | `cap_<uuid>` | Capability consumption scope |
| `requestId` | Opaque client string | Idempotency correlation |
| `approvalId` | `appr_<uuid>` | Links REQUIRE_APPROVAL → resume |

Query patterns:

- All events for agent: `agentId`
- Failure analysis: `decision=DENY`
- Delegation audit: `lineage.parentJti` or `jti` chain walk (application-level)

---

## 6. Query interface (abstract)

Implementations SHOULD support:

| Parameter | Description |
|-----------|-------------|
| `agentId` | Filter by agent |
| `tool` | Filter by tool |
| `decision` | Filter by decision |
| `since` / `until` | ISO timestamp bounds |
| `limit` | Max events (newest first when limited) |

HTTP reference: `GET /audit?agentId=...&decision=DENY&limit=50`

---

## 7. Storage profiles

### 7.1 In-memory (v1 default)

Ephemeral; suitable for tests and single-shot demos.

### 7.2 Append-only file (JSONL)

One JSON object per line; file path configured at runtime startup. Survives process restart if file persisted.

### 7.3 Future: signed chain

Tamper-evident hash chain (`hashPrev`, `hash`, optional `signature`) — **optional v1** via `auditChain.enabled` ([signed-audit-chain.md](../signed-audit-chain.md)). Default off.

---

## 8. Approval record cross-reference

Approval requests (RFC-0002 §8) MUST include `auditId` pointing to the `REQUIRE_APPROVAL` event. When execution resumes with `approvalId`, subsequent `ALLOW` events SHOULD include the same `approvalId` for traceability.

---

## 9. Event-sourced foundation (informative)

Fields `policySnapshot` and `lineage` support future event sourcing:

- Reconstruct *why* a decision was made without re-validating JWT
- Replay policy changes for what-if analysis (not normative in v1)

---

## 10. Security & privacy

1. **Minimize PII** in `payloadSummary` for production.
2. **No JWT logging** — use `jti` only.
3. **Access control** — Audit query APIs MUST be authenticated in production (out of scope for v1 dev gateway).
4. **Retention** — Deployments SHOULD define TTL and encryption at rest.

See [THREAT_MODEL.md](../../THREAT_MODEL.md).

---

## 11. Implementation status

| Feature | Path | Status |
|---------|------|--------|
| `AuditEvent` schema | `packages/audit` | Implemented |
| `policySnapshot`, `lineage` | runtime audit calls | Implemented |
| JSONL file store | `file-audit-log.ts` | Implemented |
| `SIMULATE` in audit | audit types | Implemented |
| Signed hash chain | `hash-chain.ts`, `verifyChain()` | Implemented (opt-in) |
| Intent-aware retention | — | Planned |

---

## 12. References

- [RFC-0001](./RFC-0001-capability-token.md)
- [RFC-0002](./RFC-0002-runtime-execution.md)
- [audit-and-approvals.md](../audit-and-approvals.md) — Setup guide

---

## Appendix A: Example event

```json
{
  "id": "aud_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": "2026-05-24T10:05:00.000Z",
  "agentId": "agent_child",
  "tool": "gmail.send",
  "decision": "ALLOW",
  "jti": "cap_f9e8d7c6-b5a4-3210-fedc-ba9876543210",
  "delegator": "user_456",
  "task": "support_escalation",
  "intent": "customer_reply",
  "requestId": "req_550e8400-e29b-41d4-a716-446655440000",
  "policySnapshot": {
    "allowedDomains": ["company.com"],
    "maxActions": 2
  },
  "lineage": {
    "parentJti": "cap_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "delegationDepth": 1,
    "delegatorChain": ["user_456"]
  },
  "payloadSummary": {
    "to": "user@company.com",
    "subject": "Re: Your ticket"
  }
}
```

---

## Appendix B: Changelog

| Date | Version | Change |
|------|---------|--------|
| 2026-05-24 | 1.0.0-draft | Initial RFC |
| 2026-05-24 | 1.0.0 | Promoted to **Stable** with reference implementation release 0.1.0 |
