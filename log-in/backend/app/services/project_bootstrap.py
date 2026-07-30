"""Creates a new user's first project by calling the main WebIDE backend's
already-built `POST /api/v1/project/save` (../../../backend/app/api/project.py)
over HTTP -- this service does not touch S3 or the folders/files tables
directly, it just reuses that backend's own ProjectStorageService so the
save logic (checksums, versioning, metadata) exists in exactly one place.

Best-effort: a failure here should never block account creation -- the
user still gets a working, empty account and can create their own first
project by hand. See app/api/user.py's complete_profile for how the caller
treats a bootstrap failure as non-fatal.
"""

import time

import httpx

from app.config import get_settings

_WELCOME_README = """# Welcome to your VetFab workspace

This is your first project -- feel free to rename, delete, or replace it.

Create a new file from the Explorer to get started with Verilog, \
SystemVerilog, or VHDL.
"""


class ProjectBootstrapError(Exception):
    """Raised when the main backend rejects or can't be reached for the
    initial project save. Callers treat this as non-fatal (see module doc)."""


def _seed_snapshot(readme_id: str, root_id: str) -> dict:
    now = int(time.time() * 1000)
    return {
        "version": 1,
        "workspaceName": "Welcome Project",
        "rootId": root_id,
        "nodes": {
            root_id: {
                "id": root_id,
                "kind": "folder",
                "name": "Welcome Project",
                "parentId": None,
                "children": [readme_id],
                "childrenLoaded": True,
                "createdAt": now,
                "modifiedAt": now,
            },
            readme_id: {
                "id": readme_id,
                "kind": "file",
                "name": "README.md",
                "parentId": root_id,
                "size": len(_WELCOME_README.encode("utf-8")),
                "content": _WELCOME_README,
                "createdAt": now,
                "modifiedAt": now,
            },
        },
    }


async def create_welcome_project(*, username: str, owner_id: str) -> str:
    """Creates "Welcome Project" for a freshly onboarded user. Returns the
    new project id. Raises ProjectBootstrapError on failure."""

    settings = get_settings()
    project_id = f"{username}-welcome"
    snapshot = _seed_snapshot(readme_id="readme", root_id="root")

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{settings.main_api_url}/api/v1/project/save",
                json={
                    "projectId": project_id,
                    "name": "Welcome Project",
                    "snapshot": snapshot,
                    "ownerId": owner_id,
                },
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise ProjectBootstrapError(f"Failed to create welcome project: {exc}") from exc

    return project_id
