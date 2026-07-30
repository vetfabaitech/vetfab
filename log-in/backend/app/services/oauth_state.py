"""Stateless CSRF protection for the OAuth `state` param.

The usual pattern stores a random nonce server-side (session/cookie) and
compares it on callback. That needs a cookie to survive the redirect to
GitHub and back -- which, across the frontend's origin (localhost:5174)
and this backend's origin (localhost:8010), means fighting SameSite
semantics for no real benefit at this scope. Instead, `state` here is
self-verifying: a random nonce + timestamp, HMAC-signed with JWT_SECRET.
GitHub round-trips it verbatim; the callback just re-verifies the
signature and checks it isn't stale. No server-side storage, no cookie
dependency, same CSRF guarantee (an attacker can't forge a valid
signature without the secret).
"""

import hashlib
import hmac
import secrets
import time

from app.config import get_settings

_MAX_AGE_SECONDS = 600  # 10 minutes -- generous for a human to approve the consent screen


def _sign(payload: str) -> str:
    secret = get_settings().jwt_secret.encode("utf-8")
    return hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()


def create_state() -> str:
    nonce = secrets.token_urlsafe(16)
    timestamp = str(int(time.time()))
    payload = f"{nonce}.{timestamp}"
    signature = _sign(payload)
    return f"{payload}.{signature}"


def verify_state(state: str) -> bool:
    parts = state.split(".")
    if len(parts) != 3:
        return False
    nonce, timestamp, signature = parts
    payload = f"{nonce}.{timestamp}"
    expected = _sign(payload)
    if not hmac.compare_digest(expected, signature):
        return False
    try:
        age = int(time.time()) - int(timestamp)
    except ValueError:
        return False
    return 0 <= age <= _MAX_AGE_SECONDS
