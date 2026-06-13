# MCP integration

ACR can govern **Model Context Protocol (MCP)** tool calls — the main gap vs MCP-only gateways (Sentinel, AgentWard, Datacline).

## What you get

| Feature | Description |
|---------|-------------|
| **Per-tool policies** | Map each MCP tool name → ACR `can()` policy |
| **Default deny** | Unlisted MCP tools blocked (`default_action: deny`) |
| **Explicit deny** | `delete_file: { deny: true }` |
| **Shadow mode** | Evaluate + audit without blocking (rollout) |
| **Tool scanner** | Detect poisoning / injection / typosquatting in tool descriptions |
| **Proxy relay** | `AcrMcpProxy` scans on connect + enforces on every call |
| **Embedded or gateway** | Same as rest of ACR — zero infra or `ACR_GATEWAY_URL` |
| **Capability model** | JWT limits, URL allowlists, approvals — not just RBAC |

## Architecture

```
Agent (Claude, Cursor, custom)
    │
    ▼
McpToolGuard.check / call_tool   ← acr-mcp (this layer)
    │
    ▼
MCP Server (filesystem, github, …)
```

Pair with **Query Scope Guard** (pre-LLM) and **LangChain protect()** for full stack.

## Python

```bash
pip install -e packages/sdk-python
pip install -e packages/integrations/mcp
```

```python
from acr_mcp import protect_mcp_tools

guard = protect_mcp_tools(path="policies/mcp-policies.yaml")

if refusal := guard.check_or_refuse("delete_file", {"path": "/etc/passwd"}):
    return refusal

await guard.call_tool(session, "read_file", {"path": "/safe.txt"})
```

### Policy file

```yaml
version: 1
agent_id: my_agent
mode: enforce          # enforce | shadow | disabled
default_action: deny

tools:
  read_file:
    acr_tool: http.request
    methods: [GET]
    max_actions: 100
  delete_file:
    deny: true
```

Example: [packages/integrations/mcp/examples/mcp-policies.yaml](../packages/integrations/mcp/examples/mcp-policies.yaml)

### Tool-poisoning scanner

```python
from acr_mcp import McpToolScanner

scanner = McpToolScanner(trusted_tools=["read_file", "write_file"])
report = scanner.scan_tools(tools)        # output of session.list_tools()
if not report.is_safe:
    print("Blocked:", report.blocked_tools)
```

Catches instruction injection ("ignore previous instructions"), concealment
("do not tell the user"), invisible/bidirectional unicode, hidden HTML comments,
secret-exfiltration hints (`~/.ssh`, `.env`), and typosquatting of trusted names.

### Proxy relay (scan + enforce)

```python
from acr_mcp import AcrMcpProxy

proxy = AcrMcpProxy.from_policies(path="policies/mcp-policies.yaml")
await proxy.connect(session)              # list + scan upstream tools
await proxy.call_tool(session, "read_file", {"path": "/safe.txt"})
```

`AcrMcpProxy` raises `McpToolScanBlocked` for poisoned tools and
`McpToolDeniedError` for policy violations, wrapping any `list_tools()` /
`call_tool()` session (real `mcp.ClientSession` or a test fake).

### Standalone proxy server

```bash
pip install -e "packages/integrations/mcp[proxy]"

acr-mcp-proxy --policies policies/mcp-policies.yaml -- \
    npx -y @modelcontextprotocol/server-filesystem /data
```

Runs an stdio MCP server in front of an upstream server: scanner-blocked tools
are hidden from `tools/list`, and denied/poisoned calls return an error result
to the agent. Point Claude Desktop / Cursor at `acr-mcp-proxy`.

## TypeScript

```typescript
import { McpToolGuard } from "@acr/sdk";

const guard = McpToolGuard.fromConfig({
  agent_id: "my_agent",
  mode: "enforce",
  default_action: "deny",
  tools: {
    read_file: { acr_tool: "http.request", methods: ["GET"], max_actions: 100 },
    delete_file: { deny: true },
  },
});
await guard.init();

const refusal = await guard.checkOrRefuse("delete_file", { path: "/etc/passwd" });
```

## Shadow mode rollout

1. **`mode: shadow`** — log policy decisions, still execute MCP calls
2. Fix policies from audit
3. **`mode: enforce`** — block violations

Matches enterprise **observe → enforce** patterns (StrongDM, AGT).

## vs MCP-only gateways

| | MCP gateway (RBAC) | **ACR MCP guard** |
|--|-------------------|-------------------|
| Auth model | API key / JWT roles | **Capability JWT** per tool |
| Per-call limits | Rate limits | **max_actions**, spend, domain |
| Human approval | Rare | **Built-in** |
| Revoke mid-session | Kill switch | **Per `jti`** |
| Pre-LLM scope | No | **QueryScopeGuard** (separate) |

`AcrMcpProxy` provides the in-process **scan + enforce relay**, and
`acr-mcp-proxy` runs it as a **standalone stdio server** in front of any upstream
MCP server. An HTTP/SSE transport and multi-tenant UI are still on the roadmap.

## Roadmap

- [x] MCP tool description scanner (poisoning detection) — `McpToolScanner`
- [x] In-process scan + enforce proxy — `AcrMcpProxy`
- [x] Standalone stdio proxy process — `acr-mcp-proxy`
- [ ] HTTP/SSE proxy transport + multi-tenant UI
- [ ] Go `McpToolGuard`

## Related

- [query-scope-guard.md](./query-scope-guard.md)
- [plug-and-play.md](./plug-and-play.md)
- [use-cases.md](./use-cases.md) — MCP section
