"""Fluent policy DSL — Pythonic equivalent of the TypeScript can() builder.

Usage:
    from acr import can

    grant_input = (
        can("gmail.send")
        .only_domain("company.com")
        .limit(5)
        .expires_in("10m")
        .to_grant_input(agent_id="support_agent")
    )
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


# ── Predicates ───────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class DomainInPredicate:
    """Restrict to specific email domains (gmail.send)."""

    type: str = "domain_in"
    domains: tuple[str, ...] = ()


@dataclass(frozen=True)
class MethodInPredicate:
    """Restrict to specific HTTP methods (http.request)."""

    type: str = "method_in"
    methods: tuple[str, ...] = ()


@dataclass(frozen=True)
class UrlInPredicate:
    """Restrict to specific URLs (http.request)."""

    type: str = "url_in"
    urls: tuple[str, ...] = ()


@dataclass(frozen=True)
class HoursBetweenPredicate:
    """Restrict execution to a time window."""

    type: str = "hours_between"
    start: int = 0
    end: int = 0


@dataclass(frozen=True)
class IntentCategoryPredicate:
    """Restrict to a semantic intent category."""

    type: str = "intent_category"
    category: str = ""


@dataclass(frozen=True)
class IntentActionPredicate:
    """Restrict to a specific intent category + action."""

    type: str = "intent_action"
    category: str = ""
    action: str = ""


PolicyPredicate = (
    DomainInPredicate
    | MethodInPredicate
    | UrlInPredicate
    | HoursBetweenPredicate
    | IntentCategoryPredicate
    | IntentActionPredicate
)


# ── Predicate factories (mirrors TS exports) ────────────────────────────────


class _DomainNs:
    """Namespace: ``domain.in_(["company.com"])``"""

    @staticmethod
    def in_(domains: list[str]) -> DomainInPredicate:
        return DomainInPredicate(domains=tuple(domains))


class _MethodNs:
    """Namespace: ``method.in_(["GET", "POST"])``"""

    @staticmethod
    def in_(methods: list[str]) -> MethodInPredicate:
        return MethodInPredicate(methods=tuple(m.upper() for m in methods))


class _UrlNs:
    """Namespace: ``url.in_(["https://api.example.com"])``"""

    @staticmethod
    def in_(urls: list[str]) -> UrlInPredicate:
        return UrlInPredicate(urls=tuple(urls))


class _HoursNs:
    """Namespace: ``hours.between(9, 17)``"""

    @staticmethod
    def between(start: int, end: int) -> HoursBetweenPredicate:
        return HoursBetweenPredicate(start=start, end=end)


class _IntentNs:
    """Namespace: ``intent.category("support")``"""

    @staticmethod
    def category(category: str) -> IntentCategoryPredicate:
        return IntentCategoryPredicate(category=category)

    @staticmethod
    def action(category: str, action: str) -> IntentActionPredicate:
        return IntentActionPredicate(category=category, action=action)


domain = _DomainNs()
method = _MethodNs()
url = _UrlNs()
hours = _HoursNs()
intent = _IntentNs()


# ── PolicyBuilder ────────────────────────────────────────────────────────────


class PolicyBuilder:
    """Fluent builder for capability constraints.

    Mirrors the TypeScript ``PolicyBuilder`` from ``@acr/policy-engine``.
    """

    def __init__(self, tool: str) -> None:
        self._tool = tool
        self._predicates: list[PolicyPredicate] = []
        self._constraints: dict[str, Any] = {}
        self._grant_expires_in: str | int | None = None

    # ── Domain helpers ───────────────────────────────────────────────────

    def only_domain(self, domain_name: str) -> PolicyBuilder:
        """Gmail: only send to this recipient domain."""
        return self.only_domains(domain_name)

    def only_domains(self, *domain_names: str) -> PolicyBuilder:
        """Gmail: allow-list recipient domains."""
        return self.where(DomainInPredicate(domains=tuple(domain_names)))

    # ── Constraints ──────────────────────────────────────────────────────

    def expires_in(self, duration: str | int) -> PolicyBuilder:
        """Token TTL (e.g. ``"10m"``, ``"1h"``)."""
        self._grant_expires_in = duration
        return self

    def max_spend(self, cents: int) -> PolicyBuilder:
        """Max spend in USD cents; overages require human approval."""
        return self.spending_limit(cents)

    def spending_limit(self, cents: int) -> PolicyBuilder:
        self._constraints["spendingLimit"] = cents
        return self

    def where(self, *predicates: PolicyPredicate) -> PolicyBuilder:
        """Add declarative predicates (domain, method, url, hours)."""
        self._predicates.extend(predicates)
        return self

    def limit(self, max_actions: int) -> PolicyBuilder:
        """Alias for ``max_actions``."""
        return self.max_actions(max_actions)

    def max_actions(self, max_actions: int) -> PolicyBuilder:
        self._constraints["maxActions"] = max_actions
        return self

    def allowed_hours(self, start: int, end: int) -> PolicyBuilder:
        self._constraints["allowedHours"] = {"start": start, "end": end}
        return self

    def require_approval(self) -> PolicyBuilder:
        self._constraints["approvalRequired"] = True
        return self

    def require_approval_if_external(self) -> PolicyBuilder:
        self._constraints["approvalRequiredIfExternal"] = True
        return self

    def no_attachments(self) -> PolicyBuilder:
        self._constraints["attachments"] = False
        return self

    def with_constraints(self, constraints: dict[str, Any]) -> PolicyBuilder:
        """Merge additional raw constraints (escape hatch)."""
        self._constraints.update(constraints)
        return self

    def when_intent(self, category: str) -> PolicyBuilder:
        """Allow executions matching this intent category."""
        existing = self._constraints.get("allowedIntentCategories", [])
        self._constraints["allowedIntentCategories"] = [*existing, category]
        return self

    def when_intent_action(self, category: str, action: str) -> PolicyBuilder:
        """Allow a specific category + action pair."""
        self.when_intent(category)
        existing = self._constraints.get("allowedIntentActions", [])
        self._constraints["allowedIntentActions"] = [*existing, action]
        return self

    # ── Build ────────────────────────────────────────────────────────────

    def build(self) -> dict[str, Any]:
        """Build the final ConstraintSet dict."""
        from_predicates = _predicates_to_constraints(self._tool, self._predicates)
        return {**from_predicates, **self._constraints}

    def to_grant_input(
        self,
        agent_id: str,
        *,
        session: str | None = None,
        task: str | None = None,
        intent: str | dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Build a grant input dict — use with ``client.grant()``."""
        result: dict[str, Any] = {
            "agentId": agent_id,
            "tool": self._tool,
            "constraints": self.build(),
        }
        if self._grant_expires_in is not None:
            result["expiresIn"] = self._grant_expires_in
        if session is not None:
            result["session"] = session
        if task is not None:
            result["task"] = task
        if intent is not None:
            result["intent"] = intent
        if metadata is not None:
            result["metadata"] = metadata
        return result


