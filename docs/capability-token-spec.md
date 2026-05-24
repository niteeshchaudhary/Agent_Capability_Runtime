# Capability Token Specification (v1)

> **Normative spec:** [RFC-0001: Capability Token Specification](./rfc/RFC-0001-capability-token.md) (**Stable** 1.0.0)  
> This page is a developer quick reference. For interoperability, terminology, and security guarantees, use the RFC.

Agent Capability Runtime (ACR) issues **capability tokens** — short-lived, signed JWTs that grant an agent permission to invoke a specific tool under explicit constraints.

## Design goals

- Temporary execution rights (not broad OAuth scopes)
- Fine-grained runtime constraints
- Delegated authority (`delegator` claim)
- Stateless verification (signed JWT)
- Auditability (`jti`, `sub`, `delegator`, timestamps)
- Transportable across runtimes and languages

## Token format

Tokens are **JSON Web Tokens (JWT)** signed with **HS256** (development) or **EdDSA / RS256** (production). The payload uses **snake_case** claim names for interoperability.

### Example payload

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
    "project": "support-bot"
  },
  "iat": 1748200000,
  "exp": 1748200900,
  "jti": "cap_a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

## Core claims

| Claim | Required | Description |
|-------|----------|-------------|
| `iss` | Yes | Token issuer (e.g. `acr-runtime`) |
| `sub` | Yes | Agent identity |
| `delegator` | No | User or system that delegated authority |
| `session` | No | Runtime session identifier |
| `task` | No | Human-readable execution purpose |
| `tool` | Yes | Allowed tool identifier (e.g. `gmail.send`) |
| `constraints` | Yes | Execution rules (see policy-constraints.md) |
| `metadata` | No | Arbitrary contextual tags |
| `iat` | Yes | Issued-at (Unix seconds) |
| `exp` | Yes | Expiration (Unix seconds) |
| `jti` | Yes | Unique token ID for audit and replay prevention |
| `parent_jti` | No | Parent token when delegated |
| `delegation_depth` | No | Delegation chain depth (0 = root) |
| `delegator_chain` | No | Ordered delegators for lineage |

See [RFC-0001](./rfc/RFC-0001-capability-token.md) for delegation rules and constraint subset requirements.

## Supported tools (v1)

| Tool ID | Description |
|---------|-------------|
| `gmail.send` | Send email via Gmail adapter |
| `slack.send` | Post message via Slack adapter |
| `http.request` | Generic HTTP request |

## Issuance

Tokens are minted by the **Capability Issuer** (`@acr/capability-token`):

```ts
import { grantCapability } from "@acr/capability-token";

const { token, claims } = await grantCapability(
  {
    agentId: "agent_123",
    tool: "gmail.send",
    constraints: { allowedDomains: ["company.com"], maxActions: 5 },
    expiresIn: "15m",
    delegator: "user_456",
    task: "customer_support_email",
  },
  { secret: process.env.ACR_SIGNING_SECRET! }
);
```

## Validation

Resource servers and the runtime gateway verify tokens before execution:

```ts
import { validateCapability } from "@acr/capability-token";

const result = await validateCapability(token, {
  secret: process.env.ACR_SIGNING_SECRET!,
  expectedTool: "gmail.send",
});

if (!result.valid) {
  throw new Error(result.error.code);
}

const claims = result.claims;
```

### Validation checks

1. Signature verification
2. `exp` not passed
3. Required claims present and schema-valid
4. Optional: `tool` matches expected tool for the request
5. Optional: `iss` matches configured issuer

## Security notes

- Use short TTLs (default 15 minutes; max 24 hours in v1 SDK)
- Rotate signing keys; support `kid` header for key rotation (future)
- Never log full tokens in audit systems — log `jti` and claim metadata only
- Static API keys are not capability tokens; do not substitute

## Versioning

This document describes **v1**. Breaking claim changes increment the major version and may use a `acr_ver` claim in future revisions.

**RFC:** [RFC-0001](./rfc/RFC-0001-capability-token.md) (profile `acr-capability-v1`)
