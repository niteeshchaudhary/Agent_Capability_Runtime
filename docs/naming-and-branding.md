# Naming and branding (pre-launch checklist)

Verify before public launch and npm publish.

## npm scope `@acr`

| Check | Result (verify locally) |
|-------|-------------------------|
| `@acr/sdk` on npm | **404** — name not taken (as of pre-publish check) |
| npm org `@acr` | Claim at [npmjs.com/org/create](https://www.npmjs.com/org/create) before publish |
| Alternate scope | `@agent-capability-runtime/sdk` if `@acr` org unavailable |

**Collision note:** “ACR” is overloaded (access control, radiology, etc.). In docs and talks, prefer **Agent Capability Runtime** on first mention; use `@acr/*` only as package scope.

## PyPI

| Package | PyPI name | Status |
|---------|-----------|--------|
| Python SDK | `acr-sdk` | **404** pre-publish — claim before release |
| LangChain integration | `acr-langchain` | Not published; install from monorepo |

## Go module

| Module | Import path |
|--------|-------------|
| Go SDK | `github.com/agent-capability-runtime/acr-sdk-go` |

Publish by tagging releases on GitHub; consumers `go get` from the module path.

## GitHub

| Asset | Recommended |
|-------|-------------|
| Organization | `agent-capability-runtime` (matches repo) |
| Repository | `Agent_Capability_Runtime` or `agent-capability-runtime` |
| Topics | `ai-agents`, `authorization`, `oauth`, `mcp`, `security`, `langchain`, `python` |

## Docker

| Image | Example |
|-------|---------|
| Gateway | `ghcr.io/agent-capability-runtime/gateway:0.1.0` |
| Avoid | Bare `acr` on Docker Hub (ambiguous) |

## Documentation domain (optional)

| Purpose | Example |
|---------|---------|
| Docs site | `docs.agent-capability-runtime.dev` |
| Security | `security@agent-capability-runtime.dev` (see [SECURITY.md](../SECURITY.md)) |
| Playground | `play.agent-capability-runtime.dev` |

## Package names (monorepo)

| Package | Role |
|---------|------|
| `@acr/capability-token` | JWT (TypeScript) |
| `@acr/policy-engine` | Policy (TypeScript) |
| `@acr/runtime` | Execute (TypeScript) |
| `@acr/adapters` | Tools (TypeScript) |
| `@acr/audit` | Audit (TypeScript) |
| `@acr/sdk` | Developer entry (TypeScript) |
| `acr-sdk` | Python HTTP client + `can()` DSL |
| `acr-sdk-go` | Go HTTP client + `Can()` DSL |
| `acr-langchain` | LangChain tool wrappers (Python) |

Publish order (npm): `capability-token` → `policy-engine` → `audit` → `adapters` → `runtime` → `sdk`.

PyPI: `acr-sdk` first, then `acr-langchain` (depends on `acr-sdk`).
