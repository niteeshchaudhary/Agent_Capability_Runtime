# Gap analysis 2 — status

Second-pass architecture gaps (protocol rigor) and implementation status.

| # | Gap | Status | Implementation |
|---|-----|--------|----------------|
| 1 | Threat model | **Done** | [THREAT_MODEL.md](./THREAT_MODEL.md) (expanded) |
| 2 | Capability revocation | **Done** | `runtime.revoke(jti)`, `RevocationStore`, `POST /capabilities/revoke`; Redis opt-in via `ACR_REVOCATION_MODE=redis` |
| 3 | Policy versioning | **Done** | `PolicyVersionRegistry`, `policy_version_id` on grant metadata |
| 4 | Deterministic evaluation | **Done** | [policy-evaluation-semantics.md](./docs/policy-evaluation-semantics.md) |
| 5 | Idempotency / replay | **Done** (v1) | `requestId` + `ConsumptionStore`; documented in THREAT_MODEL T4 |
| 6 | Runtime state model | **Done** | `ExecutionSessionStore`, `sessionId` on execute |
| 7 | Adapter capability discovery | **Done** | `supportedCapabilities()`, `GET /adapters/capabilities` |
| 8 | Context propagation | **Done** | `traceId`, `sessionId`, `policyVersionId` on context + audit |
| 9 | Execution state machine | **Done** | `ExecutionPhase`, [execution-state-machine.md](./docs/execution-state-machine.md) |
| 10 | Identity vs capability vs session vs intent | **Done** | [CONCEPTS.md](./docs/CONCEPTS.md) |
| 11 | Intent-aware policy rules | **Done** | `allowedIntentCategories` / `whenIntent()`, [intent-aware-policy.md](./docs/intent-aware-policy.md) |
| 12 | Sandbox adapter framework (v1) | **Done** | Timeout, SSRF guard, HTTP response cap — [sandbox-adapters.md](./docs/sandbox-adapters.md) |
| 13 | Signed audit hash chain | **Done** | SHA-256 chain + optional HMAC — [signed-audit-chain.md](./docs/signed-audit-chain.md) |
| 14 | RS256 / EdDSA signing | **Done** | HS256 default; asymmetric via env — [signing-algorithms.md](./docs/signing-algorithms.md) |
| — | Security assumptions | **Done** | [SECURITY_ASSUMPTIONS.md](./docs/SECURITY_ASSUMPTIONS.md) |

## Strategic roadmap (priority order)

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | **Intent-aware policy rules** | **Done** — [intent-aware-policy.md](./docs/intent-aware-policy.md) |
| 2 | Distributed revocation (Redis) | **Done** — [distributed-revocation.md](./docs/distributed-revocation.md) (opt-in) |
| 3 | Formal execution state machine | Done (gap-fix2) |
| 4 | Sandbox adapter framework (v1 limits) | **Done** — [sandbox-adapters.md](./docs/sandbox-adapters.md) |
| 5 | Signed audit hash chain | **Done** — [signed-audit-chain.md](./docs/signed-audit-chain.md) (opt-in) |

Deferred (low leverage now): dashboards, visual policy editors, no-code workflow builders.

## Still on the roadmap

- (Strategic phases 1–5 complete — see table above)

## Quick reference — new APIs

```ts
// Revoke compromised capability
await runtime.revoke(claims.jti, { reason: "compromised agent" });

// Optional Redis (multi-instance)
// ACR_REVOCATION_MODE=redis ACR_REDIS_URL=redis://localhost:6379

// Policy version on grant (automatic)
const { claims } = await runtime.grant({ agentId, tool, constraints });
claims.metadata?.policy_version_id; // pol_...

// Session + trace + intent on execute
await runtime.execute({
  token, tool, payload,
  sessionId: "sess_plan_1",
  traceId: "trace_abc",
  requestId: "req_unique",
  intent: { category: "customer_support", action: "reply_email" },
});

// Adapter discovery
runtime.adapters.supportedCapabilities("gmail.send");
```

```http
POST /capabilities/revoke
Authorization: Bearer <admin>
{ "capabilityId": "cap_...", "reason": "..." }

GET /adapters/capabilities?tool=gmail.send
```
