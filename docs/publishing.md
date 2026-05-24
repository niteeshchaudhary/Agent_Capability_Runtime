# Publishing to npm

ACR publishes six packages under the `@acr` scope. Publish in dependency order after a clean build.

## Prerequisites

- npm account with access to the `@acr` org (create the org on npmjs.com first)
- `npm login` or `NPM_TOKEN` in CI
- All tests passing: `pnpm build && pnpm test`

## Packages

| Package | Depends on |
|---------|------------|
| `@acr/capability-token` | — |
| `@acr/policy-engine` | capability-token |
| `@acr/audit` | — |
| `@acr/adapters` | capability-token |
| `@acr/runtime` | all above |
| `@acr/sdk` | capability-token, runtime |

`@acr/gateway` and `@acr/examples` are **private** and not published.

## Local dry run

Preview what would be published:

```bash
pnpm build
pnpm -r --filter './packages/*' exec npm pack --dry-run
```

Create tarballs locally:

```bash
pnpm -r --filter './packages/*' pack
```

## Publish (maintainers)

From the repo root after bumping versions in each `packages/*/package.json`:

```bash
pnpm build
pnpm publish:packages
```

The root script publishes all workspace packages under `packages/` with public access.

### One-time: create npm org

1. Go to [npmjs.com](https://www.npmjs.com/) → Organizations → Create `@acr`
2. Add team members who can publish

### CI publish (optional)

Add a GitHub Actions workflow triggered on `v*` tags with `NPM_TOKEN` secret. Not included by default — publish manually for v0.1.0.

## Versioning

- Follow semver for each package
- Keep versions aligned for v0.x (all packages at `0.1.0` initially)
- Document changes in [CHANGELOG.md](../CHANGELOG.md)

## After publish

Users can install:

```bash
npm install @acr/sdk
# or
npm install @acr/runtime @acr/capability-token
```

The gateway remains self-hosted from this monorepo (`apps/gateway`).
