# ACR LangChain integration

**LangChain tool wrappers for [Agent Capability Runtime](https://github.com/agent-capability-runtime/Agent_Capability_Runtime).**

Enforce capability policies **before** your agent runs a tool — ideal for indie Python devs using LangChain.

## Install

From this monorepo (until PyPI publish):

```bash
pip install -e packages/sdk-python
pip install -e packages/integrations/langchain
```

## Quick start

```python
from acr import can
from acr_langchain import CapabilityGuard, create_guard, wrap_tool
from langchain_core.tools import tool

guard = create_guard(base_url="http://localhost:3000", agent_id="my_agent")
guard.ensure(
    "http.request",
    can("http.request").where(method.in_(["GET"])).limit(20).expires_in("1h"),
)

@tool
def scrape(url: str) -> str:
    return f"scraped {url}"

guarded_scrape = wrap_tool(
    scrape,
    guard=guard,
    acr_tool="http.request",
    payload_builder=lambda kw: {"url": kw["url"], "method": "GET"},
)

# Agent sees denial as tool output instead of running scrape()
result = guarded_scrape.invoke({"url": "https://blocked.example"})
```

Start the gateway first: `pnpm dev:gateway`

## How it works

1. **`CapabilityGuard.ensure()`** — grants a JWT capability token (cached per tool)
2. **`wrap_tool()`** — before your function runs, calls ACR `execute(simulate=True)`
3. **DENY** → returns plain-text reason to the agent (or raises)
4. **SIMULATE/ALLOW** → your local tool function runs normally

Use `simulate=True` (default) so ACR checks policy without replacing your tool logic (Playwright, custom HTTP, etc.).

> **Note:** With `simulate=True`, an ALLOW decision runs policy only — your wrapped Python function still performs the work. For gateway-managed side effects (Gmail, Slack), call `client.execute(..., simulate=False)` directly.

## API

| Symbol | Description |
|--------|-------------|
| `create_guard()` | Factory for `CapabilityGuard` |
| `CapabilityGuard.ensure()` | Grant + cache capability token |
| `wrap_tool()` | Wrap one LangChain tool |
| `wrap_tools()` | Wrap a list of tools |
| `guarded_tool()` | Decorator for new tools |
| `AcrToolDeniedError` | Raised when `on_deny="raise"` |

## Examples in this repo

- [packages/sdk-python/examples/quickstart.py](../../sdk-python/examples/quickstart.py)
- [packages/sdk-python/examples/demo_wow.py](../../sdk-python/examples/demo_wow.py) — deny / approval / revoke narrative

## License

MIT
