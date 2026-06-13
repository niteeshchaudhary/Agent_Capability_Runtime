# ACR LangChain integration

**LangChain tool wrappers for [Agent Capability Runtime](https://github.com/agent-capability-runtime/Agent_Capability_Runtime).**

Enforce capability policies **before** your agent runs a tool. Zero infrastructure by default — no gateway, no Docker, no Node.

## Install

```bash
pip install "acr-sdk[langchain]"
```

Or from this monorepo (until PyPI publish):

```bash
pip install -e packages/sdk-python
pip install -e packages/integrations/langchain
```

## Quick start — one call

```python
from acr import can, method
from acr_langchain import protect

tools = protect(
    [search_web, scrape_webpage, fill_form],
    agent_id="my_agent",
    policy=can("http.request").where(method.in_(["GET", "POST"])).limit(50),
)
# Use `tools` in your AgentExecutor as usual.
```

That's it. No server needed: `protect()` uses an **embedded in-process runtime** by default. Denied calls return text like `Blocked by Agent Capability Runtime: ...` to the agent instead of executing.

### Backend selection

`protect()` picks the backend automatically:

| Condition | Backend |
|-----------|---------|
| `client=` argument | Whatever you pass (`AcrClient` / `LocalAcrClient`) |
| `base_url=` argument or `ACR_GATEWAY_URL` env | HTTP gateway |
| otherwise | Embedded `LocalAcrClient` — zero infra |

Graduate to the gateway (central audit, human approvals, revocation across processes) by setting one env var — no code change:

```bash
export ACR_GATEWAY_URL=http://localhost:3000   # pnpm dev:gateway
```

### Per-tool policies

```python
tools = protect(
    [fetch_page, send_mail],
    agent_id="my_agent",
    policies={
        "fetch_page": can("http.request").where(url.in_(["api.example.com"])),
        "send_mail": can("gmail.send").only_domain("company.com").limit(5),
    },
)
```

### Payload inference

Tool kwargs are mapped to the policy payload automatically (`url` implies `method=GET`, etc.). Pass `payload_builders={"tool_name": fn}` for custom mappings.

## Lower-level API (full control)

The original building blocks remain available:

```python
from acr_langchain import CapabilityGuard, create_guard, wrap_tool, wrap_tools, guarded_tool
from acr import AcrClient, LocalAcrClient

guard = CapabilityGuard(LocalAcrClient(), agent_id="my_agent")   # or AcrClient(...)
guard.ensure("http.request", can("http.request").limit(20))

guarded = wrap_tool(
    my_tool,
    guard=guard,
    acr_tool="http.request",
    payload_builder=lambda kw: {"url": kw["url"], "method": "GET"},
    simulate=False,        # local backend: real execute (consumes limit())
    on_deny="raise",       # or "return" (default)
)
```

## Simulate semantics

| Backend | `protect()` default | Why |
|---------|--------------------|-----|
| Embedded | `simulate=False` | ALLOW counts + audits locally; `limit()` is enforced |
| Gateway | `simulate=True` | Policy-only check — your local function performs the work |

Override with `simulate=` if you need different behavior.

## API summary

| Symbol | Description |
|--------|-------------|
| `protect()` | One-call: pick backend, grant, wrap all tools |
| `create_guard()` | Factory for gateway-backed `CapabilityGuard` |
| `CapabilityGuard` | Grant + cache capability tokens (any backend) |
| `wrap_tool()` / `wrap_tools()` | Wrap existing LangChain tools |
| `guarded_tool()` | Decorator for new tools |
| `AcrToolDeniedError` | Raised when `on_deny="raise"` |

## Examples in this repo

- [packages/sdk-python/examples/quickstart.py](../../sdk-python/examples/quickstart.py)
- [packages/sdk-python/examples/demo_wow.py](../../sdk-python/examples/demo_wow.py) — deny / approval / revoke (no gateway)

## License

MIT
