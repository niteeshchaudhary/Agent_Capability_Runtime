# Pre-launch security verification

Security researchers will probe these paths first. Run this checklist before promoting the repo publicly.

## Run automated checks

```bash
pnpm build
pnpm test
```

Targeted packages (security-critical):

```bash
pnpm --filter @acr/capability-token test
pnpm --filter @acr/runtime test
pnpm --filter @acr/adapters test
```

## Control matrix

| Threat | Status | How to verify |
|--------|--------|----------------|
| **Token replay / double spend** | ✅ v1 | `requestId` idempotency — `packages/runtime/src/consumption-ledger.test.ts`; demo step 9 in `examples/demo.ts` |
| **Nonce / request uniqueness** | ✅ v1 | Stable `requestId` per logical action; JWT `jti` scopes consumption ledger |
| **Approval binding** | ✅ v1 | Same token + tool + payload — `approvalMatchesExecution` in `packages/runtime/src/approval-store.ts`; `pnpm approval` e2e |
| **Approval expiration** | ⚠️ v1 partial | No separate approval TTL — pending approvals die when JWT `exp` passes; see [approvals-guide.md](./approvals-guide.md) |
| **Clock skew (JWT)** | ✅ v1 | `clockToleranceSec` default **5s** — `packages/capability-token/src/validate.ts`; expired token test in `capability-token.test.ts` |
| **Revocation mid-session** | ✅ v1 | `runtime.revoke(jti)` — `pnpm demo:wow`; Redis: `redis-revocation-store.test.ts` |
| **Revocation propagation (multi-instance)** | ⚠️ requires Redis | In-memory revoke is per-process — enable `ACR_REVOCATION_MODE=redis` |
| **SSRF / localhost / private IPs** | ✅ v1 | `packages/runtime/src/sandbox/network.ts` + `sandbox.test.ts`, `sandbox-execution.test.ts` |
| **Metadata IP (169.254.x.x)** | ✅ v1 | Blocked in sandbox network guard |
| **HTTP redirect to internal** | ❌ v1 gap | Redirects **not** re-validated per hop — document + roadmap; use URL allowlists |
| **Audit chain tamper** | ✅ opt-in | `pnpm --filter @acr/audit test` — `hash-chain.test.ts` |

## Manual probes (recommended)

1. **Replay execute** — same `requestId` twice → second result is replay, adapter not called twice.
2. **Revoke race** — revoke `jti`, then execute → `token_revoked` / DENY.
3. **SSRF** — `http.request` to `http://127.0.0.1/` → sandbox DENY.
4. **Approval mismatch** — approve for `user@company.com`, execute to `other@company.com` → DENY.
5. **Expired token** — wait past `exp` (or use 1s TTL in test) → `EXPIRED`.

## Known v1 limits (disclose in reviews)

- HTTP redirect chains to private networks
- DNS rebinding (use egress controls)
- Approval `resolvedBy` is audit metadata only — not cryptographic identity
- Multi-gateway revoke without Redis

Details: [security-hardening.md](./security-hardening.md) · [THREAT_MODEL.md](../THREAT_MODEL.md)

## Report findings

[SECURITY.md](../SECURITY.md) — no public issues for vulnerabilities.
