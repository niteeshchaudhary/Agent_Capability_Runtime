# Agent Capability Runtime (ACR)

**A runtime-native permission system for AI agents.**

ACR sits between your agent and external tools (Gmail, Slack, HTTP APIs). Every action is authorized by a short-lived, scoped **capability token**, evaluated against **policy constraints**, logged to an **audit trail**, and optionally paused for **human approval** before execution.

[![CI](https://github.com/agent-capability-runtime/Agent_Capability_Runtime/actions/workflows/ci.yml/badge.svg)](https://github.com/agent-capability-runtime/Agent_Capability_Runtime/actions/workflows/ci.yml)

---

## What problem does this solve?

Traditional authorization gives agents **broad, static access**:

- “Full Gmail access”
- “Slack workspace admin”
- “Database read/write”

That model breaks down for autonomous agents. They need **temporary**, **narrow**, **context-specific** permissions that are enforced **at execution time**, not only at login.

| Traditional auth | Agent Capability Runtime |
|------------------|--------------------------|
| Identity-centric (“who is this user?”) | Capability-centric (“what may this agent do right now?”) |
| Long-lived OAuth scopes | Short-lived JWTs (default 15 minutes) |
| All-or-nothing tool access | Per-tool constraints (domains, URLs, action limits) |
| Hard to audit per action | Every attempt logged with decision + reason |
| No built-in human gate | Pause for approval when policy requires it |

**ACR answers:** *“Can this agent send this email to this address right now, under these limits, with a record of who allowed it?”*

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
             (signature, exp)      (constraints)          (stub or live)
                    │                     │                     │
                    └─────────────────────┴─────────────────────┘
                                          │
                                          ▼
                                    Audit log + approvals
```

1. **Grant** — Issue a signed capability JWT for an agent + tool + constraints.
2. **Execute** — Agent calls the runtime with the token and a tool payload.
3. **Decide** — Runtime returns `ALLOW`, `DENY`, or `REQUIRE_APPROVAL`.
4. **Act** — On allow, the adapter calls the real API (or a stub in dev).
5. **Record** — Every path writes an audit event; approvals can be resumed later.

---

## What we built

This repository is a **TypeScript monorepo** implementing the full MVP from the [Blueprint](./Blueprint.md):

| Component | Package | Description |
|-----------|---------|-------------|
| Capability tokens | `@acr/capability-token` | HS256 JWT grant, validation, constraint mapping |
| Policy engine | `@acr/policy-engine` | Evaluates constraints → `ALLOW` / `DENY` / `REQUIRE_APPROVAL` |
| Runtime | `@acr/runtime` | Orchestrates grant, execute, action counting, approvals |
| Adapters | `@acr/adapters` | Gmail, Slack (stub + live), HTTP (`fetch`) |
| Audit | `@acr/audit` | In-memory or JSONL file audit log with query filters |
| SDK | `@acr/sdk` | In-process or HTTP client for the gateway |
| Gateway | `apps/gateway` | Self-hosted Hono HTTP API |

### Supported tools (v1)

| Tool ID | Description |
|---------|-------------|
| `gmail.send` | Send email (stub or Gmail API) |
| `slack.send` | Post message (stub or Slack API) |
| `http.request` | Generic HTTP with method/URL policy |

### Policy constraints (v1)

Constraints are embedded in the token and checked on every execution:

| Constraint | Example use |
|------------|-------------|
| `allowedDomains` | Gmail: only `@company.com` recipients |
| `maxActions` | Max N successful sends per token |
| `allowedMethods` / `allowedUrls` | HTTP: GET-only to `api.company.com` |
| `attachments` | Block email attachments |
| `allowedHours` | Only run during 9–17 UTC |
| `approvalRequired` | Always pause for human approval |
| `approvalRequiredIfExternal` | Approve sends outside the domain allowlist |

See [docs/policy-constraints.md](./docs/policy-constraints.md) for the full schema and evaluation order.

### Human-in-the-loop approvals

When policy returns `REQUIRE_APPROVAL`, execution pauses. A reviewer approves via API; the agent retries with the same token, payload, and `approvalId`.

### Live integrations

Gmail and Slack adapters can call real APIs when credentials are configured. See [docs/adapters-setup.md](./docs/adapters-setup.md).

### Research foundation

[agent-identity-auth-synthesis.md](./agent-identity-auth-synthesis.md) synthesizes six papers on agent identity and auth (DID/VC, A-JWT, OIDC-A, IETF AIMS, etc.) and informed this design.

---

## Live demo

**Best for presentations** — step-by-step walkthrough with clear ALLOW / DENY / APPROVAL output:

```bash
npx pnpm@9.15.0 demo              # interactive (press Enter between steps)
npx pnpm@9.15.0 demo -- --auto   # run all steps without pausing
```

**HTTP gateway demo** (start `pnpm dev:gateway` in another terminal first):

```bash
npx pnpm@9.15.0 demo:http
```

Full presenter guide: [docs/demo.md](./docs/demo.md)

---

## Quick start

**Requirements:** Node.js 20+

```bash
git clone https://github.com/agent-capability-runtime/Agent_Capability_Runtime.git
cd Agent_Capability_Runtime
npx pnpm@9.15.0 install
npx pnpm@9.15.0 build
npx pnpm@9.15.0 test
```

Run the end-to-end demo (in-process, no server):

```bash
npx pnpm@9.15.0 example:e2e        # grant → allow → deny
npx pnpm@9.15.0 example:approval   # pause → approve → resume
```

---

## How to use it

You can integrate ACR in three ways.

### Option 1: SDK (in-process) — fastest for apps

Embed the runtime directly in your Node.js service:

```ts
import { AcrClient } from "@acr/sdk";

const client = new AcrClient({
  baseUrl: "http://localhost:3000", // unused when local is set
  local: {
    secret: process.env.ACR_SIGNING_SECRET!,
    adapters: { mode: "stub" }, // or "live" with Gmail/Slack tokens
  },
});

// 1. Grant a scoped capability
const { token } = await client.grant({
  agentId: "support_agent_1",
  tool: "gmail.send",
  constraints: {
    allowedDomains: ["company.com"],
    maxActions: 5,
    attachments: false,
  },
  expiresIn: "15m",
  delegator: "user_42",
});

// 2. Execute through the runtime (policy enforced)
const result = await client.execute({
  token,
  tool: "gmail.send",
  payload: {
    to: "customer@company.com",
    subject: "Re: your ticket",
    body: "We received your request.",
  },
});

if (result.ok) {
  console.log("Sent:", result.result);
} else if (result.decision === "REQUIRE_APPROVAL") {
  console.log("Needs approval:", result.approvalId);
  // Human approves, then retry with approvalId
} else {
  console.log("Denied:", result.reason);
}
```

### Option 2: HTTP gateway — best for microservices

Run the gateway and call it from any language:

```bash
cp apps/gateway/.env.example apps/gateway/.env
# Set ACR_SIGNING_SECRET (min 32 characters)
npx pnpm@9.15.0 dev:gateway
```

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/capabilities/grant` | Issue a capability token |
| `POST` | `/runtime/execute` | Run a tool (with optional `approvalId`) |
| `GET` | `/audit` | Query audit events |
| `GET` | `/approvals` | List approval requests |
| `POST` | `/approvals/:id/approve` | Approve a pending action |
| `POST` | `/approvals/:id/reject` | Reject a pending action |
| `GET` | `/health` | Liveness check |

Example grant (curl):

```bash
curl -s -X POST http://localhost:3000/capabilities/grant \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent_1",
    "tool": "gmail.send",
    "constraints": {
      "allowedDomains": ["company.com"],
      "maxActions": 5
    }
  }'
```

### Option 3: Libraries only — tokens or policy without the full runtime

Use individual packages when you only need part of the stack:

```ts
// Token only
import { grantCapability, validateCapability } from "@acr/capability-token";

// Policy only
import { evaluatePolicy } from "@acr/policy-engine";

// Full runtime without HTTP
import { AgentCapabilityRuntime } from "@acr/runtime";
```

---

## Approval workflow example

```ts
const pending = await client.execute({
  token,
  tool: "gmail.send",
  payload: { to: "partner@gmail.com", subject: "Hi", body: "..." },
});
// → REQUIRE_APPROVAL (external domain)

await client.approve(pending.approvalId!, "manager_7");

const allowed = await client.execute({
  token,
  tool: "gmail.send",
  payload: { to: "partner@gmail.com", subject: "Hi", body: "..." },
  approvalId: pending.approvalId,
});
// → ALLOW
```

Details: [docs/audit-and-approvals.md](./docs/audit-and-approvals.md)

---

## Configuration

### Gateway environment variables

| Variable | Description |
|----------|-------------|
| `ACR_SIGNING_SECRET` | JWT signing secret (min 32 chars) **required** |
| `ACR_ISSUER` | Token issuer claim (default `acr-runtime`) |
| `PORT` | HTTP port (default `3000`) |
| `ACR_ADAPTER_MODE` | `stub` \| `live` \| `auto` (default `auto`) |
| `GMAIL_ACCESS_TOKEN` | Gmail API OAuth token |
| `SLACK_BOT_TOKEN` | Slack bot token |
| `ACR_AUDIT_PATH` | JSONL file for persistent audit log |
| `ACR_APPROVAL_PATH` | JSON file for persistent approvals |

Copy [apps/gateway/.env.example](./apps/gateway/.env.example) to get started.

---

## Repository layout

```text
packages/
  capability-token/   @acr/capability-token   JWT grant + validate
  policy-engine/      @acr/policy-engine      Constraint evaluation
  runtime/            @acr/runtime            Execute orchestration
  adapters/           @acr/adapters           Gmail, Slack, HTTP
  audit/              @acr/audit              Audit logging
  sdk/                @acr/sdk                Client library
apps/
  gateway/            Hono HTTP server
docs/                 Specs, guides, API contracts
examples/             Runnable demos
```

---

## Install from npm

```bash
npm install @acr/sdk
# or
npm install @acr/runtime @acr/capability-token
```

Publish instructions: [docs/publishing.md](./docs/publishing.md)

---

## Development

```bash
npx pnpm@9.15.0 install
npx pnpm@9.15.0 build
npx pnpm@9.15.0 test          # 123 tests across all packages
npx pnpm@9.15.0 example:token
```

Contributing: [CONTRIBUTING.md](./CONTRIBUTING.md)

---

## Documentation

| Doc | Description |
|-----|-------------|
| [Getting started](./docs/getting-started.md) | Step-by-step setup |
| [Capability token spec](./docs/capability-token-spec.md) | JWT claims and signing |
| [Runtime API](./docs/runtime-api.md) | HTTP endpoints |
| [Policy constraints](./docs/policy-constraints.md) | Constraint reference |
| [Adapter setup](./docs/adapters-setup.md) | Gmail & Slack credentials |
| [Audit & approvals](./docs/audit-and-approvals.md) | Persistence and workflows |
| [Docs index](./docs/README.md) | Full list |
| [Blueprint](./Blueprint.md) | Product architecture |
| [Changelog](./CHANGELOG.md) | Release notes |

---

## What ACR is not (v1)

ACR is intentionally focused. It is **not**:

- A chatbot or agent orchestration framework
- A full IAM / SSO / enterprise identity product
- A workflow builder or no-code automation tool
- A vector memory or RAG system

It **is** the enforcement layer you put in front of tool calls so agents can act safely with proof of what was allowed, denied, or approved.

---

## License

[MIT](./LICENSE)
