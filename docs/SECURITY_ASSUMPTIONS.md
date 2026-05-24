# Security assumptions

What ACR **assumes** to be true in a deployment. If these assumptions fail, stated guarantees may not hold.

## Trusted components

| Component | Assumption |
|-----------|------------|
| **ACR runtime** | Enforces policy before every adapter call; not bypassable by agents |
| **Capability issuer** | Grant/delegate endpoints protected ([RFC-0005](./rfc/RFC-0005-admin-authentication.md)) |
| **Signing keys** | `ACR_SIGNING_SECRET` (or asymmetric keys) stored in a secrets manager; not in agent prompts |
| **Adapters (v1)** | Run in-process after policy; implement declared tool behavior without exfiltration |
| **External APIs** | Gmail/Slack/HTTP endpoints behave as documented (honest but fallible) |

## Untrusted components

| Component | Treatment |
|-----------|-----------|
| **LLM / agent code** | Receives capability JWTs only; cannot mint or widen constraints |
| **Tool payloads** | Validated against policy AST on every execute |
| **Client retry logic** | Must use `requestId` for idempotent side effects |

## Network assumptions

- TLS between clients and gateway in production
- Admin API keys never sent to agents
- Redis (if used) reachable only by gateway replicas

## What ACR does NOT assume

- Audit logs are tamper-evident (v1 — use WORM storage externally)
- Adapters run behind runtime sandbox v1 (timeout, HTTP SSRF guard, response cap); not VM-isolated
- OAuth user identity at execute time (capability token is the authority)

## Operator responsibilities

1. Set `ACR_ADMIN_API_KEY` in production
2. Use short capability TTLs (default 15m)
3. Revoke compromised capabilities via `runtime.revoke(jti)`
4. Persist audit to durable storage
5. Rotate signing secrets and admin keys on compromise

See [THREAT_MODEL.md](../THREAT_MODEL.md) for threat catalog and mitigations.
