"""Tests for acr.scope — query scope guard."""

from __future__ import annotations

import pytest

from acr.scope import QueryScopeGuard, ScopeResult


BURGER_SCOPE = {
    "enabled": True,
    "purpose": "Burger shop assistant",
    "allowed_topics": [
        {"id": "menu", "keywords": ["menu", "burger", "fries", "combo", "price"]},
        {"id": "orders", "keywords": ["order", "delivery", "pickup", "catering"]},
        {"id": "hours", "keywords": ["hours", "open", "close", "location", "address"]},
    ],
    "denied_topics": [
        {"id": "coding", "keywords": ["python", "javascript", "write code", "programming"]},
    ],
    "deny_patterns": [r"\b(homework|essay)\b"],
    "refusal_message": "I only help with menu, orders, hours, and locations.",
}


@pytest.fixture
def guard() -> QueryScopeGuard:
    return QueryScopeGuard.from_dict(BURGER_SCOPE)


def test_disabled_always_allows() -> None:
    g = QueryScopeGuard.disabled()
    assert g.check("write python code").allowed is True


def test_allows_on_topic_query(guard: QueryScopeGuard) -> None:
    result = guard.check("What's on the lunch menu?")
    assert result.allowed is True
    assert result.matched_topic == "menu"


def test_denies_coding_query(guard: QueryScopeGuard) -> None:
    result = guard.check("Write me a Python script to sort a list")
    assert result.allowed is False
    assert result.blocked_by == "coding"


def test_denies_off_topic_without_denied_keyword(guard: QueryScopeGuard) -> None:
    result = guard.check("Explain quantum physics")
    assert result.allowed is False
    assert result.blocked_by == "out_of_scope"


def test_denies_deny_pattern(guard: QueryScopeGuard) -> None:
    result = guard.check("Help with my homework essay")
    assert result.allowed is False


def test_allows_greeting(guard: QueryScopeGuard) -> None:
    assert guard.check("Hello!").allowed is True
    assert guard.check("Hi there").allowed is True


def test_check_or_refuse(guard: QueryScopeGuard) -> None:
    assert guard.check_or_refuse("What's the burger combo price?") is None
    refusal = guard.check_or_refuse("Teach me JavaScript")
    assert refusal == "I only help with menu, orders, hours, and locations."


def test_deny_only_mode() -> None:
    g = QueryScopeGuard.from_dict(
        {
            "enabled": True,
            "match_mode": "deny_only",
            "denied_topics": [{"id": "coding", "keywords": ["python"]}],
        }
    )
    assert g.check("Tell me about burgers").allowed is True
    assert g.check("Python tutorial").allowed is False


def test_topic_shorthand_string() -> None:
    g = QueryScopeGuard.from_dict(
        {
            "enabled": True,
            "allowed_topics": ["pizza"],
        }
    )
    assert g.check("Do you sell pizza?").allowed is True


def test_invalid_match_mode() -> None:
    with pytest.raises(ValueError, match="match_mode"):
        QueryScopeGuard.from_dict({"match_mode": "invalid"})
