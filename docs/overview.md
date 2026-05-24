# Overview (extended README)

Deep-dive sections moved from the main [README](../README.md) to keep the GitHub front page scannable.

## How it works

```
┌─────────────┐     grant      ┌──────────────────┐     execute     ┌─────────────┐
│   Agent /   │ ─────────────► │  ACR Runtime     │ ──────────────► │   Gmail,    │
│   LLM app   │   capability   │  (gateway)       │   if allowed    │   Slack,    │
└─────────────┘     token        └────────┬─────────┘                 │   HTTP API  │
                                          │                           └─────────────┘
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
             Validate JWT          Policy engine          Tool adapters
             Revocation check       Intent + constraints   Sandbox (timeout, SSRF)
                    │                     │                     │
                    └─────────────────────┴─────────────────────┘
                                          ▼
                                    Audit log + approvals
```

1. **Grant** — Signed capability JWT (`HS256`, `RS256`, or `EdDSA`).
2. **Execute** — Agent calls runtime with token + payload.
3. **Decide** — `ALLOW`, `DENY`, `REQUIRE_APPROVAL`, or `SIMULATE`.
4. **Act** — Adapter runs only on ALLOW (sandboxed).
5. **Record** — Audit; optional hash chain; approvals resumable.

Diagrams: [architecture-diagrams.md](./architecture-diagrams.md) · [assets/architecture.svg](./assets/architecture.svg)

## Use cases (full)

| Use case | How ACR helps |
|----------|----------------|
| AI customer support agents | Domain allowlists, spend approval, audit per send |
| Autonomous finance / ops agents | `maxSpend`, human gate, instant revoke |
| Browser / computer-use agents | Per-execute policy on tool + payload |
| Coding copilots with tools | Short-lived capabilities vs long-lived API keys |
| Multi-agent orchestration | Delegation + per-agent `jti` revocation |
| Tool-using RAG pipelines | Enforce retrieval + action boundaries |
| MCP servers | Govern execution, not just channel access |
| Enterprise AI governance | Tamper-evident audit, policy versioning |

[use-cases.md](./use-cases.md)

## Why not OAuth (extended)

[why-not-oauth.md](./why-not-oauth.md) · [comparison.md](./comparison.md)

## Performance

```bash
pnpm benchmark
```

[benchmarks.md](./benchmarks.md)

## SDK and gateway (full examples)

[getting-started.md](./getting-started.md) · [runtime-api.md](./runtime-api.md) · [policy-dsl.md](./policy-dsl.md)

## Signing

[signing-algorithms.md](./signing-algorithms.md)

## Monorepo layout

```
packages/  capability-token, policy-engine, runtime, adapters, audit, sdk
apps/      gateway
examples/  demo, demo:wow, minimal, benchmark
docs/      guides + RFCs
```

## Research

- [agent-identity-auth-synthesis.md](../agent-identity-auth-synthesis.md)
- [Blueprint.md](../Blueprint.md)
- [THREAT_MODEL.md](../THREAT_MODEL.md)
