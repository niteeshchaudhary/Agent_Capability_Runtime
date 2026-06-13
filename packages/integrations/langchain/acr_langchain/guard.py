"""Capability token management for LangChain tool sessions."""

from __future__ import annotations

from acr.client import AcrClient
from acr.dsl import PolicyBuilder
from acr.models import GrantResponse


class CapabilityGuard:
    """Grants and caches capability tokens for an agent session.

    Use one guard per agent process. Call ``ensure()`` for each ACR tool policy
    before wrapping LangChain tools.
    """

    def __init__(
        self,
        client: AcrClient,
        *,
        agent_id: str,
    ) -> None:
        self._client = client
        self._agent_id = agent_id
        self._tokens: dict[str, str] = {}

    @property
    def client(self) -> AcrClient:
        return self._client

    @property
    def agent_id(self) -> str:
        return self._agent_id

    def ensure(self, acr_tool: str, policy: PolicyBuilder) -> GrantResponse:
        """Grant a capability token if not already cached for ``acr_tool``."""
        if acr_tool in self._tokens:
            # Return a minimal GrantResponse-like object for callers that need it
            return GrantResponse.model_validate({
                "token": self._tokens[acr_tool],
                "claims": {"sub": self._agent_id, "tool": acr_tool},
                "expiresAt": "",
            })

        grant_input = policy.to_grant_input(agent_id=self._agent_id)
        if grant_input["tool"] != acr_tool:
            raise ValueError(
                f"Policy tool {grant_input['tool']!r} does not match acr_tool {acr_tool!r}"
            )

        grant = self._client.grant_sync(grant_input)
        self._tokens[acr_tool] = grant.token
        return grant

    def get_token(self, acr_tool: str) -> str:
        """Return cached token or raise if ``ensure()`` was not called."""
        if acr_tool not in self._tokens:
            raise RuntimeError(
                f"No capability token for {acr_tool!r}. Call guard.ensure({acr_tool!r}, policy) first."
            )
        return self._tokens[acr_tool]


def create_guard(
    *,
    base_url: str,
    agent_id: str,
    admin_api_key: str | None = None,
) -> CapabilityGuard:
    """Create a ``CapabilityGuard`` with a new ``AcrClient``."""
    return CapabilityGuard(
        AcrClient(base_url=base_url, admin_api_key=admin_api_key),
        agent_id=agent_id,
    )
