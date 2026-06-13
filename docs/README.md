# Documentation

Agent Capability Runtime (ACR) — specs, API contracts, and setup guides.

## Specifications (RFC v1.0 Stable)

Formal, normative protocol definitions ([STABLE.md](./rfc/STABLE.md)):

| RFC | Description |
|-----|-------------|
| [RFC index](./rfc/README.md) | RFC process and status |
| [RFC-0001: Capability Token](./rfc/RFC-0001-capability-token.md) | JWT profile, claims, delegation, constraints |
| [RFC-0002: Runtime Execution](./rfc/RFC-0002-runtime-execution.md) | Execute pipeline, decisions, consumption, approvals |
| [RFC-0003: Audit Lineage](./rfc/RFC-0003-audit-lineage.md) | Audit events, lineage, correlation |
| [RFC-0004: Distributed Consumption](./rfc/RFC-0004-distributed-consumption.md) | Redis-backed consumption store |
| [RFC-0005: Admin Authentication](./rfc/RFC-0005-admin-authentication.md) | Bearer auth for grant/delegate |

## Adoption & positioning

| Doc | Description |
|-----|-------------|
| **[Plug and play](./plug-and-play.md)** | **Integrate in minutes — start here** |
| [Embedded vs gateway](./embedded-vs-gateway.md) | Dev vs production runtime |
| [Comparison](./comparison.md) | OAuth vs API gateway vs ACR table |
| [Who is this NOT for](./who-is-this-not-for.md) | When to skip ACR |
| [Use cases](./use-cases.md) | Who should adopt ACR today |
| [Why not OAuth](./why-not-oauth.md) | vs scopes, RBAC, gateways, MCP |
| [Threat stories](./threat-stories.md) | Narrative security examples |
| [Threat examples](./threat-examples.md) | Scenario table |
| [Benchmarks](./benchmarks.md) | `pnpm benchmark` results |
| [Hosted demo](./hosted-demo.md) | Deploy a public playground |
| [Recording demo](./recording-demo.md) | GIF / asciinema for README |
| [Naming & branding](./naming-and-branding.md) | npm, Docker, domains |
| [Security verification](./security-verification.md) | Pre-launch checklist |
| [Publishing](./publishing.md) | npm package status |

## Getting started

| Doc | Description |
|-----|-------------|
| [Getting started](./getting-started.md) | Install, run gateway, first grant + execute |
| [Capability token spec](./capability-token-spec.md) | JWT claims and signing (summary; see RFC-0001) |
| [Runtime API](./runtime-api.md) | HTTP endpoints |
| [Policy constraints](./policy-constraints.md) | Constraint schema and evaluation order |
| [Policy DSL](./policy-dsl.md) | Fluent `can("tool").where(...)` API |
| [Adapter setup](./adapters-setup.md) | Gmail and Slack live credentials |
| [Audit and approvals](./audit-and-approvals.md) | Persistent audit + human-in-the-loop |
| [Approvals guide](./approvals-guide.md) | Expiry, resume, approver identity |
| [Security hardening](./security-hardening.md) | SSRF, replay, audit chain |
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

**npm:** Packages may not be on the public registry yet — see [publishing.md](./publishing.md). Install from source:

```bash
git clone https://github.com/agent-capability-runtime/Agent_Capability_Runtime.git
cd Agent_Capability_Runtime && pnpm install && pnpm build
```

When published, prefer `@acr/sdk` for most integrations.
