# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| `0.1.x` | Yes — security fixes as feasible |
| `< 0.1.0` | No |

RFC specifications marked **Stable 1.0.0** describe intended protocol behavior; implementation maturity is **early production alpha** (see [README.md](./README.md#project-status)).

## Reporting a vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

### Preferred: GitHub private reporting

1. Open the [Security](https://github.com/agent-capability-runtime/Agent_Capability_Runtime/security) tab on this repository.
2. Choose **Report a vulnerability** (GitHub private vulnerability reporting).

### Alternative: email

If private reporting is unavailable, email **security@agent-capability-runtime.dev** with:

- Description of the issue and impact
- Steps to reproduce
- Affected version / commit SHA
- Proof-of-concept if available (please avoid destructive tests on third-party systems)

## What to expect

| Stage | Target timeline |
|-------|-----------------|
| Initial acknowledgment | **72 hours** |
| Triage and severity assessment | **7 days** |
| Fix or mitigation plan for confirmed issues | **30 days** (critical issues prioritized) |

We may request additional information and will coordinate disclosure timing with you (responsible disclosure).

## Scope

In scope:

- `@acr/capability-token`, `@acr/policy-engine`, `@acr/runtime`, `@acr/adapters`, `@acr/audit`, `@acr/sdk`
- `apps/gateway` HTTP API
- Cryptographic signing, revocation, consumption ledger, sandbox SSRF guards, audit hash chain

Out of scope (unless demonstrably affecting ACR):

- Vulnerabilities in third-party services (Gmail, Slack, etc.)
- Misconfiguration by deployers (e.g. missing `ACR_ADMIN_API_KEY`, leaked signing secrets)
- Issues in dependent libraries without a demonstrable ACR-specific exploit path

## Safe harbor

We appreciate good-faith security research. Do not access data you do not own, disrupt production systems without permission, or violate applicable laws.

## Security documentation

- [THREAT_MODEL.md](./THREAT_MODEL.md)
- [docs/SECURITY_ASSUMPTIONS.md](./docs/SECURITY_ASSUMPTIONS.md)
- [docs/security-hardening.md](./docs/security-hardening.md)
