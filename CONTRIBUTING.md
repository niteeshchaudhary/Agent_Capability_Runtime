# Contributing

Thanks for your interest in Agent Capability Runtime (ACR).

## Development setup

Requires Node.js 20+.

```bash
npx pnpm@9.15.0 install
npx pnpm@9.15.0 build
npx pnpm@9.15.0 test
```

## Project structure

| Path | Purpose |
|------|---------|
| `packages/capability-token` | JWT grant and validation |
| `packages/policy-engine` | Constraint evaluation |
| `packages/runtime` | Execute orchestration, approvals |
| `packages/adapters` | Gmail, Slack, HTTP tool adapters |
| `packages/audit` | Audit logging |
| `packages/sdk` | HTTP and in-process client |
| `apps/gateway` | Hono HTTP server |
| `docs/` | Specs and guides |
| `examples/` | Runnable demos |

## Making changes

1. Create a branch from `main`.
2. Keep changes focused — match existing naming, types, and patterns.
3. Add or update tests when behavior changes.
4. Run `pnpm build` and `pnpm test` before opening a PR.
5. Update relevant docs under `docs/` when APIs change.

## Pull requests

- Describe the problem and the approach.
- Link related issues when applicable.
- Note any breaking API changes clearly.

## Publishing (maintainers)

See [docs/publishing.md](./docs/publishing.md).
