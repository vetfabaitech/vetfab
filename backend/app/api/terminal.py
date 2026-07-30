"""REST endpoints related to the terminal feature.

The interactive terminal itself is served over the WebSocket endpoint in
app/websocket/terminal_ws.py; this module serves auxiliary data about a live
terminal session that doesn't fit that streaming protocol.
"""

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.schemas.terminal import (
    SyncedFile,
    TerminalResetWorkspaceRequest,
    TerminalResetWorkspaceResponse,
)
from app.services.terminal_service import TerminalService, get_terminal_service
from app.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1", tags=["terminal"])


@router.get("/terminal/{sessionId}/waveform/raw")
async def get_terminal_waveform_raw(
    sessionId: str,
    terminal_service: TerminalService = Depends(get_terminal_service),
) -> Response:
    """Raw bytes of the latest .vcd/.fst this terminal session's own shell has
    produced (e.g. from a manually-run `iverilog`/`vvp`, not just Run-button
    output mirrored in). Mirrors GET /api/v1/waveform/{jobId}/raw."""

    result = terminal_service.get_waveform(sessionId)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Terminal session '{sessionId}' has no waveform"
        )

    filename, data = result
    return Response(
        content=data,
        media_type="text/plain",
        headers={
            # See app/api/waveform.py for why this header is required for
            # Surfer's WASM fetch of this file to succeed under COEP.
            "Cross-Origin-Resource-Policy": "cross-origin",
            "Content-Disposition": f'inline; filename="{filename}"',
        },
    )


@router.post("/terminal/reset-workspace")
async def reset_terminal_workspace(
    body: TerminalResetWorkspaceRequest,
    terminal_service: TerminalService = Depends(get_terminal_service),
) -> TerminalResetWorkspaceResponse:
    """Call when switching to different project content (a different Cloud
    Project, a locally opened folder, or an imported `.code-workspace.json`)
    -- closes every live terminal session, reconciles whatever the shell
    changed against `trackedFiles`, then deletes the single terminal volume
    so the next project starts clean. See TerminalService.sync_and_reset_workspace
    for the full reconciliation rules. Safe to call with no active sessions
    and/or no volume yet (both are no-ops beyond an empty result)."""

    result = await terminal_service.sync_and_reset_workspace(body.trackedFiles)
    return TerminalResetWorkspaceResponse(
        synced=[SyncedFile(path=path, content=content) for path, content in result.synced],
        skippedConflicts=result.skipped_conflicts,
    )
