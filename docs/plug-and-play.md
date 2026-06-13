# Plug and play — integrate ACR in minutes

ACR has **three integration depths**. Pick the one that matches your stack — all use the same `can()` policy language.

## Choose your path

| Path | Setup | Best for |
|------|-------|----------|
| **Python embedded** | `pip install -e packages/sdk-python` | LangChain, FastAPI, scripts — **no server** |
| **TypeScript embedded** | `pnpm install` + `@acr/sdk` `local` mode | Node agents — **no server** |
| **HTTP gateway** | `pnpm dev:gateway` or Docker | Production, multi-agent, central audit |

**Production rule of thumb:** start embedded for development; set **`ACR_GATEWAY_URL`** (or `ACR_SIGNING_SECRET` + gateway) when you need shared audit, Redis revocation, or live adapters (Gmail/Slack).

---

## Python — LangChain (one call)

```bash
pip install -e packages/sdk-python
pip install -e packages/integrations/langchain
```

```python
from acr import can, method
from acr_langchain import protect

@tool
def search_web(query: str) -> str:
    return fetch(query)

tools = protect(
    [search_web],
    agent_id="support_bot",
    policy=can("http.request").where(method.in_(["GET"])).limit(100).expires_in("1h"),
)
# Use `tools` in AgentExecutor — denied calls return text to the model, not exceptions.
```

No gateway. No env vars. Policy runs in-process.

---

## Python — any app (embedded)

```python
from acr import create_client, can

client = create_client()  # LocalAcrClient unless ACR_GATEWAY_URL is set

grant = client.grant_sync(
    can("gmail.send").only_domain("company.com").limit(5).to_grant_input(agent_id="agent_1")
)

result = client.execute_sync(
    token=grant.token,
    tool="gmail.send",
    payload={"to": "user@company.com", "subject": "Hi"},
)
```

Run the full narrative demo (deny → approval → revoke):

```bash
python packages/sdk-python/examples/demo_wow.py
```

---

## TypeScript — embedded (no server)

```typescript
import { AcrClient, can } from "@acr/sdk";

const client = new AcrClient({
  baseUrl: "http://unused",
  local: { secret: process.env.ACR_SIGNING_SECRET ?? "dev-secret-change-in-production-32b-minimum", adapters: { mode: "stub" } },
});

const { token } = await client.grant(
  can("gmail.send").onlyDomain("company.com").limit(5).toGrantInput({ agentId: "agent_1" }),
);

const result = await client.execute({ token, tool: "gmail.send", payload: { to: "no@gmail.com", subject: "x", body: "x" } });
// → DENY
```

```bash
pnpm demo:wow    # same story in TypeScript
pnpm minimal   # 10-line version
```

---

## Production — gateway (one env var)

### Local gateway

```bash
pnpm install && pnpm build
pnpm setup:gateway   # optional — copies .env.example
pnpm dev:gateway     # works out of the box (dev signing secret)
```

### Point clients at the gateway

```bash
export ACR_GATEWAY_URL=http://localhost:3000
export ACR_SIGNING_SECRET=your-production-secret-min-32-chars
export ACR_ADMIN_API_KEY=your-admin-key-min-32-chars
```

Python:

```python
from acr import create_client
client = create_client()  # picks up ACR_GATEWAY_URL automatically
```

TypeScript / Go: use `AcrClient` / `acr.NewClient` with the gateway URL.

Docker:

```bash
docker build -t acr-gateway -f apps/gateway/Dockerfile .
docker run -p 3000:3000 \
  -e ACR_SIGNING_SECRET=... \
  -e ACR_ADMIN_API_KEY=... \
  acr-gateway
```

See [hosted-demo.md](./hosted-demo.md).

---

## Environment variables (cheat sheet)

| Variable | Required | Purpose |
|----------|----------|---------|
| `ACR_GATEWAY_URL` | Production multi-instance | Switch Python `create_client()` to HTTP mode |
| `ACR_SIGNING_SECRET` | Production | HS256 signing (≥32 chars). Shared by gateway + embedded if set |
| `ACR_ADMIN_API_KEY` | Production gateway | Protect grant/delegate/revoke ([RFC-0005](./rfc/RFC-0005-admin-authentication.md)) |
| `ACR_AUDIT_PATH` | Optional | Append audit JSONL (embedded or gateway) |
| `ACR_REVOCATION_MODE=redis` | Multi-instance | Shared revocation ([distributed-revocation.md](./distributed-revocation.md)) |

---

## Embedded vs gateway

| Capability | Embedded (`LocalAcrClient` / TS `local`) | Gateway |
|------------|------------------------------------------|---------|
| Domain / spend / intent policy | ✅ | ✅ |
| Approvals + revoke | ✅ in-process | ✅ + HTTP API |
| `requestId` idempotency | ✅ | ✅ |
| Live Gmail / Slack / HTTP adapters | ❌ (your code runs tools) | ✅ |
| Redis revocation / consumption | ❌ | ✅ opt-in |
| Signed audit hash chain | ❌ | ✅ opt-in |
| SSRF sandbox on `http.request` | N/A | ✅ |

Details: [embedded-vs-gateway.md](./embedded-vs-gateway.md)

---

## Next steps

- [getting-started.md](./getting-started.md)
- [use-cases.md](./use-cases.md)
- [policy-dsl.md](./policy-dsl.md)
- [packages/sdk-python/README.md](../packages/sdk-python/README.md)
- [packages/integrations/langchain/README.md](../packages/integrations/langchain/README.md)
