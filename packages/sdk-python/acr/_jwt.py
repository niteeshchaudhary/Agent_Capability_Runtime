"""Minimal HS256 JWT encode/decode using only the standard library.

Used by the embedded local runtime (``acr.local``). Tokens are interoperable
with the gateway's HS256 signing when the same secret is configured.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
from typing import Any


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def encode_hs256(payload: dict[str, Any], secret: str) -> str:
    """Sign a JWT payload with HS256."""
    header = {"alg": "HS256", "typ": "JWT"}
    header_b64 = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    signature = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{header_b64}.{payload_b64}.{_b64url_encode(signature)}"


def decode_hs256(token: str, secret: str) -> dict[str, Any]:
    """Verify an HS256 JWT signature and return the payload.

    Raises ValueError for malformed tokens or signature mismatch.
    Expiry is NOT checked here — callers decide how to surface it.
    """
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("malformed token")

    header_b64, payload_b64, signature_b64 = parts
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    expected = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()

    try:
        actual = _b64url_decode(signature_b64)
    except Exception as exc:
        raise ValueError("malformed signature") from exc

    if not hmac.compare_digest(expected, actual):
        raise ValueError("invalid signature")

    try:
        payload = json.loads(_b64url_decode(payload_b64))
    except Exception as exc:
        raise ValueError("malformed payload") from exc

    if not isinstance(payload, dict):
        raise ValueError("invalid payload")
    return payload
