# Hosted demo (deploy your own playground)

ACR does not ship a official public playground yet — deploy a minimal gateway in ~5 minutes.

---

## Option A: Docker

```bash
# From repo root
docker build -t acr-gateway -f apps/gateway/Dockerfile .
docker run -p 3000:3000 \
  -e ACR_SIGNING_SECRET=your-secret-min-32-characters-long \
  -e ACR_ADMIN_API_KEY=your-admin-key-min-32-chars \
  acr-gateway
```

Try:

```bash
curl -s http://localhost:3000/health
pnpm demo:http   # with GATEWAY_URL=http://localhost:3000
```

---

## Option B: Railway / Render / Fly.io

1. Fork this repository.
2. Set **root directory** to `apps/gateway` or use Dockerfile at repo root.
3. Environment variables:

| Variable | Required |
|----------|----------|
| `ACR_SIGNING_SECRET` | Yes (≥32 chars) |
| `ACR_ADMIN_API_KEY` | Yes (production) |
| `PORT` | Often injected by platform |

4. Health check: `GET /health`

---

## Playground flows (manual)

### 1. Grant

```bash
curl -s -X POST "$URL/capabilities/grant" \
  -H "Authorization: Bearer $ACR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"demo","tool":"gmail.send","constraints":{"allowedDomains":["company.com"]}}'
```

### 2. Execute (deny)

```bash
curl -s -X POST "$URL/runtime/execute" \
  -H "Content-Type: application/json" \
  -d '{"token":"TOKEN","tool":"gmail.send","payload":{"to":"evil@gmail.com","subject":"x","body":"y"}}'
```

### 3. Simulate (no side effects)

Add `"simulate": true` to execute body — returns `SIMULATE` without sending.

---

## Future: public sandbox

A hosted UI (grant → execute → see DENY/ALLOW) is on the roadmap. Until then, `pnpm demo:wow` locally is the fastest experience.
