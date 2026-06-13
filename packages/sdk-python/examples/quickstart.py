"""ACR Python SDK — Quickstart example.

Prerequisites:
  1. Start the ACR gateway:  cd Agent_Capability_Runtime && pnpm dev:gateway
  2. Install the SDK:        pip install -e packages/sdk-python
  3. Run this script:        python packages/sdk-python/examples/quickstart.py
"""

import asyncio
from acr import AcrClient, can


async def main() -> None:
    gateway_url = "http://localhost:3000"

    async with AcrClient(base_url=gateway_url) as client:
        # 1. Check gateway health
        health = await client.health()
        print(f"✅ Gateway healthy: {health}")

        # 2. Grant a scoped capability
        grant_input = (
            can("gmail.send")
            .only_domain("company.com")
            .limit(5)
            .expires_in("10m")
            .to_grant_input(agent_id="support_agent")
        )
        grant = await client.grant(grant_input)
        print(f"🔑 Token granted: {grant.token[:20]}...")
        print(f"   Expires at: {grant.expires_at}")

        # 3. Execute — should ALLOW (internal domain)
        result = await client.execute(
            token=grant.token,
            tool="gmail.send",
            payload={
                "to": "customer@company.com",
                "subject": "Support response",
                "body": "Thank you for contacting us.",
            },
        )
        print(f"📨 Execute (internal): {result.decision}")

        # 4. Execute — should DENY (external domain)
        result = await client.execute(
            token=grant.token,
            tool="gmail.send",
            payload={
                "to": "attacker@gmail.com",
                "subject": "Exfiltration",
                "body": "All customer data...",
            },
        )
        print(f"🚫 Execute (external): {result.decision}")
        if hasattr(result, "reason"):
            print(f"   Reason: {result.reason}")

        # 5. Simulate (dry run)
        result = await client.execute(
            token=grant.token,
            tool="gmail.send",
            payload={"to": "test@company.com", "subject": "Test"},
            simulate=True,
        )
        print(f"🧪 Simulate: {result.decision}")

        # 6. Check audit log
        events = await client.list_audit(limit=5)
        print(f"📋 Audit events: {len(events)}")
        for event in events:
            print(f"   - {event.tool}: {event.decision}")


if __name__ == "__main__":
    asyncio.run(main())
