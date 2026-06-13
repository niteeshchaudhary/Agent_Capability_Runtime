# Open source launch checklist

Use this before promoting ACR publicly (Hacker News, Product Hunt, social, conference talks).

## Community & governance

- [x] [SECURITY.md](./SECURITY.md) — disclosure policy, 72h ack, supported versions
- [x] [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) — Contributor Covenant 2.1
- [x] [CONTRIBUTING.md](./CONTRIBUTING.md) — dev setup + PR expectations
- [ ] Replace `security@agent-capability-runtime.dev` with your real security inbox (or enable GitHub private reporting only)

## README & positioning

- [x] Badges (CI, MIT, TypeScript, Node, RFC, PRs welcome)
- [x] Project status (RFC stable vs implementation alpha)
- [x] Architecture visual — [docs/assets/architecture.svg](./docs/assets/architecture.svg)
- [x] Threat stories on README front page
- [x] Comparison table — [docs/comparison.md](./docs/comparison.md)
- [x] Who is this NOT for — [docs/who-is-this-not-for.md](./docs/who-is-this-not-for.md)
- [x] Roadmap — [ROADMAP.md](./ROADMAP.md)
- [x] Plug and play guide — [docs/plug-and-play.md](./docs/plug-and-play.md)
- [x] Security verification checklist — [docs/security-verification.md](./docs/security-verification.md)
- [x] Naming checklist — [docs/naming-and-branding.md](./docs/naming-and-branding.md)
- [ ] Terminal GIF or asciinema — [docs/recording-demo.md](./docs/recording-demo.md)
- [ ] Terminal screenshot — optional `docs/assets/demo-wow.png`
- [x] Minimal example — `pnpm minimal` / [examples/minimal.ts](./examples/minimal.ts)
- [x] [docs/benchmarks.md](./docs/benchmarks.md) — `pnpm benchmark`

## npm & versioning

- [x] [docs/publishing.md](./docs/publishing.md) — not yet on npm unless published
- [ ] Run `pnpm publish:packages` when ready for `@acr/sdk` on npm
- [ ] Publish `acr-sdk` to PyPI (workflow: `.github/workflows/publish-python.yml`)
- [ ] Tag release `v0.1.0` on GitHub after first publish

## Multi-language SDKs

- [x] Python SDK (`acr-sdk`) + `LocalAcrClient` — [packages/sdk-python](./packages/sdk-python)
- [x] Go SDK (`acr-sdk-go`) — [packages/sdk-go](./packages/sdk-go)
- [x] LangChain `protect()` — [packages/integrations/langchain](./packages/integrations/langchain)
- [x] Python WOW demo — `pnpm demo:wow:py` (embedded, no gateway)
- [x] Gateway e2e in CI — Python + Go integration job

## Hosted demo

- [x] [docs/hosted-demo.md](./docs/hosted-demo.md) — Docker + Railway/Render/Fly
- [x] [apps/gateway/Dockerfile](./apps/gateway/Dockerfile)
- [ ] Deploy a public playground URL and add to README

## Manual (high leverage)

- [ ] Record 30s GIF of `pnpm demo:wow`
- [ ] Blog/thread: “OAuth breaks when software becomes autonomous”
- [ ] Pin demo asset in README after capture

## Verify before announce

```bash
pnpm install && pnpm build && pnpm test
pnpm demo:wow
pnpm demo:wow:py          # Python embedded — no gateway
pnpm minimal && pnpm benchmark
pnpm dev:gateway          # optional gateway smoke test

# Go e2e (gateway must be running)
$env:ACR_RUN_E2E="1"; Set-Location packages/sdk-go; go test ./... -run TestGateway
```
