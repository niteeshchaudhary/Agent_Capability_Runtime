# ACR Python SDK

**Python client for [Agent Capability Runtime](https://github.com/agent-capability-runtime/Agent_Capability_Runtime)** — runtime-enforced capability permissions for AI agents.

[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](../../LICENSE)

## Install

```bash
pip install acr-sdk
```

Or from source:

```bash
cd Agent_Capability_Runtime/packages/sdk-python
pip install -e ".[dev]"
```

## Quick Start

### Async (FastAPI / LangChain)

```python
from acr import AcrClient, can

async with AcrClient(base_url="http://localhost:3000") as client:
    # Grant a scoped capability
    grant = await client.grant(
        can("gmail.send")
        .only_domain("company.com")
        .limit(5)
        .expires_in("10m")
        .to_grant_input(agent_id="support_agent")
    )

    # Execute — ALLOW (internal domain)
    result = await client.execute(
        token=grant.token,
        tool="gmail.send",
        payload={"to": "user@company.com", "subject": "Hello"},
    )
    print(result.decision)  # "ALLOW"

    # Execute — DENY (external domain blocked)
    result = await client.execute(
        token=grant.token,
        tool="gmail.send",
        payload={"to": "attacker@gmail.com", "subject": "Exfil"},
    )
    print(result.decision)  # "DENY"
```

### Sync

```python
from acr import AcrClient, can

client = AcrClient(base_url="http://localhost:3000")

grant = client.grant_sync(
    can("gmail.send")
    .only_domain("company.com")
    .to_grant_input(agent_id="agent_1")
)

result = client.execute_sync(
    token=grant.token,
    tool="gmail.send",
    payload={"to": "user@company.com", "subject": "Hello"},
)
client.close()
```

## Fluent DSL

The `can()` builder mirrors the TypeScript DSL:

```python
from acr import can

# Email constraints
can("gmail.send").only_domain("company.com").limit(5).no_attachments()

# HTTP constraints
can("http.request").where(method.in_(["GET", "POST"])).where(url.in_(["https://api.example.com"]))

# Spending limit with approval
can("gmail.send").max_spend(100_00).require_approval()

# Intent-based governance
can("gmail.send").when_intent("customer_support").when_intent_action("support", "reply")

# Time-based
can("gmail.send").allowed_hours(9, 17)
```

## Full API

| Method | Async | Sync |
|--------|-------|------|
| Grant capability | `client.grant(input)` | `client.grant_sync(input)` |
| Execute tool | `client.execute(...)` | `client.execute_sync(...)` |
| Delegate capability | `client.delegate(parent_token, input)` | `client.delegate_sync(...)` |
| Revoke capability | `client.revoke(capability_id)` | `client.revoke_sync(...)` |
| List approvals | `client.list_approvals()` | `client.list_approvals_sync()` |
| Approve | `client.approve(approval_id)` | `client.approve_sync(...)` |
| Reject | `client.reject(approval_id)` | `client.reject_sync(...)` |
| Audit log | `client.list_audit()` | `client.list_audit_sync()` |
| Health check | `client.health()` | `client.health_sync()` |

## Admin Authentication

```python
client = AcrClient(
    base_url="http://localhost:3000",
    admin_api_key="your-admin-secret",
)
```

## Requirements

- Python 3.10+
- A running ACR gateway (`pnpm dev:gateway`)

## License

MIT — see [LICENSE](../../LICENSE)
