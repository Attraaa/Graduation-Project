"""Local channel token and HMAC helpers.

This cannot prevent an administrator-level process on the same machine from
observing keyboard input. It does help reject accidental or unauthenticated
messages at the module boundary.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from typing import Any, Mapping, Optional


class LocalSessionSecurity:
    """Session token plus canonical JSON HMAC signing."""

    def __init__(self, token: Optional[str] = None):
        self.token = token or secrets.token_urlsafe(32)
        self._key = self.token.encode("utf-8")

    def require_token(self, token: Optional[str]) -> bool:
        return bool(token) and hmac.compare_digest(str(token), self.token)

    def sign(self, payload: Mapping[str, Any]) -> str:
        body = _canonical_json(payload).encode("utf-8")
        return hmac.new(self._key, body, hashlib.sha256).hexdigest()

    def verify(self, payload: Mapping[str, Any], signature: Optional[str]) -> bool:
        if not signature:
            return False
        expected = self.sign(payload)
        return hmac.compare_digest(expected, str(signature))


def _canonical_json(payload: Mapping[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
