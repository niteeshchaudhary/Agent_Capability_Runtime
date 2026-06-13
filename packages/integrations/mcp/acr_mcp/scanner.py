"""MCP tool-description scanner — detect tool poisoning before agents trust a server.

Deterministic, zero-dependency static analysis of MCP tool definitions. Catches:

- **Prompt injection / hidden instructions** in tool descriptions
  (e.g. "ignore previous instructions", "do not tell the user").
- **Invisible / bidirectional unicode** used to smuggle instructions past humans.
- **Sensitive data exfiltration hints** (read ~/.ssh, .env, send to external host).
- **Typosquatting** of trusted tool names (e.g. ``read_flie`` vs ``read_file``).

This addresses MCP supply-chain risk (OWASP Agentic ASI tool misuse) the same way
AgentWard / Microsoft AGT scanners do, while staying free of external tooling.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Iterable


class Severity(str, Enum):
    """Finding severity, ordered low → high via :func:`severity_rank`."""

    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


_SEVERITY_ORDER = {
    Severity.INFO: 0,
    Severity.LOW: 1,
    Severity.MEDIUM: 2,
    Severity.HIGH: 3,
    Severity.CRITICAL: 4,
}


def severity_rank(severity: Severity) -> int:
    return _SEVERITY_ORDER[severity]


@dataclass(frozen=True)
class ToolFinding:
    """A single issue detected in a tool definition."""

    code: str
    severity: Severity
    message: str
    evidence: str = ""


@dataclass(frozen=True)
class ToolScanReport:
    """Result of scanning one MCP tool definition."""

    tool_name: str
    findings: tuple[ToolFinding, ...] = ()

    @property
    def max_severity(self) -> Severity:
        if not self.findings:
            return Severity.INFO
        return max((f.severity for f in self.findings), key=severity_rank)

    def is_blocked(self, threshold: Severity) -> bool:
        """True when any finding meets/exceeds ``threshold``."""
        if not self.findings:
            return False
        return severity_rank(self.max_severity) >= severity_rank(threshold)

    def to_dict(self) -> dict[str, Any]:
        return {
            "tool": self.tool_name,
            "max_severity": self.max_severity.value,
            "findings": [
                {
                    "code": f.code,
                    "severity": f.severity.value,
                    "message": f.message,
                    "evidence": f.evidence,
                }
                for f in self.findings
            ],
        }


@dataclass(frozen=True)
class ScanReport:
    """Result of scanning a batch of MCP tools."""

    reports: tuple[ToolScanReport, ...] = ()
    block_threshold: Severity = Severity.HIGH

    @property
    def blocked_tools(self) -> tuple[str, ...]:
        return tuple(
            r.tool_name for r in self.reports if r.is_blocked(self.block_threshold)
        )

    @property
    def is_safe(self) -> bool:
        return len(self.blocked_tools) == 0

    def report_for(self, tool_name: str) -> ToolScanReport | None:
        for r in self.reports:
            if r.tool_name == tool_name:
                return r
        return None

    def to_dict(self) -> dict[str, Any]:
        return {
            "block_threshold": self.block_threshold.value,
            "is_safe": self.is_safe,
            "blocked_tools": list(self.blocked_tools),
            "reports": [r.to_dict() for r in self.reports],
        }


# ── Detection rules ──────────────────────────────────────────────────────────

# Imperative override / instruction-injection phrases.
_INJECTION_PATTERNS: tuple[tuple[str, str, Severity], ...] = (
    (r"ignore\s+(all\s+|any\s+)?(the\s+)?previous\s+instructions", "injection.ignore_previous", Severity.CRITICAL),
    (r"disregard\s+(all\s+|the\s+)?(above|previous|prior)", "injection.disregard", Severity.CRITICAL),
    (r"forget\s+(all\s+|everything\s+|your\s+)", "injection.forget", Severity.HIGH),
    (r"system\s*prompt", "injection.system_prompt", Severity.HIGH),
    (r"</?(system|instructions?)>", "injection.fake_tags", Severity.HIGH),
    (r"do\s+not\s+(tell|inform|mention|reveal)\b", "injection.conceal", Severity.CRITICAL),
    (r"without\s+(informing|telling|notifying)\s+the\s+user", "injection.conceal_user", Severity.CRITICAL),
    (r"\bsecretly\b", "injection.secretly", Severity.HIGH),
    (r"you\s+must\s+(always|now|first)\b", "injection.must_directive", Severity.MEDIUM),
    (r"override\s+(the\s+)?(policy|policies|rules|restrictions)", "injection.override_policy", Severity.HIGH),
)

# Sensitive data exfiltration hints.
_EXFIL_PATTERNS: tuple[tuple[str, str, Severity], ...] = (
    (r"~?/?\.ssh\b", "exfil.ssh", Severity.HIGH),
    (r"\.env\b", "exfil.dotenv", Severity.HIGH),
    (r"\bid_rsa\b", "exfil.private_key", Severity.HIGH),
    (r"(aws|gcp|azure)[_\s-]*(secret|key|credential)", "exfil.cloud_cred", Severity.HIGH),
    (r"\b(api[_\s-]?key|access[_\s-]?token|password)s?\b", "exfil.secret_terms", Severity.MEDIUM),
    (r"(exfiltrat|leak)\w*", "exfil.explicit", Severity.CRITICAL),
    (r"send\s+(it\s+|the\s+|them\s+|this\s+)?to\s+https?://", "exfil.send_external", Severity.HIGH),
)

# Hidden HTML/markdown comment payloads.
_HIDDEN_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)

# Invisible / control / bidirectional characters often used to hide text.
_INVISIBLE_RE = re.compile(
    "["
    "\u200b-\u200f"  # zero-width + directional marks
    "\u202a-\u202e"  # bidi embedding/override
    "\u2060-\u2064"  # word joiner / invisible operators
    "\u2066-\u2069"  # bidi isolates
    "\ufeff"          # BOM / zero-width no-break space
    "\u00ad"          # soft hyphen
    "]"
)


def _ellipsize(text: str, limit: int = 80) -> str:
    snippet = " ".join(text.split())
    return snippet if len(snippet) <= limit else snippet[: limit - 1] + "…"


def _levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        curr = [i]
        for j, cb in enumerate(b, start=1):
            cost = 0 if ca == cb else 1
            curr.append(min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost))
        prev = curr
    return prev[-1]


class McpToolScanner:
    """Static scanner for MCP tool definitions."""

    def __init__(
        self,
        *,
        trusted_tools: Iterable[str] | None = None,
        block_threshold: Severity = Severity.HIGH,
        max_description_chars: int = 4000,
    ) -> None:
        self._trusted = sorted({t.strip().lower() for t in (trusted_tools or []) if t.strip()})
        self._block_threshold = block_threshold
        self._max_description_chars = max_description_chars

    @property
    def block_threshold(self) -> Severity:
        return self._block_threshold

    def scan_tool(
        self,
        name: str,
        description: str | None = None,
        *,
        input_schema: dict[str, Any] | None = None,
    ) -> ToolScanReport:
        findings: list[ToolFinding] = []
        text = description or ""

        findings.extend(self._scan_invisible(text))
        findings.extend(self._scan_hidden_comments(text))
        findings.extend(self._scan_patterns(text, _INJECTION_PATTERNS))
        findings.extend(self._scan_patterns(text, _EXFIL_PATTERNS))
        findings.extend(self._scan_length(text))
        findings.extend(self._scan_typosquat(name))
        if input_schema is not None:
            findings.extend(self._scan_schema(input_schema))

        return ToolScanReport(tool_name=name, findings=tuple(findings))

    def scan_tools(self, tools: Iterable[Any]) -> ScanReport:
        """Scan a collection of MCP tools.

        Each item may be a mapping (``{"name", "description", "inputSchema"}``)
        or an object exposing ``name`` / ``description`` / ``inputSchema``.
        """
        reports = [self._scan_any(tool) for tool in tools]
        return ScanReport(reports=tuple(reports), block_threshold=self._block_threshold)

    # ── internal scanners ────────────────────────────────────────────────

    def _scan_any(self, tool: Any) -> ToolScanReport:
        name, description, schema = _extract_tool_fields(tool)
        return self.scan_tool(name, description, input_schema=schema)

    def _scan_invisible(self, text: str) -> list[ToolFinding]:
        matches = _INVISIBLE_RE.findall(text)
        if not matches:
            return []
        names = sorted({unicodedata.name(ch, f"U+{ord(ch):04X}") for ch in matches})
        return [
            ToolFinding(
                code="hidden.invisible_unicode",
                severity=Severity.HIGH,
                message=f"description contains {len(matches)} invisible/bidirectional character(s)",
                evidence=", ".join(names[:5]),
            )
        ]

    def _scan_hidden_comments(self, text: str) -> list[ToolFinding]:
        findings: list[ToolFinding] = []
        for match in _HIDDEN_COMMENT_RE.findall(text):
            findings.append(
                ToolFinding(
                    code="hidden.comment",
                    severity=Severity.MEDIUM,
                    message="description contains a hidden HTML/markdown comment",
                    evidence=_ellipsize(match),
                )
            )
        return findings

    def _scan_patterns(
        self, text: str, patterns: tuple[tuple[str, str, Severity], ...]
    ) -> list[ToolFinding]:
        findings: list[ToolFinding] = []
        for pattern, code, severity in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                findings.append(
                    ToolFinding(
                        code=code,
                        severity=severity,
                        message=f"description matches suspicious pattern: {code}",
                        evidence=_ellipsize(match.group(0)),
                    )
                )
        return findings

    def _scan_length(self, text: str) -> list[ToolFinding]:
        if len(text) > self._max_description_chars:
            return [
                ToolFinding(
                    code="anomaly.long_description",
                    severity=Severity.LOW,
                    message=(
                        f"description is unusually long "
                        f"({len(text)} > {self._max_description_chars} chars)"
                    ),
                )
            ]
        return []

    def _scan_typosquat(self, name: str) -> list[ToolFinding]:
        if not self._trusted:
            return []
        candidate = name.strip().lower()
        if candidate in self._trusted:
            return []
        for trusted in self._trusted:
            distance = _levenshtein(candidate, trusted)
            if 0 < distance <= 2 and abs(len(candidate) - len(trusted)) <= 2:
                return [
                    ToolFinding(
                        code="typosquat.near_trusted",
                        severity=Severity.HIGH,
                        message=(
                            f"tool name {name!r} closely resembles trusted tool "
                            f"{trusted!r} (edit distance {distance})"
                        ),
                        evidence=trusted,
                    )
                ]
        return []

    def _scan_schema(self, schema: dict[str, Any]) -> list[ToolFinding]:
        findings: list[ToolFinding] = []
        blob = _stringify_schema(schema)
        findings.extend(self._scan_invisible(blob))
        findings.extend(self._scan_patterns(blob, _INJECTION_PATTERNS))
        # Re-label schema findings so they are distinguishable from description ones.
        return [
            ToolFinding(
                code=f"schema.{f.code}",
                severity=f.severity,
                message=f"input schema: {f.message}",
                evidence=f.evidence,
            )
            for f in findings
        ]


def _extract_tool_fields(tool: Any) -> tuple[str, str, dict[str, Any] | None]:
    if isinstance(tool, dict):
        name = str(tool.get("name", ""))
        description = str(tool.get("description", "") or "")
        schema = tool.get("inputSchema") or tool.get("input_schema")
        return name, description, schema if isinstance(schema, dict) else None
    name = str(getattr(tool, "name", "") or "")
    description = str(getattr(tool, "description", "") or "")
    schema = getattr(tool, "inputSchema", None) or getattr(tool, "input_schema", None)
    return name, description, schema if isinstance(schema, dict) else None


def _stringify_schema(schema: dict[str, Any]) -> str:
    parts: list[str] = []

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                parts.append(str(key))
                walk(value)
        elif isinstance(node, (list, tuple)):
            for item in node:
                walk(item)
        else:
            parts.append(str(node))

    walk(schema)
    return " ".join(parts)
