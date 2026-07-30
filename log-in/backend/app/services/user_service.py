"""User service: owns the `users` table (Supabase Postgres, same project as
the main WebIDE backend's `projects`/`folders`/`files` -- see
../../../backend/app/services/metadata_service.py for the sibling this
mirrors).

Uses the official synchronous `supabase-py` client, same reasoning as
every other service in this codebase that talks to it: the SDK is
synchronous, so every call is pushed through `asyncio.to_thread` to keep
the event loop free.
"""

import asyncio
from datetime import UTC, datetime
from typing import Any

from postgrest.exceptions import APIError
from supabase import Client, create_client

from app.config import get_settings

_COLUMNS = (
    "id,oauth_provider,oauth_id,username,display_name,email,avatar_url,bio,"
    "country,timezone,preferred_hdl,theme,default_visibility,created_at,updated_at"
)


class UserServiceError(Exception):
    """Raised when a `users` table call fails. Handlers map this to 500."""


class UsernameTakenError(Exception):
    """Raised when a username uniqueness check fails at insert time (a race
    against another signup, not caught by the pre-check) -- lets the caller
    return a clean 409 instead of a raw 500."""


class UserService:
    def __init__(self, url: str, service_role_key: str) -> None:
        self._url = url
        self._key = service_role_key
        self._client: Client | None = None

    def _client_or_raise(self) -> Client:
        if not self._url or not self._key:
            raise UserServiceError("Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)")
        if self._client is None:
            self._client = create_client(self._url, self._key)
        return self._client

    def _get_by_oauth_sync(self, provider: str, oauth_id: str) -> dict[str, Any] | None:
        client = self._client_or_raise()
        try:
            result = (
                client.table("users")
                .select(_COLUMNS)
                .eq("oauth_provider", provider)
                .eq("oauth_id", oauth_id)
                .limit(1)
                .execute()
            )
        except APIError as exc:
            raise UserServiceError(f"Failed to look up user by oauth identity: {exc}") from exc
        return result.data[0] if result.data else None

    async def get_by_oauth(self, provider: str, oauth_id: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._get_by_oauth_sync, provider, oauth_id)

    def _get_by_id_sync(self, user_id: str) -> dict[str, Any] | None:
        client = self._client_or_raise()
        try:
            result = client.table("users").select(_COLUMNS).eq("id", user_id).limit(1).execute()
        except APIError as exc:
            raise UserServiceError(f"Failed to look up user '{user_id}': {exc}") from exc
        return result.data[0] if result.data else None

    async def get_by_id(self, user_id: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._get_by_id_sync, user_id)

    def _get_by_username_sync(self, username: str) -> dict[str, Any] | None:
        client = self._client_or_raise()
        try:
            result = client.table("users").select("id").eq("username", username).limit(1).execute()
        except APIError as exc:
            raise UserServiceError(f"Failed to check username '{username}': {exc}") from exc
        return result.data[0] if result.data else None

    async def get_by_username(self, username: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._get_by_username_sync, username)

    def _create_sync(self, fields: dict[str, Any]) -> dict[str, Any]:
        client = self._client_or_raise()
        now = datetime.now(UTC).isoformat()
        row = {**fields, "created_at": now, "updated_at": now}
        try:
            result = client.table("users").insert(row).execute()
        except APIError as exc:
            # Postgres unique_violation -- another request took the username
            # between our availability check and this insert.
            if "duplicate key" in str(exc).lower() or getattr(exc, "code", None) == "23505":
                raise UsernameTakenError(fields.get("username", "")) from exc
            raise UserServiceError(f"Failed to create user: {exc}") from exc
        return result.data[0]

    async def create(self, fields: dict[str, Any]) -> dict[str, Any]:
        """`fields` should already be validated (see app/utils/username.py)
        -- this is a straight insert. Returns the created row."""

        return await asyncio.to_thread(self._create_sync, fields)


def get_user_service() -> "UserService":
    """FastAPI dependency provider for UserService."""

    return user_service


settings = get_settings()
user_service = UserService(url=settings.supabase_project_url, service_role_key=settings.supabase_service_role_key)
