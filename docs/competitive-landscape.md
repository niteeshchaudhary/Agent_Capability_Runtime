# Competitive landscape — agent runtime governance

How **Agent Capability Runtime (ACR)** compares to other products and open-source projects in the **agent action governance** space (not generic LLM prompt filtering).

Last updated: 2026-06. Market moves quickly — verify links before external citations.

---

## Category map

| Category | Examples | What they govern |
|----------|----------|------------------|
| **Capability / action runtime** | **ACR**, Microsoft AGT, AgentWard, CodeIntegrity | Tool calls, side effects, permissions at execute time |
| **MCP proxy / gateway** | Sentinel, Datacline, Gravitee MCP proxy | MCP transport, auth, RBAC, rate limits |
| **LLM guardrails** | Lakera, provider safety filters | Model input/output, not tool boundaries |
| **Traditional auth** | OAuth, API gateways | Human consent, north-south API traffic |

ACR competes in the **first row**. It complements OAuth and API gateways; it overlaps partially with MCP gateways and AGT-style platforms.

See also: [comparison.md](./comparison.md) (OAuth vs gateway vs ACR).

---

## Key competitors

### Microsoft Agent Governance Toolkit (AGT)

- **Site:** [github.com/microsoft/agent-governance-toolkit](https://github.com/microsoft/agent-governance-toolkit)
- **License:** MIT (2026)
- **Focus:** Full “agent OS” — policy engine, identity mesh, sandbox rings, SRE, compliance mapping (OWASP Agentic Top 10, EU AI Act)

| Strength vs ACR | Gap vs ACR |
|-----------------|------------|
| OPA/Rego + Cedar + YAML policies | No capability JWT / delegation / mid-session revoke model |
| 20+ framework bindings | Heavier platform (9 packages) |
| MCP tool scanner, shadow AI discovery | Explicitly **not** pre-LLM prompt moderation |
| Fleet dashboard, `agt verify` CLI | Less “embed in 5 lines” plug-and-play |

### AgentWard

- **Site:** [github.com/agentward-ai/agentward](https://github.com/agentward-ai/agentward)
- **Focus:** Proxy between agents and MCP/tools; SCAN → CONFIGURE → ENFORCE → VERIFY

| Strength vs ACR | Gap vs ACR |
|-----------------|------------|
| MCP-native proxy story | RBAC-style permissions, not capability tokens |
| Tool supply-chain scan workflow | Optional LLM arg-validation (extra cost) |
| SIEM/syslog audit | No built-in human approval / spend gates |

### MCP security gateways

Examples: [Sentinel MCP Gateway](https://github.com/wallybrain/sentinel-mcp-gateway), [Datacline secure-mcp-gateway](https://github.com/datacline/secure-mcp-gateway), commercial MCP proxies (Gravitee, Docker MCP Gateway pattern).

| Strength vs ACR | Gap vs ACR |
|-----------------|------------|
| stdio→HTTP relay, multi-tenant UI | Per-server RBAC, not per-execute capability semantics |
| OAuth/JWT at MCP layer, rate limits | No approval workflows or delegation |
| Prompt-injection rules (some) | No embedded zero-infra runtime |

### CodeIntegrity (commercial)

- **Site:** [codeintegrity.ai](https://www.codeintegrity.ai/)
- **Focus:** Zero-trust control plane for agent tool calls and data-flow provenance

| Strength vs ACR | Gap vs ACR |
|-----------------|------------|
| Enterprise GRC narrative, exec reporting | Closed source; less hackable OSS path |
| Intent + provenance evaluation | Different deployment model |

### AI EdgeLabs / Parallax (commercial)

- **Site:** [edgelabs.ai](https://edgelabs.ai/platform/ai-llm-security)
- **Focus:** Endpoint agent visibility, `tool.before` / `tool.after` hooks, shadow AI

| Strength vs ACR | Gap vs ACR |
|-----------------|------------|
| OS-level visibility (domains, processes) | Endpoint product, not capability-token runtime |
| Destructive command / secret scanning | Different buyer (EDR-style) |

### StrongDM / Cedar narrative (commercial roadmap)

- **Focus:** Local policy gateway with Cedar; observe → shadow → enforce rollout

| Strength vs ACR | Gap vs ACR |
|-----------------|------------|
| Cedar as enterprise policy language | Not OSS capability-runtime focused |
| Clear rollout modes | Agent-specific capability model less emphasized |

---

## Feature matrix (high level)

| Capability | **ACR** | AGT | AgentWard | MCP gateway | OAuth |
|------------|---------|-----|-----------|-------------|-------|
| Per-tool-call policy (deterministic) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Capability JWT (short-lived, delegatable) | ✅ | ❌ | ❌ | ❌ | Partial |
| Revoke mid-session (`jti`) | ✅ | Kill switch | Kill switch | Kill switch | ❌ |
| Human approval before side effect | ✅ | ✅ | Partial | Rare | ❌ |
| Spend / domain / intent on payload | ✅ | ✅ | Partial | Partial | ❌ |
| Embedded runtime (no server) | ✅ | Partial | ❌ | ❌ | N/A |
| Pre-LLM query scope (cost saving) | ✅ | ❌ | ❌ | ❌ | N/A |
| MCP tool guard | ✅ [`acr-mcp`](../packages/integrations/mcp) | ✅ | ✅ | ✅ (native) | N/A |
| MCP proxy server (stdio relay) | Roadmap | Partial | ✅ | ✅ | N/A |
| OPA / Rego / Cedar policies | Roadmap | ✅ | Partial | Partial | N/A |
| MCP tool-description scanner | Roadmap | ✅ | ✅ | Partial | N/A |
| Fleet / compliance dashboard | Roadmap | ✅ | Partial | ✅ | N/A |
| Agent identity mesh / trust score | ❌ | ✅ | Partial | Partial | Partial |
| Published npm / PyPI | Roadmap | Partial | N/A | Varies | N/A |

---

## Where ACR wins today

1. **Capability-token model** — OAuth-alternative for *autonomous* agents: grant → execute → revoke → delegate with **narrower** child constraints ([RFC-0001](./rfc/RFC-0001-capability-token.md)).
2. **Plug-and-play embedded runtime** — `LocalAcrClient`, `create_client()`, `protect()`, zero gateway ([plug-and-play.md](./plug-and-play.md)).
3. **Human-in-the-loop at execute** — `REQUIRE_APPROVAL` on spend / policy, not just deny ([audit-and-approvals.md](./audit-and-approvals.md)).
4. **Pre-LLM cost control** — [Query scope guard](./query-scope-guard.md) blocks off-topic prompts **before** the model runs (keyword/regex, zero LLM cost). Most action-governance tools explicitly avoid this layer.
5. **Multi-language SDKs** — TypeScript, Python, Go with stable RFCs.
6. **Honest scope** — Action governance, not pretending to replace OAuth or full SIEM.

---

## Gaps vs market (and ACR response)

| Market expectation | Status in ACR | Plan |
|--------------------|---------------|------|
| OPA/Rego/Cedar policy bundles | Custom `can()` DSL only | [ROADMAP](../ROADMAP.md) — OPA/Rego |
| Standalone MCP proxy (stdio/HTTP) | Guard library only | MCP proxy server |
| MCP tool poisoning scanner | Not shipped | Tool description scanner |
| Enterprise dashboard + approvals UI | HTTP API only | Hosted dashboard |
| Observe → shadow → enforce fleet rollout | MCP `mode: shadow` + execute `simulate` | Broader shadow mode docs |
| OpenTelemetry / Prometheus | Not shipped | OTel on roadmap |
| Agent identity / trust scoring | `agent_id` string | Later — see [agent-identity-auth-synthesis.md](../agent-identity-auth-synthesis.md) |
| Compliance packs (OWASP Agentic, EU AI Act) | Threat stories + audit | Compliance mapping later |
| npm / PyPI / Go module publish | Install from monorepo | Publish workflows |

Recent gap closures (2026):

- **Query scope guard** — all SDKs ([query-scope-guard.md](./query-scope-guard.md))
- **MCP tool guard** — Python `acr-mcp` + TS `McpToolGuard` ([mcp-integration.md](./mcp-integration.md))

---

## Positioning statement

> **ACR is runtime-enforced capability permissions for AI agents** — short-lived tokens, per-execute policy, approvals, revocation, and audit at the tool boundary. Use OAuth for human connection, an API gateway for ingress, an MCP proxy for protocol routing, and **ACR where autonomous agents actually act**.

### When to choose ACR

- Building **LangChain / custom / MCP** agents that call real tools (email, HTTP, CRM, payments)
- Need **approval + revoke + limits** without rebuilding OAuth
- Want **embedded dev** (no infra) graduating to **gateway** via one env var
- Want **pre-LLM topic filtering** to save model cost on scoped agents (support bot, shop assistant)

### When to choose something else

| Need | Better fit |
|------|------------|
| Full enterprise agent platform + compliance UI | Microsoft AGT, commercial GRC |
| MCP-only proxy with Keycloak + web admin | Datacline, Sentinel, Gravitee |
| Endpoint DLP / shadow AI on laptops | AI EdgeLabs, EDR vendors |
| Human SaaS OAuth “Connect Gmail” | OAuth — [why-not-oauth.md](./why-not-oauth.md) |
| Block toxic model output | LLM guardrails — not ACR’s layer |

### Combined stack (recommended)

```
User query
    → QueryScopeGuard (ACR)     # off-topic? refuse — no LLM cost
    → LLM + agent loop
    → protect() / McpToolGuard  # every tool call checked
    → Adapter / MCP server
    → Audit + optional gateway
```

---

## Priority backlog (competitive parity)

Aligned with [ROADMAP](../ROADMAP.md):

| Priority | Item | Closes gap with |
|----------|------|-----------------|
| **P0** | MCP proxy server | Sentinel, AgentWard, AGT |
| **P0** | OPA/Rego backend | AGT, StrongDM/Cedar shops |
| **P1** | Admin dashboard | AGT, MCP gateways |
| **P1** | OpenTelemetry | Enterprise ops |
| **P2** | MCP tool scanner | AgentWard, AGT |
| **P2** | npm/PyPI publish | Adoption friction |
| **P3** | Agent identity / trust | AGT AgentMesh |

---

## Related docs

- [comparison.md](./comparison.md) — OAuth vs API gateway vs ACR
- [why-not-oauth.md](./why-not-oauth.md)
- [who-is-this-not-for.md](./who-is-this-not-for.md)
- [use-cases.md](./use-cases.md)
- [mcp-integration.md](./mcp-integration.md)
- [query-scope-guard.md](./query-scope-guard.md)
- [threat-stories.md](./threat-stories.md)
