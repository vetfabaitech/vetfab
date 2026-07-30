"""Metadata service: owns the `projects` / `folders` / `files` /
`file_versions` Postgres tables (via Supabase's postgrest client) --
relational metadata only, never file content. See
`app/services/s3_service.py` for where content actually lives and
`app/services/project_storage_service.py` for the orchestration between the
two.

Uses the official synchronous `supabase-py` client (same reasoning as
`docker_service.py`: the SDK is synchronous, so every call is pushed through
`asyncio.to_thread` to keep the FastAPI event loop free).
"""

import asyncio
from datetime import UTC, datetime
from typing import Any

from postgrest.exceptions import APIError
from supabase import Client, create_client

from app.config import get_settings
from app.utils.exceptions import SupabaseError
from app.utils.logger import get_logger

logger = get_logger(__name__)


class MetadataService:
    """Backend-only client (service role key) for the project metadata
    tables. Every table here is deny-by-default RLS -- this client bypasses
    it, so it must never be constructed with anything but the service role
    key."""

    def __init__(self, url: str, service_role_key: str) -> None:
        self._url = url
        self._key = service_role_key
        self._client: Client | None = None

    def _client_or_raise(self) -> Client:
        if not self._url or not self._key:
            raise SupabaseError("Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)")
        if self._client is None:
            self._client = create_client(self._url, self._key)
        return self._client

    # -- projects -------------------------------------------------------

    def _upsert_project_sync(self, project_id: str, name: str, size_bytes: int, owner_id: str | None) -> str:
        client = self._client_or_raise()
        saved_at = datetime.now(UTC).isoformat()
        row = {
            "id": project_id,
            "name": name,
            "size_bytes": size_bytes,
            "updated_at": saved_at,
            "deleted_at": None,
        }
        # Only set on insert/explicit pass-through -- omitting the key
        # entirely (rather than sending owner_id=None) means re-saving an
        # already-owned project via a caller that doesn't know about
        # ownership can never accidentally null it back out.
        if owner_id is not None:
            row["owner_id"] = owner_id
        try:
            client.table("projects").upsert(row).execute()
        except APIError as exc:
            raise SupabaseError(f"Failed to upsert project metadata: {exc}") from exc
        return saved_at

    async def upsert_project(self, project_id: str, name: str, size_bytes: int, owner_id: str | None = None) -> str:
        return await asyncio.to_thread(self._upsert_project_sync, project_id, name, size_bytes, owner_id)

    def _get_project_sync(self, project_id: str) -> dict[str, Any] | None:
        client = self._client_or_raise()
        try:
            result = (
                client.table("projects")
                # owner_id included (not just id/name/size_bytes/updated_at)
                # so callers can check ownership -- see
                # ProjectStorageService.load_project/delete_project.
                .select("id,name,size_bytes,updated_at,owner_id")
                .eq("id", project_id)
                .is_("deleted_at", "null")
                .limit(1)
                .execute()
            )
        except APIError as exc:
            raise SupabaseError(f"Failed to read project metadata for '{project_id}': {exc}") from exc
        return result.data[0] if result.data else None

    async def get_project(self, project_id: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._get_project_sync, project_id)

    def _list_projects_sync(self, owner_id: str) -> list[dict[str, Any]]:
        client = self._client_or_raise()
        try:
            result = (
                client.table("projects")
                .select("id,name,size_bytes,updated_at")
                # Caller's own projects, plus legacy rows saved before
                # per-user ownership existed (owner_id IS NULL) -- those
                # predate this filter and have no rightful single owner, so
                # they stay visible to everyone rather than silently
                # vanishing for whoever's account made them. Any project
                # explicitly owned by *another* real account is excluded --
                # that's the actual cross-account leak this filter exists
                # to close.
                .or_(f"owner_id.is.null,owner_id.eq.{owner_id}")
                .is_("deleted_at", "null")
                .order("updated_at", desc=True)
                .execute()
            )
        except APIError as exc:
            raise SupabaseError(f"Failed to list projects: {exc}") from exc
        return result.data

    async def list_projects(self, owner_id: str) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._list_projects_sync, owner_id)

    def _soft_delete_project_sync(self, project_id: str) -> None:
        client = self._client_or_raise()
        now = datetime.now(UTC).isoformat()
        try:
            client.table("projects").update({"deleted_at": now}).eq("id", project_id).execute()
            client.table("folders").update({"deleted_at": now}).eq("project_id", project_id).execute()
            client.table("files").update({"deleted_at": now}).eq("project_id", project_id).execute()
        except APIError as exc:
            raise SupabaseError(f"Failed to delete project '{project_id}': {exc}") from exc

    async def soft_delete_project(self, project_id: str) -> None:
        await asyncio.to_thread(self._soft_delete_project_sync, project_id)

    # -- folders ----------------------------------------------------------

    def _get_folders_sync(self, project_id: str) -> list[dict[str, Any]]:
        client = self._client_or_raise()
        try:
            result = (
                client.table("folders")
                .select("node_id,parent_node_id,name,path,created_at,updated_at")
                .eq("project_id", project_id)
                .is_("deleted_at", "null")
                .order("created_at")
                .execute()
            )
        except APIError as exc:
            raise SupabaseError(f"Failed to read folders for project '{project_id}': {exc}") from exc
        return result.data

    async def get_folders(self, project_id: str) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._get_folders_sync, project_id)

    def _upsert_folders_sync(self, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        client = self._client_or_raise()
        try:
            client.table("folders").upsert(rows, on_conflict="project_id,node_id").execute()
        except APIError as exc:
            raise SupabaseError(f"Failed to upsert folders: {exc}") from exc

    async def upsert_folders(self, rows: list[dict[str, Any]]) -> None:
        await asyncio.to_thread(self._upsert_folders_sync, rows)

    def _soft_delete_folders_sync(self, project_id: str, node_ids: list[str]) -> None:
        if not node_ids:
            return
        client = self._client_or_raise()
        now = datetime.now(UTC).isoformat()
        try:
            client.table("folders").update({"deleted_at": now}).eq("project_id", project_id).in_(
                "node_id", node_ids
            ).execute()
        except APIError as exc:
            raise SupabaseError(f"Failed to delete folders: {exc}") from exc

    async def soft_delete_folders(self, project_id: str, node_ids: list[str]) -> None:
        await asyncio.to_thread(self._soft_delete_folders_sync, project_id, node_ids)

    # -- files --------------------------------------------------------------

    def _get_files_sync(self, project_id: str) -> list[dict[str, Any]]:
        client = self._client_or_raise()
        try:
            result = (
                client.table("files")
                .select(
                    "node_id,folder_node_id,name,path,extension,mime_type,size_bytes,"
                    "s3_key,checksum,version,created_at,updated_at"
                )
                .eq("project_id", project_id)
                .is_("deleted_at", "null")
                .order("created_at")
                .execute()
            )
        except APIError as exc:
            raise SupabaseError(f"Failed to read files for project '{project_id}': {exc}") from exc
        return result.data

    async def get_files(self, project_id: str) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._get_files_sync, project_id)

    def _upsert_files_sync(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not rows:
            return []
        client = self._client_or_raise()
        try:
            result = client.table("files").upsert(rows, on_conflict="project_id,node_id").execute()
        except APIError as exc:
            raise SupabaseError(f"Failed to upsert files: {exc}") from exc
        return result.data

    async def upsert_files(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Returns the upserted rows (including generated `id`) so callers
        can link `file_versions.file_id` without a second round trip."""

        return await asyncio.to_thread(self._upsert_files_sync, rows)

    def _soft_delete_files_sync(self, project_id: str, node_ids: list[str]) -> list[str]:
        """Soft-deletes the given files and returns their s3_key values so
        the caller can remove the underlying S3 objects."""

        if not node_ids:
            return []
        client = self._client_or_raise()
        now = datetime.now(UTC).isoformat()
        try:
            existing = (
                client.table("files")
                .select("s3_key")
                .eq("project_id", project_id)
                .in_("node_id", node_ids)
                .execute()
            )
            client.table("files").update({"deleted_at": now}).eq("project_id", project_id).in_(
                "node_id", node_ids
            ).execute()
        except APIError as exc:
            raise SupabaseError(f"Failed to delete files: {exc}") from exc
        return [row["s3_key"] for row in existing.data]

    async def soft_delete_files(self, project_id: str, node_ids: list[str]) -> list[str]:
        return await asyncio.to_thread(self._soft_delete_files_sync, project_id, node_ids)

    def _insert_file_versions_sync(self, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        client = self._client_or_raise()
        try:
            client.table("file_versions").insert(rows).execute()
        except APIError as exc:
            raise SupabaseError(f"Failed to insert file versions: {exc}") from exc

    async def insert_file_versions(self, rows: list[dict[str, Any]]) -> None:
        await asyncio.to_thread(self._insert_file_versions_sync, rows)


def get_metadata_service() -> "MetadataService":
    """FastAPI dependency provider for MetadataService."""

    return metadata_service


settings = get_settings()
metadata_service = MetadataService(
    url=settings.supabase_project_url,
    service_role_key=settings.supabase_service_role_key,
)
