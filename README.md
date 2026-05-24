# Agent Capability Runtime (ACR)

**Runtime-enforced capability permissions for AI agents.**

OAuth was built for humans clicking “Allow once.” Autonomous agents need **per-action** governance: short-lived tokens, policy at execute time, human approval, instant revocation, and audit.

[![CI](https://github.com/agent-capability-runtime/Agent_Capability_Runtime/actions/workflows/ci.yml/badge.svg)](https://github.com/agent-capability-runtime/Agent_Capability_Runtime/actions/workflows/ci.yml)

---

## See it in 60 seconds

```bash
git clone https://github.com/agent-capability-runtime/Agent_Capability_Runtime.git
cd Agent_Capability_Runtime
pnpm install
pnpm build
pnpm demo:wow
```

You will see:

1. **DENY** — agent emails `gmail.com` → blocked (domain policy)
2. **REQUIRE_APPROVAL** — payment over $100 → human gate
3. **DENY** — capability revoked mid-session → `token_revoked`

Full walkthrough: `pnpm demo` · Presenter guide: [docs/demo.md](./docs/demo.md)

---

## The hook (copy-paste)

```typescript
import { AcrClient, can } from "@acr/sdk";

const client = new AcrClient({
  baseUrl: "http://localhost:3000",
  local: { secret: process.env.ACR_SIGNING_SECRET!, adapters: { mode: "stub" } },
});

const { token } = await client.grant(
  can("gmail.send").onlyDomain("company.com").limit(5).expiresIn("10m").toGrantInput({
    agentId: "support_agent",
  }),
);

const result = await client.execute({
  token,
  tool: "gmail.send",
  payload: { to: "attacker@gmail.com", subject: "Export", body: "All contacts" },
});

// → DENY: external domain blocked
```

**Opinionated SDK** — memorable, tweetable:

```typescript
can("gmail.send")
  .onlyDomain("company.com")
  .limit(5)
  .maxSpend(100_00)   // $100 — over limit requires approval
  .expiresIn("10m")
  .toGrantInput({ agentId: "agent_1" });
```

---

## Without ACR vs with ACR

| Without ACR | With ACR |
|-------------|----------|
| Prompt injection → unrestricted tool use | Runtime **DENY** at execute |
| Broad OAuth scope for hours | Scoped JWT for **minutes** |
| No kill switch | **`runtime.revoke(jti)`** instant block |
| “What did the agent do?” | **Audit** per decision |

More scenarios: [docs/threat-examples.md](./docs/threat-examples.md)

---

## How it works

```
┌─────────────┐     grant      ┌──────────────────┐     execute     ┌─────────────┐
│   Agent /   │ ─────────────► │  ACR Runtime     │ ──────────────► │   Gmail,    │
│   LLM app   │   capability   │  (gateway)       │   if allowed    │   Slack,    │
└─────────────┘     token        └────────┬─────────┘                 │   HTTP API  │
                                          │                           └─────────────┘
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
             Validate JWT          Policy engine          Tool adapters
             Revocation check       Intent + constraints   Sandbox (timeout, SSRF)
                    │                     │                     │
                    └─────────────────────┴─────────────────────┘
                                          ▼
                                    Audit log + approvals
```

Diagrams (Mermaid): [docs/architecture-diagrams.md](./docs/architecture-diagrams.md)

1. **Grant** — Issue a signed capability JWT (`HS256`, `RS256`, or `EdDSA`).
2. **Execute** — Agent calls runtime with token + payload.
3. **Decide** — `ALLOW`, `DENY`, `REQUIRE_APPROVAL`, or `SIMULATE`.
4. **Act** — Adapter runs only on ALLOW (sandboxed).
5. **Record** — Audit event; optional hash chain; approvals resumable.

---

## Quick start

**Requirements:** Node.js 20+, pnpm 9+

```bash
pnpm install
pnpm build
pnpm test
pnpm demo:wow          # 30s “wow” demo
pnpm demo              # full interactive demo
pnpm dev:gateway       # HTTP API on :3000
```

Gateway env: copy `apps/gateway/.env.example` → set `ACR_SIGNING_SECRET` (32+ chars).

---

## What we built

| Component | Package | Description |
|-----------|---------|-------------|
| Capability tokens | `@acr/capability-token` | JWT grant/validate, RS256/EdDSA, delegation |
| Policy engine | `@acr/policy-engine` | `can()` DSL, intent-aware rules |
| Runtime | `@acr/runtime` | Execute, revoke, sandbox, Redis opt-in |
| Adapters | `@acr/adapters` | Gmail, Slack, HTTP |
| Audit | `@acr/audit` | JSONL + optional tamper-evident chain |
| SDK | `@acr/sdk` | `AcrClient` + `can()` fluent API |
| Gateway | `apps/gateway` | Self-hosted Hono HTTP API |

### Supported tools

| Tool ID | Description |
|---------|-------------|
| `gmail.send` | Email (stub or live Gmail) |
| `slack.send` | Slack message |
| `http.request` | HTTP with method/URL policy |

### Policy highlights

| Feature | Example |
|---------|---------|
| Domain allowlist | `.onlyDomain("company.com")` |
| Action budget | `.limit(5)` |
| Spending approval | `.maxSpend(10000)` → over $100 needs approver |
| Intent governance | `.whenIntent("customer_support")` |
| Human gate | `.requireApprovalIfExternal()` |
| Revocation | `await runtime.revoke(jti)` |

See [docs/policy-constraints.md](./docs/policy-constraints.md) · [docs/intent-aware-policy.md](./docs/intent-aware-policy.md)

---

## How to use it

### SDK (in-process)

```typescript
import { AcrClient, can } from "@acr/sdk";

const client = new AcrClient({
  local: {
    secret: process.env.ACR_SIGNING_SECRET!,
    adapters: { mode: "stub" },
  },
});

const { token } = await client.grant(
  can("gmail.send").onlyDomain("company.com").limit(5).toGrantInput({
    agentId: "support_agent_1",
    delegator: "user_42",
  }),
);

const result = await client.execute({
  token,
  tool: "gmail.send",
  payload: { to: "customer@company.com", subject: "Re: ticket", body: "On it." },
});

if (result.ok) console.log("Sent:", result.result);
else if (result.decision === "REQUIRE_APPROVAL") console.log("Approval:", result.approvalId);
else console.log("Denied:", result.reason);
```

### HTTP gateway

```bash
pnpm dev:gateway
```

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/capabilities/grant` | Issue token |
| `POST` | `/runtime/execute` | Execute tool |
| `POST` | `/capabilities/revoke` | Revoke `jti` |
| `GET` | `/audit` | Query audit |
| `GET` | `/audit/verify` | Verify hash chain |

Full API: [docs/runtime-api.md](./docs/runtime-api.md) · [docs/getting-started.md](./docs/getting-started.md)

### Signing (production)

| Algorithm | Config |
|-----------|--------|
| HS256 (dev) | `ACR_SIGNING_SECRET` |
| RS256 / EdDSA | `ACR_SIGNING_PRIVATE_KEY` + `ACR_SIGNING_PUBLIC_KEY` |

[docs/signing-algorithms.md](./docs/signing-algorithms.md)

---

## Demos

| Command | What you get |
|---------|----------------|
| `pnpm demo:wow` | 30s — deny, approval, revoke |
| `pnpm demo:quick` | Same as wow (alias) |
| `pnpm demo` | Full interactive tour |
| `pnpm demo:http` | Against running gateway |

---

## Documentation map

| Doc | Topic |
|-----|-------|
| [getting-started.md](./docs/getting-started.md) | Install, gateway, Redis |
| [threat-examples.md](./docs/threat-examples.md) | Security narrative |
| [architecture-diagrams.md](./docs/architecture-diagrams.md) | Mermaid flows |
| [demo.md](./docs/demo.md) | Presenter script |
| [policy-dsl.md](./docs/policy-dsl.md) | `can()` reference |
| [distributed-revocation.md](./docs/distributed-revocation.md) | Redis revoke |
| [signed-audit-chain.md](./docs/signed-audit-chain.md) | Tamper-evident audit |
| [sandbox-adapters.md](./docs/sandbox-adapters.md) | SSRF guard, timeouts |

### Protocol (RFC v1.0 Stable)

| RFC | Title |
|-----|-------|
| [RFC-0001](./docs/rfc/RFC-0001-capability-token.md) | Capability Token |
| [RFC-0002](./docs/rfc/RFC-0002-runtime-execution.md) | Runtime Execution |
| [RFC-0003](./docs/rfc/RFC-0003-audit-lineage.md) | Audit Lineage |
| [RFC-0004](./docs/rfc/RFC-0004-distributed-consumption.md) | Distributed Consumption |
| [RFC-0005](./docs/rfc/RFC-0005-admin-authentication.md) | Admin Auth |

[Index of all RFCs](./docs/rfc/README.md) · [STABLE release](./docs/rfc/STABLE.md)

---

## Monorepo layout

```
packages/
  capability-token/   # JWT grant, validate, delegate
  policy-engine/      # can() DSL + evaluation
  runtime/            # Orchestration
  adapters/           # Tool implementations
  audit/              # Audit store
  sdk/                # Developer client
apps/
  gateway/            # HTTP API
examples/             # demo, demo:wow, e2e
docs/                 # Guides + RFCs
```

---

## Research & blueprint

- [agent-identity-auth-synthesis.md](./agent-identity-auth-synthesis.md) — academic survey
- [Blueprint.md](./Blueprint.md) — original MVP spec
- [THREAT_MODEL.md](./THREAT_MODEL.md) — security analysis

---

## License

MIT — see [LICENSE](./LICENSE).
