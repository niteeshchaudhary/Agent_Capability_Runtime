"""ACR WOW demo — deny, approval, revoke. Runs with zero setup (embedded runtime).

    pip install -e packages/sdk-python
    python packages/sdk-python/examples/demo_wow.py

Optional production gateway mode:

    set ACR_GATEWAY_URL=http://localhost:3000
    python packages/sdk-python/examples/demo_wow.py
"""

from __future__ import annotations

import asyncio
import os
import sys

from acr import LocalAcrClient, can, create_client
from acr.client import AcrClient
from acr.models import ExecuteApprovalRequired, ExecuteDenied, ExecuteSuccess

DEV_SECRET = "dev-secret-change-in-production-32b-minimum"


def section(n: int, title: str, subtitle: str) -> None:
    print(f"\n── Step {n}: {title} ──")
    print(f"   {subtitle}\n")


def log_decision(label: str, result: object) -> None:
    if isinstance(result, ExecuteSuccess):
        print(f"   ✓ {label}: ALLOW")
    elif isinstance(result, ExecuteApprovalRequired):
        print(f"   ⏸ {label}: REQUIRE_APPROVAL")
        print(f"     {result.reason}")
    elif isinstance(result, ExecuteDenied):
        print(f"   ✗ {label}: DENY")
        print(f"     {result.reason}")
    else:
        print(f"   ? {label}: {result}")


async def run_demo(client: LocalAcrClient | AcrClient) -> None:
    is_local = isinstance(client, LocalAcrClient)
    mode = "embedded (zero setup)" if is_local else f"gateway ({os.environ.get('ACR_GATEWAY_URL', 'http://localhost:3000')})"
    print(f"   Backend: {mode}\n")

    grant = await client.grant(
        can("gmail.send")
        .only_domain("company.com")
        .limit(5)
        .expires_in("10m")
        .to_grant_input(agent_id="sales_agent")
    )

    exfil = await client.execute(
        token=grant.token,
        tool="gmail.send",
        payload={"to": "attacker@gmail.com", "subject": "Customer list", "body": "export"},
    )
    log_decision("gmail.send → attacker@gmail.com", exfil)

    safe = await client.execute(
        token=grant.token,
        tool="gmail.send",
        payload={"to": "customer@company.com", "subject": "Re: ticket", "body": "ok"},
    )
    log_decision("gmail.send → customer@company.com", safe)

    section(2, "Agent tries a payment over $100", "Policy: max_spend($100) — human approval gate")

    pay_grant = await client.grant(
        can("gmail.send")
        .only_domain("company.com")
        .max_spend(10_000)
        .expires_in("15m")
        .to_grant_input(agent_id="finance_agent")
    )

    payload = {
        "to": "vendor@company.com",
        "subject": "Wire transfer",
        "body": "Approve payment",
        "amount": 25_000,
    }

    big_spend = await client.execute(token=pay_grant.token, tool="gmail.send", payload=payload)
    log_decision("Payment $250.00", big_spend)

    if isinstance(big_spend, ExecuteApprovalRequired):
        await client.approve(big_spend.approval_id, resolved_by="cfo_demo")
        approved = await client.execute(
            token=pay_grant.token,
            tool="gmail.send",
            payload=payload,
            approval_id=big_spend.approval_id,
        )
        log_decision("After CFO approval", approved)

    section(3, "Capability revoked mid-session", "SOC revokes jti — next execute denied")

    live = await client.grant(
        can("gmail.send").only_domain("company.com").limit(10).to_grant_input(agent_id="compromised_agent")
    )

    before = await client.execute(
        token=live.token,
        tool="gmail.send",
        payload={"to": "ops@company.com", "subject": "Hi", "body": "before"},
    )
    log_decision("Before revoke", before)

    jti = live.claims.jti
    if jti:
        await client.revoke(jti, reason="SOC: compromised session")
        print(f'\n   ⚡ revoke("{jti}")')
        after = await client.execute(
            token=live.token,
            tool="gmail.send",
            payload={"to": "ops@company.com", "subject": "Hi", "body": "after"},
        )
        log_decision("After revoke", after)

    section(4, "Audit trail", "Every decision recorded")
    events = await client.list_audit(limit=6)
    for event in events:
        ts = (event.timestamp or "")[11:19]
        print(f"   {ts} {(event.decision or ''):16} {event.tool or ''} {event.reason or ''}")


async def main() -> None:
    if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")

    print('\n  OAuth was built for humans clicking "Allow."')
    print("  Autonomous agents need runtime enforcement.\n")

    section(1, "Agent tries to email an external address", "Policy: only @company.com")

    os.environ.setdefault("ACR_SIGNING_SECRET", DEV_SECRET)
    client = create_client()

    if isinstance(client, AcrClient):
        async with client:
            await run_demo(client)
    else:
        await run_demo(client)

    print("\n  ✓ Demo complete")
    print("  LangChain one-liner: from acr_langchain import protect")
    print("  Production: set ACR_GATEWAY_URL=http://your-gateway:3000\n")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(130)
    except Exception as exc:
        print(f"\n  ✗ Demo failed: {exc}", file=sys.stderr)
        sys.exit(1)
