# Intent-aware policy rules

ACR separates **what tool runs** from **why it runs**. The same API (`gmail.send`) can be allowed for customer support replies and denied for bulk marketing when intent differs.

## Execution intent

At grant (optional) and execute (required when policy constrains intent):

```json
{
  "category": "customer_support",
  "action": "reply_email"
}
```

- `category` — semantic bucket (e.g. `customer_support`, `marketing`)
- `action` — optional finer label (e.g. `reply_email`, `bulk_campaign`)

String shorthand is supported: `"customer_support"` normalizes to `{ "category": "customer_support" }`.

## Policy constraints

On the capability token:

| Constraint | Meaning |
|------------|---------|
| `allowedIntentCategories` | Execute-time `intent.category` must be one of these |
| `allowedIntentActions` | Execute-time `intent.action` must be one of these (action required) |

Compiled AST conditions: `intent_category`, `intent_action`.

## DSL

```typescript
import { can } from "@acr/policy-engine";

can("gmail.send")
  .whenIntent("customer_support")
  .whenIntentAction("customer_support", "reply_email")
  .where(domain.in(["company.com"]))
  .limit(5)
  .compile();
```

## Runtime behavior

1. Grant may attach default intent in token `metadata.intent`.
2. Execute may pass `intent` (object or string); it overrides metadata for policy evaluation.
3. Policy evaluates intent **before** adapter execution (same phase as domain/method limits).
4. Audit records `intentCategory`, `intentAction`, and a composite `intent` label.

## Example

**Allowed:** `gmail.send` with intent `{ category: "customer_support", action: "reply_email" }` and policy `.whenIntent("customer_support")`.

**Denied:** Same tool with `{ category: "marketing", action: "bulk_campaign" }` — `DENY` with reason referencing intent category.

## Related

- [CONCEPTS.md](./CONCEPTS.md) — identity vs capability vs session vs intent
- [policy-evaluation-semantics.md](./policy-evaluation-semantics.md)
- RFC-0002 Policy Engine (stable); intent fields extend constraint sets without breaking existing tokens
