"""Auth endpoints.

/login is still a stub (501) -- GitHub and Google are both wired to real
flows. See github_oauth.py/google_oauth.py/session.py for how those paths
actually work.
"""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import RedirectResponse

from app.api.deps import get_session_claims
from app.config import get_settings
from app.schemas.auth import AuthResponse, LoginRequest, OAuthExchangeRequest, UserOut
from app.services import github_oauth, google_oauth, oauth_state
from app.services.session import create_session_token
from app.services.user_service import UserServiceError, get_user_service

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

_NOT_IMPLEMENTED = "This endpoint is a stub -- authentication isn't wired up yet."
_SESSION_COOKIE = "hdl_webide_session"


@router.post("/login")
async def login(body: LoginRequest) -> None:
    # TODO: look up the user by email, verify the password hash (never
    # store/compare plaintext), issue a session the same way
    # github_callback does below.
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, _NOT_IMPLEMENTED)


@router.get("/google/authorize")
async def google_authorize() -> RedirectResponse:
    """Browser is sent here directly (a real navigation, not fetch) by
    OAuthButtons' Google button. Redirects on to Google's consent screen
    with a freshly signed `state` (see oauth_state.py for why this needs
    no server-side session to verify on the way back)."""

    state = oauth_state.create_state()
    return RedirectResponse(google_oauth.build_authorize_url(state), status_code=status.HTTP_302_FOUND)


@router.post("/google/callback", response_model=AuthResponse)
async def google_callback(body: OAuthExchangeRequest, response: Response) -> AuthResponse:
    """Called by the frontend's callback page (POST, not a navigation) once
    Google has redirected back to it with `code`/`state` in the query
    string. Exchanges the code, fetches the profile, and issues a session."""

    if not oauth_state.verify_state(body.state):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This sign-in link has expired. Please try again.")

    try:
        access_token = await google_oauth.exchange_code_for_token(body.code)
        profile = await google_oauth.fetch_google_profile(access_token)
    except google_oauth.GoogleOAuthError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Unable to authenticate with Google. Please try again.") from exc

    # Same returning-vs-pending logic as github_callback above.
    try:
        existing_user = await get_user_service().get_by_oauth("google", str(profile.id))
    except UserServiceError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Unable to reach the user store. Please try again.") from exc

    subject = existing_user["id"] if existing_user else f"google:{profile.id}"
    session_token = create_session_token(
        subject=subject,
        email=profile.email,
        name=profile.name,
        avatar_url=profile.avatar_url,
        provider="google",
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

    return AuthResponse(
        user=UserOut(
            id=subject,
            email=profile.email,
            name=(existing_user["display_name"] if existing_user else profile.name),
            avatar_url=profile.avatar_url,
            provider="google",
        ),
        access_token=session_token,
        profile_complete=existing_user is not None,
    )


@router.get("/github/authorize")
async def github_authorize() -> RedirectResponse:
    """Browser is sent here directly (a real navigation, not fetch) by
    OAuthButtons' GitHub button. Redirects on to GitHub's consent screen
    with a freshly signed `state` (see oauth_state.py for why this needs
    no server-side session to verify on the way back)."""

    state = oauth_state.create_state()
    return RedirectResponse(github_oauth.build_authorize_url(state), status_code=status.HTTP_302_FOUND)


@router.post("/github/callback", response_model=AuthResponse)
async def github_callback(body: OAuthExchangeRequest, response: Response) -> AuthResponse:
    """Called by the frontend's callback page (POST, not a navigation) once
    GitHub has redirected back to it with `code`/`state` in the query
    string. Exchanges the code, fetches the profile, and issues a session."""

    if not oauth_state.verify_state(body.state):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This sign-in link has expired. Please try again.")

    try:
        access_token = await github_oauth.exchange_code_for_token(body.code)
        profile = await github_oauth.fetch_github_profile(access_token)
    except github_oauth.GitHubOAuthError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Unable to authenticate with GitHub. Please try again.") from exc

    # Look up a real `users` row for this GitHub identity. Found -> this is
    # a returning, fully-onboarded account, so `sub` becomes that row's own
    # id (a real uuid) instead of the provider-scoped placeholder. Not
    # found -> `sub` stays provider-scoped ("pending"); the frontend routes
    # to /onboarding, and POST /api/v1/user/complete-profile parses this
    # same subject back apart to create the row.
    try:
        existing_user = await get_user_service().get_by_oauth("github", str(profile.id))
    except UserServiceError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Unable to reach the user store. Please try again.") from exc

    subject = existing_user["id"] if existing_user else f"github:{profile.id}"
    session_token = create_session_token(
        subject=subject,
        email=profile.email,
        name=profile.name or profile.login,
        avatar_url=profile.avatar_url,
        provider="github",
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

    return AuthResponse(
        user=UserOut(
            id=subject,
            email=profile.email,
            name=(existing_user["display_name"] if existing_user else profile.name or profile.login),
            avatar_url=profile.avatar_url,
            provider="github",
        ),
        access_token=session_token,
        profile_complete=existing_user is not None,
    )


@router.post("/logout")
async def logout(response: Response) -> None:
    response.delete_cookie(_SESSION_COOKIE)


@router.get("/me", response_model=UserOut)
async def me(claims: dict = Depends(get_session_claims)) -> UserOut:
    """Decodes whatever session token the request carries -- see
    app/api/deps.py. Works for both pending (not-yet-onboarded) and
    complete sessions, since it only ever reads JWT claims, never the
    `users` table (see GET /api/v1/user/profile for that)."""

    return UserOut(
        id=claims["sub"],
        email=claims["email"],
        name=claims.get("name"),
        avatar_url=claims.get("avatar_url"),
        provider=claims["provider"],
    )
