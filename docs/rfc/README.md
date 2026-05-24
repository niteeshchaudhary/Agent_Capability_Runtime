# ACR Request for Comments (RFC)

Formal specifications for the **Agent Capability Runtime (ACR)** protocol. RFCs are the **normative** source of truth for interoperability, terminology, and security properties. Implementation guides in `docs/` summarize and link here; when they diverge, **the RFC wins**.

**Current protocol release:** [ACR v1.0 Stable](./STABLE.md) (2026-05-24)

## Why RFCs?

Protocol-oriented products gain leverage from:

- **Formal specs** — Multiple implementations can interoperate without reading application code.
- **Terminology ownership** — Precise definitions (`capability token`, `constraint subset`, `delegation chain`) reduce ambiguity in sales, security reviews, and integrations.
- **Conceptual clarity** — Stakeholders align on *what* the system guarantees before debating *how* it is deployed.

## RFC index

| RFC | Title | Status | Version |
|-----|-------|--------|---------|
| [RFC-0001](./RFC-0001-capability-token.md) | Capability Token Specification | **Stable** | 1.0.0 |
| [RFC-0002](./RFC-0002-runtime-execution.md) | Runtime Execution & Policy Decisions | **Stable** | 1.0.0 |
| [RFC-0003](./RFC-0003-audit-lineage.md) | Audit Event Lineage | **Stable** | 1.0.0 |
| [RFC-0004](./RFC-0004-distributed-consumption.md) | Distributed Consumption Ledger | **Stable** | 1.0.0 |
| [RFC-0005](./RFC-0005-admin-authentication.md) | Admin Authentication for Issuance | **Stable** | 1.0.0 |

### Reading order

1. **RFC-0001** — What a capability token is (JWT, claims, delegation)
2. **RFC-0002** — How runtimes execute tools (policy, consumption, approvals)
3. **RFC-0003** — What gets logged and how to correlate events
4. **RFC-0004** — Shared consumption for multi-instance gateways (Redis)
5. **RFC-0005** — Who may mint capabilities (admin Bearer)

## Status keywords

| Status | Meaning |
|--------|---------|
| **Stable** | Normative; breaking changes require a new major profile or successor RFC |
| **Draft** | Under review; not yet normative |
| **Deprecated** | Superseded; do not use for new integrations |
| **Experimental** | May change without a major version bump |

## Versioning

- RFC numbers are **permanent identifiers** (RFC-0001 is always the capability token spec).
- Protocol profiles: `acr-capability-v1`, `acr-runtime-v1`, `acr-audit-v1`, `acr-consumption-v1`, `acr-gateway-admin-v1`.
- Breaking changes require a new major profile and an RFC amendment or successor.

## Amending Stable RFCs

1. Open an issue describing the change and migration impact.
2. For breaking changes: new RFC number or major version bump + profile name.
3. Update the reference implementation and [STABLE.md](./STABLE.md) conformance notes.
4. Add a row to the RFC’s Appendix changelog.

## Contributing

1. Open a discussion or issue describing the protocol change.
2. Add or amend an RFC in `docs/rfc/` (copy structure from RFC-0001).
3. Update the reference implementation (`@acr/capability-token`, gateway, runtime).
4. Mark implementation status in the RFC §Implementation Status.

## Related documents

| Doc | Role |
|-----|------|
| [STABLE.md](./STABLE.md) | v1.0 Stable release + conformance checklist |
| [RFC-0001](./RFC-0001-capability-token.md) | Normative token format |
| [RFC-0002](./RFC-0002-runtime-execution.md) | Normative execute / policy / consumption |
| [RFC-0003](./RFC-0003-audit-lineage.md) | Normative audit events |
| [RFC-0004](./RFC-0004-distributed-consumption.md) | Normative distributed consumption |
| [RFC-0005](./RFC-0005-admin-authentication.md) | Normative admin auth for grant/delegate |
| [capability-token-spec.md](../capability-token-spec.md) | Developer summary → RFC-0001 |
| [policy-constraints.md](../policy-constraints.md) | Constraint evaluation guide → RFC-0002 |
| [policy-dsl.md](../policy-dsl.md) | Fluent DSL (compiles to RFC-0002 AST) |
| [runtime-api.md](../runtime-api.md) | HTTP transport (informative) |
| [audit-and-approvals.md](../audit-and-approvals.md) | Setup guide → RFC-0002, RFC-0003 |
| [THREAT_MODEL.md](../THREAT_MODEL.md) | Security assumptions and threats |
| [SECURITY_ASSUMPTIONS.md](../SECURITY_ASSUMPTIONS.md) | Deployment trust boundaries |
| [CONCEPTS.md](../CONCEPTS.md) | Identity vs capability vs session vs intent |
