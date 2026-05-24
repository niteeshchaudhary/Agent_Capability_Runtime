# Policy Constraints (v1)

> **Normative:** [RFC-0001 §6](./rfc/RFC-0001-capability-token.md) (encoding), [RFC-0002 §5](./rfc/RFC-0002-runtime-execution.md) (evaluation)

Constraints are the **core authorization primitive** in ACR.

## ConstraintSet schema

TypeScript (SDK) uses **camelCase**. JWT payloads use **snake_case** (see mapping table).

```ts
interface ConstraintSet {
  allowedDomains?: string[];
  maxActions?: number;
  allowedMethods?: string[];
  allowedUrls?: string[];
  attachments?: boolean;
  spendingLimit?: number;
  allowedHours?: { start: number; end: number }; // 0–23 UTC
  approvalRequired?: boolean;
  approvalRequiredIfExternal?: boolean;
}
```

## Supported constraints (v1)

| Constraint (TS) | JWT claim key | Type | Applies to | Description |
|-----------------|---------------|------|------------|-------------|
| `allowedDomains` | `allowed_domains` | string[] | `gmail.send` | Email recipient domain allowlist |
| `maxActions` | `max_actions` | number | all | Max successful executions per token |
| `allowedMethods` | `allowed_methods` | string[] | `http.request` | HTTP verbs (GET, POST, …) |
| `allowedUrls` | `allowed_urls` | string[] | `http.request` | Host or URL prefix allowlist |
| `attachments` | `attachments` | boolean | `gmail.send` | Allow email attachments |
| `spendingLimit` | `spending_limit` | number | future | Max monetary amount (USD cents) |
| `allowedHours` | `allowed_hours` | `{start,end}` | all | UTC hour window |
| `approvalRequired` | `approval_required` | boolean | all | Always require human approval |
| `approvalRequiredIfExternal` | `approval_required_if_external` | boolean | `gmail.send` | Approval if recipient outside allowlist |

## Evaluation order (runtime gateway)

1. Token valid and not expired
2. Tool in request matches token `tool`
3. Tool-specific constraints (domains, URLs, methods, attachments)
4. Global constraints (`maxActions`, `allowedHours`)
5. Approval triggers (`approvalRequired`, `approvalRequiredIfExternal`)

First failing check → `DENY` or `REQUIRE_APPROVAL`.

## Examples

### Gmail — company domain only

```json
{
  "tool": "gmail.send",
  "constraints": {
    "allowed_domains": ["company.com"],
    "max_actions": 5,
    "attachments": false
  }
}
```

**Allow:** `to: john@company.com`  
**Deny:** `to: john@gmail.com`  
**Deny:** payload includes attachment when `attachments: false`

### HTTP — read-only internal APIs

```json
{
  "tool": "http.request",
  "constraints": {
    "allowed_methods": ["GET"],
    "allowed_urls": ["api.company.com"],
    "max_actions": 100
  }
}
```

**Allow:** `GET https://api.company.com/v1/users`  
**Deny:** `POST https://api.company.com/v1/users`  
**Deny:** `GET https://evil.com`

### Slack — rate limited messaging

```json
{
  "tool": "slack.send",
  "constraints": {
    "max_actions": 10,
    "allowed_hours": { "start": 9, "end": 17 }
  }
}
```

## Action counting

`maxActions` is enforced by the runtime using token `jti` as the counter key (in-memory for v1; Redis/DB in Phase 2). When count ≥ `maxActions`, decision is `DENY` with reason `max_actions exceeded`.

## Future constraints (not in v1)

- `allowed_channels` (Slack)
- `spending_limit` with currency
- `require_mfa` step-up
- `data_classification` tags
- OPA/Rego policy references

## Package ownership

| Package | Responsibility |
|---------|----------------|
| `@acr/capability-token` | Schema, JWT encode/decode, grant/validate |
| `@acr/policy-engine` | Constraint evaluation against payloads |
| `@acr/runtime` | Orchestration, action counting, audit (Days 4–7) |
