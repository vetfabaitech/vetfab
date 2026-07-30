"""WS /ws/lsp/{projectId} -- JSON-RPC proxy between Monaco and svlangserver.

The backend is only a proxy here: `vscode-ws-jsonrpc` on the frontend sends
one bare JSON-RPC object per WebSocket text frame; this handler re-frames
each one with an LSP `Content-Length` header (see `app/utils/lsp_framing.py`)
and writes it to the project's svlangserver process (started on demand via
`LspProcessManager`), and does the reverse for messages coming back out.
No LSP semantics are interpreted here -- completion/hover/definition/etc.
are entirely svlangserver's concern.
"""

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.lsp.manager import LspProcessManager, get_lsp_manager
from app.lsp.process import LspProcess
from app.utils.exceptions import InvalidWorkspacePathError, LspProcessError
from app.utils.logger import get_logger
from app.workspace.manager import WorkspaceManager, get_workspace_manager

logger = get_logger(__name__)

router = APIRouter()


@router.websocket("/ws/lsp/{projectId}")
async def lsp_session(websocket: WebSocket, projectId: str) -> None:
    """Attach one Monaco editor instance to its project's svlangserver
    process, starting it if this is the first client for that project."""

    await websocket.accept()
    workspace_manager: WorkspaceManager = get_workspace_manager()
    lsp_manager: LspProcessManager = get_lsp_manager()

    try:
        session = await asyncio.to_thread(workspace_manager.ensure_open, projectId)
    except InvalidWorkspacePathError as exc:
        await _send_error(websocket, str(exc))
        await websocket.close(code=1008)
        return

    try:
        process = await lsp_manager.get_or_start(projectId, str(session.path))
    except LspProcessError as exc:
        logger.error("Failed to start svlangserver for project %s: %s", projectId, exc)
        await _send_error(websocket, str(exc))
        await websocket.close(code=1011)
        return

    queue = process.subscribe()
    reader_task = asyncio.create_task(_pump_client_to_lsp(websocket, process))
    writer_task = asyncio.create_task(_pump_lsp_to_client(websocket, queue))

    try:
        _done, pending = await asyncio.wait({reader_task, writer_task}, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
    finally:
        process.unsubscribe(queue)
        logger.info("LSP session torn down for project=%s (svlangserver keeps running)", projectId)


async def _send_error(websocket: WebSocket, message: str) -> None:
    try:
        await websocket.send_json({"jsonrpc": "2.0", "method": "$/languageServiceError", "params": {"message": message}})
    except RuntimeError:
        pass  # socket already closed


async def _pump_client_to_lsp(websocket: WebSocket, process: LspProcess) -> None:
    """Monaco -> svlangserver."""

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue  # ignore malformed frames rather than tearing down the session

            try:
                await process.send(message)
            except LspProcessError as exc:
                logger.warning("svlangserver send failed, ending session: %s", exc)
                return
    except WebSocketDisconnect:
        logger.info("Client disconnected from LSP session for project=%s", process.project_id)


async def _pump_lsp_to_client(websocket: WebSocket, queue: "asyncio.Queue") -> None:
    """svlangserver -> Monaco."""

    try:
        while True:
            message = await queue.get()
            if message is None:
                await _send_error(websocket, "svlangserver process exited")
                return
            await websocket.send_text(json.dumps(message))
    except RuntimeError:
        pass  # websocket closed while we were mid-send
