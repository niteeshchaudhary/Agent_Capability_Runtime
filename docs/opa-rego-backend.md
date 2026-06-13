# OPA / Rego policy backend

ACR ships a built-in constraint engine (`can()` DSL → policy AST). For teams that
already standardize on **[Open Policy Agent (OPA)](https://www.openpolicyagent.org/)**
and **Rego**, ACR can call an external policy layer at **execute** time — additive
on top of JWT constraints, approvals, and revocation.

## Architecture

```
Grant (JWT constraints)  →  built-in AST evaluation  →  OPA/Rego (optional)  →  adapter
```

OPA runs **after** the built-in engine passes `DENY` / `REQUIRE_APPROVAL` from JWT
rules. OPA can further **deny**, **require approval**, or **allow**. It cannot
override a JWT deny.

Modes:

| Mode | Behavior |
|------|----------|
| `enforce` | OPA `DENY` / `REQUIRE_APPROVAL` blocks execution |
| `shadow` | OPA decisions are evaluated but execution continues (rollout) |
| `disabled` | OPA skipped |

## Rego contract

Policies should expose **`data.acr.decision`** (configurable via `ACR_OPA_DECISION_PATH`):

```rego
package acr

import rego.v1

default decision := {"decision": "ALLOW"}

decision := {"decision": "DENY", "reason": "blocked"} if {
  input.tool == "gmail.send"
  endswith(input.payload.to, "@blocked.example")
}
```

### Input document

OPA receives:

```json
{
  "input": {
    "agentId": "agent_123",
    "tool": "gmail.send",
    "payload": { "to": "user@company.com" },
    "constraints": { "maxActions": 10 },
    "actionCount": 3,
    "approvalGranted": false,
    "simulate": false,
    "jti": "cap_abc",
    "task": "support",
    "policyVersionId": "pv_..."
  }
}
```

### Output shapes (parsed)

- `{ "decision": "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | "SIMULATE", "reason": "..." }`
- `{ "allow": true }` / `{ "allow": false, "reason": "..." }`

Example bundle: [`packages/policy-engine/examples/opa/acr.rego`](../packages/policy-engine/examples/opa/acr.rego)

## Gateway configuration

```bash
# OPA HTTP server (recommended for production)
export ACR_OPA_URL=http://127.0.0.1:8181
export ACR_OPA_MODE=enforce          # enforce | shadow | disabled
export ACR_OPA_DECISION_PATH=acr/decision
export ACR_OPA_TIMEOUT_MS=3000

# Or local bundle via opa CLI (Node runtime / gateway on same host)
export ACR_OPA_BUNDLE_PATH=packages/policy-engine/examples/opa/acr.rego
```

Run OPA locally:

```bash
opa run --server packages/policy-engine/examples/opa/
curl -s -X POST http://127.0.0.1:8181/v1/data/acr/decision \
  -H 'content-type: application/json' \
  -d '{"input":{"tool":"gmail.send","payload":{"to":"x@blocked.example"},"actionCount":0,"approvalGranted":false,"simulate":false,"constraints":{}}}'
```

## TypeScript / Node SDK

```typescript
import { OpaPolicyBackend, buildOpaInput } from "@acr/policy-engine/opa";

const opa = new OpaPolicyBackend({
  url: "http://127.0.0.1:8181",
  mode: "enforce",
});

const result = await opa.evaluate(
  buildOpaInput({
    agentId: "agent_1",
    tool: "gmail.send",
    payload: { to: "x@co.com" },
    constraints: { maxActions: 5 },
    actionCount: 0,
    approvalGranted: false,
    simulate: false,
  }),
);
```

Embedded runtime (`AgentCapabilityRuntime`) accepts `opa` in `RuntimeConfig` — the
gateway loads it from env via `loadOpaConfigFromEnv()`.

## Python embedded client

`LocalAcrClient` reads the same `ACR_OPA_*` env vars and calls the OPA HTTP API
after built-in constraint checks.

```python
import os
os.environ["ACR_OPA_URL"] = "http://127.0.0.1:8181"
os.environ["ACR_OPA_MODE"] = "enforce"

from acr import LocalAcrClient, can
client = LocalAcrClient()
```

## Related

- [policy-evaluation-semantics.md](./policy-evaluation-semantics.md)
- [policy-constraints.md](./policy-constraints.md)
- [mcp-integration.md](./mcp-integration.md) — MCP guard shadow mode (similar rollout pattern)
