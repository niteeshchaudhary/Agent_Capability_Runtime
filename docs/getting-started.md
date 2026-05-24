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

Grant a token (include admin header when `ACR_ADMIN_API_KEY` is set — [RFC-0005](./rfc/RFC-0005-admin-authentication.md)):

```bash
curl -s -X POST http://localhost:3000/capabilities/grant \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACR_ADMIN_API_KEY" \
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

## 4. Multi-instance consumption (Redis)

For multiple gateway replicas, use a shared Redis ledger ([RFC-0004](./rfc/RFC-0004-distributed-consumption.md)):

```bash
# apps/gateway/.env
ACR_REDIS_URL=redis://localhost:6379
ACR_CONSUMPTION_MODE=redis
```

Install the optional peer dependency in your deployment:

```bash
npm install redis
```

## 5. Distributed revocation (optional Redis)

Revocation defaults to **in-memory** — no Redis required for local or single-instance use.

For multiple gateway replicas, opt in to a shared revocation list:

```bash
ACR_REVOCATION_MODE=redis
ACR_REDIS_URL=redis://localhost:6379
```

See [distributed-revocation.md](./distributed-revocation.md).

## 6. Approvals

When a constraint requires human approval:

```bash
npx pnpm@9.15.0 example:approval
```

See [audit-and-approvals.md](./audit-and-approvals.md) for the full workflow.

## 7. Live Gmail / Slack

Set credentials in `apps/gateway/.env` and see [adapters-setup.md](./adapters-setup.md).

## Next steps

- [Policy constraints](./policy-constraints.md) — tune what agents can do
- [Runtime API](./runtime-api.md) — full HTTP reference
- [RFC-0001](./rfc/RFC-0001-capability-token.md) — normative capability token spec
- [RFC-0004](./rfc/RFC-0004-distributed-consumption.md) — Redis consumption for scale-out
