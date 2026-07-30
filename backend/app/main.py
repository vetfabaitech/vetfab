"""FastAPI application entrypoint for the HDL WebIDE backend."""

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import execute, format as format_api, index as index_api, lint, project, run, stop, terminal, waveform, workspace
from app.config import get_settings
from app.lsp.manager import get_lsp_manager
from app.utils.exceptions import (
    DockerExecutionError,
    InvalidWorkspacePathError,
    JobAlreadyTerminatedError,
    JobNotFoundError,
    LspProcessError,
    ProjectAccessDeniedError,
    S3StorageError,
    SupabaseError,
    ToolExecutionError,
    WorkspaceNotFoundError,
)
from app.utils.logger import configure_logging, get_logger
from app.websocket import execute_ws, lsp_ws, run_ws, terminal_ws

configure_logging()
logger = get_logger(__name__)
settings = get_settings()

app = FastAPI(
    title="HDL WebIDE Backend",
    description="Backend APIs for running and monitoring HDL (Verilog/VHDL) simulations.",
    version="0.1.0",
)

# Allow the frontend dev server(s) listed in CORS_ORIGINS (see .env) to call these APIs.
# TODO: tighten this once a real deployment domain exists.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(JobNotFoundError)
async def job_not_found_handler(request: Request, exc: JobNotFoundError) -> JSONResponse:
    logger.warning("Unhandled JobNotFoundError for %s: %s", request.url.path, exc)
    return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": str(exc)})


@app.exception_handler(JobAlreadyTerminatedError)
async def job_already_terminated_handler(request: Request, exc: JobAlreadyTerminatedError) -> JSONResponse:
    logger.warning("Unhandled JobAlreadyTerminatedError for %s: %s", request.url.path, exc)
    return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={"detail": str(exc)})


@app.exception_handler(DockerExecutionError)
async def docker_execution_error_handler(request: Request, exc: DockerExecutionError) -> JSONResponse:
    logger.error("Unhandled DockerExecutionError for %s: %s", request.url.path, exc)
    return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content={"detail": str(exc)})


@app.exception_handler(SupabaseError)
async def supabase_error_handler(request: Request, exc: SupabaseError) -> JSONResponse:
    logger.error("Unhandled SupabaseError for %s: %s", request.url.path, exc)
    return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content={"detail": str(exc)})


@app.exception_handler(ProjectAccessDeniedError)
async def project_access_denied_handler(request: Request, exc: ProjectAccessDeniedError) -> JSONResponse:
    logger.warning("Unhandled ProjectAccessDeniedError for %s: %s", request.url.path, exc)
    return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": str(exc)})


@app.exception_handler(S3StorageError)
async def s3_storage_error_handler(request: Request, exc: S3StorageError) -> JSONResponse:
    logger.error("Unhandled S3StorageError for %s: %s", request.url.path, exc)
    return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content={"detail": str(exc)})


@app.exception_handler(WorkspaceNotFoundError)
async def workspace_not_found_handler(request: Request, exc: WorkspaceNotFoundError) -> JSONResponse:
    logger.warning("Unhandled WorkspaceNotFoundError for %s: %s", request.url.path, exc)
    return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": str(exc)})


@app.exception_handler(InvalidWorkspacePathError)
async def invalid_workspace_path_handler(request: Request, exc: InvalidWorkspacePathError) -> JSONResponse:
    logger.warning("Unhandled InvalidWorkspacePathError for %s: %s", request.url.path, exc)
    return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"detail": str(exc)})


@app.exception_handler(LspProcessError)
async def lsp_process_error_handler(request: Request, exc: LspProcessError) -> JSONResponse:
    logger.error("Unhandled LspProcessError for %s: %s", request.url.path, exc)
    return JSONResponse(status_code=status.HTTP_502_BAD_GATEWAY, content={"detail": str(exc)})


@app.exception_handler(ToolExecutionError)
async def tool_execution_error_handler(request: Request, exc: ToolExecutionError) -> JSONResponse:
    logger.error("Unhandled ToolExecutionError for %s: %s", request.url.path, exc)
    return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content={"detail": str(exc)})


# REST routers
app.include_router(run.router)
app.include_router(stop.router)
app.include_router(execute.router)
app.include_router(waveform.router)
app.include_router(terminal.router)
app.include_router(project.router)
app.include_router(workspace.router)
app.include_router(format_api.router)
app.include_router(lint.router)
app.include_router(index_api.router)

# WebSocket routers
app.include_router(run_ws.router)
app.include_router(execute_ws.router)
app.include_router(terminal_ws.router)
app.include_router(lsp_ws.router)


@app.on_event("shutdown")
async def shutdown_language_services() -> None:
    """Stop every project's svlangserver process so none are orphaned when
    the backend restarts (e.g. during `--reload`)."""

    await get_lsp_manager().stop_all()


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    """Simple liveness probe."""

    return {"status": "ok"}
