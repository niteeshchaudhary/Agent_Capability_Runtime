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

## Still manual (high leverage)

1. **Record a 30s GIF** — run `pnpm demo:wow`, capture terminal
2. **Pin demo GIF** in README (upload to repo `docs/assets/` or GitHub release)
3. **Post thread** linking README + threat-examples + demo:wow
