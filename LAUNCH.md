# Open source launch checklist

Use this before promoting ACR publicly (Hacker News, Product Hunt, social, conference talks).

## Community & governance

- [x] [SECURITY.md](./SECURITY.md) — disclosure policy, 72h ack, supported versions
- [x] [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) — Contributor Covenant 2.1
- [x] [CONTRIBUTING.md](./CONTRIBUTING.md) — dev setup + PR expectations
- [ ] Replace `security@agent-capability-runtime.dev` with your real security inbox (or enable GitHub private reporting only)

## README & positioning

- [x] Project status (RFC stable vs implementation alpha)
- [x] Architecture visual — [docs/assets/architecture.svg](./docs/assets/architecture.svg)
- [ ] Terminal screenshot — run `pnpm demo:wow`, save as `docs/assets/demo-wow.png`
- [x] [docs/use-cases.md](./docs/use-cases.md) — who should adopt today
- [x] [docs/why-not-oauth.md](./docs/why-not-oauth.md) — positioning moat
- [x] [docs/threat-stories.md](./docs/threat-stories.md) — narrative security stories
- [x] Minimal example — `pnpm minimal` / [examples/minimal.ts](./examples/minimal.ts)
- [x] [docs/benchmarks.md](./docs/benchmarks.md) — `pnpm benchmark`

## npm & versioning

- [x] [docs/publishing.md](./docs/publishing.md) — not yet on npm unless published
- [ ] Run `pnpm publish:packages` when ready for `@acr/sdk` on npm
- [ ] Tag release `v0.1.0` on GitHub after first publish

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
```
