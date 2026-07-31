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

    # Diagnostic only, not a functional change: this is the earliest point
    # in the whole execute pipeline where we can prove the browser's
    # WebSocket upgrade actually reached this process (vs. dying at a
    # reverse proxy / never being opened by the client at all -- both
    # produce identical symptoms downstream: job stays "queued", no
    # container, no further logs). If this line is missing from the logs
    # for a job that logged "queued", the request never reached FastAPI;
    # if it's present, the stall is somewhere inside stream_execution below.
    logger.info("Execute websocket connection received for job %s", jobId)
    await websocket.accept()
    logger.info("Execute websocket accepted for job %s", jobId)
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
