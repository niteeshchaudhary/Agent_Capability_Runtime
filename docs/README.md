# Documentation

Agent Capability Runtime (ACR) — specs, API contracts, and setup guides.

## Getting started

| Doc | Description |
|-----|-------------|
| [Getting started](./getting-started.md) | Install, run gateway, first grant + execute |
| [Capability token spec](./capability-token-spec.md) | JWT claims and signing |
| [Runtime API](./runtime-api.md) | HTTP endpoints |
| [Policy constraints](./policy-constraints.md) | Constraint schema and evaluation order |
| [Adapter setup](./adapters-setup.md) | Gmail and Slack live credentials |
| [Audit and approvals](./audit-and-approvals.md) | Persistent audit + human-in-the-loop |
| [Publishing](./publishing.md) | npm package release (maintainers) |

## Research

| Doc | Description |
|-----|-------------|
| [Agent identity auth synthesis](../agent-identity-auth-synthesis.md) | Literature review (6 sources) |
| [Blueprint](../Blueprint.md) | Product blueprint |
| [Logical blueprint](../logicalblueprint.md) | Detailed architecture notes |

## Packages

| npm package | Role |
|-------------|------|
| `@acr/capability-token` | Grant and validate capability JWTs |
| `@acr/policy-engine` | Evaluate constraints against payloads |
| `@acr/runtime` | Orchestrate grant, execute, audit, approvals |
| `@acr/adapters` | Tool adapters (Gmail, Slack, HTTP) |
| `@acr/audit` | Audit event storage and query |
| `@acr/sdk` | Client for gateway or in-process runtime |

Install the SDK for most integrations:

```bash
npm install @acr/sdk @acr/runtime
```

Or use individual packages if you only need token validation or policy evaluation.
