# Developer adoption checklist

Status after addressing the gaps from the original review.

| Item | Status | Where |
|------|--------|--------|
| **WOW demo** (deny / approval / revoke) | **Done** | `pnpm demo:wow` → [examples/demo-wow.ts](./examples/demo-wow.ts) |
| **60-second quickstart** | **Done** | `pnpm install && pnpm build && pnpm demo:quick` |
| **README examples-first** | **Done** | [README.md](./README.md) — hook, narrative, then architecture |
| **Opinionated SDK API** | **Done** | `can("gmail.send").onlyDomain().limit().expiresIn().maxSpend()` via `@acr/sdk` |
| **Architecture diagrams** | **Done** | [docs/architecture-diagrams.md](./docs/architecture-diagrams.md) |
| **Threat examples** | **Done** | [docs/threat-examples.md](./docs/threat-examples.md) |
| **Defining narrative** | **Done** | “OAuth breaks for autonomous agents” in README + demos |
| Demo video/GIF | *Manual* | Record `pnpm demo:wow` (asciinema / screen studio) |
| Technical blog thread | *Manual* | Suggested title below |

---

## Original review (reference)

### 1. Missing “WOW” Demo — addressed

Three moments in `demo:wow`:

1. Agent emails external domain → **DENY**
2. Agent payment > $100 → **REQUIRE_APPROVAL** (`.maxSpend(10000)`)
3. Capability revoked mid-session → **token_revoked**

### 2. README too infra-heavy — addressed

Top of README: one-liner, `pnpm demo:wow`, deny example, SDK fluent API, threat table — RFCs moved to docs map.

### 3. Quickstart in 60 seconds — addressed

```bash
pnpm install
pnpm build
pnpm demo:quick
```

### 4. Opinionated SDK API — addressed

```typescript
can("gmail.send")
  .onlyDomain("company.com")
  .limit(5)
  .maxSpend(100_00)
  .expiresIn("10m")
  .toGrantInput({ agentId: "agent_1" });
```

Exported from `@acr/sdk` and `@acr/policy-engine`.

### 5. Visual architecture diagrams — addressed

Mermaid: execute flow, delegation, approval state machine, revocation — [docs/architecture-diagrams.md](./docs/architecture-diagrams.md).

### 6. Threat examples — addressed

[docs/threat-examples.md](./docs/threat-examples.md)

### 7. Defining narrative — addressed

README + demo open with: **OAuth was built for humans; autonomous agents need runtime enforcement.**

---

## Suggested blog / thread title

> **OAuth breaks when software becomes autonomous.**

Subtitle: *We built runtime capability enforcement — not broader scopes, but per-execute governance.*

---

## OSS launch polish (pre-promotion)

| Item | Status | Where |
|------|--------|--------|
| SECURITY.md | **Done** | [SECURITY.md](./SECURITY.md) |
| CODE_OF_CONDUCT.md | **Done** | [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) |
| Why not OAuth | **Done** | [docs/why-not-oauth.md](./docs/why-not-oauth.md) |
| Use cases | **Done** | [docs/use-cases.md](./docs/use-cases.md) |
| Threat stories | **Done** | [docs/threat-stories.md](./docs/threat-stories.md) |
| Approvals / SSRF / replay docs | **Done** | [docs/approvals-guide.md](./docs/approvals-guide.md), [docs/security-hardening.md](./docs/security-hardening.md) |
| Architecture PNG/SVG | **Done** | [docs/assets/architecture.svg](./docs/assets/architecture.svg) |
| Terminal screenshot | *Manual* | Capture `pnpm demo:wow` → `docs/assets/demo-wow.png` |
| Benchmarks | **Done** | `pnpm benchmark` → [docs/benchmarks.md](./docs/benchmarks.md) |
| Minimal <25 LOC example | **Done** | `pnpm minimal` → [examples/minimal.ts](./examples/minimal.ts) |
| npm publishing clarity | **Done** | [docs/publishing.md](./docs/publishing.md) |
| Hosted demo guide | **Done** | [docs/hosted-demo.md](./docs/hosted-demo.md) |
| Launch checklist | **Done** | [LAUNCH.md](./LAUNCH.md) |
| Public playground URL | *Manual* | Deploy gateway per hosted-demo.md |
| README badges | **Done** | CI, MIT, TS, Node, RFC, PRs welcome |
| README threat stories | **Done** | Front-page attack scenarios |
| Comparison table | **Done** | [docs/comparison.md](./docs/comparison.md) |
| Who NOT for | **Done** | [docs/who-is-this-not-for.md](./docs/who-is-this-not-for.md) |
| Roadmap | **Done** | [ROADMAP.md](./ROADMAP.md) |
| README length | **Done** | ~180 lines; [docs/overview.md](./docs/overview.md) |
| Security verification | **Done** | [docs/security-verification.md](./docs/security-verification.md) |
| Naming / npm check | **Done** | [docs/naming-and-branding.md](./docs/naming-and-branding.md) |
| Demo GIF / asciinema | *Manual* | [docs/recording-demo.md](./docs/recording-demo.md) |

---

## Multi-language SDKs (`sdksupport` branch)

| Item | Status | Where |
|------|--------|--------|
| Python SDK (`acr-sdk`) | **Done** | [packages/sdk-python](./packages/sdk-python) |
| Go SDK (`acr-sdk-go`) | **Done** | [packages/sdk-go](./packages/sdk-go) |
| LangChain integration | **Done** | [packages/integrations/langchain](./packages/integrations/langchain) |
| Python `demo_wow.py` | **Done** | `python packages/sdk-python/examples/demo_wow.py` |
| Go DSL parity (intent, HTTP) | **Done** | [packages/sdk-go/dsl.go](./packages/sdk-go/dsl.go) |
| Gateway e2e CI (Python + Go) | **Done** | `.github/workflows/ci.yml` integration job |
| PyPI publish workflow | **Done** | `.github/workflows/publish-python.yml` |
| Roadmap / naming docs updated | **Done** | [ROADMAP.md](./ROADMAP.md), [docs/naming-and-branding.md](./docs/naming-and-branding.md) |

---

## Still manual (high leverage)

1. **Record a 30s GIF** — run `pnpm demo:wow`, capture terminal
2. **Pin demo GIF** in README (upload to repo `docs/assets/` or GitHub release)
3. **Post thread** linking README + threat-stories + demo:wow
4. **Deploy hosted playground** and add URL to README
