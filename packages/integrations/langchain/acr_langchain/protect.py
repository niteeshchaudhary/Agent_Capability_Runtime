"""One-call protection for LangChain tools.

The highest-level API: pick a backend (embedded by default, gateway when
configured), grant tokens, and wrap tools — in a single function call.

    from acr import can
    from acr_langchain import protect

    tools = protect(
        [search_web, scrape_webpage],
        agent_id="my_agent",
        policy=can("http.request").where(method.in_(["GET"])).limit(50),
    )

Backend selection (first match wins):
  1. ``client=`` argument (any AcrClient / LocalAcrClient)
  2. ``base_url=`` argument → HTTP gateway
  3. ``ACR_GATEWAY_URL`` env var → HTTP gateway
  4. otherwise → embedded ``LocalAcrClient`` (zero infrastructure)

The lower-level ``CapabilityGuard`` + ``wrap_tool``/``wrap_tools`` API remains
available for full control.
"""

from __future__ import annotations

import os
from collections.abc import Sequence

from langchain_core.tools import BaseTool, StructuredTool

from acr.client import AcrClient
from acr.dsl import PolicyBuilder
from acr.local import LocalAcrClient

from acr_langchain.guard import AcrClientLike, CapabilityGuard
from acr_langchain.tools import PayloadBuilder, wrap_tool


def _resolve_client(
    client: AcrClientLike | None,
    base_url: str | None,
    admin_api_key: str | None,
    signing_secret: str | None,
) -> tuple[AcrClientLike, bool]:
    """Return (client, is_local)."""
    if client is not None:
        return client, isinstance(client, LocalAcrClient)

    url = base_url or os.environ.get("ACR_GATEWAY_URL")
    if url:
        return (
            AcrClient(
                base_url=url,
                admin_api_key=admin_api_key or os.environ.get("ACR_ADMIN_API_KEY"),
            ),
            False,
        )
    return LocalAcrClient(secret=signing_secret), True


def protect(
    tools: Sequence[BaseTool],
    *,
    agent_id: str,
    policy: PolicyBuilder | None = None,
    policies: dict[str, PolicyBuilder] | None = None,
    client: AcrClientLike | None = None,
    base_url: str | None = None,
    admin_api_key: str | None = None,
    signing_secret: str | None = None,
    simulate: bool | None = None,
    on_deny: str = "return",
    payload_builders: dict[str, PayloadBuilder] | None = None,
) -> list[StructuredTool]:
    """Wrap LangChain tools with ACR enforcement in one call.

    Args:
        tools: LangChain tools to protect.
        agent_id: Agent identity for granted capability tokens.
        policy: Default policy for all tools (its ACR tool id is used).
        policies: Per-tool overrides — LangChain tool name → PolicyBuilder.
            Tools not listed fall back to ``policy``.
        client: Explicit backend (AcrClient or LocalAcrClient). Overrides
            ``base_url`` / environment detection.
        base_url: Gateway URL. Defaults to ``ACR_GATEWAY_URL`` env; when
            neither is set, an embedded LocalAcrClient is used (no server).
        admin_api_key: Bearer for gateway grant (or ``ACR_ADMIN_API_KEY`` env).
        signing_secret: HS256 secret for embedded mode (or ``ACR_SIGNING_SECRET``
            env; an ephemeral secret is generated when unset).
        simulate: Policy-check mode. Default: auto — ``False`` for the embedded
            backend (so ``limit()`` counters apply) and ``True`` for the
            gateway (so gateway adapters never run; your local code does).
        on_deny: ``"return"`` (denial text goes to the agent) or ``"raise"``.
        payload_builders: Optional per-tool payload mapping overrides; by
            default payloads are inferred from tool kwargs (url/method/etc.).

    Note: one capability token is granted per ACR tool id. If multiple
    policies share a tool id, the first builder encountered wins.
    """
    if policy is None and not policies:
        raise ValueError("protect() requires `policy` or `policies`")

    resolved_client, is_local = _resolve_client(client, base_url, admin_api_key, signing_secret)
    effective_simulate = simulate if simulate is not None else not is_local

    overrides = policies or {}
    builders = payload_builders or {}

    tool_policies: dict[str, PolicyBuilder] = {}
    for t in tools:
        chosen = overrides.get(t.name, policy)
        if chosen is None:
            raise ValueError(
                f"No policy for tool {t.name!r}: add it to `policies` or pass a default `policy`"
            )
        tool_policies[t.name] = chosen

    guard = CapabilityGuard(resolved_client, agent_id=agent_id)
    for builder in tool_policies.values():
        guard.ensure(builder.tool, builder)

    return [
        wrap_tool(
            t,
            guard=guard,
            acr_tool=tool_policies[t.name].tool,
            payload_builder=builders.get(t.name),
            simulate=effective_simulate,
            on_deny=on_deny,
        )
        for t in tools
    ]
