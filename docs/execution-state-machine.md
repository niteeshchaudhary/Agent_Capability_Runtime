# Execution state machine

Formal lifecycle phases for runtime execute (gap-fix2 §9).

## Phases

| Phase | When set |
|-------|----------|
| `PENDING` | Reserved — initial client state before request |
| `VALIDATING` | Reserved — token validation in progress |
| `APPROVAL_REQUIRED` | Policy returned `REQUIRE_APPROVAL` |
| `APPROVED` | Execute resumed with valid `approvalId` |
| `EXECUTING` | Consumption reserved; adapter invoked |
| `COMPLETED` | Successful ALLOW or idempotent replay |
| `DENIED` | Policy or consumption denied |
| `FAILED` | Adapter threw after consumption reserved |
| `REVOKED` | Capability `jti` on revocation list |
| `EXPIRED` | Token past `exp` (validation failure) |
| `SIMULATED` | Policy dry-run (`simulate: true`) |

## Typical transitions

```text
execute → VALIDATING → (policy) → APPROVAL_REQUIRED → [human] → APPROVED → EXECUTING → COMPLETED
                              └→ DENIED
                              └→ SIMULATED
                              └→ EXECUTING → FAILED
execute → REVOKED (if jti revoked)
validate fail → EXPIRED / DENIED
```

## API surface

- `ExecuteResult.executionPhase` — terminal or significant phase for this response.
- `AuditEvent.executionPhase` — persisted on every audit record.
- `ExecutionSession.lastPhase` — updated when `sessionId` provided on execute.

## Session store

When `sessionId` is set on execute:

```ts
runtime.sessions.get(sessionId);
// { actionCount, lastPhase, approvalIds, traceId, jti, ... }
```

Use for long-running agents and multi-step plans.

## Related

- [RFC-0002](./rfc/RFC-0002-runtime-execution.md)
- [CONCEPTS.md](./CONCEPTS.md)
