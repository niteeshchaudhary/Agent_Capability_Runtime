"""Query scope guard — block off-topic user prompts before they reach the LLM.

Uses keyword and regex rules only (zero LLM cost). Configure allowed/denied
topics per agent purpose so unrelated queries never invoke your model.

Example::

    from acr.scope import QueryScopeGuard

    guard = QueryScopeGuard.from_dict({
        "enabled": True,
        "purpose": "Burger shop customer assistant",
        "allowed_topics": [
            {"id": "menu", "keywords": ["menu", "burger", "fries", "price"]},
            {"id": "orders", "keywords": ["order", "delivery", "pickup"]},
        ],
        "denied_topics": [
            {"id": "coding", "keywords": ["python", "javascript", "write code"]},
        ],
    })

    result = guard.check("What's on the lunch menu?")  # allowed
    result = guard.check("Write me a Python script")   # denied — no LLM call
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal


_GREETING_PATTERN = re.compile(
    r"^(hi|hello|hey|thanks|thank you|ok|okay|bye|goodbye|good morning|good evening)"
    r"(\s|!|\?|\.|$)",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class TopicRule:
    """One allowed or denied topic bucket."""

    id: str
    description: str = ""
    keywords: tuple[str, ...] = ()
    patterns: tuple[str, ...] = ()


@dataclass(frozen=True)
class ScopeResult:
    """Outcome of a scope check."""

    allowed: bool
    reason: str = ""
    matched_topic: str | None = None
    blocked_by: str | None = None


@dataclass
class QueryScopeConfig:
    """Declarative query scope for an agent."""

    enabled: bool = True
    purpose: str = ""
    allowed_topics: list[TopicRule] = field(default_factory=list)
    denied_topics: list[TopicRule] = field(default_factory=list)
    deny_patterns: list[str] = field(default_factory=list)
    allow_greetings: bool = True
    allow_empty: bool = True
    match_mode: Literal["any_allowed", "deny_only"] = "any_allowed"
    refusal_message: str = (
        "I can only help with topics related to my purpose. "
        "Please ask something within that scope."
    )


class QueryScopeGuard:
    """Zero-cost pre-LLM filter for user queries."""

    def __init__(self, config: QueryScopeConfig) -> None:
        self._config = config
        self._deny_regexes = [_compile_pattern(p) for p in config.deny_patterns]
        self._allowed = [_compile_topic_rule(t) for t in config.allowed_topics]
        self._denied = [_compile_topic_rule(t) for t in config.denied_topics]

    @property
    def enabled(self) -> bool:
        return self._config.enabled

    @property
    def purpose(self) -> str:
        return self._config.purpose

    @property
    def refusal_message(self) -> str:
        return self._config.refusal_message

    @classmethod
    def disabled(cls) -> QueryScopeGuard:
        """Passthrough guard — always allows (scope checking off)."""
        return cls(QueryScopeConfig(enabled=False))

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> QueryScopeGuard:
        """Build from a dict (e.g. parsed YAML ``scope:`` block)."""
        allowed = [_parse_topic_rule(t) for t in (data.get("allowed_topics") or [])]
        denied = [_parse_topic_rule(t) for t in (data.get("denied_topics") or [])]
        config = QueryScopeConfig(
            enabled=bool(data.get("enabled", True)),
            purpose=str(data.get("purpose", "")),
            allowed_topics=allowed,
            denied_topics=denied,
            deny_patterns=[str(p) for p in (data.get("deny_patterns") or [])],
            allow_greetings=bool(data.get("allow_greetings", True)),
            allow_empty=bool(data.get("allow_empty", True)),
            match_mode=str(data.get("match_mode", "any_allowed")),  # type: ignore[arg-type]
            refusal_message=str(
                data.get(
                    "refusal_message",
                    QueryScopeConfig.refusal_message,
                )
            ),
        )
        if config.match_mode not in ("any_allowed", "deny_only"):
            raise ValueError("match_mode must be 'any_allowed' or 'deny_only'")
        return cls(config)

    @classmethod
    def load(cls, path: str | Path) -> QueryScopeGuard:
        """Load scope config from a YAML file (requires ``pyyaml``)."""
        raw = _load_yaml(path)
        if not isinstance(raw, dict):
            raise ValueError(f"Scope file must be a mapping: {path}")
        scope_block = raw.get("scope", raw)
        if not isinstance(scope_block, dict):
            raise ValueError(f"Missing 'scope' mapping in {path}")
        return cls.from_dict(scope_block)

    def check(self, query: str) -> ScopeResult:
        """Return whether the query may proceed to the LLM."""
        if not self._config.enabled:
            return ScopeResult(allowed=True, reason="scope guard disabled")

        text = query.strip()
        normalized = text.lower()

        if not text:
            if self._config.allow_empty:
                return ScopeResult(allowed=True, reason="empty query allowed")
            return ScopeResult(
                allowed=False,
                reason="empty query not allowed",
                blocked_by="empty",
            )

        if self._config.allow_greetings and _GREETING_PATTERN.match(text):
            return ScopeResult(allowed=True, reason="greeting allowed", matched_topic="greeting")

        for pattern, label in self._deny_regexes:
            if pattern.search(text):
                return ScopeResult(
                    allowed=False,
                    reason=f"matched deny pattern: {label}",
                    blocked_by=label,
                )

        for compiled in self._denied:
            if _topic_matches(compiled, normalized, text):
                return ScopeResult(
                    allowed=False,
                    reason=f"matched denied topic: {compiled.rule.id}",
                    blocked_by=compiled.rule.id,
                )

        if self._config.match_mode == "deny_only":
            return ScopeResult(allowed=True, reason="deny-only mode, no deny match")

        if not self._allowed:
            return ScopeResult(allowed=True, reason="no allowed_topics configured")

        for compiled in self._allowed:
            if _topic_matches(compiled, normalized, text):
                return ScopeResult(
                    allowed=True,
                    reason=f"matched allowed topic: {compiled.rule.id}",
                    matched_topic=compiled.rule.id,
                )

        return ScopeResult(
            allowed=False,
            reason="query does not match any allowed topic",
            blocked_by="out_of_scope",
        )

    def check_or_refuse(self, query: str) -> str | None:
        """Return refusal text if denied, else ``None`` (safe to call LLM)."""
        result = self.check(query)
        if result.allowed:
            return None
        return self._config.refusal_message


@dataclass
class _CompiledTopic:
    rule: TopicRule
    keyword_patterns: list[re.Pattern[str]]
    regex_patterns: list[re.Pattern[str]]


def _compile_pattern(pattern: str) -> tuple[re.Pattern[str], str]:
    try:
        return re.compile(pattern, re.IGNORECASE), pattern
    except re.error as exc:
        raise ValueError(f"Invalid deny pattern {pattern!r}: {exc}") from exc


def _compile_topic_rule(rule: TopicRule) -> _CompiledTopic:
    keywords = [
        re.compile(re.escape(kw.lower()), re.IGNORECASE) for kw in rule.keywords if kw.strip()
    ]
    regexes = [_compile_pattern(p)[0] for p in rule.patterns]
    return _CompiledTopic(rule=rule, keyword_patterns=keywords, regex_patterns=regexes)


def _topic_matches(compiled: _CompiledTopic, normalized: str, original: str) -> bool:
    for pattern in compiled.keyword_patterns:
        if pattern.search(normalized):
            return True
    for pattern in compiled.regex_patterns:
        if pattern.search(original):
            return True
    return False


def _parse_topic_rule(raw: Any) -> TopicRule:
    if isinstance(raw, str):
        return TopicRule(id=raw, keywords=(raw.lower(),))
    if not isinstance(raw, dict):
        raise ValueError(f"Topic rule must be a string or mapping, got {type(raw)!r}")
    topic_id = str(raw.get("id") or raw.get("name") or "")
    if not topic_id:
        raise ValueError("Topic rule requires 'id' or 'name'")
    keywords = raw.get("keywords") or raw.get("terms") or []
    patterns = raw.get("patterns") or []
    return TopicRule(
        id=topic_id,
        description=str(raw.get("description", "")),
        keywords=tuple(str(k).lower() for k in keywords),
        patterns=tuple(str(p) for p in patterns),
    )


def _load_yaml(path: str | Path) -> Any:
    try:
        import yaml
    except ImportError as exc:
        raise ImportError(
            "YAML scope files require pyyaml: pip install pyyaml"
        ) from exc
    text = Path(path).read_text(encoding="utf-8")
    return yaml.safe_load(text)
