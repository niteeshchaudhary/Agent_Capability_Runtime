# Core concepts — Identity, Capability, Session, Intent

Formal separation of concerns in ACR (gap-fix2 §10).

| Concept | Meaning | Where it lives |
|---------|---------|----------------|
| **Identity** | *Who* the actor is | JWT `sub` (agent id), optional `delegator` |
| **Capability** | *What* is allowed | JWT `tool` + `constraints`; bound by `jti` |
| **Session** | *Lifecycle* of a multi-step workflow | Client `sessionId`; runtime `ExecutionSession` store |
| **Intent** | *Why* an action is taken | `metadata.intent` on token or execute `intent` |

## Identity

- **Agent identity** (`sub`) — the autonomous actor executing tools.
- **Delegator** — human or system that granted authority (`delegator`, `delegator_chain`).
- Identity is **not** re-authenticated at execute; the capability token carries the authorization.

## Capability

- Short-lived JWT ([RFC-0001](./rfc/RFC-0001-capability-token.md)).
- Scoped to one `tool` and a `ConstraintSet`.
- Identified by `jti` for consumption, revocation, and audit.
- May be **delegated** with monotonic constraint narrowing.

## Session

- Optional client-provided `sessionId` for long-running agent plans.
- Runtime tracks `actionCount`, `lastPhase`, and linked `approvalIds` per session.
- Distinct from capability TTL — a session may span multiple capability tokens over time.

## Intent

- Human-readable label (e.g. `support_response`, `invoice_payment`).
- Stored in audit for forensics; v1 policy does not branch on intent unless extended.
- Execute-time `intent` overrides token `metadata.intent`.

## Anti-patterns

| Don't | Do instead |
|-------|------------|
| Use OAuth scope as capability | Mint narrow capability JWT per task |
| Put admin keys in agent context | Keep issuance on trusted backend |
| Reuse `sessionId` across tenants | Scope sessions per agent/tenant |
| Log full JWTs | Log `jti`, `sub`, `tool`, decision |

## Related

- [RFC-0001](./rfc/RFC-0001-capability-token.md) — capability encoding
- [RFC-0002](./rfc/RFC-0002-runtime-execution.md) — execute pipeline
- [execution-state-machine.md](./execution-state-machine.md) — session phases
