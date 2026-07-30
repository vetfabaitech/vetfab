"""WS /ws/execute/{jobId} -- streams real reconstruct+compile+simulate progress
for a Project Execution Payload job (see ExecutionManager.stream_execution).

Message protocol (JSON text frames) -- same shape as /ws/run/{jobId}, plus a
couple of extra fields on the final result:
  {"type": "log", "message": "..."}
  {"type": "output", "stream": "compiler"|"stdout"|"stderr", "text": "..."}
  {"type": "result", "status": "...", "mode": "simulate"|"lint", "stdout": "...",
   "stderr": "...", "compilerOutput": "...", "compileExitCode": int|null,
   "runExitCode": int|null, "hasWaveform": bool, "waveformFilename": "..."|null,
   "executionTimeMs": int, "buildTimeMs": int|null, "runTimeMs": int|null,
   "warningCount": int, "errorCount": int}

"mode": "lint" jobs (see ExecutionManager.stream_execution) never call
adapter.run() -- runExitCode/runTimeMs/hasWaveform stay null/null/false, and
no "stdout"/"stderr" stream output message is ever sent for that job.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.services.execution_manager import get_execution_manager
from app.utils.exceptions import JobNotFoundError
from app.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter()


@router.websocket("/ws/execute/{jobId}")
async def execute_progress(websocket: WebSocket, jobId: str) -> None:
    """Stream real reconstruct+compile+simulate progress/output/result, then
    close gracefully."""

    await websocket.accept()
    manager = get_execution_manager()

    try:
        async for message in manager.stream_execution(jobId):
            await websocket.send_json(message)
    except JobNotFoundError as exc:
        logger.warning("Execute websocket opened for unknown job %s", jobId)
        await websocket.send_json({"type": "log", "message": str(exc)})
    except WebSocketDisconnect:
        logger.info("Client disconnected from execute websocket for job %s", jobId)
        return
    finally:
        if websocket.client_state != WebSocketState.DISCONNECTED:
            await websocket.close()
