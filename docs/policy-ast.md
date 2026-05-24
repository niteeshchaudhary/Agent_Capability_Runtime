# Policy AST (normalized policy model)

> **Normative evaluation:** [RFC-0002 §5.3](./rfc/RFC-0002-runtime-execution.md)

ACR compiles constraint objects into a **normalized policy AST** before evaluation.

## Why an AST?

| Problem (object-only constraints) | AST approach |
|-----------------------------------|--------------|
| Evaluation order implicit | Explicit `AND` tree |
| Hard to simulate / explain | `evaluatedConditions` per leaf |
| Enterprise DSL later | Compile DSL → same AST |

## Structure

```json
{
  "tool": "gmail.send",
  "root": {
    "operator": "AND",
    "conditions": [
      { "kind": "max_actions", "params": { "limit": 5 } },
      { "kind": "gmail_allowed_domains", "params": { "domains": ["company.com"] } }
    ]
  },
  "source": { "allowedDomains": ["company.com"], "maxActions": 5 }
}
```

### Condition kinds (v1)

| Kind | Maps from |
|------|-----------|
| `allowed_hours` | `allowedHours` |
| `max_actions` | `maxActions` |
| `approval_required` | `approvalRequired` |
| `approval_required_if_external` | `approvalRequiredIfExternal` + `allowedDomains` |
| `gmail_allowed_domains` | `allowedDomains` (hard deny) |
| `gmail_attachments` | `attachments: false` |
| `http_method` | `allowedMethods` |
| `http_url` | `allowedUrls` |

## API

```ts
import { compilePolicy, evaluatePolicy, evaluatePolicyAst } from "@acr/policy-engine";

const doc = compilePolicy("gmail.send", {
  allowedDomains: ["company.com"],
  maxActions: 5,
});

const result = evaluatePolicyAst(doc, {
  tool: "gmail.send",
  payload: { to: "user@company.com", subject: "Hi" },
  actionCount: 0,
  simulate: true, // → decision SIMULATE if would allow
});
```

`evaluatePolicy()` compiles internally — existing code paths unchanged.

## Runtime decisions (v1)

| Decision | Meaning |
|----------|---------|
| `ALLOW` | Execute adapter |
| `DENY` | Block |
| `REQUIRE_APPROVAL` | Pause for human |
| `SIMULATE` | Policy check only (`simulate: true`) |
| `REDACT`, `SANDBOX`, `LIMIT`, `ESCALATE` | Reserved for future versions |

## Policy DSL

Implemented in `@acr/policy-engine` — see [policy-dsl.md](./policy-dsl.md).

```ts
import { can, domain } from "@acr/policy-engine";

const doc = can("gmail.send")
  .where(domain.in(["company.com"]))
  .limit(5)
  .compile();
```

Compiles to the same AST documented here.
