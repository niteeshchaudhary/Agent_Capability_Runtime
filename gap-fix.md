# Gap analysis — status

Original gaps from architecture review and what was implemented in this pass.

| # | Gap | Status | Implementation |
|---|-----|--------|----------------|
| 1 | Formal policy model (AST/DSL) | **Done** | `compilePolicy()`, policy AST, fluent DSL — [docs/policy-dsl.md](./docs/policy-dsl.md) |
| 2 | Richer runtime decisions | **Partial** | `SIMULATE` + reserved types; `REDACT`/`SANDBOX`/`LIMIT`/`ESCALATE` typed for future |
| 3 | Adapters too trusted | **Foundation done** | `ExecutionContext` + `executeWithContext()` contract |
| 4 | Intent-based execution | **Foundation done** | `intent` on grant/execute; stored in audit + metadata |
| 5 | Delegation chains | **Foundation done** | `parent_jti`, `delegation_depth`, `delegator_chain`, `delegateCapability()`, subset validation, `POST /capabilities/delegate` |
| 6 | Threat model | **Done** | [THREAT_MODEL.md](./THREAT_MODEL.md) |
| 7 | Event-sourced audit | **Foundation done** | `policySnapshot`, `lineage`, `requestId`, `intent` on audit events |
| 8 | Capability consumption | **Done** | `ConsumptionStore` + in-memory + Redis (`RFC-0004`), idempotent `requestId` |

## Protocol specs (v1.0 Stable — 2026-05-24)

| RFC | Status |
|-----|--------|
| [RFC-0001 Capability Token](./docs/rfc/RFC-0001-capability-token.md) | **Stable** 1.0.0 |
| [RFC-0002 Runtime Execution](./docs/rfc/RFC-0002-runtime-execution.md) | **Stable** 1.0.0 |
| [RFC-0003 Audit Lineage](./docs/rfc/RFC-0003-audit-lineage.md) | **Stable** 1.0.0 |
| [RFC-0004 Distributed Consumption](./docs/rfc/RFC-0004-distributed-consumption.md) | **Stable** 1.0.0 |
| [RFC-0005 Admin Authentication](./docs/rfc/RFC-0005-admin-authentication.md) | **Stable** 1.0.0 |

See [docs/rfc/STABLE.md](./docs/rfc/STABLE.md) for conformance checklist.

## Still on the roadmap

- Signed / tamper-evident audit chain (RFC-0003 amendment)
- Sandbox adapters (`SANDBOX` decision)
- Intent-aware policy rules (same API, different intent labels)
- RS256 / EdDSA as default signing (RFC-0001 amendment)

## Quick reference — new APIs

```ts
// Policy simulation
await runtime.execute({ token, tool, payload, simulate: true });

// Idempotent execution
await runtime.execute({ token, tool, payload, requestId: "uuid" });

// Delegation
await delegateCapability(parentToken, { agentId, tool, constraints }, { secret });

// Policy AST
import { compilePolicy, evaluatePolicyAst } from "@acr/policy-engine";

// Policy DSL
import { can, domain } from "@acr/policy-engine";
const input = can("gmail.send").where(domain.in(["company.com"])).limit(5)
  .toGrantInput({ agentId: "agent_1" });
```
