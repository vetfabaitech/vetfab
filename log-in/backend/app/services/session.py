"""Issues/verifies the JWT this backend uses as a session token.

No user database yet (see Settings.database_url's doc) -- claims are the
GitHub profile fields directly, so the token itself is the "user record"
for now. A real implementation would look up/create a local user row
keyed by (provider, provider_user_id) and put that row's own id in `sub`
instead.
"""

import time
from typing import Any

from jose import JWTError, jwt

from app.config import get_settings


class InvalidSessionError(Exception):
    pass


def create_session_token(*, subject: str, email: str, name: str | None, avatar_url: str | None, provider: str) -> str:
    settings = get_settings()
    now = int(time.time())
    claims = {
        "sub": subject,
        "email": email,
        "name": name,
        "avatar_url": avatar_url,
        "provider": provider,
        "iat": now,
        "exp": now + settings.jwt_expires_minutes * 60,
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_session_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise InvalidSessionError(str(exc)) from exc
