# Roadmap

ACR is actively maintained. RFCs are **Stable 1.0.0**; the TypeScript implementation is **0.1.x alpha** — we ship incrementally toward **v1.0.0**.

## Now (0.1.x)

- [x] Capability JWT grant / validate (HS256, RS256, EdDSA)
- [x] Runtime execute pipeline (ALLOW / DENY / REQUIRE_APPROVAL / SIMULATE)
- [x] Fluent `can()` policy DSL + intent-aware rules
- [x] Revocation (in-memory + optional Redis)
- [x] Consumption ledger + `requestId` idempotency
- [x] Sandbox v1 (timeout, SSRF guard, response cap)
- [x] Optional signed audit hash chain
- [x] Self-hosted gateway + Docker
- [x] **TypeScript SDK** — `@acr/sdk` (HTTP + in-process `local` mode)
- [x] **Python SDK** — `acr-sdk` (HTTP; async + sync) — [packages/sdk-python](../packages/sdk-python)
- [x] **Go SDK** — `acr-sdk-go` (HTTP) — [packages/sdk-go](../packages/sdk-go)
- [x] **LangChain integration** — `acr-langchain` tool wrappers — [packages/integrations/langchain](../packages/integrations/langchain)

## Next

- [ ] **Hosted dashboard** — grant, execute, audit, approve in a browser UI
- [ ] **OPA / Rego integration** — external policy bundles alongside native AST
- [ ] **Approval TTL** — separate expiry for pending approvals (independent of JWT `exp`)
- [ ] **HTTP redirect revalidation** — block redirect chains to private IPs
- [ ] **OpenTelemetry** — traces for grant / execute / policy / adapter
- [ ] **npm / PyPI publish** — `@acr/*`, `acr-sdk` (see [docs/naming-and-branding.md](./docs/naming-and-branding.md))

## Later

- [ ] **Rust SDK** — embeddable runtime for edge / high-throughput gateways
- [ ] **Python in-process runtime** — embed `@acr/runtime` equivalent without gateway
- [ ] **Kubernetes admission** — validate agent workloads before tool sidecars run
- [ ] **Webhooks** — approval and deny events to Slack / PagerDuty / SIEM
- [ ] **Policy marketplace** — shareable constraint packs per tool

## How to influence

Open a [Discussion](https://github.com/agent-capability-runtime/Agent_Capability_Runtime/discussions) or issue with the `roadmap` label. PRs welcome for items marked in **Next** when aligned with RFCs.
