"""Python WOW demo — deny, approval, revoke (parity with ``pnpm demo:wow``).

Prerequisites:
  1. Start gateway:  pnpm dev:gateway
  2. Install SDK:     pip install -e packages/sdk-python
  3. Run:             python packages/sdk-python/examples/demo_wow.py

Or via CI integration job with ACR_RUN_E2E=1.
"""

from __future__ import annotations

import asyncio
import os
import sys

from acr import AcrClient, can
from acr.models import ExecuteApprovalRequired, ExecuteDenied, ExecuteSuccess

GATEWAY = os.environ.get("ACR_GATEWAY_URL", "http://localhost:3000")
ADMIN_KEY = os.environ.get("ACR_ADMIN_API_KEY")


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


async def main() -> None:
    if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")

    print("\n  OAuth was built for humans clicking \"Allow.\"")
    print("  Autonomous agents need runtime enforcement.\n")

    async with AcrClient(base_url=GATEWAY, admin_api_key=ADMIN_KEY) as client:
        # ── 1. Block data exfiltration ───────────────────────────────────
        section(
            1,
            "Agent tries to email an external address",
            "Policy: only @company.com — runtime blocks at execute",
        )

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
            payload={
                "to": "attacker@gmail.com",
                "subject": "Customer list",
                "body": "Attached: all contacts",
            },
        )
        log_decision("gmail.send → attacker@gmail.com", exfil)

        safe = await client.execute(
            token=grant.token,
            tool="gmail.send",
            payload={
                "to": "customer@company.com",
                "subject": "Re: your ticket",
                "body": "We are on it.",
            },
        )
        log_decision("gmail.send → customer@company.com", safe)

        # ── 2. High-value action needs approval ──────────────────────────
        section(
            2,
            "Agent tries a payment over $100",
            "Policy: max_spend($100) — runtime pauses for human approval",
        )

        pay_grant = await client.grant(
            can("gmail.send")
            .only_domain("company.com")
            .max_spend(10_000)
            .expires_in("15m")
            .to_grant_input(agent_id="finance_agent")
        )

        payload = {
            "to": "vendor@company.com",
            "subject": "Wire transfer authorization",
            "body": "Approve payment",
            "amount": 25_000,
        }

        big_spend = await client.execute(
            token=pay_grant.token,
            tool="gmail.send",
            payload=payload,
        )
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

        # ── 3. Instant revocation ────────────────────────────────────────
        section(
            3,
            "Capability revoked mid-session",
            "SOC revokes jti — next execute is denied",
        )

        live = await client.grant(
            can("gmail.send")
            .only_domain("company.com")
            .limit(10)
            .to_grant_input(agent_id="compromised_agent")
        )

        before = await client.execute(
            token=live.token,
            tool="gmail.send",
            payload={"to": "ops@company.com", "subject": "Hi", "body": "Before revoke"},
        )
        log_decision("Before revoke", before)

        jti = live.claims.jti
        if not jti:
            print("   ⚠ No jti in grant claims — skipping revoke step")
        else:
            await client.revoke(jti, reason="SOC: compromised session")
            print(f'\n   ⚡ client.revoke("{jti}")')

            after = await client.execute(
                token=live.token,
                tool="gmail.send",
                payload={"to": "ops@company.com", "subject": "Hi", "body": "After revoke"},
            )
            log_decision("After revoke", after)

        # ── 4. Audit ─────────────────────────────────────────────────────
        section(4, "Audit trail", "Every decision recorded")
        events = await client.list_audit(limit=6)
        for event in events:
            ts = (event.timestamp or "")[11:19]
            print(f"   {ts} {event.decision or '':16} {event.tool or ''} {event.reason or ''}")

    print("\n  ✓ Demo complete — try: python examples/quickstart.py\n")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(130)
    except Exception as exc:
        print(f"\n  ✗ Demo failed: {exc}", file=sys.stderr)
        print(
            "  Start the gateway first (terminal 1):  pnpm dev:gateway",
            file=sys.stderr,
        )
        print(
            "  Then run this script (terminal 2):     python packages/sdk-python/examples/demo_wow.py",
            file=sys.stderr,
        )
        print(f"  Gateway URL: {GATEWAY}\n", file=sys.stderr)
        sys.exit(1)
