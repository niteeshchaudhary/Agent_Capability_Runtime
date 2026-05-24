# RFC-0001: Capability Token Specification

| Field | Value |
|-------|-------|
| **RFC** | 0001 |
| **Title** | Capability Token Specification |
| **Version** | 1.0.0 |
| **Status** | Stable |
| **Stabilized** | 2026-05-24 |
| **Authors** | Agent Capability Runtime contributors |
| **Created** | 2026-05-24 |
| **Profile** | `acr-capability-v1` |

---

## Abstract

This document defines the **Agent Capability Token (ACT)** — a short-lived, signed JSON Web Token (JWT) that grants an **agent** permission to invoke exactly one **tool** under a machine-enforceable **constraint set**. Capability tokens are the portable authorization primitive of the Agent Capability Runtime (ACR). They separate *who the agent is* (`sub`) from *what it may do* (`tool` + `constraints`) and *under whose authority* (`delegator`, delegation chain).

Implementations MUST verify signature, lifetime, required claims, and (when delegating) constraint subset rules before trusting a token.

---

## 1. Introduction

Autonomous agents call external tools (email, chat, HTTP APIs) on behalf of users. Traditional authorization (OAuth scopes, API keys) grants **broad, long-lived** access ill-suited to per-action decisions.

A **capability token** encodes **temporary, narrow, delegable** execution rights. Runtimes evaluate the token at **execution time** against the requested payload, not only at session start.

This RFC specifies:

- JWT profile and algorithms (v1)
- Required and optional claims
- Constraint object schema (JWT encoding)
- Tool identifier registry (v1)
- Issuance and validation procedures
- Transitive delegation and constraint monotonicity

HTTP APIs, policy ASTs, and audit formats are **out of scope** for this RFC; they consume capability tokens as defined here.

---

## 2. Terminology

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

| Term | Definition |
|------|------------|
| **Agent** | An autonomous or semi-autonomous software actor identified by `sub`. |
| **Capability token** (ACT) | A signed JWT conforming to this specification. |
| **Capability issuer** | Component that mints tokens (`grant`) after authentication/authorization of the grant request. |
| **Capability consumer** / **runtime** | Component that validates a token and enforces constraints before invoking a tool. |
| **Tool** | A named operation class (e.g. `gmail.send`) implemented by an adapter behind the runtime. |
| **Constraint set** | JSON object limiting how a tool may be invoked (domains, action counts, approval flags, etc.). |
| **Grant** | Issuance of a new root capability token (no `parent_jti`). |
| **Delegation** | Issuance of a child token derived from a valid parent token with equal or stricter constraints. |
| **Constraint subset** | Property that child constraints MUST NOT widen parent authority (§9). |
| **jti** | JWT ID; unique token identifier for audit, consumption accounting, and delegation lineage. |
| **Static credential** | Long-lived API key or OAuth refresh token — explicitly **not** a capability token. |

---

## 3. Design principles

1. **Capability-centric, not identity-centric** — Authorization follows the token’s `tool` and `constraints`, not ambient session scope alone.
2. **Short-lived** — Default TTL 15 minutes; v1 implementations MUST reject grants exceeding 24 hours unless a future RFC raises the cap.
3. **Stateless verification** — Consumers verify signature and claims without a central session store (consumption counters are runtime-local unless otherwise specified).
4. **Explicit delegation** — Child tokens carry `parent_jti`, `delegation_depth`, and `delegator_chain` for audit and depth limits.
5. **Monotonic authority** — Delegation MUST only narrow constraints, never expand them (§9).
6. **Interoperable encoding** — JWT payload claim names use **snake_case**; SDKs MAY expose camelCase at the application boundary.

---

## 4. Token format

### 4.1 Container

