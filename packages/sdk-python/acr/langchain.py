"""Convenience namespace: ``from acr.langchain import protect``.

Requires the LangChain extra::

    pip install "acr-sdk[langchain]"
"""

try:
    from acr_langchain import (
        AcrToolDeniedError,
        CapabilityGuard,
        create_guard,
        guarded_tool,
        protect,
        wrap_tool,
        wrap_tools,
    )
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "acr.langchain requires the LangChain integration. "
        'Install it with: pip install "acr-sdk[langchain]" '
        "(or pip install acr-langchain)"
    ) from exc

__all__ = [
    "AcrToolDeniedError",
    "CapabilityGuard",
    "create_guard",
    "guarded_tool",
    "protect",
    "wrap_tool",
    "wrap_tools",
]
