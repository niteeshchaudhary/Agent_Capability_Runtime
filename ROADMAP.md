# Open source roadmap

ACR is actively maintained. RFCs are **Stable 1.0.0**; implementations are **0.1.x alpha** toward **v1.0.0**.

## Shipped (0.1.x)

- [x] TypeScript runtime + `@acr/sdk` (embedded + gateway)
- [x] Python `acr-sdk` — HTTP client + **`LocalAcrClient`** (embedded, zero setup)
- [x] Go `acr-sdk-go` — HTTP client + `Can()` DSL
- [x] LangChain **`protect()`** — one-call tool wrapping
- [x] **MCP tool guard** — `acr-mcp` policy at MCP boundary + shadow mode
- [x] **MCP tool scanner** — `acr-mcp` poisoning / injection / typosquat detection
- [x] **MCP proxy** — `AcrMcpProxy` scan-on-connect + enforce-on-call relay
- [x] **MCP proxy server (stdio)** — `acr-mcp-proxy` standalone relay process
- [x] **Query scope guard** — pre-LLM topic filter (all SDKs)
- [x] Self-hosted gateway + Docker (zero-config dev signing secret)
- [x] Revocation, approvals, consumption/idempotency, sandbox, audit chain (gateway)

## Next

- [ ] **MCP proxy server (HTTP/SSE)** — multi-tenant relay transport
- [ ] **Hosted dashboard** — grant, execute, audit, approve in browser
- [ ] **OPA / Rego** — external policy bundles
- [ ] **Approval TTL** — separate from JWT `exp`
- [ ] **HTTP redirect revalidation** — SSRF hardening
- [ ] **OpenTelemetry** — grant / execute traces
- [ ] **npm / PyPI publish** — `@acr/sdk`, `acr-sdk`, `acr-langchain`

## Later

- [ ] **Rust SDK**
- [ ] **Kubernetes admission**
- [ ] **Webhooks** — approval/deny to Slack/PagerDuty
- [ ] **Policy marketplace**

## Plug and play today

See [docs/plug-and-play.md](./docs/plug-and-play.md).
