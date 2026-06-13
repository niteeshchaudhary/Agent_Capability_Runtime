# ACR MCP integration

**Govern MCP tool calls with Agent Capability Runtime** — capability tokens, limits, URL allowlists, shadow mode, and audit at the MCP boundary.

Closes the gap vs MCP-only gateways (Sentinel, AgentWard) while keeping ACR's **capability JWT + approval + revoke** model.

## Install

```bash
pip install -e packages/sdk-python
pip install -e packages/integrations/mcp
```

## Quick start

### 1. Define policies (`policies/mcp-policies.yaml`)

See [examples/mcp-policies.yaml](./examples/mcp-policies.yaml).

```yaml
version: 1
agent_id: my_agent
mode: enforce        # enforce | shadow | disabled
default_action: deny

tools:
  read_file:
    acr_tool: http.request
    methods: [GET]
    max_actions: 100
  delete_file:
    deny: true
```

### 2. Wrap MCP `call_tool`

```python
from acr_mcp import protect_mcp_tools

guard = protect_mcp_tools(path="policies/mcp-policies.yaml")

# Before forwarding to MCP server:
refusal = guard.check_or_refuse("delete_file", {"path": "/etc/passwd"})
if refusal:
    return refusal

result = await guard.call_tool(mcp_session, "read_file", {"path": "/safe/file.txt"})
```

### 3. Shadow mode (observe without blocking)

```yaml
mode: shadow
```

Policy is evaluated and audited, but the MCP call still runs — use for rollout (StrongDM-style **observe → enforce**).

## TypeScript

Use the same policy shape with `@acr/sdk`:

```typescript
import { McpToolGuard } from "@acr/sdk";

const guard = McpToolGuard.fromConfig({ /* same fields as YAML */ });
const refusal = guard.checkOrRefuse("delete_file", { path: "/etc/passwd" });
```

## How it fits

| Layer | Package |
|-------|---------|
| Pre-LLM topic filter | `acr.scope.QueryScopeGuard` |
| MCP tool boundary | **`acr-mcp`** (this package) |
| LangChain tools | `acr-langchain protect()` |
| Production gateway | `apps/gateway` + `ACR_GATEWAY_URL` |

## Related

- [docs/mcp-integration.md](../../docs/mcp-integration.md)
- [docs/query-scope-guard.md](../../docs/query-scope-guard.md)
- [docs/plug-and-play.md](../../docs/plug-and-play.md)
