# Signed audit hash chain (v1)

When enabled, each audit event links to the previous via SHA-256 and optional HMAC signing — tampering breaks verification.

## Defaults

| Setting | Default |
|---------|---------|
| Hash chain | **Off** — no `hash` / `signature` fields |
| Signing | Off unless `signingSecret` / `ACR_AUDIT_CHAIN_SECRET` is set |

## Enable

```typescript
const runtime = new AgentCapabilityRuntime({
  secret,
  auditPath: "./data/audit.jsonl",
  auditChain: {
    enabled: true,
    signingSecret: process.env.ACR_AUDIT_CHAIN_SECRET, // min 32 chars
  },
});
```

```bash
ACR_AUDIT_CHAIN_ENABLED=true
ACR_AUDIT_CHAIN_SECRET=audit-hmac-secret-min-32-characters-required
ACR_AUDIT_PATH=./data/audit.jsonl
```

## Event fields

| Field | Description |
|-------|-------------|
| `sequence` | Monotonic index (1-based) |
| `hashPrev` | Previous event hash (genesis for first event) |
| `hash` | SHA-256 of canonical event body + `hashPrev` |
| `signature` | HMAC-SHA256(`hash`) when signing secret configured |

## Verification

```typescript
const result = runtime.audit.verifyChain?.();
// { enabled, valid, eventCount, errors }
```

```http
GET /audit/verify
```

Returns `{ enabled: false }` when chain is not configured.

## Guarantees (v1)

- Append-order integrity within a single audit log file
- Detection of modified fields after write
- HMAC proves origin when secret is protected

## Not in v1

- Multi-writer merge across files
- External timestamp authority
- Merkle batching to blockchain

## Related

- [RFC-0003](./rfc/RFC-0003-audit-lineage.md) — audit schema
- [audit-and-approvals.md](./audit-and-approvals.md)
