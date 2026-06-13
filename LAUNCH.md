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
- [x] README trimmed — deep sections in [docs/overview.md](./docs/overview.md)
- [x] Security verification checklist — [docs/security-verification.md](./docs/security-verification.md)
- [x] Naming checklist — [docs/naming-and-branding.md](./docs/naming-and-branding.md)
- [ ] Terminal GIF or asciinema — [docs/recording-demo.md](./docs/recording-demo.md)
- [ ] Terminal screenshot — optional `docs/assets/demo-wow.png`
- [x] [docs/use-cases.md](./docs/use-cases.md) — who should adopt today
- [x] [docs/why-not-oauth.md](./docs/why-not-oauth.md) — positioning moat
- [x] [docs/threat-stories.md](./docs/threat-stories.md) — narrative security stories
- [x] Minimal example — `pnpm minimal` / [examples/minimal.ts](./examples/minimal.ts)
- [x] [docs/benchmarks.md](./docs/benchmarks.md) — `pnpm benchmark`

## npm & versioning

- [x] [docs/publishing.md](./docs/publishing.md) — not yet on npm unless published
- [ ] Run `pnpm publish:packages` when ready for `@acr/sdk` on npm
- [ ] Publish `acr-sdk` to PyPI (workflow: `.github/workflows/publish-python.yml`)
- [ ] Tag release `v0.1.0` on GitHub after first publish

## Multi-language SDKs

- [x] Python SDK (`acr-sdk`) — [packages/sdk-python](./packages/sdk-python)
- [x] Go SDK (`acr-sdk-go`) — [packages/sdk-go](./packages/sdk-go)
- [x] LangChain integration — [packages/integrations/langchain](./packages/integrations/langchain)
- [x] Python WOW demo — `python packages/sdk-python/examples/demo_wow.py` (gateway required)
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
pnpm install
pnpm build
pnpm test
pnpm demo:wow
pnpm minimal
pnpm benchmark

# Python (gateway must be running for demo_wow)
pip install -e packages/sdk-python
python packages/sdk-python/examples/demo_wow.py

# Go (unit tests; e2e via ACR_RUN_E2E=1 with gateway)
cd packages/sdk-go && go test ./...
```
