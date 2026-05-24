# Agent Capability Runtime (ACR)

**Runtime-enforced capability permissions for AI agents.**

OAuth was built for humans clicking “Allow once.” Autonomous agents need **per-action** governance: short-lived tokens, policy at execute time, human approval, instant revocation, and audit.

[![CI](https://github.com/agent-capability-runtime/Agent_Capability_Runtime/actions/workflows/ci.yml/badge.svg)](https://github.com/agent-capability-runtime/Agent_Capability_Runtime/actions/workflows/ci.yml)

## Project status

**Early production-ready alpha** (`0.1.x`). Protocol RFCs are marked **Stable 1.0.0**; the TypeScript implementation may evolve before **v1.0.0**. See [LAUNCH.md](./LAUNCH.md) for the pre-promotion checklist.

| | RFC specs | Implementation |
|--|-----------|----------------|
| Maturity | Stable 1.0.0 | Alpha — API may change |
| npm | N/A | **Not yet published** to npm by default — install from source or see [docs/publishing.md](./docs/publishing.md) |

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

### Runtime decision flow

![ACR execute flow](./docs/assets/architecture.svg)

Mermaid (approval, revocation, delegation): [docs/architecture-diagrams.md](./docs/architecture-diagrams.md)

### Terminal output (`pnpm demo:wow`)

```
── Step 1: Agent tries to email an external address ──
   ✗ gmail.send → attacker@gmail.com: DENY
   ✓ gmail.send → customer@company.com: ALLOW

── Step 2: Agent tries a payment over $100 ──
   ⏸ Payment $250.00: REQUIRE_APPROVAL
   ✓ After CFO approval: ALLOW

── Step 3: Capability revoked mid-session ──
   ✗ After revoke: DENY — SOC: compromised session
```

Capture a screenshot for social: [docs/assets/demo-wow-terminal.txt](./docs/assets/demo-wow-terminal.txt) · add `docs/assets/demo-wow.png` when ready.

---

## Minimal example (~30 seconds)

```bash
pnpm minimal
```

```typescript
import { AcrClient, can } from "@acr/sdk";

const client = new AcrClient({
  baseUrl: "http://unused",
  local: { secret: process.env.ACR_SIGNING_SECRET!, adapters: { mode: "stub" } },
});

const { token } = await client.grant(
  can("gmail.send").onlyDomain("company.com").limit(3).expiresIn("10m").toGrantInput({ agentId: "agent_demo" }),
);

console.log((await client.execute({ token, tool: "gmail.send", payload: { to: "ok@company.com", subject: "Hi", body: "x" } })).ok); // true
console.log((await client.execute({ token, tool: "gmail.send", payload: { to: "no@gmail.com", subject: "Hi", body: "x" } })).ok); // false — DENY
```

Full file: [examples/minimal.ts](./examples/minimal.ts)

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

More scenarios: [docs/threat-examples.md](./docs/threat-examples.md) · Stories for social: [docs/threat-stories.md](./docs/threat-stories.md)

---

## Who should adopt this today?

| Use case | How ACR helps |
|----------|----------------|
| AI customer support agents | Domain allowlists, spend approval, audit per send |
| Autonomous finance / ops agents | `maxSpend`, human gate, instant revoke |
| Browser / computer-use agents | Per-execute policy on tool + payload, not just OAuth scope |
| Coding copilots with tools | Short-lived capabilities vs long-lived API keys |
| Multi-agent orchestration | Delegation + per-agent `jti` revocation |
| Tool-using RAG pipelines | Enforce retrieval + action boundaries at runtime |
| MCP servers | Govern **execution**, not just channel access |
| Enterprise AI governance | Tamper-evident audit, approvals, policy versioning |

Full list: [docs/use-cases.md](./docs/use-cases.md)

---

## Why not just OAuth?

OAuth answers **“which human authorized this app once?”**  
ACR answers **“may this agent perform this specific action right now?”**

| Approach | Breaks for autonomous agents |
|----------|------------------------------|
| OAuth scopes | Coarse (`gmail.send` = all sends); no per-payload limits |
| API keys | Long-lived; stolen key = full access |
| RBAC / IAM | Agents ≠ human users; no tool + payload binding |
| API gateways | Path routing, not semantic tool intent |
| MCP / tool auth | Channel access ≠ governed per-invoke execution |
| Prompt guardrails | Advisory — ACR is **mandatory** at the adapter |

Full comparison: [docs/why-not-oauth.md](./docs/why-not-oauth.md)

---

## Performance (local, stub adapters)

Regenerate: `pnpm benchmark` · Details: [docs/benchmarks.md](./docs/benchmarks.md)

| Operation | p50 (approx.) |
|-----------|----------------|
| JWT validate | ~0.2 ms |
| Policy evaluate | ~0.005 ms |
| Runtime execute (ALLOW) | ~0.3 ms |
| Runtime execute (DENY) | ~0.3 ms |

Live Gmail/Slack/HTTP latency dominates in production; these numbers are **core runtime overhead** only.

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
| `pnpm minimal` | Grant + ALLOW + DENY in one file |
| `pnpm benchmark` | Micro-benchmarks for docs |

### Hosted playground

No official public instance yet — deploy your own in ~5 minutes: [docs/hosted-demo.md](./docs/hosted-demo.md) (Docker, Railway, Render, Fly.io).

---

## Documentation map

| Doc | Topic |
|-----|-------|
| [getting-started.md](./docs/getting-started.md) | Install, gateway, Redis |
| [use-cases.md](./docs/use-cases.md) | Who should adopt today |
| [why-not-oauth.md](./docs/why-not-oauth.md) | vs OAuth, RBAC, MCP, API keys |
| [threat-stories.md](./docs/threat-stories.md) | Attack narratives (HN/social) |
| [threat-examples.md](./docs/threat-examples.md) | Security scenarios |
| [security-hardening.md](./docs/security-hardening.md) | SSRF, replay, audit integrity |
| [approvals-guide.md](./docs/approvals-guide.md) | Human-in-the-loop, expiry, resume |
| [benchmarks.md](./docs/benchmarks.md) | Latency table |
| [hosted-demo.md](./docs/hosted-demo.md) | Deploy a public playground |
| [publishing.md](./docs/publishing.md) | npm status (maintainers) |
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

## Community

| | |
|--|--|
| [CONTRIBUTING.md](./CONTRIBUTING.md) | How to contribute |
| [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) | Contributor Covenant |
| [SECURITY.md](./SECURITY.md) | Responsible disclosure (no public security issues) |
| [LAUNCH.md](./LAUNCH.md) | Pre-promotion checklist |

---

## License

MIT — see [LICENSE](./LICENSE).
