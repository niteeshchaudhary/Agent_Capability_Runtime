# Distributed capability revocation

Revocation immediately blocks `execute` for a given capability `jti`. Single-process deployments use an **in-memory** store (default). Multi-instance gateways can opt into **Redis** so any replica honors `POST /capabilities/revoke`.

## Defaults

| Setting | Default | Notes |
|---------|---------|--------|
| `config.revocation.mode` | `memory` | No Redis required |
| Redis | **opt-in** | Set `mode: "redis"` explicitly |

Unlike consumption, revocation does **not** auto-enable Redis when `ACR_REDIS_URL` is set. You choose per concern.

## Configuration

```typescript
import { createAgentCapabilityRuntime } from "@acr/runtime";

const runtime = await createAgentCapabilityRuntime({
  secret: process.env.ACR_SIGNING_SECRET!,
  revocation: {
    mode: "redis",
    redisUrl: process.env.ACR_REDIS_URL,
    keyPrefix: "acr:revoke",
    ttlSec: 86_400,
  },
});
```

### Gateway environment

```bash
# In-memory (default) — no Redis needed
ACR_REVOCATION_MODE=memory

# Shared revocation across replicas
ACR_REVOCATION_MODE=redis
ACR_REDIS_URL=redis://localhost:6379
ACR_REVOCATION_TTL_SEC=86400
```

Consumption and revocation can use the same Redis server with different key prefixes (`acr:consume` vs `acr:revoke`).

## API

```typescript
await runtime.revoke(claims.jti, {
  reason: "compromised agent",
  revokedBy: "admin@company.com",
});

if (await runtime.isRevoked(claims.jti)) {
  // blocked on execute → token_revoked
}
```

```http
POST /capabilities/revoke
Authorization: Bearer <admin>
{ "capabilityId": "cap_...", "reason": "..." }
```

## Redis keys

- Key: `{prefix}:{jti}` (default `acr:revoke:cap_<uuid>`)
- Value: JSON `RevocationRecord`
- TTL: `ttlSec` (default 24h; align with max token lifetime)

## Related

- [THREAT_MODEL.md](../THREAT_MODEL.md) — revocation controls
- [RFC-0004](./rfc/RFC-0004-distributed-consumption.md) — consumption ledger (separate concern)
