"""WS /ws/terminal/{projectId} -- real interactive terminal session.

Protocol: the client must send exactly one "init" message first (current
editor files + initial terminal size), then any number of "input"/"resize"
messages. The server streams back "ready", "output", "error", and "exit".
Each connection gets its own isolated container via TerminalService --
never shared across tabs/projects.
"""

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.schemas.terminal import TerminalInitMessage
from app.services.terminal_service import TerminalService, get_terminal_service
from app.utils.exceptions import DockerExecutionError
from app.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter()


@router.websocket("/ws/terminal/{projectId}")
async def terminal_session(websocket: WebSocket, projectId: str) -> None:
    """Attach one browser tab to its own isolated, interactive shell container."""

    await websocket.accept()
    terminal_service = get_terminal_service()

    try:
        raw = await websocket.receive_text()
        init = TerminalInitMessage.model_validate_json(raw)
    except WebSocketDisconnect:
        return
    except Exception as exc:  # malformed handshake -- close cleanly, never crash the server
        await _send_error(websocket, f"Invalid init message: {exc}")
        await websocket.close()
        return

    try:
        session = await terminal_service.open_session(projectId, init.files, init.cols, init.rows)
    except DockerExecutionError as exc:
        logger.error("Failed to open terminal session for project %s: %s", projectId, exc)
        await _send_error(websocket, str(exc))
        await websocket.close()
        return

    # sessionId lets the client build the GET /api/v1/terminal/{sessionId}/waveform/raw
    # URL once this session's own shell produces a waveform (see "waveform" messages below).
    await websocket.send_json({"type": "ready", "sessionId": session.session_id})

    reader_task = asyncio.create_task(_pump_client_to_shell(websocket, terminal_service, session.session_id))
    writer_task = asyncio.create_task(_pump_shell_to_client(websocket, terminal_service, session.session_id))

    try:
        _done, pending = await asyncio.wait({reader_task, writer_task}, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
    finally:
        await terminal_service.close_session(session.session_id)
        logger.info("Terminal session %s torn down for project %s", session.session_id, projectId)


async def _send_error(websocket: WebSocket, message: str) -> None:
    try:
        await websocket.send_json({"type": "error", "message": message})
    except RuntimeError:
        pass  # socket already closed


async def _pump_client_to_shell(websocket: WebSocket, terminal_service: TerminalService, session_id: str) -> None:
    """Reads control messages from the browser and applies them to the shell."""

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue  # ignore garbage frames rather than tearing down the session

            msg_type = message.get("type")
            if msg_type == "input" and isinstance(message.get("data"), str):
                await terminal_service.send_input(session_id, message["data"])
            elif msg_type == "resize":
                cols, rows = message.get("cols"), message.get("rows")
                if isinstance(cols, int) and isinstance(rows, int):
                    await terminal_service.resize(session_id, cols, rows)
    except WebSocketDisconnect:
        logger.info("Client disconnected from terminal session %s", session_id)


async def _pump_shell_to_client(websocket: WebSocket, terminal_service: TerminalService, session_id: str) -> None:
    """Streams shell output to the browser until the shell exits."""

    try:
        async for message in terminal_service.read_output(session_id):
            await websocket.send_json(message)
    except RuntimeError:
        pass  # websocket closed while we were mid-send
