"""GET /api/v1/user/check-username, POST /api/v1/user/complete-profile,
GET /api/v1/user/profile -- the one-time "create your IDE identity" step
after GitHub OAuth. See app/api/auth.py's github_callback for how a
session ends up "pending" (no `users` row yet) in the first place.
"""

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.api.deps import get_session_claims
from app.config import get_settings
from app.schemas.user import CheckUsernameResponse, CompleteProfileRequest, CompleteProfileResponse, ProfileOut
from app.services.project_bootstrap import ProjectBootstrapError, create_welcome_project
from app.services.session import create_session_token
from app.services.user_service import UserServiceError, UsernameTakenError, get_user_service
from app.utils.logger import get_logger
from app.utils.username import validate_username_format

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1/user", tags=["user"])

# Same cookie name/settings as app/api/auth.py's github_callback/google_callback
# -- complete_profile below reissues this exactly the same way they do,
# since it's minting a session token for the same reason they are (a new
# `sub`), just one step later in the flow.
_SESSION_COOKIE = "hdl_webide_session"


def _parse_pending_subject(sub: str) -> tuple[str, str]:
    """Reverses github_callback's `f"{provider}:{oauth_id}"` placeholder --
    raises 409 if `sub` is already a real user id (nothing to complete)."""

    if ":" not in sub:
        raise HTTPException(status.HTTP_409_CONFLICT, "This account already has a completed profile.")
    provider, oauth_id = sub.split(":", 1)
    return provider, oauth_id


@router.get("/check-username", response_model=CheckUsernameResponse)
async def check_username(username: str) -> CheckUsernameResponse:
    username = username.strip().lower()
    format_error = validate_username_format(username)
    if format_error:
        return CheckUsernameResponse(available=False, reason=format_error)

    try:
        existing = await get_user_service().get_by_username(username)
    except UserServiceError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Unable to check username availability right now.") from exc

    if existing:
        return CheckUsernameResponse(available=False, reason="This username is already taken.")
    return CheckUsernameResponse(available=True)


@router.post("/complete-profile", response_model=CompleteProfileResponse)
async def complete_profile(
    body: CompleteProfileRequest, response: Response, claims: dict = Depends(get_session_claims)
) -> CompleteProfileResponse:
    provider, oauth_id = _parse_pending_subject(claims["sub"])

    username = body.username.strip().lower()
    format_error = validate_username_format(username)
    if format_error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, format_error)

    user_service = get_user_service()
    try:
        if await user_service.get_by_username(username):
            raise HTTPException(status.HTTP_409_CONFLICT, "This username is already taken.")

        user = await user_service.create(
            {
                "oauth_provider": provider,
                "oauth_id": oauth_id,
                "username": username,
                "display_name": body.displayName.strip() or claims.get("name") or username,
                "email": claims["email"],
                "avatar_url": claims.get("avatar_url"),
                "bio": body.bio,
                "country": body.country,
                "timezone": body.timezone,
                "preferred_hdl": body.preferredHdl,
                "theme": body.theme,
                "default_visibility": body.defaultVisibility,
            }
        )
    except UsernameTakenError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "This username is already taken.") from exc
    except UserServiceError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Unable to save your profile right now. Please try again.") from exc

    # Best-effort: the account exists and is fully usable even if this
    # fails -- never block onboarding on it (see project_bootstrap.py).
    try:
        await create_welcome_project(username=username, owner_id=user["id"])
    except ProjectBootstrapError as exc:
        logger.warning("Welcome project creation failed for user '%s': %s", user["id"], exc)

    # The token this request authenticated with still carries the
    # pre-onboarding placeholder subject ("github:<oauth_id>", parsed apart
    # above) -- it was only ever good for reaching this endpoint (see
    # _parse_pending_subject). Now that a real `users` row exists, mint a
    # fresh token with that row's own uuid `id` as `sub`, exactly like
    # app/api/auth.py's github_callback/google_callback do for a *returning*
    # user. Callers MUST switch to this token: continuing to use the old one
    # sends a non-uuid string ("github:<oauth_id>") anywhere a `sub` gets
    # used as a Postgres uuid value -- e.g. the main WebIDE backend's
    # projects.owner_id column -- which fails outright rather than silently
    # misbehaving.
    session_token = create_session_token(
        subject=user["id"],
        email=user["email"],
        name=user["display_name"],
        avatar_url=user.get("avatar_url"),
        provider=provider,
    )

    settings = get_settings()
    response.set_cookie(
        _SESSION_COOKIE,
        session_token,
        max_age=settings.jwt_expires_minutes * 60,
        httponly=True,
        samesite="lax",
        secure=False,  # flip to True once this is served over HTTPS
    )

    return CompleteProfileResponse(profile=ProfileOut.model_validate(user), accessToken=session_token)


@router.get("/profile", response_model=ProfileOut)
async def get_profile(claims: dict = Depends(get_session_claims)) -> ProfileOut:
    sub = claims["sub"]
    if ":" in sub:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not created yet.")

    try:
        user = await get_user_service().get_by_id(sub)
    except UserServiceError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Unable to load your profile right now.") from exc

    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found.")
    return ProfileOut.model_validate(user)
