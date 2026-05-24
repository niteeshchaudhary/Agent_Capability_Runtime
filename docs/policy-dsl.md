# Policy DSL

Fluent API for defining capability constraints. Compiles to the same [policy AST](./policy-ast.md) as raw `ConstraintSet` objects.

```ts
import { can, domain } from "@acr/policy-engine";

const constraints = can("gmail.send")
  .where(domain.in(["company.com"]))
  .limit(5)
  .noAttachments()
  .build();

await runtime.grant({ agentId: "agent_1", tool: "gmail.send", constraints });
```

Or build grant input directly:

```ts
const grantInput = can("gmail.send")
  .where(domain.in(["company.com"]))
  .limit(5)
  .toGrantInput({ agentId: "agent_1", expiresIn: "15m" });

await runtime.grant(grantInput);
```

## API

### `can(tool)`

Starts a builder for `gmail.send`, `slack.send`, or `http.request`.

### `.where(...predicates)`

| Helper | Tool | Maps to |
|--------|------|---------|
| `domain.in(["a.com"])` | `gmail.send` | `allowedDomains` |
| `method.in(["GET"])` | `http.request` | `allowedMethods` |
| `url.in(["api.co.com"])` | `http.request` | `allowedUrls` |
| `hours.between(9, 17)` | all | `allowedHours` |

### Chain methods

| Method | Constraint |
|--------|------------|
| `.limit(n)` / `.maxActions(n)` | `maxActions` |
| `.allowedHours(start, end)` | `allowedHours` |
| `.requireApproval()` | `approvalRequired` |
| `.requireApprovalIfExternal()` | `approvalRequiredIfExternal` |
| `.noAttachments()` | `attachments: false` |
| `.spendingLimit(n)` | `spendingLimit` |
| `.with({ ... })` | merge raw constraints |

### Output

| Method | Returns |
|--------|---------|
| `.build()` | `ConstraintSet` |
| `.compile()` | `PolicyDocument` (AST) |
| `.toGrantInput({ agentId, ... })` | `GrantCapabilityInput` |

## Examples

### Gmail — company only, cap sends

```ts
import { can, domain } from "@acr/policy-engine";

can("gmail.send")
  .where(domain.in(["company.com", "subsidiary.com"]))
  .limit(10)
  .noAttachments();
```

### Gmail — external needs approval

```ts
can("gmail.send")
  .where(domain.in(["company.com"]))
  .requireApprovalIfExternal()
  .limit(5);
```

### HTTP — read-only internal

```ts
import { can, method, url } from "@acr/policy-engine";

can("http.request")
  .where(method.in(["GET"]))
  .where(url.in(["api.company.com"]))
  .limit(100);
```

### Simulate before grant

```ts
import { evaluatePolicyAst } from "@acr/policy-engine";

const doc = can("gmail.send").where(domain.in(["company.com"])).compile();

const dryRun = evaluatePolicyAst(doc, {
  tool: "gmail.send",
  payload: { to: "user@company.com", subject: "Test" },
  simulate: true,
});
// dryRun.decision === "SIMULATE"
```

## Relationship to RFCs

- Constraints encode into tokens per [RFC-0001](./rfc/RFC-0001-capability-token.md)
- Evaluation semantics per [RFC-0002](./rfc/RFC-0002-runtime-execution.md)
- DSL is syntactic sugar over `compilePolicy()` — not a separate protocol version
