"""LangChain tool wrappers that enforce ACR capabilities before execution."""

from __future__ import annotations

import functools
import inspect
from collections.abc import Callable
from typing import Any

from langchain_core.tools import BaseTool, StructuredTool, tool

from acr.models import ExecuteApprovalRequired, ExecuteDenied, ExecuteResult
from acr_langchain.exceptions import AcrToolDeniedError
from acr_langchain.guard import CapabilityGuard

PayloadBuilder = Callable[[dict[str, Any]], dict[str, Any]]


def _default_payload(tool_name: str, kwargs: dict[str, Any]) -> dict[str, Any]:
    """Build a generic http.request-style payload from tool kwargs."""
    payload: dict[str, Any] = {"toolName": tool_name, **kwargs}
    if "url" in kwargs:
        payload.setdefault("method", "GET")
    return payload


def _format_denial(result: ExecuteDenied) -> str:
    code = f" ({result.code})" if result.code else ""
    return f"Blocked by Agent Capability Runtime{code}: {result.reason}"


def _format_approval(result: ExecuteApprovalRequired) -> str:
    return (
        f"Tool execution requires human approval (id={result.approval_id}): {result.reason}"
    )


def _check_policy(
    guard: CapabilityGuard,
    *,
    acr_tool: str,
    payload: dict[str, Any],
    simulate: bool,
) -> None:
    """Run ACR execute (simulate by default). Raises AcrToolDeniedError on deny."""
    token = guard.get_token(acr_tool)
    result: ExecuteResult = guard.client.execute_sync(
        token=token,
        tool=acr_tool,
        payload=payload,
        simulate=simulate,
    )

    if isinstance(result, ExecuteDenied):
        raise AcrToolDeniedError(
            result.reason,
            code=result.code,
            audit_id=result.audit_id,
        )

    if isinstance(result, ExecuteApprovalRequired):
        raise AcrToolDeniedError(
            _format_approval(result),
            audit_id=result.audit_id,
        )


def _run_with_acr_check(
    fn: Callable[..., Any],
    guard: CapabilityGuard,
    *,
    acr_tool: str,
    tool_name: str,
    payload_builder: PayloadBuilder | None,
    simulate: bool,
    on_deny: str,
) -> Callable[..., Any]:
    @functools.wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        bound = inspect.signature(fn).bind_partial(*args, **kwargs)
        bound.apply_defaults()
        call_kwargs = dict(bound.arguments)

        build = payload_builder or (lambda kw: _default_payload(tool_name, kw))
        payload = build(call_kwargs)

        try:
            _check_policy(
                guard,
                acr_tool=acr_tool,
                payload=payload,
                simulate=simulate,
            )
        except AcrToolDeniedError as exc:
            if on_deny == "return":
                code = f" ({exc.code})" if exc.code else ""
                return f"Blocked by Agent Capability Runtime{code}: {exc.reason}"
            raise

        return fn(*args, **kwargs)

    return wrapper


def wrap_tool(
    langchain_tool: BaseTool,
    *,
    guard: CapabilityGuard,
    acr_tool: str,
    payload_builder: PayloadBuilder | None = None,
    simulate: bool = True,
    on_deny: str = "return",
) -> StructuredTool:
    """Wrap an existing LangChain tool with ACR policy enforcement.

    By default uses ``simulate=True`` so ACR checks policy **without** running
    the gateway adapter — your local tool function still performs the work.

    Args:
        langchain_tool: Existing ``@tool`` or ``StructuredTool``.
        guard: Session guard with a cached token from ``ensure()``.
        acr_tool: ACR tool id (e.g. ``"http.request"``, ``"gmail.send"``).
        payload_builder: Maps tool kwargs → execute payload for policy evaluation.
        simulate: When True, policy-only check (recommended for local tools).
        on_deny: ``"return"`` sends denial text to the agent; ``"raise"`` propagates.
    """
    if on_deny not in ("return", "raise"):
        raise ValueError("on_deny must be 'return' or 'raise'")

    original_fn = langchain_tool.func
    if original_fn is None:
        raise ValueError(f"Tool {langchain_tool.name!r} has no callable func to wrap")

    wrapped_fn = _run_with_acr_check(
        original_fn,
        guard,
        acr_tool=acr_tool,
        tool_name=langchain_tool.name,
        payload_builder=payload_builder,
        simulate=simulate,
        on_deny=on_deny,
    )

    return StructuredTool(
        name=langchain_tool.name,
        description=langchain_tool.description,
        func=wrapped_fn,
        args_schema=langchain_tool.args_schema,
        return_direct=getattr(langchain_tool, "return_direct", False),
    )


def wrap_tools(
    tools: list[BaseTool],
    *,
    guard: CapabilityGuard,
    acr_tool: str,
    payload_builders: dict[str, PayloadBuilder] | None = None,
    simulate: bool = True,
    on_deny: str = "return",
) -> list[StructuredTool]:
    """Wrap multiple LangChain tools with the same ACR tool id."""
    builders = payload_builders or {}
    return [
        wrap_tool(
            t,
            guard=guard,
            acr_tool=acr_tool,
            payload_builder=builders.get(t.name),
            simulate=simulate,
            on_deny=on_deny,
        )
        for t in tools
    ]


def guarded_tool(
    *,
    guard: CapabilityGuard,
    acr_tool: str,
    payload_builder: PayloadBuilder | None = None,
    simulate: bool = True,
    on_deny: str = "return",
) -> Callable[[Callable[..., Any]], StructuredTool]:
    """Decorator: define a LangChain tool with ACR enforcement.

    Example::

        @guarded_tool(guard=guard, acr_tool="http.request", payload_builder=payload_for_url)
        def scrape_webpage(url: str) -> str:
            ...
    """

    def decorator(fn: Callable[..., Any]) -> StructuredTool:
        wrapped_fn = _run_with_acr_check(
            fn,
            guard,
            acr_tool=acr_tool,
            tool_name=fn.__name__,
            payload_builder=payload_builder,
            simulate=simulate,
            on_deny=on_deny,
        )
        return tool(wrapped_fn)

    return decorator
