# RFC-0005: Admin Authentication for Capability Issuance

| Field | Value |
|-------|-------|
| **RFC** | 0005 |
| **Title** | Admin Authentication for Capability Issuance |
| **Version** | 1.0.0 |
| **Status** | Stable |
| **Stabilized** | 2026-05-24 |
| **Depends on** | [RFC-0001](./RFC-0001-capability-token.md) |
| **Authors** | Agent Capability Runtime contributors |
| **Created** | 2026-05-24 |
| **Profile** | `acr-gateway-admin-v1` |

---

## Abstract

Capability tokens MUST be minted by trusted **issuers**, not by agents themselves. This RFC specifies how HTTP gateways authenticate **administrative** callers before `grant` and `delegate` operations. Execution (`POST /runtime/execute`) uses capability tokens only — not admin keys.

---

## 1. Threat model

| Threat | Mitigation |
|--------|------------|
| Agent self-issues broad tokens | Grant/delegate behind admin auth |
| Stolen admin key | Rotate keys; short capability TTLs; audit grants |
| Missing auth in production | Deployments MUST configure admin keys |

See [THREAT_MODEL.md](../../THREAT_MODEL.md).

---

## 2. Protected operations

When admin authentication is **enabled**, these endpoints require valid credentials:

| Method | Path | Operation |
|--------|------|-----------|
| `POST` | `/capabilities/grant` | Mint root capability |
| `POST` | `/capabilities/delegate` | Mint delegated capability |

**Not protected by this RFC** (use capability tokens or separate controls):

- `POST /runtime/execute`
- `GET /audit`, `GET /approvals`, approval resolve endpoints

Deployments MAY add separate auth for audit/approval APIs.

---

## 3. Authentication scheme

### 3.1 Header

```
Authorization: Bearer <admin_api_key>
```

- Scheme MUST be `Bearer` (case-sensitive per HTTP semantics for scheme token).
- `<admin_api_key>` is an opaque shared secret (≥ 32 characters recommended).

### 3.2 Validation

1. If admin auth is **disabled** (no keys configured), gateway MAY allow grant/delegate without credentials (**development only**).
2. If admin auth is **enabled**, missing or malformed header → `401 Unauthorized`.
3. Key comparison MUST use constant-time equality per key to mitigate timing attacks.

### 3.3 Configuration

| Variable | Description |
|----------|-------------|
| `ACR_ADMIN_API_KEY` | Single admin key |
| `ACR_ADMIN_API_KEYS` | Comma-separated keys (rotation / multi-tenant) |

If either is non-empty, admin auth is **enabled**.

---

## 4. Error responses

### 4.1 Missing credentials

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "unauthorized",
  "message": "Missing Authorization: Bearer <admin_api_key>"
}
```

### 4.2 Invalid key

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "unauthorized",
  "message": "Invalid admin API key"
}
```

---

## 5. Relationship to capability tokens

| Credential | Purpose | Lifetime |
|------------|---------|----------|
| **Admin API key** | Mint capabilities (grant/delegate) | Long-lived; rotate operationally |
| **Capability JWT** | Execute tools under constraints | Short-lived (RFC-0001) |

Admin keys MUST NOT be passed to agents or embedded in agent prompts. Agents receive only capability JWTs.

---

## 6. Future work

- OAuth 2.0 client credentials for grant (enterprise IdP)
- Per-tenant issuer keys with `kid` rotation
- Signed grant audit events (who minted which `jti`)

---

## 7. Implementation status

| Component | Status |
|-----------|--------|
| Gateway `requireAdminAuth` middleware | Implemented |
| `ACR_ADMIN_API_KEY` / `ACR_ADMIN_API_KEYS` | Implemented |
| OAuth grant | Not yet |

---

## 8. References

- [RFC-0001](./RFC-0001-capability-token.md) — Capability tokens
- [runtime-api.md](../runtime-api.md) — HTTP mapping

---

## Appendix A: Changelog

| Date | Version | Change |
|------|---------|--------|
| 2026-05-24 | 1.0.0-draft | Initial RFC |
| 2026-05-24 | 1.0.0 | Promoted to **Stable** with reference implementation release 0.1.0 |
