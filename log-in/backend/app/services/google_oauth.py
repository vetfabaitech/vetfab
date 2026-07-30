"""Talks to Google's OAuth + userinfo API for the login flow. Mirrors
github_oauth.py's shape -- see that file for the pattern this follows.
Nothing here is mocked -- these are real HTTP calls against
accounts.google.com/oauth2.googleapis.com/googleapis.com, using the client
id/secret from Settings (see .env.example)."""

from urllib.parse import urlencode

import httpx

from app.config import get_settings

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

SCOPES = "openid email profile"


class GoogleOAuthError(Exception):
    pass


def build_authorize_url(state: str) -> str:
    settings = get_settings()
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "state": state,
        "prompt": "select_account",
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


async def exchange_code_for_token(code: str) -> str:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            TOKEN_URL,
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "code": code,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
    body = response.json() if response.content else {}
    if response.status_code != 200:
        raise GoogleOAuthError(body.get("error_description", f"Token exchange failed with status {response.status_code}"))
    token = body.get("access_token")
    if not token:
        raise GoogleOAuthError("No access_token in Google's response")
    return token


class GoogleProfile:
    def __init__(self, id: str, name: str | None, email: str, avatar_url: str | None) -> None:
        self.id = id
        self.name = name
        self.email = email
        self.avatar_url = avatar_url


async def fetch_google_profile(access_token: str) -> GoogleProfile:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"})
    if response.status_code != 200:
        raise GoogleOAuthError(f"Failed to fetch Google profile (status {response.status_code})")
    profile = response.json()

    email = profile.get("email")
    if not email:
        raise GoogleOAuthError("Google account has no accessible email address")

    return GoogleProfile(
        id=profile["id"],
        name=profile.get("name"),
        email=email,
        avatar_url=profile.get("picture"),
    )
