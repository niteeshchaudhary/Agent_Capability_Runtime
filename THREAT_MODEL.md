# Threat Model — Agent Capability Runtime (ACR)

ACR is a **runtime governance layer** between AI agents and external tools. This document describes threats, mitigations, and residual risks for **v1 Stable**.

See also [SECURITY_ASSUMPTIONS.md](./docs/SECURITY_ASSUMPTIONS.md).

## Assets

| Asset | Description |
|-------|-------------|
| Signing secret | HMAC key used to mint and verify capability JWTs |
| Capability tokens | Short-lived, scoped permissions bound to agent + tool |
| Admin API keys | Issuance credentials for grant/delegate/revoke |
| Approval records | Human decisions on paused executions |
| Audit log | Evidence of allow/deny/approval decisions |
| Policy version registry | Immutable compiled policies for replay |
| Revocation list | Immediately invalidated `jti` values |
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

- Capabilities minted **outside** the agent loop (gateway/admin)
- Tokens are tool-scoped; `expectedTool` enforced at execute
- Constraints embedded in signed JWTs (agent cannot widen them)
- Delegation enforces constraint subset ([RFC-0001](./docs/rfc/RFC-0001-capability-token.md))

**Residual risk:** Compromised admin key → overbroad grants. **Control:** [RFC-0005](./docs/rfc/RFC-0005-admin-authentication.md), key rotation.

### T2 — Confused deputy

**Attack:** Agent uses a capability minted for tool A to trigger tool B.

**Mitigations:**

- `validateCapability` with `expectedTool`
- Approval binding checks token + tool + payload equality

**Residual risk:** Implementation bugs. **Control:** tests on `approvalMatchesExecution`.

### T3 — Capability escalation via delegation

**Attack:** Child token grants more authority than parent.

**Mitigations:**

- `assertConstraintSubset` at delegate time
- `parent_jti`, `delegation_depth`, `delegator_chain` on tokens

**Residual risk:** Depth limit bypass if issuer misconfigured. **Control:** default max depth 8.

### T4 — Token replay / double execution

**Attack:** Replay execute to duplicate side effects or drain quota incorrectly.

**Mitigations:**

- `ConsumptionStore.tryConsume(jti, limit, requestId)` — idempotent replay
- Short token TTL (default 15m)
- [RFC-0004](./docs/rfc/RFC-0004-distributed-consumption.md) Redis ledger for multi-instance

**Residual risk:** Clients omit `requestId`. **Control:** document requirement; operators enforce via SDK wrappers.

### T5 — Approval bypass / spoofing

**Attack:** Execute without approval when policy requires it, or reuse approval for different payload.

**Mitigations:**

- Policy AST evaluates approval leaves before allow
- Resume requires matching `approvalId`, token, tool, payload
- `approvalMatchesExecution` constant-time binding

**Residual risk:** Stolen approved `approvalId` + token within TTL. **Control:** short TTL; revoke on suspicion.

### T6 — Adapter compromise (malicious or buggy)

**Attack:** Adapter exfiltrates credentials or ignores policy context.

**Mitigations:**

- Adapters run **after** policy decision
- `ExecutionContext` passes capability lineage + `policyVersionId`
- `supportedCapabilities()` for declared constraint surface

**Residual risk:** In-process adapters not sandboxed. **Roadmap:** `SANDBOX` decision, isolated workers.

### T7 — Malicious tool registration

**Attack:** Register adapter with arbitrary side effects.

**Mitigations:**

- Fixed tool allowlist at grant schema
- Registry exposes only registered tools

### T8 — Cross-agent impersonation / capability leakage

**Attack:** Agent A uses agent B's token; token logged in prompt.

**Mitigations:**

- Token `sub` bound to agent
- Audit uses validated claims
- Never log full JWTs

**Recommendations:** HTTPS only; treat tokens as secrets; revoke on leak via `runtime.revoke(jti)`.

### T9 — Runtime bypass

**Attack:** Call adapter or external API without going through runtime.

**Mitigations:**

- Architecture: agents only receive capability tokens, not adapter credentials
- Credentials live in gateway adapter config only

**Residual risk:** Operator gives agents raw OAuth tokens. **Control:** deployment guidance.

### T10 — Compromised agent (post-grant)

**Attack:** Valid token used maliciously within constraints.

**Mitigations:**

- Narrow constraints + short TTL
- **`runtime.revoke(jti)`** for immediate invalidation
- Audit + session tracking for forensics

### T11 — Audit tampering

**Attack:** Modify audit log to hide malicious actions.

**Mitigations:**

- Append-only JSONL mode
- `policyVersionId`, `executionPhase`, lineage on events

**Residual risk:** No cryptographic chain in v1. **Roadmap:** signed audit hash chain (RFC-0003 amendment).

### T12 — Concurrency races

**Attack:** Parallel executes exceed `max_actions` or double-send.

**Mitigations:**

- Atomic `tryConsume` (Lua in Redis; single-threaded map in memory)
- `release()` on adapter failure

**Residual risk:** In-memory ledger on multi-instance without Redis. **Control:** `ACR_REDIS_URL`.

### T13 — Policy ambiguity / inconsistent evaluation

**Attack:** N/A — integrity threat is inconsistent deny/allow across replicas.

**Mitigations:**

- Deterministic AND short-circuit semantics ([policy-evaluation-semantics.md](./docs/policy-evaluation-semantics.md))
- Immutable `policy_version_id` on grant

### T14 — Adapter sandbox escape

**Attack:** SSRF via `http.request`, resource exhaustion, adapter compromise.

**Mitigations (v1):**

- Runtime sandbox: execution timeout, private-network block for HTTP, response size cap ([sandbox-adapters.md](./docs/sandbox-adapters.md))
- Policy constraints on URL/method/domain before adapter runs

**Residual risk:** In-process adapters are not VM-isolated. **Future:** `SANDBOX` policy decision + worker isolation.

## Capability revocation

```ts
await runtime.revoke(jti, { reason: "compromised agent", revokedBy: "admin" });
```

Revoked tokens return `token_revoked` / phase `REVOKED` on execute.

**Multi-instance:** In-memory revocation is per process. For shared revoke across replicas, set `ACR_REVOCATION_MODE=redis` (opt-in; defaults to memory). See [distributed-revocation.md](./docs/distributed-revocation.md).

## Policy simulation (SIMULATE)

`execute({ simulate: true })` evaluates policy without side effects. Must not be mistaken for authorization to act.

## Security recommendations

1. `ACR_SIGNING_SECRET` ≥ 32 random bytes from a secrets manager.
2. `ACR_ADMIN_API_KEY` on all issuance endpoints in production.
3. TLS on gateway; restrict network access to grant/revoke.
4. Set `requestId` on every execute for idempotency.
5. Enable persistent audit (`ACR_AUDIT_PATH`).
6. Use Redis consumption for multiple gateway replicas.
7. Use Redis revocation (`ACR_REVOCATION_MODE=redis`) when running multiple gateway replicas.
8. Revoke compromised capabilities immediately.
9. Use `simulate: true` in CI policy tests.

## Related docs

- [SECURITY_ASSUMPTIONS.md](./docs/SECURITY_ASSUMPTIONS.md)
- [CONCEPTS.md](./docs/CONCEPTS.md)
- [Policy evaluation semantics](./docs/policy-evaluation-semantics.md)
- [Execution state machine](./docs/execution-state-machine.md)
- [RFC index](./docs/rfc/README.md)
