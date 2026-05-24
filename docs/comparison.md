# Feature comparison: OAuth vs API gateway vs ACR

This is the positioning table most teams ask for on first read.

| Feature | OAuth 2.0 scopes | API gateway | **ACR** |
|---------|------------------|-------------|---------|
| Runtime enforcement per tool call | ❌ | Partial (path/method) | ✅ |
| Per-action payload limits (domain, amount, intent) | ❌ | Partial | ✅ |
| Human approval before side effect | ❌ | ❌ | ✅ |
| Instant revocation mid-session (`jti`) | ❌ | ❌ | ✅ |
| Agent-to-agent delegation (narrower child token) | ❌ | ❌ | ✅ |
| Short-lived capability (minutes, not hours) | Partial | N/A | ✅ |
| Idempotent execute (`requestId`) | ❌ | Partial | ✅ |
| Tamper-evident audit chain (opt-in) | ❌ | Partial | ✅ |
| SSRF guard for agent HTTP tools | ❌ | Sometimes | ✅ (sandbox v1) |
| Semantic tool + intent policy | ❌ | ❌ | ✅ |

**Partial** = possible with heavy custom plugins, not the default product model.

## When each wins

| Choose | When |
|--------|------|
| **OAuth** | Human connects Gmail/Slack once; you need standard consent UX |
| **API gateway** | North-south traffic, rate limits, mTLS, routing |
| **ACR** | Autonomous agents invoking tools with **per-execute** governance |

Often you use **all three**: OAuth for connection, gateway for ingress, ACR at the tool boundary.

See also: [why-not-oauth.md](./why-not-oauth.md) · [use-cases.md](./use-cases.md) · [who-is-this-not-for.md](./who-is-this-not-for.md)
