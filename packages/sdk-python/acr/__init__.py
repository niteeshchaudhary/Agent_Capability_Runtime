"""ACR SDK — Python client for Agent Capability Runtime."""

from acr.client import AcrClient
from acr.dsl import can, domain, method, url, hours, intent, PolicyBuilder
from acr.exceptions import AcrError, GrantError, ExecuteError, ApprovalError
from acr.local import LocalAcrClient, create_client
from acr.scope import QueryScopeGuard, QueryScopeConfig, ScopeResult, TopicRule
from acr.models import (
    ConstraintSet,
    ExecuteInput,
    ExecuteResult,
    ExecuteSuccess,
    ExecuteDenied,
    ExecuteApprovalRequired,
    ExecuteSimulated,
    GrantCapabilityInput,
    GrantResponse,
    ApprovalRequest,
    AuditEvent,
    DelegateCapabilityInput,
)

__version__ = "0.1.0"

__all__ = [
    # Client
    "AcrClient",
    "LocalAcrClient",
    "create_client",
    # Query scope (pre-LLM)
    "QueryScopeGuard",
    "QueryScopeConfig",
    "ScopeResult",
    "TopicRule",
    # DSL
    "can",
    "domain",
    "method",
    "url",
    "hours",
    "intent",
    "PolicyBuilder",
    # Exceptions
    "AcrError",
    "GrantError",
    "ExecuteError",
    "ApprovalError",
    # Models
    "ConstraintSet",
    "ExecuteInput",
    "ExecuteResult",
    "ExecuteSuccess",
    "ExecuteDenied",
    "ExecuteApprovalRequired",
    "ExecuteSimulated",
    "GrantCapabilityInput",
    "GrantResponse",
    "ApprovalRequest",
    "AuditEvent",
    "DelegateCapabilityInput",
]
