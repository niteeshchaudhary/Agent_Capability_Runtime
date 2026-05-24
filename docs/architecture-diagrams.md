# Architecture diagrams

Visual reference for runtime flow, delegation, interception, and approvals.

## Runtime execute flow

```mermaid
sequenceDiagram
  participant Agent
  participant Gateway as ACR Gateway
  participant Policy as Policy Engine
  participant Sandbox
  participant Adapter as Tool Adapter
  participant Audit

  Agent->>Gateway: POST /runtime/execute (token, tool, payload)
  Gateway->>Gateway: validate JWT + revocation
  Gateway->>Policy: evaluate constraints
  alt DENY
    Policy-->>Gateway: DENY + reason
    Gateway->>Audit: record DENY
    Gateway-->>Agent: denied
  else REQUIRE_APPROVAL
    Policy-->>Gateway: REQUIRE_APPROVAL
    Gateway->>Audit: record pending
    Gateway-->>Agent: approvalId
  else ALLOW
    Policy-->>Gateway: ALLOW
    Gateway->>Sandbox: timeout + network guard
    Sandbox->>Adapter: execute(payload)
    Adapter-->>Gateway: result
    Gateway->>Audit: record ALLOW
    Gateway-->>Agent: success
  end
```

## Capability grant vs execute

```
  GRANT (admin)                         EXECUTE (agent)
       │                                      │
       ▼                                      ▼
  ┌─────────┐    signed JWT            ┌──────────────┐
  │ Issuer  │ ───────────────────────► │   Runtime    │
  │         │   tool + constraints     │  validates   │
  └─────────┘   max_actions, domains   │  + policy    │
                                         │  + sandbox   │
                                         └──────┬───────┘
                                                │
                    ┌───────────────────────────┼───────────────────────────┐
                    ▼                           ▼                           ▼
                 ALLOW                      DENY                   REQUIRE_APPROVAL
              (adapter runs)            (blocked + audit)         (human approves, retry)
```

## Delegation chain

```mermaid
flowchart LR
  Human["Human / Admin"]
  Planner["Planner agent"]
  Executor["Executor agent"]
  Runtime["ACR Runtime"]

  Human -->|grant| Planner
  Planner -->|delegate narrower constraints| Executor
  Executor -->|execute| Runtime
  Runtime -->|subset check| Executor

  subgraph token["JWT lineage"]
    JTI0["jti: cap_root"]
    JTI1["jti: cap_child\nparent_jti → root"]
  end
```

Child tokens **cannot exceed** parent constraints (domain subset, lower `maxActions`, etc.).

## Approval workflow

```mermaid
stateDiagram-v2
  [*] --> PolicyEval: execute
  PolicyEval --> Paused: REQUIRE_APPROVAL
  PolicyEval --> Running: ALLOW
  Paused --> Approved: human approves
  Paused --> Rejected: human rejects
  Approved --> Running: retry with approvalId
  Running --> [*]: adapter success
  PolicyEval --> [*]: DENY
```

## Revocation (multi-instance)

```
  Admin ──POST /capabilities/revoke──► Revocation store
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    │  memory (default)  OR  Redis (ACR_REVOCATION_MODE) │
                    └─────────────────────────┬─────────────────────────┘
                                              │
  Agent execute ──► isRevoked(jti)? ──yes──► DENY token_revoked
```

## Related docs

- [RFC-0002 Runtime Execution](./rfc/RFC-0002-runtime-execution.md)
- [execution-state-machine.md](./execution-state-machine.md)
- [CONCEPTS.md](./CONCEPTS.md)
