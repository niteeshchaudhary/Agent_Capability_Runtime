# Security hardening reference

What researchers and production deployers should verify — and known v1 limits.

---

## Audit hash chain

| Topic | v1 behavior |
|-------|-------------|
| Tamper detection | Opt-in (`ACR_AUDIT_CHAIN_ENABLED`); SHA-256 chain + optional HMAC |
| Replay of audit | Chain is append-only; verification walks full sequence |
| Clock skew | JWT validation uses `clockToleranceSec` (default 5s); audit timestamps are informational |
| Multi-writer | Single process or shared file; multi-instance needs shared JSONL + external integrity controls |

**Verify:** `GET /audit/verify` or `runtime.audit.verifyChain()`.

---

## Revocation races

| Scenario | Mitigation |
|----------|------------|
| Revoke vs concurrent execute | Last-writer wins per store; use **Redis revocation** (`ACR_REVOCATION_MODE=redis`) for multi-instance |
| Revoke then replay | Revoked `jti` always **DENY** at validation |
| In-memory revoke on 2 gateways | Without Redis, revoke on instance A does not affect instance B |

---

## SSRF (`http.request`)

Sandbox v1 blocks (when `ACR_SANDBOX_BLOCK_PRIVATE=true`, default):

- `localhost`, `*.localhost`
- `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- `169.254.0.0/16` (cloud metadata)
- `metadata.google.internal`
- Non-HTTP(S) schemes

**Policy layer:** `allowedUrls` / host allowlist (defense in depth).

### Known v1 limits

| Limit | Status |
|-------|--------|
| HTTP redirects to internal IPs | **Not re-validated** per hop — use allowlists; disable redirects in adapter if needed |
| DNS rebinding | Not mitigated — use network egress controls in production |
| IPv6 literals | Basic ULA/link-local checks |

---

## Token replay & consumption

| Control | Mechanism |
|---------|-----------|
| `max_actions` | Consumption ledger per `jti` (memory or Redis) |
| Idempotent execute | `requestId` — second call returns replay without double adapter invocation |
| One-time execution | Set `maxActions: 1` or unique `requestId` per logical action |
| Payment actions | Combine `maxSpend` + `requestId` + approval |

**Nonce:** Use `requestId` as application-level nonce; JWT `jti` scopes consumption.

---

## Signing & secrets

| Item | Guidance |
|------|----------|
| Dev | HS256 + `ACR_SIGNING_SECRET` (≥32 chars) |
| Prod | RS256 or EdDSA — private key on issuer only |
| Admin | `ACR_ADMIN_API_KEY` on grant/delegate/revoke in production |

---

## Reporting issues

See [SECURITY.md](../SECURITY.md).
