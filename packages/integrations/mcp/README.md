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

## Tool-poisoning scanner

MCP servers advertise tools with free-text descriptions an agent reads into its
prompt — a supply-chain risk. `McpToolScanner` statically inspects tool
definitions for prompt injection, hidden/invisible unicode, secret-exfiltration
hints, and **typosquatting** of trusted tool names.

```python
from acr_mcp import McpToolScanner, Severity

scanner = McpToolScanner(trusted_tools=["read_file", "write_file"])
report = scanner.scan_tools(tools)   # tools = list_tools() result

if not report.is_safe:
    print("Blocked:", report.blocked_tools)
    for r in report.reports:
        for f in r.findings:
            print(r.tool_name, f.severity.value, f.code, "—", f.message)
```

| Detection | Example | Severity |
|-----------|---------|----------|
| Instruction injection | "ignore all previous instructions" | critical |
| Conceal from user | "do not tell the user" | critical |
| Invisible unicode | bidi/zero-width chars in description | high |
| Hidden comment | `<!-- exfiltrate .env -->` | medium |
| Exfiltration hint | `~/.ssh`, `.env`, `id_rsa` | high |
| Typosquatting | `read_flie` ≈ `read_file` | high |

## MCP proxy (scan + enforce relay)

`AcrMcpProxy` wraps an upstream MCP session: it **scans** tools on connect and
**enforces** the capability policy on every call — the "MCP proxy" pattern on
top of ACR.

```python
from acr_mcp import AcrMcpProxy

proxy = AcrMcpProxy.from_policies(path="policies/mcp-policies.yaml")

await proxy.connect(session)              # list + scan upstream tools
result = await proxy.call_tool(session, "read_file", {"path": "/safe.txt"})
# raises McpToolScanBlocked if poisoned, McpToolDeniedError if policy denies
```

Any object exposing `list_tools()` / `call_tool(name, arguments)` works
(`mcp.ClientSession` in production, a fake in tests).

## Standalone proxy server

Run the proxy as its own stdio MCP server in front of any upstream MCP server —
agents connect to the proxy and policy + scanning apply transparently.

```bash
pip install -e "packages/integrations/mcp[proxy]"   # adds the `mcp` runtime

acr-mcp-proxy --policies policies/mcp-policies.yaml -- \
    npx -y @modelcontextprotocol/server-filesystem /data
```

Point your MCP client (Claude Desktop, Cursor, …) at `acr-mcp-proxy` instead of
the raw server. Scanner-blocked tools are hidden from `tools/list`; policy
denials and poisoned calls return an error result to the agent.

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
