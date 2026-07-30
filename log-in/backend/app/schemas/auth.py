"""Request/response contracts for POST /api/v1/auth/*.

Defined now so the frontend's mockAuth.ts has a real shape to match when
it eventually gets wired to these endpoints -- the fields here are what
LoginForm/OAuthButtons already send and expect back.
"""

from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    remember: bool = False


class OAuthExchangeRequest(BaseModel):
    """Body for POST /auth/{provider}/callback -- the authorization `code`
    (and CSRF `state`) the provider's redirect handed back to the frontend,
    to be exchanged server-side for that provider's token (never done in
    the browser -- it would require exposing the client *secret* to
    client-side JS)."""

    code: str
    state: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str | None = None
    avatar_url: str | None = None
    provider: str  # "password" | "google" | "github"


class AuthResponse(BaseModel):
    user: UserOut
    # A real implementation would set the token as an httpOnly cookie
    # instead of returning it in the body, so it's never reachable from JS
    # (mitigates XSS-based token theft). Included here only to keep this
    # stub's contract self-describing.
    access_token: str
    token_type: str = "bearer"
    # False the first time a given (provider, oauth_id) signs in -- no
    # `users` row exists yet. The frontend routes to /onboarding instead of
    # the dashboard in that case. See app/api/user.py's complete_profile.
    profile_complete: bool = False
