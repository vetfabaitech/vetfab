"""Talks to GitHub's OAuth + REST API for the login flow. Nothing here is
mocked -- these are real HTTP calls against github.com/api.github.com,
using the client id/secret from Settings (see .env.example)."""

from urllib.parse import urlencode

import httpx

from app.config import get_settings

AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
TOKEN_URL = "https://github.com/login/oauth/access_token"
USER_URL = "https://api.github.com/user"
EMAILS_URL = "https://api.github.com/user/emails"

# read:user for profile fields, user:email in case the primary email is
# private (not returned on /user, needs the separate /user/emails call).
SCOPES = "read:user user:email"


class GitHubOAuthError(Exception):
    pass


def build_authorize_url(state: str) -> str:
    settings = get_settings()
    params = {
        "client_id": settings.github_client_id,
        "redirect_uri": settings.github_redirect_uri,
        "scope": SCOPES,
        "state": state,
        "allow_signup": "true",
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


async def exchange_code_for_token(code: str) -> str:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            TOKEN_URL,
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
                "redirect_uri": settings.github_redirect_uri,
            },
        )
    if response.status_code != 200:
        raise GitHubOAuthError(f"Token exchange failed with status {response.status_code}")

    body = response.json()
    if "error" in body:
        raise GitHubOAuthError(body.get("error_description", body["error"]))
    token = body.get("access_token")
    if not token:
        raise GitHubOAuthError("No access_token in GitHub's response")
    return token


class GitHubProfile:
    def __init__(self, id: int, login: str, name: str | None, email: str, avatar_url: str | None) -> None:
        self.id = id
        self.login = login
        self.name = name
        self.email = email
        self.avatar_url = avatar_url


async def fetch_github_profile(access_token: str) -> GitHubProfile:
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        user_response = await client.get(USER_URL, headers=headers)
        if user_response.status_code != 200:
            raise GitHubOAuthError(f"Failed to fetch GitHub profile (status {user_response.status_code})")
        user = user_response.json()

        email = user.get("email")
        if not email:
            # Primary email is private -- fall back to the verified primary
            # entry from the emails endpoint (needs the user:email scope).
            emails_response = await client.get(EMAILS_URL, headers=headers)
            if emails_response.status_code == 200:
                for entry in emails_response.json():
                    if entry.get("primary") and entry.get("verified"):
                        email = entry["email"]
                        break

    if not email:
        raise GitHubOAuthError("GitHub account has no accessible email address")

    return GitHubProfile(
        id=user["id"],
        login=user["login"],
        name=user.get("name"),
        email=email,
        avatar_url=user.get("avatar_url"),
    )
