# Live demo guide

Use this walkthrough to present Agent Capability Runtime (ACR) to an audience.

## Prerequisites

```bash
npx pnpm@9.15.0 install
npx pnpm@9.15.0 build
```

## Option A — In-process demo (recommended)

No server required. Best for recordings and quick presentations.

```bash
npx pnpm@9.15.0 demo
```

**Interactive mode** (default): pauses after each step — press Enter to continue.

**Auto mode** (no pauses, good for CI or screen recordings):

```bash
npx pnpm@9.15.0 demo -- --auto
```

### What the audience sees

| Step | What happens |
|------|----------------|
| 1 | Grant `gmail.send` with `allowedDomains`, `maxActions`, `approvalRequiredIfExternal` |
| 2 | **ALLOW** — email to `@company.com` |
| 3 | **DENY** — `@gmail.com` (domain blocked) |
| 3b | **DENY** — attachment when `attachments: false` |
| 4 | **REQUIRE_APPROVAL** — external partner → approve → resume |
| 5 | **DENY** — `max_actions` exceeded after 3 sends |
| 6 | **ALLOW** — separate `slack.send` capability |
| 7 | **SIMULATE** — policy dry-run, no email sent |
| 8 | **Delegation** — planner → executor with lineage |
| 9 | **Idempotent** — same `requestId` replays without double send |
| 10 | Audit trail (snapshots + lineage) |

## Option B — HTTP gateway demo

Shows the same concepts over REST (good for “production-like” narrative).

**Terminal 1** — start gateway:

```bash
cp apps/gateway/.env.example apps/gateway/.env
# Edit ACR_SIGNING_SECRET (32+ chars)
npx pnpm@9.15.0 dev:gateway
```

**Terminal 2** — run HTTP demo:

```bash
npx pnpm@9.15.0 demo:http
```

Endpoints exercised: `GET /health`, `POST /capabilities/grant`, `POST /capabilities/delegate`, `POST /runtime/execute`, `POST /approvals/:id/approve`, `GET /audit`.

## Talking points (30-second pitch)

1. **Problem:** Agents with broad OAuth scopes can do too much, too long, with no per-action proof.
2. **Approach:** Issue a **capability token** — short-lived, tool-specific, constraint-rich.
3. **Enforcement:** Every tool call hits the **runtime**; policy decides allow / deny / approve.
4. **Governance:** **Audit log** + optional **human approval** for sensitive actions.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `pnpm demo` not found | Run from repo root after `pnpm install` |
| Gateway demo fails health check | Start `pnpm dev:gateway` and set `ACR_SIGNING_SECRET` |
| Garbled colors in old terminals | Run with `NO_COLOR=1` (output still readable) |

## Related examples

```bash
npx pnpm@9.15.0 example:e2e       # minimal allow/deny script
npx pnpm@9.15.0 example:approval  # approval-only script
npx pnpm@9.15.0 example:token     # JWT grant/validate only
```
