"""POST /format -- runs Verible only when explicitly requested (never on a
timer or keystroke), per the language-service spec."""

from fastapi import APIRouter, Depends, HTTPException, status

from app.config import Settings, get_settings
from app.formatter.verible import FormatterError, VeribleFormatter
from app.schemas.format import FormatRequest, FormatResponse
from app.utils.exceptions import InvalidWorkspacePathError, ToolExecutionError
from app.utils.logger import get_logger
from app.workspace.manager import WorkspaceManager, get_workspace_manager

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1", tags=["format"])


def get_verible_formatter(settings: Settings = Depends(get_settings)) -> VeribleFormatter:
    return VeribleFormatter(settings.verible_format_cmd, settings.verible_timeout)


@router.post("/format", response_model=FormatResponse)
async def format_file(
    request: FormatRequest,
    workspace_manager: WorkspaceManager = Depends(get_workspace_manager),
    formatter: VeribleFormatter = Depends(get_verible_formatter),
) -> FormatResponse:
    try:
        source = workspace_manager.read_file(request.workspace, request.filename)
    except InvalidWorkspacePathError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    try:
        formatted = await formatter.format(source, request.filename)
    except FormatterError as exc:
        logger.info("Verible format rejected '%s': %s", request.filename, exc.stderr)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.stderr) from exc
    except ToolExecutionError as exc:
        logger.error("Verible unavailable: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    return FormatResponse(filename=request.filename, formatted=formatted)
