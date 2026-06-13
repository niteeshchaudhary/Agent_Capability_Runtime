"""Tests for OPA/Rego backend helpers."""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest

from acr.opa import (
    OpaConfig,
    build_opa_input,
    evaluate_opa,
    load_opa_config_from_env,
)


def test_build_opa_input_fields() -> None:
    body = build_opa_input(
        agent_id="a1",
        tool="slack.send",
        payload={"x": 1},
        constraints={"maxActions": 5},
        action_count=2,
        approval_granted=True,
    )
    assert body["agentId"] == "a1"
    assert body["actionCount"] == 2
    assert body["approvalGranted"] is True


def test_evaluate_opa_disabled() -> None:
    allowed, decision, reason, shadow = evaluate_opa(None, {})
    assert allowed is True
    assert decision == "ALLOW"
    assert reason is None
    assert shadow is False


def test_evaluate_opa_enforce_deny() -> None:
    config = OpaConfig(url="http://opa.test", mode="enforce")
    body = {"result": {"acr": {"decision": {"decision": "DENY", "reason": "blocked"}}}}

    class FakeResp:
        def read(self) -> bytes:
            return json.dumps(body).encode()

        def __enter__(self):
            return self

        def __exit__(self, *args: object) -> None:
            return None

    with patch("acr.opa.urllib.request.urlopen", return_value=FakeResp()):
        allowed, decision, reason, shadow = evaluate_opa(
            config,
            build_opa_input(
                agent_id="a",
                tool="t",
                payload={},
                constraints={},
                action_count=0,
            ),
        )
    assert allowed is False
    assert decision == "DENY"
    assert reason == "blocked"
    assert shadow is False


def test_evaluate_opa_shadow_allows() -> None:
    config = OpaConfig(url="http://opa.test", mode="shadow")
    body = {"result": {"acr": {"decision": {"decision": "DENY", "reason": "would block"}}}}

    class FakeResp:
        def read(self) -> bytes:
            return json.dumps(body).encode()

        def __enter__(self):
            return self

        def __exit__(self, *args: object) -> None:
            return None

    with patch("acr.opa.urllib.request.urlopen", return_value=FakeResp()):
        allowed, decision, _, shadow = evaluate_opa(
            config,
            build_opa_input(
                agent_id="a",
                tool="t",
                payload={},
                constraints={},
                action_count=0,
            ),
        )
    assert allowed is True
    assert decision == "DENY"
    assert shadow is True


def test_load_opa_config_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ACR_OPA_URL", "http://127.0.0.1:8181")
    monkeypatch.setenv("ACR_OPA_MODE", "shadow")
    cfg = load_opa_config_from_env()
    assert cfg is not None
    assert cfg.url == "http://127.0.0.1:8181"
    assert cfg.mode == "shadow"
