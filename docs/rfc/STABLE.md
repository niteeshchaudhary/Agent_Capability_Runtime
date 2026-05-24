# ACR Protocol v1.0 — Stable Release

**Date:** 2026-05-24  
**Reference implementation:** `@acr/*` packages and gateway **0.1.0**

## What “Stable” means

RFCs **0001–0005** are normative at version **1.0.0**. Implementations claiming ACR v1 conformance MUST follow these specifications. Breaking changes require:

1. A new **major profile** (e.g. `acr-capability-v2`), and  
2. An RFC amendment or successor with explicit migration guidance.

Additive, backward-compatible changes (new optional constraint keys, new tools) MAY ship in minor documentation updates without a new major profile if unknown keys are ignored per RFC-0001.

## Stable RFC set

| RFC | Profile | Title |
|-----|---------|-------|
| [RFC-0001](./RFC-0001-capability-token.md) | `acr-capability-v1` | Capability Token |
| [RFC-0002](./RFC-0002-runtime-execution.md) | `acr-runtime-v1` | Runtime Execution & Policy |
| [RFC-0003](./RFC-0003-audit-lineage.md) | `acr-audit-v1` | Audit Event Lineage |
| [RFC-0004](./RFC-0004-distributed-consumption.md) | `acr-consumption-v1` | Distributed Consumption |
| [RFC-0005](./RFC-0005-admin-authentication.md) | `acr-gateway-admin-v1` | Admin Authentication |

## Known gaps (post-Stable roadmap)

Documented in implementation status sections — not blockers for v1 Stable:

| Area | Status |
|------|--------|
| RS256 / EdDSA default signing | HS256 in reference; asymmetric recommended in production |
| Signed audit hash chain | RFC-0003 amendment planned |
| OAuth-based grant (RFC-0005 §6) | Future |
| `REDACT` / `SANDBOX` decisions | Reserved in RFC-0002 |

## Conformance checklist

- [ ] Mint tokens per RFC-0001; validate before execute  
- [ ] Evaluate policy and consumption per RFC-0002  
- [ ] Emit audit events per RFC-0003  
- [ ] Use shared consumption per RFC-0004 when running multiple gateway instances  
- [ ] Protect grant/delegate per RFC-0005 in production  

## Promotion record

| Date | Action |
|------|--------|
| 2026-05-24 | RFC-0001–0005 promoted from Draft → **Stable** at version 1.0.0 |
