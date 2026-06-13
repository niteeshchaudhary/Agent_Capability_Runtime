# Getting started

Pick the fastest path for your stack. For copy-paste recipes see **[plug-and-play.md](./plug-and-play.md)**.

## Python — zero setup (recommended for LangChain)

```bash
git clone https://github.com/agent-capability-runtime/Agent_Capability_Runtime.git
cd Agent_Capability_Runtime
pip install -e packages/sdk-python
python packages/sdk-python/examples/demo_wow.py
```

LangChain one-liner:

```bash
pip install -e packages/sdk-python -e packages/integrations/langchain
```

```python
from acr import can, method
from acr_langchain import protect

tools = protect([my_tool], agent_id="agent_1", policy=can("http.request").where(method.in_(["GET"])).limit(20))
```

Graduate to production: set `ACR_GATEWAY_URL` — same `create_client()` code.

## TypeScript — zero setup (in-process)

```bash
git clone https://github.com/agent-capability-runtime/Agent_Capability_Runtime.git
cd Agent_Capability_Runtime
pnpm install && pnpm build
pnpm demo:wow
```

```typescript
import { AcrClient, can } from "@acr/sdk";

const client = new AcrClient({
  baseUrl: "http://unused",
  local: {
    secret: process.env.ACR_SIGNING_SECRET ?? "dev-secret-change-in-production-32b-minimum",
    adapters: { mode: "stub" },
  },
});

const { token } = await client.grant(
  can("gmail.send").onlyDomain("company.com").limit(5).toGrantInput({ agentId: "agent_1" }),
);

await client.execute({ token, tool: "gmail.send", payload: { to: "user@company.com", subject: "Hi", body: "x" } });
```

Or run: `pnpm example:e2e`

## HTTP gateway (production)

```bash
pnpm install && pnpm build
pnpm setup:gateway    # optional — creates apps/gateway/.env
pnpm dev:gateway      # dev signing secret auto-set if .env missing
```

Grant (when `ACR_ADMIN_API_KEY` is set, include Bearer header — [RFC-0005](./rfc/RFC-0005-admin-authentication.md)):

```bash
curl -s -X POST http://localhost:3000/capabilities/grant \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agent_1","tool":"gmail.send","constraints":{"allowedDomains":["company.com"],"maxActions":5}}'
```

Execute:

```bash
curl -s -X POST http://localhost:3000/runtime/execute \
  -H "Content-Type: application/json" \
  -d '{"token":"TOKEN","tool":"gmail.send","payload":{"to":"user@company.com","subject":"Hi","body":"x"}}'
```

Point Python clients at the gateway:

```bash
export ACR_GATEWAY_URL=http://localhost:3000
```

```python
from acr import create_client
client = create_client()
```

## Go client

```bash
cd packages/sdk-go && go test ./...
```

With gateway running: `ACR_RUN_E2E=1 go test ./... -run TestGateway`

## Optional: Redis (multi-instance)

```bash
ACR_REVOCATION_MODE=redis ACR_CONSUMPTION_MODE=redis ACR_REDIS_URL=redis://localhost:6379
```

See [distributed-revocation.md](./distributed-revocation.md).

## Next

- [plug-and-play.md](./plug-and-play.md)
- [embedded-vs-gateway.md](./embedded-vs-gateway.md)
- [policy-dsl.md](./policy-dsl.md)
- [runtime-api.md](./runtime-api.md)
