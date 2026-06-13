# npm publishing status

## Current status

Packages are **`0.1.0`** and published from this monorepo via the workspace. They are intended for:

- **Local development** — `pnpm install` with workspace protocol
- **GitHub installs** — `"@acr/sdk": "github:org/repo#main"`

### npm registry

Pre-publish check (2026): `npm view @acr/sdk` → **404** (names available). Claim org `@acr` before publish — [naming-and-branding.md](./naming-and-branding.md).

| Package | npm | Notes |
|---------|-----|-------|
| `@acr/capability-token` | Not published yet | Run `pnpm publish:packages` from root |
| `@acr/policy-engine` | Not published yet | |
| `@acr/runtime` | Not published yet | |
| `@acr/adapters` | Not published yet | |
| `@acr/audit` | Not published yet | |
| `@acr/sdk` | Not published yet | Primary developer entry |

**Before v1.0.0:** Packages may not yet appear on npm under `@acr/*`. If `npm view @acr/sdk` fails, install from source:

```bash
git clone https://github.com/agent-capability-runtime/Agent_Capability_Runtime.git
cd Agent_Capability_Runtime
pnpm install && pnpm build
```

Then depend on workspace packages or use the examples/ folder directly.

## Publishing (maintainers)

### npm (TypeScript)

```bash
pnpm build
pnpm publish:packages
```

Requires npm org access to `@acr` scope and `NPM_TOKEN` in CI.

### PyPI (Python)

Package: **`acr-sdk`** (`packages/sdk-python`)

| Package | PyPI | Notes |
|---------|------|-------|
| `acr-sdk` | Not published yet | Manual workflow or `python -m build` + twine |

Pre-publish check: `pip index versions acr-sdk` → not found (claim name before publish).

**Build locally:**

```bash
cd packages/sdk-python
python -m pip install build twine
python -m build
twine check dist/*
```

**Publish (maintainers):**

1. Bump `version` in `packages/sdk-python/pyproject.toml`
2. Configure [PyPI trusted publishing](https://docs.pypi.org/trusted-publishers/) for this repo
3. Run GitHub Action **Publish Python SDK** (`.github/workflows/publish-python.yml`)

Requires `pypi` environment with trusted publisher configured.

### Go module

Module: **`github.com/agent-capability-runtime/acr-sdk-go`** (`packages/sdk-go`)

| Package | Registry | Notes |
|---------|----------|-------|
| `acr-sdk-go` | GitHub releases / proxy.golang.org | Tag `v0.1.0` on repo; no separate publish step |

Consumers:

```bash
go get github.com/agent-capability-runtime/acr-sdk-go@v0.1.0
```

### LangChain (`acr-langchain`)

Install from monorepo until PyPI publish:

```bash
pip install -e packages/sdk-python
pip install -e packages/integrations/langchain
```

Future: publish `acr-langchain` to PyPI after `acr-sdk` is live.

## Versioning policy (target)

| Tag | Meaning |
|-----|---------|
| `0.1.x` | Early production alpha — minor breaking changes possible |
| `1.0.0` | Stable SDK + runtime API aligned with RFC 1.0 |

RFC documents are **Stable 1.0.0** (protocol intent); implementation follows at `0.1.x` until explicit v1 release.
