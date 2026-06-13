# Embedded vs gateway runtime

ACR ships two deployment shapes with the **same policy DSL** and **same execute API**.

## Embedded (in-process)

**Python:** `LocalAcrClient()` or `create_client()` without `ACR_GATEWAY_URL`  
**TypeScript:** `AcrClient({ local: { secret, adapters } })`

### When to use

- Local development and CI
- LangChain / FastAPI agents where **your Python code** performs the tool action
- Single-process agents that need policy gates without ops overhead

### What you get

- Grant, execute, deny, approval, revoke, audit — in memory
- HS256 capability tokens (use `ACR_SIGNING_SECRET` for stable secrets across restarts)
- Optional `ACR_AUDIT_PATH` JSONL persistence

### Limits (by design)

- No live Gmail/Slack/HTTP adapters — ACR checks policy; **you** run the side effect
- No cross-process revocation (use gateway + Redis for fleets)
- No SSRF sandbox (no outbound HTTP from ACR itself)
- HS256 only in embedded Python (gateway supports RS256/EdDSA)

## Gateway (HTTP)

**Start:** `pnpm dev:gateway` · **Docker:** [hosted-demo.md](./hosted-demo.md)

### When to use

- Production with multiple agents or services
- Central audit, approvals UI, SOC revoke
- Live tool adapters with sandbox (SSRF guard, timeouts)
- Redis-backed revocation and consumption across replicas

### Client switch (Python)

```python
# Dev — embedded
client = create_client()

# Prod — one env var, same code
os.environ["ACR_GATEWAY_URL"] = "https://acr.internal:3000"
client = create_client()
```

## Security posture

| Threat | Embedded | Gateway |
|--------|----------|---------|
| Prompt injection → bad tool args | Policy DENY at execute | Same |
| Token replay (`requestId`) | ✅ per process | ✅ (+ Redis optional) |
| Compromised agent session | `revoke(jti)` in-process | `POST /capabilities/revoke` (+ Redis) |
| SSRF via agent HTTP tools | Your responsibility | Sandbox on `http.request` adapter |

For production checklists see [security-verification.md](./security-verification.md).
