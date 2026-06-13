# ACR Dashboard

Browser UI for the ACR gateway: **grant** capabilities, **execute** tool calls,
review **audit** events, and **approve** pending requests.

## Quick start

```bash
# Terminal 1 — gateway
pnpm dev:gateway

# Terminal 2 — build dashboard once (or watch during dev)
pnpm --filter @acr/dashboard run build
# Or: pnpm --filter @acr/dashboard run dev  (Vite dev server on :5173)

# Open UI (served by gateway after build)
open http://localhost:3000/dashboard/
```

Set **Admin API key** in the sidebar to match `ACR_ADMIN_API_KEY` so grant works
in production mode.

## Docker

The gateway Dockerfile builds the dashboard automatically. After `docker run -p 3000:3000 …`,
open `http://localhost:3000/dashboard/`.

## Disable UI

```bash
ACR_DASHBOARD_ENABLED=false pnpm dev:gateway
```

## Flows

1. **Grant** — pick agent + tool, edit constraints JSON, receive JWT
2. **Execute** — paste token, payload JSON, optional simulate
3. **Audit** — last 50 events from `GET /audit`
4. **Approvals** — pending queue with approve/reject buttons

Same-origin deployment recommended (empty Gateway URL field). For remote gateways,
set the full base URL (e.g. `https://acr.example.com`).

## Related

- [hosted-demo.md](./hosted-demo.md)
- [audit-and-approvals.md](./audit-and-approvals.md)
- [runtime-api.md](./runtime-api.md)
