# Audit and approvals (Week 3)

> **Normative:** [RFC-0002: Runtime Execution](./rfc/RFC-0002-runtime-execution.md) (approvals), [RFC-0003: Audit Lineage](./rfc/RFC-0003-audit-lineage.md) (events)

Persistent audit logging and human-in-the-loop approval workflows.

## Audit storage

By default the runtime uses an in-memory audit log. For persistence across restarts, set:

```bash
ACR_AUDIT_PATH=./data/audit.jsonl
```

Events are appended as JSON Lines (one JSON object per line). Query via:

```http
GET /audit?agentId=agent_1&decision=DENY&limit=50
```

| Query param | Description |
|-------------|-------------|
| `agentId` | Filter by agent |
| `tool` | Filter by tool id |
| `decision` | `ALLOW`, `DENY`, `REQUIRE_APPROVAL`, or `SIMULATE` |
| `since` | ISO timestamp lower bound |
| `until` | ISO timestamp upper bound |
| `limit` | Max events (most recent when set) |

## Approval workflow

When policy evaluation returns `REQUIRE_APPROVAL` (e.g. `approvalRequired` or `approvalRequiredIfExternal`), execution pauses and an approval record is created.

### 1. Execute (paused)

```http
POST /runtime/execute
```

```json
{
  "token": "...",
  "tool": "gmail.send",
  "payload": { "to": "external@gmail.com", "subject": "Hi" }
}
```

Response `202`:

```json
{
  "decision": "REQUIRE_APPROVAL",
  "approvalId": "appr_...",
  "reason": "external domain requires approval: gmail.com",
  "auditId": "aud_..."
}
```

### 2. List pending approvals

```http
GET /approvals?status=pending
```

### 3. Approve or reject

```http
POST /approvals/appr_.../approve
Content-Type: application/json

{ "resolvedBy": "user_42" }
```

```http
POST /approvals/appr_.../reject
```

### 4. Resume execution

Re-submit the **same** token, tool, and payload with the approved `approvalId`:

```http
POST /runtime/execute
```

```json
{
  "token": "...",
  "tool": "gmail.send",
  "payload": { "to": "external@gmail.com", "subject": "Hi" },
  "approvalId": "appr_..."
}
```

The runtime verifies the approval is `approved` and matches the request before executing.

## Approval hooks

Register a callback when running in-process:

```ts
const runtime = new AgentCapabilityRuntime({
  secret: process.env.ACR_SIGNING_SECRET!,
  onApprovalRequired: async (request) => {
    console.log("Approval needed:", request.id, request.reason);
    // notify Slack, email, dashboard, etc.
  },
});
```

## Persistent approvals

```bash
ACR_APPROVAL_PATH=./data/approvals.json
```

Approvals are stored as a JSON array and survive gateway restarts.

## SDK

```ts
import { AcrClient } from "@acr/sdk";

const client = new AcrClient({ baseUrl: "http://localhost:3000" });

const pending = await client.execute({ token, tool: "gmail.send", payload });
if (!pending.ok && pending.decision === "REQUIRE_APPROVAL") {
  await client.approve(pending.approvalId, "user_42");
  const result = await client.execute({
    token,
    tool: "gmail.send",
    payload,
    approvalId: pending.approvalId,
  });
}
```
