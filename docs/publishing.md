# npm publishing status

## Current status

Packages are **`0.1.0`** and published from this monorepo via the workspace. They are intended for:

- **Local development** — `pnpm install` with workspace protocol
- **GitHub installs** — `"@acr/sdk": "github:org/repo#main"`

### npm registry

| Package | npm | Notes |
|---------|-----|-------|
| `@acr/capability-token` | Planned / verify before launch | Run `pnpm publish:packages` from root |
| `@acr/policy-engine` | Planned | |
| `@acr/runtime` | Planned | |
| `@acr/adapters` | Planned | |
| `@acr/audit` | Planned | |
| `@acr/sdk` | Planned | Primary developer entry |

**Before v1.0.0:** Packages may not yet appear on npm under `@acr/*`. If `npm view @acr/sdk` fails, install from source:

```bash
git clone https://github.com/agent-capability-runtime/Agent_Capability_Runtime.git
cd Agent_Capability_Runtime
pnpm install && pnpm build
```

Then depend on workspace packages or use the examples/ folder directly.

## Publishing (maintainers)

```bash
pnpm build
pnpm publish:packages
```

Requires npm org access to `@acr` scope and `NPM_TOKEN` in CI.

## Versioning policy (target)

| Tag | Meaning |
|-----|---------|
| `0.1.x` | Early production alpha — minor breaking changes possible |
| `1.0.0` | Stable SDK + runtime API aligned with RFC 1.0 |

RFC documents are **Stable 1.0.0** (protocol intent); implementation follows at `0.1.x` until explicit v1 release.