Capability tokens are **JWTs** as defined in [RFC 7519](https://www.rfc-editor.org/rfc/rfc7519).

| Property | v1 requirement |
|----------|----------------|
| Serialization | Compact JWS |
| Signing | **HS256** (HMAC-SHA256) with shared secret ≥ 32 octets, OR asymmetric algorithms in §4.2 |
| `typ` header | `JWT` |
| Profile | Implementations SHOULD include custom header `acr: acr-capability-v1` when using library defaults; not required for validation in v1 |

### 4.2 Algorithms

| Algorithm | Use | Notes |
|-----------|-----|-------|
| `HS256` | Development, single-tenant | Shared secret; rotate aggressively |
| `RS256` | Production (recommended path) | Issuer holds private key; runtimes hold public key |
| `EdDSA` | Production | Preferred for new deployments |

Consumers MUST reject tokens signed with algorithms not configured for their trust store. **"alg": "none"** MUST be rejected.

### 4.3 Claim name convention

All custom claims in the JWT payload use **snake_case**. Application SDKs MAY map to camelCase when parsing or building grant requests.

---

## 5. Claim registry

### 5.1 Required claims

| Claim | Type | Description |
|-------|------|-------------|
| `iss` | string | Issuer identifier (default: `acr-runtime`). Consumers MAY pin expected issuer. |
| `sub` | string | Agent identity (opaque to this RFC). |
| `tool` | string | Tool identifier from §7. |
| `constraints` | object | Constraint set; see §6. MUST be present (may be `{}`). |
| `iat` | number | Issued-at, Unix seconds. |
| `exp` | number | Expiration, Unix seconds. MUST be > `iat`. |
| `jti` | string | Unique token ID; format §5.4. |

### 5.2 Optional claims

| Claim | Type | Description |
|-------|------|-------------|
| `delegator` | string | Principal that delegated authority to `sub` for this token. |
| `session` | string | Opaque session binding for correlation. |
| `task` | string | Human-readable task label (non-normative for policy). |
| `metadata` | object | Opaque key-value context. `intent` SHOULD be stored here as `metadata.intent` when provided at grant time. |
| `parent_jti` | string | `jti` of parent token; present only for delegated tokens. |
| `delegation_depth` | integer | Depth in delegation chain; root grant is `0` or omitted; first delegation is `1`. |
| `delegator_chain` | string[] | Ordered list of delegators from root to parent. |

### 5.3 Reserved claims (future RFCs)

| Claim | Purpose |
|-------|---------|
| `acr_ver` | Major protocol version if claim-breaking changes ship |
| `intent` | Top-level intent claim (v1 uses `metadata.intent`) |
| `aud` | Intended runtime audience |
| `cnf` | Proof-of-possession binding |

### 5.4 `jti` format

```
jti = "cap_" 1*( ALPHA / DIGIT / "-" )
```

v1 reference implementation:

```
cap_<UUID>   e.g. cap_a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

Issuers MUST NOT reuse `jti` values within the token’s validity period.

---

## 6. Constraint set

The `constraints` claim is a JSON object. Absent keys impose no restriction for that dimension. Evaluation semantics (how each key maps to allow/deny) are defined by the runtime policy layer; this RFC defines **encoding and delegation subset rules** only.

### 6.1 Constraint keys (v1)

| JWT key | Type | Semantics (summary) |
|---------|------|---------------------|
| `allowed_domains` | string[] | Email recipient domains (`gmail.send`) |
| `max_actions` | positive integer | Max successful consumptions per token |
| `allowed_methods` | string[] | HTTP verbs (`http.request`) |
| `allowed_urls` | string[] | Host or URL prefix allowlist (`http.request`) |
| `attachments` | boolean | Whether attachments are permitted (`gmail.send`) |
| `spending_limit` | number | Reserved; monetary cap in minor units (future) |
| `allowed_hours` | `{start,end}` | UTC hour window, 0–23, `start` ≤ `end` |
| `approval_required` | boolean | Always require human approval before execute |
| `approval_required_if_external` | boolean | Approval when recipient outside `allowed_domains` |

Unknown keys MUST be ignored by consumers that do not implement them (forward compatibility).

### 6.2 SDK ↔ JWT mapping

| SDK (camelCase) | JWT (snake_case) |
|-----------------|------------------|
| `allowedDomains` | `allowed_domains` |
| `maxActions` | `max_actions` |
| `allowedMethods` | `allowed_methods` |
| `allowedUrls` | `allowed_urls` |
| `attachments` | `attachments` |
| `spendingLimit` | `spending_limit` |
| `allowedHours` | `allowed_hours` |
| `approvalRequired` | `approval_required` |
| `approvalRequiredIfExternal` | `approval_required_if_external` |

### 6.3 Example payload

```json
{
  "iss": "acr-runtime",
  "sub": "agent_123",
  "delegator": "user_456",
  "session": "session_789",
  "task": "customer_support_email",
  "tool": "gmail.send",
  "constraints": {
    "allowed_domains": ["company.com"],
    "max_actions": 5,
    "attachments": false,
    "approval_required_if_external": true
  },
  "metadata": {
    "environment": "production",
    "intent": "support_response"
  },
  "iat": 1748200000,
  "exp": 1748200900,
  "jti": "cap_a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

---

## 7. Tool identifier registry (v1)

Tool IDs are lowercase strings: `<namespace>.<action>`.

| Tool ID | Description |
|---------|-------------|
| `gmail.send` | Send email via Gmail-compatible adapter |
| `slack.send` | Post message to Slack channel |
| `http.request` | Outbound HTTP request |

Issuers MUST NOT mint tokens for unknown tools unless the deployment registers extensions. Consumers MUST reject tokens whose `tool` does not match the execute request’s tool.

Future RFCs MAY define an IANA-style **ACR Tool Registry** process for community extensions.

---

## 8. Issuance (grant)

### 8.1 Grant request (abstract)

| Field | Required | Maps to claim |
|-------|----------|---------------|
| `agentId` | Yes | `sub` |
| `tool` | Yes | `tool` |
| `constraints` | Yes | `constraints` |
| `expiresIn` | No | `exp` − `iat` (default 900 s) |
| `delegator` | No | `delegator` |
| `session` | No | `session` |
| `task` | No | `task` |
| `intent` | No | `metadata.intent` |
| `metadata` | No | `metadata` |

### 8.2 Issuer requirements

1. Authenticate the grant request per [RFC-0005](./RFC-0005-admin-authentication.md) (admin Bearer) or equivalent issuer policy.
2. Validate `constraints` against schema for `tool`.
3. Set `iat` to current time; `exp` to `iat + TTL` where TTL ≤ 86 400 seconds in v1.
4. Generate fresh `jti`.
5. Sign JWT per §4.

### 8.3 Grant response

Implementations return at minimum:

- `token` — compact JWT string
- `claims` — decoded payload (for debugging and audit)
- `expiresAt` — ISO 8601 expiration time

---

## 9. Delegation

Delegation creates a **child** capability from a **parent** token.

### 9.1 Rules

1. Parent token MUST validate at delegation time (signature, not expired, correct `tool`).
2. Child `tool` MUST equal parent `tool` (v1).
3. Child `constraints` MUST satisfy **constraint subset** (§9.2).
4. Child `exp` MUST NOT exceed parent `exp`.
5. Child `delegation_depth` MUST equal `(parent.delegation_depth ?? 0) + 1`.
6. Child `parent_jti` MUST equal parent `jti`.
7. `delegation_depth` MUST NOT exceed issuer-configured maximum (default **8** in reference implementation).

### 9.2 Constraint subset (normative)

Child constraints MUST be **equal or stricter** than parent:

| Constraint | Subset rule |
|------------|-------------|
| `max_actions` | Child value ≤ parent value (if both set) |
| `allowed_domains` | Child set ⊆ parent set (case-insensitive) |
| `allowed_methods` | Child set ⊆ parent set |
| `allowed_urls` | Each child entry must match a parent host or be a subdomain of one |
| `attachments` | Child `false` is stricter than parent `true`; child MUST NOT allow attachments if parent disallows |
| `approval_required` | Child `true` when parent `false` is allowed (stricter) |
| `approval_required_if_external` | Same as approval flags |
| `allowed_hours` | Child window ⊆ parent window (reference implementation) |
| `spending_limit` | Child ≤ parent when both set |

Violations MUST result in refusal to mint the child token.

### 9.3 Delegated payload example

```json
{
  "iss": "acr-runtime",
  "sub": "agent_child",
  "delegator": "user_456",
  "tool": "gmail.send",
  "constraints": {
    "allowed_domains": ["company.com"],
    "max_actions": 2
  },
  "parent_jti": "cap_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "delegation_depth": 1,
  "delegator_chain": ["user_456"],
  "iat": 1748200100,
  "exp": 1748200900,
  "jti": "cap_f9e8d7c6-b5a4-3210-fedc-ba9876543210"
}
```

---

## 10. Validation

Consumers MUST perform the following checks before treating a token as valid:

| Step | Check | Failure code (reference) |
|------|-------|--------------------------|
| 1 | Well-formed JWT (three segments) | `INVALID_FORMAT` |
| 2 | Signature valid for trusted key/secret | `INVALID_SIGNATURE` |
| 3 | `exp` > now (with optional clock tolerance) | `EXPIRED` |
| 4 | Required claims present and schema-valid | `INVALID_CLAIMS` |
| 5 | `tool` in supported registry (if enforced) | `UNSUPPORTED_TOOL` |
| 6 | Optional: `iss` matches configured issuer | `ISSUER_MISMATCH` |
| 7 | Optional: `tool` matches execute request tool | `TOOL_MISMATCH` |

Validation returns either `{ valid: true, claims }` or `{ valid: false, error: { code, message } }`.

Consumers MUST NOT execute tools when validation fails.

---

## 11. Relationship to OAuth and API keys

| Mechanism | Role relative to ACT |
|-----------|----------------------|
| OAuth 2.0 / OIDC | Proves **user identity** to the capability issuer at grant time; does not replace per-action capability tokens. |
| API keys | **Static credentials**; MUST NOT be passed as capability tokens or embedded in `constraints`. |
| ACT | **Execution-time** authorization for a specific agent, tool, and constraint set. |

Recommended pattern: OAuth establishes *who may grant*; ACT establishes *what the agent may do now*.

---

## 12. Versioning and compatibility

- **Profile name:** `acr-capability-v1`
- **Breaking changes** (removed claims, changed subset semantics) require `acr-capability-v2` and a new RFC or RFC-0001 revision marked Stable with migration notes.
- **Additive changes** (new optional constraint keys, new tools) are compatible within v1 if unknown keys are ignored.

---

## 13. Security considerations

1. **Short TTL** — Limit blast radius of stolen tokens; default 15 minutes.
2. **Secret/key hygiene** — HS256 secrets ≥ 32 characters; prefer asymmetric keys in production.
3. **No token logging** — Log `jti`, `sub`, `tool`, decision — not full JWT strings.
4. **Delegation depth** — Cap depth to prevent unbounded chains.
5. **Subset enforcement** — Mandatory at delegation; prevents privilege escalation via child tokens.
6. **Consumption** — `max_actions` requires runtime-side counters; multi-instance deployments need shared ledger (future RFC).
7. **Replay** — `jti` + idempotent `requestId` at runtime reduce duplicate side effects; not a substitute for TLS and agent authentication at grant.

See [THREAT_MODEL.md](../../THREAT_MODEL.md) for deployment-specific threats.

---

## 14. Implementation status

| Component | Repository path | RFC-0001 v1 |
|-----------|-----------------|-------------|
| Grant / validate / delegate | `packages/capability-token` | Implemented |
| Constraint subset | `packages/capability-token/src/constraint-subset.ts` | Implemented |
| HTTP grant / delegate | `apps/gateway` | Implemented |
| `acr` JWT header | — | Not yet |
| RS256 / EdDSA default | — | HS256 only in reference |
| `acr_ver` claim | — | Not yet |

---

## 15. References

### 15.1 Normative

- [RFC 7519](https://www.rfc-editor.org/rfc/rfc7519) — JSON Web Token (JWT)
- [RFC 7515](https://www.rfc-editor.org/rfc/rfc7515) — JSON Web Signature (JWS)
- [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) — Key words for requirements

### 15.2 Informative

- [RFC-0002](./RFC-0002-runtime-execution.md) — Runtime execution & policy decisions
- [RFC-0003](./RFC-0003-audit-lineage.md) — Audit event lineage
- [Agent identity auth synthesis](../../agent-identity-auth-synthesis.md) — Research background
- [policy-constraints.md](../policy-constraints.md) — Runtime evaluation guide
- [THREAT_MODEL.md](../../THREAT_MODEL.md) — Threat model

---

## Appendix A: Validation error codes (reference)

| Code | Meaning |
|------|---------|
| `INVALID_FORMAT` | Malformed JWT |
| `INVALID_SIGNATURE` | Signature verification failed |
| `EXPIRED` | `exp` in the past |
| `NOT_YET_VALID` | `iat` in the future (if enforced) |
| `INVALID_CLAIMS` | Schema validation failed |
| `ISSUER_MISMATCH` | `iss` does not match expected |
| `TOOL_MISMATCH` | Token `tool` ≠ request tool |
| `UNSUPPORTED_TOOL` | Tool not in deployment registry |

---

## Appendix B: Changelog

| Date | Version | Change |
|------|---------|--------|
| 2026-05-24 | 1.0.0-draft | Initial RFC; aligns with ACR v1 implementation |
| 2026-05-24 | 1.0.0 | Promoted to **Stable** with reference implementation release 0.1.0 |

---

## Authors’ addresses

Agent Capability Runtime — https://github.com/agent-capability-runtime/Agent_Capability_Runtime

Amendments to Stable RFCs require a new minor RFC revision or a successor RFC with a migration section.
