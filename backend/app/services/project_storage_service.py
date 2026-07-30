"""Project storage service: the one place that reconciles the explorer's
whole-tree JSON snapshot (what the frontend sends/expects, unchanged --
see `frontend/src/store/explorerStore.ts` snapshotFromState/stateFromSnapshot)
against the new storage split -- file content in S3
(`app/services/s3_service.py`), everything else in Postgres
(`app/services/metadata_service.py`).

Save walks the incoming tree, uploads only the files whose content actually
changed (sha256 checksum compares against what's already stored -- autosave
resends the whole tree every time, so this avoids re-uploading unchanged
files on every save), and soft-deletes whatever metadata rows no longer
appear in the tree. Load does the reverse: fetch metadata, fetch every
file's bytes from S3, and rebuild the exact `nodes` dict shape the frontend
already knows how to consume.
"""

import asyncio
import hashlib
from datetime import UTC, datetime
from typing import Any

from app.services.metadata_service import MetadataService, get_metadata_service
from app.services.s3_service import S3Service, get_s3_service
from app.utils.exceptions import ProjectAccessDeniedError
from app.utils.logger import get_logger

logger = get_logger(__name__)

_MIME_TYPES = {
    ".v": "text/x-verilog",
    ".sv": "text/x-systemverilog",
    ".svh": "text/x-systemverilog",
    ".vh": "text/x-verilog",
    ".vhd": "text/x-vhdl",
    ".vhdl": "text/x-vhdl",
    ".sdc": "text/plain",
    ".xdc": "text/plain",
    ".json": "application/json",
    ".md": "text/markdown",
    ".txt": "text/plain",
}


def _extension_of(name: str) -> str:
    dot = name.rfind(".")
    return name[dot:].lower() if dot > 0 else ""


def _ms_to_iso(ms: Any) -> str:
    if not isinstance(ms, (int, float)):
        return datetime.now(UTC).isoformat()
    return datetime.fromtimestamp(ms / 1000, tz=UTC).isoformat()


def _iso_to_ms(value: Any) -> int:
    if not value:
        return int(datetime.now(UTC).timestamp() * 1000)
    return int(datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp() * 1000)


