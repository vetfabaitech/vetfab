"""Shared FastAPI dependency for reading the session token off a request --
factored out of auth.py's `/me` so app/api/user.py's endpoints (which also
need "who's calling") don't duplicate the same extraction logic.
"""

from fastapi import Header, HTTPException, Request, status

from app.services.session import InvalidSessionError, decode_session_token

_SESSION_COOKIE = "hdl_webide_session"


def get_session_claims(request: Request, authorization: str | None = Header(default=None)) -> dict:
    """Accepts the session either as a Bearer token (what the frontend
    actually uses) or the httpOnly cookie /github/callback also sets.
    Raises 401 if neither is present or the token is invalid/expired."""

    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:]
    elif _SESSION_COOKIE in request.cookies:
        token = request.cookies[_SESSION_COOKIE]

    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in.")

    try:
        return decode_session_token(token)
    except InvalidSessionError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session has expired. Please sign in again.") from exc
