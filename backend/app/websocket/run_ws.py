"""WS /ws/run/{jobId} -- streams real execution progress (Docker compile+simulate).

Message protocol (JSON text frames):
  {"type": "log", "message": "..."}                                -> Logs panel only
  {"type": "output", "stream": "compiler"|"stdout"|"stderr", "text": "..."} -> Output panel only
  {"type": "result", "status": "...", "stdout": "...", "stderr": "...",
   "compilerOutput": "...", "waveformUrl": "..."|null}             -> final message

The waveform itself is never sent over this socket -- only its (pre-signed S3)
URL, which the frontend fetches directly.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.services.execution_service import get_execution_service
from app.utils.exceptions import JobNotFoundError
from app.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter()


@router.websocket("/ws/run/{jobId}")
async def run_progress(websocket: WebSocket, jobId: str) -> None:
    """Stream real compile+simulate progress/output/result, then close gracefully."""

    await websocket.accept()
    execution_service = get_execution_service()

    try:
        async for message in execution_service.stream_execution(jobId):
            await websocket.send_json(message)
    except JobNotFoundError as exc:
        logger.warning("Run websocket opened for unknown job %s", jobId)
        await websocket.send_json({"type": "log", "message": str(exc)})
    except WebSocketDisconnect:
        logger.info("Client disconnected from run websocket for job %s", jobId)
        return
    finally:
        if websocket.client_state != WebSocketState.DISCONNECTED:
            await websocket.close()
