"""Tests for acr.dsl — PolicyBuilder and can() fluent API."""

from acr.dsl import (
    PolicyBuilder,
    can,
    domain,
    hours,
    intent,
    method,
    url,
)
import pytest


class TestCan:
    def test_basic_builder(self):
        constraints = can("gmail.send").build()
        assert constraints == {}

    def test_only_domain(self):
        constraints = can("gmail.send").only_domain("company.com").build()
        assert constraints["allowedDomains"] == ["company.com"]

    def test_only_domains_multiple(self):
        constraints = can("gmail.send").only_domains("a.com", "b.com").build()
        assert set(constraints["allowedDomains"]) == {"a.com", "b.com"}

    def test_limit(self):
        constraints = can("gmail.send").limit(5).build()
        assert constraints["maxActions"] == 5

    def test_max_spend(self):
        constraints = can("gmail.send").max_spend(100_00).build()
        assert constraints["spendingLimit"] == 100_00

    def test_expires_in(self):
        builder = can("gmail.send").expires_in("10m")
        grant_input = builder.to_grant_input(agent_id="agent_1")
        assert grant_input["expiresIn"] == "10m"
        assert grant_input["agentId"] == "agent_1"
        assert grant_input["tool"] == "gmail.send"

    def test_require_approval(self):
        constraints = can("gmail.send").require_approval().build()
        assert constraints["approvalRequired"] is True

    def test_no_attachments(self):
        constraints = can("gmail.send").no_attachments().build()
        assert constraints["attachments"] is False

    def test_chained_fluent(self):
        constraints = (
            can("gmail.send")
            .only_domain("company.com")
            .limit(5)
            .max_spend(100_00)
            .no_attachments()
            .require_approval()
            .build()
        )
        assert constraints["allowedDomains"] == ["company.com"]
        assert constraints["maxActions"] == 5
        assert constraints["spendingLimit"] == 100_00
        assert constraints["attachments"] is False
        assert constraints["approvalRequired"] is True

    def test_to_grant_input_full(self):
        gi = (
            can("gmail.send")
            .only_domain("company.com")
            .limit(5)
            .expires_in("10m")
            .to_grant_input(agent_id="support_agent", session="s1", task="t1")
        )
        assert gi["agentId"] == "support_agent"
        assert gi["tool"] == "gmail.send"
        assert gi["constraints"]["allowedDomains"] == ["company.com"]
        assert gi["constraints"]["maxActions"] == 5
        assert gi["expiresIn"] == "10m"
        assert gi["session"] == "s1"
        assert gi["task"] == "t1"

    def test_when_intent(self):
        constraints = can("gmail.send").when_intent("customer_support").build()
        assert constraints["allowedIntentCategories"] == ["customer_support"]

    def test_when_intent_action(self):
        constraints = (
            can("gmail.send")
            .when_intent_action("customer_support", "reply_email")
            .build()
        )
        assert "customer_support" in constraints["allowedIntentCategories"]
        assert "reply_email" in constraints["allowedIntentActions"]

    def test_allowed_hours(self):
        constraints = can("gmail.send").allowed_hours(9, 17).build()
        assert constraints["allowedHours"] == {"start": 9, "end": 17}


class TestPredicates:
    def test_domain_in(self):
        constraints = (
            can("gmail.send").where(domain.in_(["company.com", "partner.com"])).build()
        )
        assert set(constraints["allowedDomains"]) == {"company.com", "partner.com"}

    def test_domain_in_wrong_tool(self):
        with pytest.raises(ValueError, match="gmail.send"):
            can("http.request").where(domain.in_(["company.com"])).build()

    def test_method_in(self):
        constraints = (
            can("http.request").where(method.in_(["get", "post"])).build()
        )
        assert set(constraints["allowedMethods"]) == {"GET", "POST"}

    def test_method_in_wrong_tool(self):
        with pytest.raises(ValueError, match="http.request"):
            can("gmail.send").where(method.in_(["GET"])).build()

    def test_url_in(self):
        constraints = (
            can("http.request").where(url.in_(["https://api.example.com"])).build()
        )
        assert constraints["allowedUrls"] == ["https://api.example.com"]

    def test_hours_between(self):
        constraints = can("gmail.send").where(hours.between(9, 17)).build()
        assert constraints["allowedHours"] == {"start": 9, "end": 17}

    def test_intent_category(self):
        constraints = (
            can("gmail.send").where(intent.category("support")).build()
        )
        assert constraints["allowedIntentCategories"] == ["support"]

    def test_intent_action(self):
        constraints = (
            can("gmail.send").where(intent.action("support", "reply")).build()
        )
        assert "support" in constraints["allowedIntentCategories"]
        assert "reply" in constraints["allowedIntentActions"]


class TestWithConstraints:
    def test_raw_constraints(self):
        constraints = (
            can("gmail.send")
            .with_constraints({"customField": "value"})
            .build()
        )
        assert constraints["customField"] == "value"
