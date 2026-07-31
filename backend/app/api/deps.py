"""Shared FastAPI dependency for identifying the caller, decoded from the
session JWT the log-in backend issues (see ../../../log-in/backend/app/services
/session.py -- this only ever verifies that token, never mints one).

MVP scope note: only the project endpoints (app/api/project.py) use this so
far -- every other route in this backend is still exactly as open as before
(see frontend/src/components/AuthGuard.tsx's doc comment for why that's a
deliberate, separate follow-up rather than an oversight).
"""

from uuid import UUID

from fastapi import Header, HTTPException, status
from jose import JWTError, jwt

from app.config import get_settings


def get_current_user_id(authorization: str | None = Header(default=None)) -> str:
    """Extracts and verifies the Bearer token's `sub` claim -- the Supabase
    `users.id` of whoever is calling. Raises 401 if the header is missing,
    malformed, or the token is invalid/expired."""

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in.")

    settings = get_settings()
    if not settings.jwt_secret:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session verification is not configured.")

    token = authorization[7:]
    try:
        claims = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session has expired. Please sign in again.") from exc

    sub = claims.get("sub")
    if not sub:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in.")

    # `sub` is used verbatim as `owner_id` against Postgres `uuid` columns
    # (see app/services/metadata_service.py) -- a *pending* log-in-app
    # session (no completed onboarding yet) carries a provider-scoped
    # placeholder instead ("github:<oauth_id>", see
    # ../../../log-in/backend/app/api/auth.py's github_callback), which
    # fails there with a raw "invalid input syntax for type uuid" rather
    # than a clean error. Reject it here instead, before it ever reaches a
    # query -- this also catches any other malformed/stale `sub` the same way.
    try:
        UUID(sub)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session has expired. Please sign in again.") from exc

    return sub
