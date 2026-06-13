"""ACR Python SDK — HTTP gateway end-to-end example.

Prerequisites:
  1. Start the ACR gateway:  cd Agent_Capability_Runtime && pnpm dev:gateway
  2. Install the SDK:        pip install -e packages/sdk-python
  3. Run:                    python packages/sdk-python/examples/e2e_gateway.py

Env:
  ACR_GATEWAY_URL  — default http://localhost:3000
  ACR_ADMIN_API_KEY — optional Bearer for grant/delegate when gateway requires it
"""

from __future__ import annotations

import asyncio
import os
import sys

from acr import AcrClient, can
from acr.models import ExecuteDenied, ExecuteSuccess


async def main() -> None:
    gateway_url = os.environ.get("ACR_GATEWAY_URL", "http://localhost:3000")
    admin_key = os.environ.get("ACR_ADMIN_API_KEY")

    async with AcrClient(base_url=gateway_url, admin_api_key=admin_key) as client:
        health = await client.health()
        print(f"Gateway: {health.get('status')} (v{health.get('version', '?')})")

        grant = await client.grant(
            can("gmail.send")
            .only_domain("company.com")
            .limit(3)
            .expires_in("15m")
            .to_grant_input(agent_id="python_e2e_agent")
        )
        print(f"Granted token: {grant.token[:20]}...")

        allowed = await client.execute(
            token=grant.token,
            tool="gmail.send",
            payload={"to": "alice@company.com", "subject": "Allowed", "body": "Hi"},
        )
        if not isinstance(allowed, ExecuteSuccess):
            print(f"FAIL: expected ALLOW, got {allowed.decision}", file=sys.stderr)
            sys.exit(1)
        print(f"Execute (company.com): {allowed.decision}")

        denied = await client.execute(
            token=grant.token,
            tool="gmail.send",
            payload={"to": "bob@gmail.com", "subject": "Blocked", "body": "Hi"},
        )
        if not isinstance(denied, ExecuteDenied):
            print(f"FAIL: expected DENY, got {denied.decision}", file=sys.stderr)
            sys.exit(1)
        print(f"Execute (gmail.com): {denied.decision} — {denied.reason}")

        events = await client.list_audit(agent_id="python_e2e_agent", limit=5)
        print(f"Audit events: {len(events)}")

    print("E2E passed.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        print(f"E2E failed: {exc}", file=sys.stderr)
        print("Start gateway first: pnpm dev:gateway", file=sys.stderr)
        sys.exit(1)
