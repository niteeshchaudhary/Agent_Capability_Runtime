# Policy evaluation semantics

Deterministic rules for `@acr/policy-engine` (gap-fix2 §4). Normative companion to [RFC-0002 §5](./rfc/RFC-0002-runtime-execution.md).

## Model

Policies compile to a root **`AND`** node of condition leaves. Evaluation is **short-circuit**: the first leaf that does not yield `ALLOW` stops evaluation and returns that decision.

There is **no** `OR` precedence in v1 compiled policies.

## Decision precedence (first match wins)

When a leaf fails, it returns exactly one of:

| Leaf outcome | Runtime decision |
|--------------|------------------|
| Constraint violated (hard) | `DENY` |
| Approval required | `REQUIRE_APPROVAL` |
| All leaves pass | `ALLOW` (or `SIMULATE` if `simulate: true`) |

`DENY` and `REQUIRE_APPROVAL` **both** halt the AND chain. Neither overrides the other globally — **compile order** determines which fires first when multiple could apply.

## Compile order (v1)

Fixed order from `compilePolicy()`:

1. `allowed_hours`
2. `max_actions` (policy pre-check; consumption ledger enforces again at execute)
3. `approval_required`
4. `approval_required_if_external` (gmail + domains)
5. Tool-specific hard rules:
   - `gmail_allowed_domains`
   - `gmail_attachments`
   - `http_method`
   - `http_url`

### Example

Token with `approvalRequired: true` and external recipient:

- If `approval_required` is compiled **before** domain check → `REQUIRE_APPROVAL` first.
- Domain deny never reached until approval granted and execute retried.

## Approval interaction

When `approvalGranted: true` on execute (valid `approvalId`):

- `approval_required` leaves pass.
- `approval_required_if_external` passes for external domains.
- `gmail_allowed_domains` **may still pass** if `approvalGranted` (external send allowed after approval).

## Simulation

If `simulate: true` and all leaves would `ALLOW` → `SIMULATE` (no adapter, no consumption).

If any leaf would `DENY` or `REQUIRE_APPROVAL` → that decision is returned (not `SIMULATE`).

## Policy versioning

Each grant registers an immutable `policy_version_id` (hash of compiled AST). Execute loads the registered document for audit replay consistency.

## Invariants

1. Same `(tool, constraints, payload, context)` → same decision.
2. Evaluation does not mutate state (except runtime consumption after ALLOW).
3. Unknown constraint keys in JWT are ignored at compile time if absent from schema.
