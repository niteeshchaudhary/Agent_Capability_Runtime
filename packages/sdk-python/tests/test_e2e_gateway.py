"""Gateway integration tests — run when ACR gateway is available.

Skipped by default in unit test runs. Enabled when:
  - ACR_RUN_E2E=1, or
  - invoked via CI integration job with gateway running.
"""

from __future__ import annotations

import os

import httpx
import pytest

from acr import AcrClient, can
from acr.models import ExecuteDenied, ExecuteSuccess

GATEWAY = os.environ.get("ACR_GATEWAY_URL", "http://localhost:3000")
ADMIN_KEY = os.environ.get("ACR_ADMIN_API_KEY")


def _gateway_reachable() -> bool:
    try:
        resp = httpx.get(f"{GATEWAY}/health", timeout=2.0)
        return resp.status_code == 200
    except httpx.HTTPError:
        return False


pytestmark = [
    pytest.mark.e2e,
    pytest.mark.skipif(
        os.environ.get("ACR_RUN_E2E") != "1" or not _gateway_reachable(),
        reason="Set ACR_RUN_E2E=1 and start gateway (pnpm dev:gateway)",
    ),
]


@pytest.mark.asyncio
async def test_gateway_grant_allow_deny() -> None:
    async with AcrClient(base_url=GATEWAY, admin_api_key=ADMIN_KEY) as client:
        grant = await client.grant(
            can("gmail.send")
            .only_domain("company.com")
            .limit(3)
            .expires_in("15m")
            .to_grant_input(agent_id="pytest_e2e_agent")
        )

        allowed = await client.execute(
            token=grant.token,
            tool="gmail.send",
            payload={"to": "alice@company.com", "subject": "Allowed", "body": "Hi"},
        )
        assert isinstance(allowed, ExecuteSuccess)

        denied = await client.execute(
            token=grant.token,
            tool="gmail.send",
            payload={"to": "bob@gmail.com", "subject": "Blocked", "body": "Hi"},
        )
        assert isinstance(denied, ExecuteDenied)
