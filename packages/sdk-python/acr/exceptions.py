"""ACR SDK exception classes."""

from __future__ import annotations


class AcrError(Exception):
    """Base exception for all ACR SDK errors."""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class GrantError(AcrError):
    """Raised when a capability grant request fails."""

    pass


class ExecuteError(AcrError):
    """Raised when a tool execution request fails unexpectedly (not a policy DENY)."""

    pass


class ApprovalError(AcrError):
    """Raised when an approval operation fails."""

    pass


class DelegateError(AcrError):
    """Raised when a capability delegation fails."""

    pass


class RevokeError(AcrError):
    """Raised when a capability revocation fails."""

    pass