def can(tool: str) -> PolicyBuilder:
    """Start building a capability policy for a tool.

    Example::

        can("gmail.send").only_domain("company.com").limit(5).expires_in("10m")
    """
    return PolicyBuilder(tool)


# ── Internal helpers ─────────────────────────────────────────────────────────


def _predicates_to_constraints(
    tool: str, predicates: list[PolicyPredicate]
) -> dict[str, Any]:
    out: dict[str, Any] = {}

    for p in predicates:
        if isinstance(p, DomainInPredicate):
            if tool != "gmail.send":
                raise ValueError(f"domain.in_() is only valid for gmail.send, got {tool}")
            out.setdefault("allowedDomains", [])
            out["allowedDomains"].extend(p.domains)

        elif isinstance(p, MethodInPredicate):
            if tool != "http.request":
                raise ValueError(f"method.in_() is only valid for http.request, got {tool}")
            out.setdefault("allowedMethods", [])
            out["allowedMethods"].extend(p.methods)

        elif isinstance(p, UrlInPredicate):
            if tool != "http.request":
                raise ValueError(f"url.in_() is only valid for http.request, got {tool}")
            out.setdefault("allowedUrls", [])
            out["allowedUrls"].extend(p.urls)

        elif isinstance(p, HoursBetweenPredicate):
            out["allowedHours"] = {"start": p.start, "end": p.end}

        elif isinstance(p, IntentCategoryPredicate):
            out.setdefault("allowedIntentCategories", [])
            out["allowedIntentCategories"].append(p.category)

        elif isinstance(p, IntentActionPredicate):
            out.setdefault("allowedIntentCategories", [])
            out["allowedIntentCategories"].append(p.category)
            out.setdefault("allowedIntentActions", [])
            out["allowedIntentActions"].append(p.action)

    # Deduplicate and normalize
    if "allowedDomains" in out:
        out["allowedDomains"] = list({d.lower() for d in out["allowedDomains"]})
    if "allowedMethods" in out:
        out["allowedMethods"] = list({m.upper() for m in out["allowedMethods"]})
    if "allowedIntentCategories" in out:
        out["allowedIntentCategories"] = list(
            {c.lower() for c in out["allowedIntentCategories"]}
        )
    if "allowedIntentActions" in out:
        out["allowedIntentActions"] = list(
            {a.lower() for a in out["allowedIntentActions"]}
        )

    return out
