# Agent Capability Runtime (ACR)

Runtime-native authorization and governance layer for AI agents.

Every agent action passes through capability-scoped permissions, runtime policy enforcement, and auditability.

## Status

| Phase | Status |
|-------|--------|
| Day 1 — Schema, API, constraints, repo structure | Done |
| Day 2–3 — Token generator & validator | Done |
| Day 4–7 — Runtime gateway & policy middleware | Done |
| Week 2 — Gmail & Slack live API adapters | Done |
| Week 3 — Audit logs & approval hooks | Done |
| Week 4 — npm publish, docs, examples | Planned |

## Monorepo layout

```text
packages/
  capability-token/   # JWT grant + validate (@acr/capability-token)
  policy-engine/      # Constraint evaluation (@acr/policy-engine)
  runtime/            # Execute orchestration (@acr/runtime)
  sdk/                # HTTP + in-process client (@acr/sdk)
  adapters/           # gmail, slack (live + stub), http (@acr/adapters)
  audit/              # Audit log layer (@acr/audit)
apps/
  gateway/            # Hono HTTP server (grant + execute)
docs/                 # Specs and API contracts
examples/             # e2e-local.ts
```

## Quick start

Requires Node.js 20+. If `pnpm` is not installed globally:

```bash
npx pnpm@9.15.0 install
npx pnpm@9.15.0 build
npx pnpm@9.15.0 test
npx pnpm@9.15.0 example:token
npx pnpm@9.15.0 example:e2e
```

With pnpm available:

```bash
pnpm install
pnpm build
pnpm test
pnpm example:token
pnpm example:e2e
```

### Run the HTTP gateway

```bash
# Copy apps/gateway/.env.example and set ACR_SIGNING_SECRET
pnpm dev:gateway
# POST http://localhost:3000/capabilities/grant
# POST http://localhost:3000/runtime/execute
# GET  http://localhost:3000/audit
# GET  http://localhost:3000/approvals
# POST http://localhost:3000/approvals/:id/approve
# GET  http://localhost:3000/health
```

See [docs/audit-and-approvals.md](docs/audit-and-approvals.md) for approval workflows and persistent audit storage.

## Grant a capability token

```ts
import { grantCapability, validateCapability } from "@acr/capability-token";

const secret = process.env.ACR_SIGNING_SECRET!;

const { token, claims } = await grantCapability(
  {
    agentId: "agent_1",
    tool: "gmail.send",
    constraints: {
      allowedDomains: ["company.com"],
      maxActions: 5,
      attachments: false,
    },
    expiresIn: "15m",
    delegator: "user_42",
  },
  { secret },
);

const result = await validateCapability(token, {
  secret,
  expectedTool: "gmail.send",
});

if (!result.valid) throw new Error(result.error.message);
```

## Execute through the runtime

```ts
import { AgentCapabilityRuntime } from "@acr/runtime";

const runtime = new AgentCapabilityRuntime({
  secret: process.env.ACR_SIGNING_SECRET!,
});

const { token } = await runtime.grant({
  agentId: "agent_1",
  tool: "gmail.send",
  constraints: { allowedDomains: ["company.com"] },
});

const result = await runtime.execute({
  token,
  tool: "gmail.send",
  payload: { to: "user@company.com", subject: "Hello", body: "Hi" },
});

if (result.ok) {
  console.log(result.result); // { messageId, status: "sent", to }
} else {
  console.log(result.decision, result.reason);
}
```

## Documentation

- [Capability Token Spec](./docs/capability-token-spec.md)
- [Runtime API](./docs/runtime-api.md)
- [Policy Constraints](./docs/policy-constraints.md)
- [Adapter Setup (Gmail & Slack)](./docs/adapters-setup.md)
- [Research synthesis](./agent-identity-auth-synthesis.md)

## Core principle

Build the **runtime-native permission system** for autonomous software — not another chatbot or orchestration framework.