def _flatten_snapshot(nodes: dict[str, Any], root_id: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Walks the tree from `root_id` (via each folder's `children` array,
    mirroring `workspace_reconstructor.py`'s walk) and returns
    (folder_records, file_records). Nodes unreachable from the root (stray
    keys in the `nodes` dict) are ignored, same as what the UI would render."""

    folders: list[dict[str, Any]] = []
    files: list[dict[str, Any]] = []
    visited: set[str] = set()

    def walk(node_id: str, parent_node_id: str | None, parent_path: str) -> None:
        if node_id in visited:
            return
        visited.add(node_id)
        node = nodes.get(node_id)
        if not isinstance(node, dict):
            return

        name = str(node.get("name") or node_id)
        is_root = parent_node_id is None
        path = "" if is_root else (f"{parent_path}/{name}" if parent_path else name)

        if node.get("kind") == "folder":
            folders.append(
                {
                    "node_id": node_id,
                    "parent_node_id": parent_node_id,
                    "name": name,
                    "path": path,
                    "created_at": _ms_to_iso(node.get("createdAt")),
                    "updated_at": _ms_to_iso(node.get("modifiedAt")),
                }
            )
            for child_id in node.get("children") or []:
                walk(str(child_id), node_id, path)
        else:
            content = node.get("content")
            content = content if isinstance(content, str) else ""
            files.append(
                {
                    "node_id": node_id,
                    "folder_node_id": parent_node_id,
                    "name": name,
                    "path": path,
                    "content": content,
                    "created_at": _ms_to_iso(node.get("createdAt")),
                    "updated_at": _ms_to_iso(node.get("modifiedAt")),
                }
            )

    walk(root_id, None, "")
    return folders, files


class ProjectStorageService:
    """Orchestrates MetadataService (Postgres) + S3Service (file content) to
    implement save/load/list/delete for a whole project snapshot."""

    def __init__(self, metadata: MetadataService, s3: S3Service) -> None:
        self._metadata = metadata
        self._s3 = s3

    async def save_project(self, project_id: str, name: str, snapshot: dict[str, Any], owner_id: str) -> tuple[str, int]:
        """Reconciles `snapshot` against what's currently stored for
        `project_id`. Returns `(saved_at_iso, size_bytes)`.

        `owner_id` is always the *authenticated* caller (see
        app/api/project.py -- never client-asserted), so a slug collision
        with someone else's existing project id can't silently hand them
        write access to it: an existing project already owned by a
        different real account raises ProjectAccessDeniedError instead of
        being overwritten."""

        existing_project = await self._metadata.get_project(project_id)
        if existing_project is not None and existing_project["owner_id"] not in (None, owner_id):
            raise ProjectAccessDeniedError(project_id)

        nodes = snapshot.get("nodes")
        root_id = snapshot.get("rootId")
        if not isinstance(nodes, dict) or not isinstance(root_id, str):
            raise ValueError("snapshot is missing 'nodes' or 'rootId'")

        new_folders, new_files = _flatten_snapshot(nodes, root_id)

        existing_folders, existing_files = await asyncio.gather(
            self._metadata.get_folders(project_id),
            self._metadata.get_files(project_id),
        )
        existing_files_by_node = {row["node_id"]: row for row in existing_files}

        # Upload only files whose content actually changed since the last
        # save -- autosave resends the whole tree every time, most files
        # are unchanged, and re-uploading them would be pure waste.
        file_rows: list[dict[str, Any]] = []
        version_rows: list[dict[str, Any]] = []
        upload_tasks: list[Any] = []

        for record in new_files:
            content_bytes = record["content"].encode("utf-8")
            checksum = hashlib.sha256(content_bytes).hexdigest()
            existing = existing_files_by_node.get(record["node_id"])

            if existing is not None and existing["checksum"] == checksum:
                version = existing["version"]
                s3_key = existing["s3_key"]
            else:
                version = (existing["version"] + 1) if existing else 1
                s3_key = self._s3.object_key(project_id, "files", record["node_id"], f"v{version}")
                extension = _extension_of(record["name"])
                content_type = _MIME_TYPES.get(extension, "text/plain")
                upload_tasks.append(self._s3.upload_bytes(s3_key, content_bytes, content_type))
                version_rows.append(
                    {
                        "s3_key": s3_key,
                        "version": version,
                        "size_bytes": len(content_bytes),
                        "checksum": checksum,
                        # file_id (uuid) is filled in after the files upsert
                        # returns rows -- see below.
                        "_node_id": record["node_id"],
                    }
                )

            file_rows.append(
                {
                    "project_id": project_id,
                    "node_id": record["node_id"],
                    "folder_node_id": record["folder_node_id"],
                    "name": record["name"],
                    "path": record["path"],
                    "extension": _extension_of(record["name"]),
                    "mime_type": _MIME_TYPES.get(_extension_of(record["name"]), "text/plain"),
                    "size_bytes": len(content_bytes),
                    "s3_key": s3_key,
                    "checksum": checksum,
                    "version": version,
                    "created_at": record["created_at"],
                    "updated_at": record["updated_at"],
                    "deleted_at": None,
                }
            )

        folder_rows = [
            {
                "project_id": project_id,
                "node_id": r["node_id"],
                "parent_node_id": r["parent_node_id"],
                "name": r["name"],
                "path": r["path"],
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
                "deleted_at": None,
            }
            for r in new_folders
        ]

        # Must happen before the folders/files upserts below: both tables
        # have `project_id references projects(id)`, so the project row has
        # to exist first or the very first save of a new project fails its
        # foreign key check.
        size_bytes = sum(r["size_bytes"] for r in file_rows)
        saved_at = await self._metadata.upsert_project(project_id, name, size_bytes, owner_id)

        if upload_tasks:
            await asyncio.gather(*upload_tasks)

        _, upserted_files = await asyncio.gather(
            self._metadata.upsert_folders(folder_rows),
            self._metadata.upsert_files(file_rows),
        )

        if version_rows:
            file_id_by_node = {row["node_id"]: row["id"] for row in upserted_files}
            for row in version_rows:
                row["file_id"] = file_id_by_node.get(row.pop("_node_id"))
            version_rows = [row for row in version_rows if row.get("file_id")]
            await self._metadata.insert_file_versions(version_rows)

        # Soft-delete metadata for nodes that dropped out of the tree.
        new_folder_ids = {r["node_id"] for r in new_folders}
        new_file_ids = {r["node_id"] for r in new_files}
        removed_folder_ids = [r["node_id"] for r in existing_folders if r["node_id"] not in new_folder_ids]
        removed_file_ids = [r["node_id"] for r in existing_files if r["node_id"] not in new_file_ids]

        if removed_file_ids:
            await self._metadata.soft_delete_files(project_id, removed_file_ids)
            # Trailing "/" matters: node ids are monotonic counters
            # (f_x_1, f_x_10, ...), so an unterminated prefix could also
            # match a different, unrelated file's objects.
            await asyncio.gather(
                *(
                    self._s3.delete_prefix(self._s3.object_key(project_id, "files", node_id) + "/")
                    for node_id in removed_file_ids
                )
            )
        if removed_folder_ids:
            await self._metadata.soft_delete_folders(project_id, removed_folder_ids)

        return saved_at, size_bytes

    async def load_project(self, project_id: str, owner_id: str) -> tuple[dict[str, Any] | None, str | None]:
        """Rebuilds the explorer snapshot shape from metadata + S3 content.
        Returns `(None, None)` if nothing has been saved for this project.
        Raises ProjectAccessDeniedError if it exists but belongs to a
        different real account (legacy owner_id=NULL rows are loadable by
        anyone -- see MetadataService.list_projects's matching rule)."""

        project = await self._metadata.get_project(project_id)
        if project is None:
            return None, None
        if project["owner_id"] not in (None, owner_id):
            raise ProjectAccessDeniedError(project_id)

        folders, files = await asyncio.gather(
            self._metadata.get_folders(project_id),
            self._metadata.get_files(project_id),
        )

        contents = await asyncio.gather(
            *(self._s3.download_bytes(f["s3_key"]) for f in files),
            return_exceptions=True,
        )

        nodes: dict[str, Any] = {}
        root_id: str | None = None

        for folder in folders:
            if folder["parent_node_id"] is None:
                root_id = folder["node_id"]
            nodes[folder["node_id"]] = {
                "id": folder["node_id"],
                "kind": "folder",
                "name": folder["name"],
                "parentId": folder["parent_node_id"],
                "createdAt": _iso_to_ms(folder["created_at"]),
                "modifiedAt": _iso_to_ms(folder["updated_at"]),
                "children": [],
                "childrenLoaded": True,
            }

        for file_row, content in zip(files, contents, strict=True):
            if isinstance(content, BaseException):
                logger.warning(
                    "Skipping file '%s' (node=%s) in project '%s': S3 download failed: %s",
                    file_row["path"],
                    file_row["node_id"],
                    project_id,
                    content,
                )
                continue
            nodes[file_row["node_id"]] = {
                "id": file_row["node_id"],
                "kind": "file",
                "name": file_row["name"],
                "parentId": file_row["folder_node_id"],
                "createdAt": _iso_to_ms(file_row["created_at"]),
                "modifiedAt": _iso_to_ms(file_row["updated_at"]),
                "size": file_row["size_bytes"],
                "content": content.decode("utf-8"),
            }

        # children order is reconstructed by creation order (folders/files
        # were fetched `.order("created_at")`) -- harmless, since on-screen
        # ordering is driven by the explorer's own `sort` state, not this
        # array's order.
        for node_id, node in nodes.items():
            parent_id = node.get("parentId")
            if parent_id is not None and parent_id in nodes:
                nodes[parent_id]["children"].append(node_id)

        if root_id is None or root_id not in nodes:
            return None, None

        snapshot = {
            "version": 1,
            "workspaceName": project["name"],
            "rootId": root_id,
            "nodes": nodes,
        }
        return snapshot, project["updated_at"]

    async def list_projects(self, owner_id: str) -> list[dict[str, Any]]:
        return await self._metadata.list_projects(owner_id)

    async def delete_project(self, project_id: str, owner_id: str) -> None:
        existing_project = await self._metadata.get_project(project_id)
        if existing_project is None:
            return
        if existing_project["owner_id"] not in (None, owner_id):
            raise ProjectAccessDeniedError(project_id)
        await self._metadata.soft_delete_project(project_id)
        # Trailing "/" matters here too -- project ids are user-chosen slugs
        # (see slugifyProjectId), so "my-project" is a string-prefix of
        # "my-project-copy" and an unterminated prefix would delete both.
        await self._s3.delete_prefix(self._s3.object_key(project_id) + "/")


def get_project_storage_service() -> "ProjectStorageService":
    """FastAPI dependency provider for ProjectStorageService."""

    return project_storage_service


project_storage_service = ProjectStorageService(get_metadata_service(), get_s3_service())
