# Agent Capability Runtime (ACR)

**Runtime-enforced capability permissions for AI agents.**

OAuth was built for humans clicking “Allow once.” Autonomous agents need **per-action** governance: short-lived tokens, policy at execute time, human approval, instant revocation, and audit.

[![CI](https://github.com/agent-capability-runtime/Agent_Capability_Runtime/actions/workflows/ci.yml/badge.svg)](https://github.com/agent-capability-runtime/Agent_Capability_Runtime/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-339933.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![RFC](https://img.shields.io/badge/RFC-Stable%201.0.0-8B5CF6.svg)](./docs/rfc/STABLE.md)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

**Early production-ready alpha** (`0.1.x`) · [Plug and play guide](./docs/plug-and-play.md) · [Roadmap](./ROADMAP.md)

---

## Plug and play (pick one)

### Python + LangChain — no server

```bash
pip install -e packages/sdk-python -e packages/integrations/langchain
```

```python
from acr import can, method
from acr_langchain import protect

tools = protect(
    [my_tool],
    agent_id="agent_1",
    policy=can("http.request").where(method.in_(["GET"])).limit(50),
)
```

### Python / TypeScript — embedded runtime

```python
from acr import create_client, can
client = create_client()
grant = client.grant_sync(can("gmail.send").only_domain("company.com").to_grant_input(agent_id="a1"))
client.execute_sync(token=grant.token, tool="gmail.send", payload={"to": "no@gmail.com"})  # DENY
```

```typescript
import { AcrClient, can } from "@acr/sdk";
const client = new AcrClient({ baseUrl: "http://unused", local: { secret: "dev-secret-change-in-production-32b-minimum", adapters: { mode: "stub" } } });
```

### Production — one env var

```bash
export ACR_GATEWAY_URL=http://localhost:3000   # same Python code switches to gateway
pnpm dev:gateway                               # zero-config local gateway
```

Full paths, env cheat sheet, Docker: **[docs/plug-and-play.md](./docs/plug-and-play.md)**

---

## See it in 60 seconds

**TypeScript (no server):**

```bash
pnpm install && pnpm build && pnpm demo:wow
```

**Python (no server):**

```bash
pip install -e packages/sdk-python && python packages/sdk-python/examples/demo_wow.py
```

DENY external email → REQUIRE_APPROVAL on spend → revoke mid-session.

![ACR execute flow](./docs/assets/architecture.svg)

---

## Real attack scenarios

**Prompt injection → CRM exfil:** agent told to email `attacker@gmail.com` → **`DENY`** (domain policy)

**Runaway payment:** `$250` with `$100` cap → **`REQUIRE_APPROVAL`** → human approves → **`ALLOW`**

**Compromised session:** `revoke(jti)` → **`DENY`** (`token_revoked`)

[docs/threat-stories.md](./docs/threat-stories.md)

---

## Why ACR vs OAuth / gateways

| Feature | OAuth | API Gateway | **ACR** |
|---------|:-----:|:-------------:|:-------:|
| Runtime enforcement per call | ❌ | Partial | ✅ |
| Human approval | ❌ | ❌ | ✅ |
| Per-action limits | ❌ | Partial | ✅ |
| Revocation mid-session | ❌ | ❌ | ✅ |

[docs/comparison.md](./docs/comparison.md) · [docs/why-not-oauth.md](./docs/why-not-oauth.md)

---

## What we built

| Package | Role |
|---------|------|
| `@acr/sdk` | TypeScript — embedded + gateway |
| `acr-sdk` | Python — **`LocalAcrClient`** + gateway HTTP |
| `acr-langchain` | **`protect(tools, ...)`** one-liner |
| `acr-sdk-go` | Go gateway client |
| `apps/gateway` | Production HTTP API + live adapters |

[docs/embedded-vs-gateway.md](./docs/embedded-vs-gateway.md) — when to use which

---

## Quick start (monorepo)

```bash
pnpm install && pnpm build && pnpm test
pnpm demo:wow              # TypeScript WOW
pnpm demo:wow:py           # Python WOW (embedded)
pnpm dev:gateway           # gateway :3000 — works without .env in dev
pnpm setup:gateway         # optional: copy apps/gateway/.env.example → .env
```

**Windows PowerShell:** use `;` instead of `&&`. Go e2e: `$env:ACR_RUN_E2E="1"; Set-Location packages/sdk-go; go test ./... -run TestGateway`

---

## Documentation

| Doc | Topic |
|-----|-------|
| [plug-and-play.md](./docs/plug-and-play.md) | **Start here** — integrate in minutes |
| [getting-started.md](./docs/getting-started.md) | Step-by-step |
| [embedded-vs-gateway.md](./docs/embedded-vs-gateway.md) | Dev vs production |
| [comparison.md](./docs/comparison.md) | vs OAuth / gateways |
| [security-verification.md](./docs/security-verification.md) | Pre-launch checklist |

**RFC v1.0 Stable:** [RFC index](./docs/rfc/README.md)

---

## Community

[CONTRIBUTING.md](./CONTRIBUTING.md) · [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) · [SECURITY.md](./SECURITY.md)

MIT — [LICENSE](./LICENSE)
