# Threat Model — Agent Capability Runtime (ACR)

ACR is a **runtime governance layer** between AI agents and external tools. This document describes threats, mitigations, and residual risks for v1.

## Assets

| Asset | Description |
|-------|-------------|
| Signing secret | HMAC key used to mint and verify capability JWTs |
| Capability tokens | Short-lived, scoped permissions bound to agent + tool |
| Approval records | Human decisions on paused executions |
| Audit log | Evidence of allow/deny/approval decisions |
| Adapter credentials | Gmail/Slack OAuth tokens used by live adapters |
| User data | Email content, Slack messages, HTTP payloads |

## Trust boundaries

```text
[ Untrusted: LLM / agent code ]
           ↓ capability token only
[ ACR Runtime — trusted enforcement ]
           ↓ scoped credentials
[ Tool adapters → external APIs ]
```

The runtime **must not** trust:

- Raw agent prompts or model output
- Tool payloads without policy evaluation
- Client claims of approval without `approvalId` verification

## Threat catalog

### T1 — Prompt injection → capability escalation

**Attack:** Adversarial prompt tricks agent into requesting broader permissions or exfiltrating tokens.

**Mitigations:**

- Capabilities are minted **outside** the agent loop (gateway/admin)
- Tokens are tool-scoped; `expectedTool` enforced at execute
- Constraints are embedded in signed JWTs (agent cannot widen them)

**Residual risk:** Compromised grant endpoint or admin key → issue overbroad tokens. **Control:** [RFC-0005](./docs/rfc/RFC-0005-admin-authentication.md) — `ACR_ADMIN_API_KEY` on grant/delegate.

### T2 — Confused deputy

**Attack:** Agent uses a capability minted for tool A to trigger tool B.

**Mitigations:**

- `validateCapability` with `expectedTool`
- Approval binding checks token + tool + payload hash

**Residual risk:** Logic bugs in binding. **Control:** tests + code review on `approvalMatchesExecution`.

### T3 — Capability escalation via delegation

**Attack:** Child token grants more authority than parent.

**Mitigations (v1 foundation):**

- `parent_jti`, `delegation_depth`, `delegator_chain` on tokens
- `delegateCapability()` enforces depth limit and parent validation

**Residual risk:** Delegation not yet restricted by constraint subset. **Roadmap:** child constraints ⊆ parent constraints.

### T4 — Token replay / double execution

**Attack:** Replay same execute request to consume quota twice or send duplicate emails.

**Mitigations:**

- `ConsumptionLedger.tryConsume(jti, limit, requestId)` — idempotent per `requestId`
- Short token TTL (default 15m)

**Residual risk:** In-memory ledger not shared across replicas. **Roadmap:** Redis-backed atomic counters.

### T5 — Approval bypass

**Attack:** Execute without approval when policy requires it.

**Mitigations:**

- Policy AST evaluates `approval_required` / `approval_required_if_external`
- Resume requires matching `approvalId` in `approved` state

**Residual risk:** Race between approve and token expiry. **Control:** short approval TTL (future).

### T6 — Adapter compromise

**Attack:** Malicious or buggy adapter exfiltrates credentials or ignores policy.

**Mitigations:**

- Adapters run **after** policy decision
- Execution contract passes capability context (foundation for sandboxing)

**Residual risk:** Adapters still execute in-process. **Roadmap:** isolated worker / WASM sandbox.

### T7 — Malicious tool registration

**Attack:** Register adapter that performs arbitrary side effects.

**Mitigations:**

- Fixed tool allowlist (`gmail.send`, `slack.send`, `http.request`)
- Unknown tools rejected at grant schema

### T8 — Cross-agent impersonation

**Attack:** Agent A uses agent B's token.

**Mitigations:**

- Token `sub` claim bound to agent identity
- Audit records `agentId` from validated claims

**Residual risk:** Token leakage = full capability transfer. **Control:** treat tokens as secrets; HTTPS only.

### T9 — Token leakage

**Attack:** Token logged, cached, or exposed in client-side storage.

**Mitigations:**

- Short expiry
- Audit payload summaries (not full bodies in v1)

**Recommendations:** Never log full JWTs; rotate signing secret; use mTLS between services.

### T10 — Sandbox escape (future)

**Attack:** Escape isolation boundary when sandbox adapters ship.

**Status:** Not in v1. Track when `SANDBOX` decision is implemented.

## Policy simulation (SIMULATE)

Enterprise users can call `execute({ simulate: true })` to evaluate policy **without** side effects. This reduces risk of testing in production but must not leak secrets in simulation responses.

## Audit integrity

Audit events are append-only (JSONL file mode). They are **not** cryptographically signed in v1. For tamper-evidence, ship logs to WORM storage or sign event chains (roadmap).

## Security recommendations

1. Use `ACR_SIGNING_SECRET` ≥ 32 random bytes from a secrets manager.
2. Run gateway behind TLS; restrict grant endpoints to trusted issuers.
3. Set `requestId` on every execute for idempotency.
4. Enable persistent audit (`ACR_AUDIT_PATH`) in production.
5. Use `simulate: true` in CI/CD policy tests before rollout.

## Related docs

- [Policy AST](./docs/policy-ast.md)
- [Policy constraints](./docs/policy-constraints.md)
- [Audit and approvals](./docs/audit-and-approvals.md)
