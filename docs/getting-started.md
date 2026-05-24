# Getting started

This guide walks through a minimal ACR setup in under five minutes.

## Prerequisites

- Node.js 20+
- A signing secret (32+ characters)

## 1. Clone and install

```bash
git clone https://github.com/agent-capability-runtime/Agent_Capability_Runtime.git
cd Agent_Capability_Runtime
npx pnpm@9.15.0 install
npx pnpm@9.15.0 build
npx pnpm@9.15.0 test
```

## 2. In-process (no server)

Run the end-to-end example:

```bash
npx pnpm@9.15.0 example:e2e
```

Or use the SDK directly:

```ts
import { AcrClient } from "@acr/sdk";

const client = new AcrClient({
  baseUrl: "http://localhost:3000",
  local: {
    secret: process.env.ACR_SIGNING_SECRET!,
    adapters: { mode: "stub" },
  },
});

const { token } = await client.grant({
  agentId: "agent_1",
  tool: "gmail.send",
  constraints: { allowedDomains: ["company.com"], maxActions: 5 },
});

const result = await client.execute({
  token,
  tool: "gmail.send",
  payload: { to: "user@company.com", subject: "Hello", body: "Hi" },
});
```

## 3. HTTP gateway

```bash
cp apps/gateway/.env.example apps/gateway/.env
# Edit ACR_SIGNING_SECRET in .env
npx pnpm@9.15.0 dev:gateway
```

Grant a token:

```bash
curl -s -X POST http://localhost:3000/capabilities/grant \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent_1",
    "tool": "gmail.send",
    "constraints": { "allowedDomains": ["company.com"], "maxActions": 5 }
  }'
```

Execute (replace `TOKEN`):

```bash
curl -s -X POST http://localhost:3000/runtime/execute \
  -H "Content-Type: application/json" \
  -d '{
    "token": "TOKEN",
    "tool": "gmail.send",
    "payload": { "to": "user@company.com", "subject": "Hi", "body": "Hello" }
  }'
```

## 4. Approvals

When a constraint requires human approval:

```bash
npx pnpm@9.15.0 example:approval
```

See [audit-and-approvals.md](./audit-and-approvals.md) for the full workflow.

## 5. Live Gmail / Slack

Set credentials in `apps/gateway/.env` and see [adapters-setup.md](./adapters-setup.md).

## Next steps

- [Policy constraints](./policy-constraints.md) — tune what agents can do
- [Runtime API](./runtime-api.md) — full HTTP reference
- [Capability token spec](./capability-token-spec.md) — JWT claim details
