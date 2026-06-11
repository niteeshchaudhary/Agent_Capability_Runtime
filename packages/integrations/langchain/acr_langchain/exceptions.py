"""acr-langchain exceptions."""


class AcrToolDeniedError(Exception):
    """Raised when ACR denies a tool call before local execution."""

    def __init__(self, reason: str, *, code: str | None = None, audit_id: str | None = None) -> None:
        super().__init__(reason)
        self.reason = reason
        self.code = code
        self.audit_id = audit_id
