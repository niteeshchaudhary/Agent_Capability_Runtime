# RFC-0004: Distributed Consumption Ledger

| Field | Value |
|-------|-------|
| **RFC** | 0004 |
| **Title** | Distributed Consumption Ledger |
| **Version** | 1.0.0 |
| **Status** | Stable |
| **Stabilized** | 2026-05-24 |
| **Depends on** | [RFC-0002](./RFC-0002-runtime-execution.md) |
| **Authors** | Agent Capability Runtime contributors |
| **Created** | 2026-05-24 |
| **Profile** | `acr-consumption-v1` |

---

## Abstract

[RFC-0002](./RFC-0002-runtime-execution.md) §7 defines per-`jti` consumption and idempotent `requestId` replay. Single-process runtimes use an in-memory ledger. This RFC specifies a **pluggable consumption store** and a **Redis-backed** implementation safe for multi-instance gateways.

---

## 1. Problem

When multiple gateway replicas handle execute requests for the same capability token:

- In-memory counters diverge → `max_actions` limits are ineffective.
- Idempotent `requestId` replay may double-execute across replicas.

A shared, atomic store is required.

---

## 2. ConsumptionStore interface

```ts
interface ConsumptionStore {
  get(jti: string): Promise<number>;
  tryConsume(jti: string, limit: number | undefined, requestId?: string): Promise<ConsumeResult>;
  release(jti: string, requestId?: string): Promise<void>;
  reset(jti?: string): Promise<void>;
}
```

| Method | Semantics |
|--------|-----------|
| `get` | Current successful consumption count for `jti` |
| `tryConsume` | Atomically reserve quota or detect replay |
| `release` | Roll back after adapter failure (RFC-0002 §7.3) |
| `reset` | Test/admin helper; Redis impl may reject global reset |

### 2.1 ConsumeResult

| Field | Type | Meaning |
|-------|------|---------|
| `allowed` | boolean | May proceed to adapter |
| `count` | number | Count after operation |
| `replay` | boolean | Idempotent replay — no adapter call |
| `reason` | string? | Human-readable detail |

---

## 3. tryConsume algorithm (normative)

1. If `requestId` is set and already recorded for `jti` → `{ allowed: true, replay: true }` (do not increment).
2. If `limit` is set and `count >= limit` → `{ allowed: false, replay: false, reason: "max_actions exceeded" }`.
3. Increment count; record `requestId` if set → `{ allowed: true, replay: false }`.

Steps 1–3 MUST execute atomically (single Lua script or equivalent).

---

## 4. Redis implementation

### 4.1 Keys

| Key | Type | Purpose |
|-----|------|---------|
| `{prefix}:{jti}:count` | string (integer) | Consumption counter |
| `{prefix}:{jti}:reqs` | set | Completed `requestId` values |

Default `prefix`: `acr:consume`.

### 4.2 TTL

Keys SHOULD expire after `ttlSec` (default **86400** — 24h, aligned with max token lifetime). Refreshed on each `tryConsume` / `release`.

### 4.3 Connection

| Env / config | Description |
|--------------|-------------|
| `ACR_REDIS_URL` | Redis URL (`redis://host:6379`) |
| `ACR_CONSUMPTION_MODE` | `memory` or `redis` |
| `ACR_REDIS_KEY_PREFIX` | Override key prefix |
| `ACR_CONSUMPTION_TTL_SEC` | Key TTL seconds |

### 4.4 Dependency

Reference implementation uses the [`redis`](https://www.npmjs.com/package/redis) npm package (v4+) as an **optional peer dependency** of `@acr/runtime`.

---

## 5. Runtime integration

```ts
import { createAgentCapabilityRuntime } from "@acr/runtime";

const runtime = await createAgentCapabilityRuntime({
  secret: process.env.ACR_SIGNING_SECRET!,
  consumption: {
    mode: "redis",
    redisUrl: process.env.ACR_REDIS_URL,
  },
});
```

In-process tests and local dev continue to use `new AgentCapabilityRuntime({ secret })` → in-memory ledger by default.

---

## 6. Security considerations

1. **Redis ACL** — Restrict access to consumption keys; use TLS in production (`rediss://`).
2. **No PII in keys** — Keys use `jti` only.
3. **Clock skew** — TTL is approximate cleanup; authority still bounded by JWT `exp`.
4. **Race safety** — Never implement distributed consumption with read-modify-write outside atomic scripts.

---

## 7. Implementation status

| Component | Status |
|-----------|--------|
| `ConsumptionStore` interface | Implemented |
| `ConsumptionLedger` (memory) | Implemented |
| `RedisConsumptionStore` + Lua | Implemented |
| `createConsumptionStore` / `createAgentCapabilityRuntime` | Implemented |
| Gateway `ACR_REDIS_URL` wiring | Implemented |

---

## 8. References

- [RFC-0002](./RFC-0002-runtime-execution.md) — Consumption & idempotency
- [THREAT_MODEL.md](../../THREAT_MODEL.md)

---

## Appendix A: Changelog

| Date | Version | Change |
|------|---------|--------|
| 2026-05-24 | 1.0.0-draft | Initial RFC + Redis reference implementation |
| 2026-05-24 | 1.0.0 | Promoted to **Stable** with reference implementation release 0.1.0 |
