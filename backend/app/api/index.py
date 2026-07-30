"""POST /reindex, GET /symbols, GET /hierarchy.

Surelog only ever runs here -- on an explicit reindex request (project open/
reload, file added/removed, or the frontend calling `POST /reindex`
directly) -- never on every keystroke. Results are cached in `SymbolCache`
(`app/cache/symbol_cache.py`) so `/symbols`/`/hierarchy` are cheap reads.
"""

import dataclasses

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.cache.symbol_cache import SymbolCache, get_symbol_cache
from app.config import Settings, get_settings
from app.indexer.surelog import SurelogIndexer
from app.models.symbol import WorkspaceIndex
from app.schemas.index import HierarchyResponse, ReindexRequest, ReindexResponse, SymbolsResponse
from app.utils.exceptions import InvalidWorkspacePathError
from app.utils.logger import get_logger
from app.utils.symbol_serialization import instance_to_schema, module_to_schema, package_to_schema
from app.workspace.manager import WorkspaceManager, get_workspace_manager

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1", tags=["index"])


def get_surelog_indexer(settings: Settings = Depends(get_settings)) -> SurelogIndexer:
    return SurelogIndexer(settings.surelog_cmd, settings.surelog_timeout)


async def _run_reindex(
    project_id: str,
    workspace_manager: WorkspaceManager,
    indexer: SurelogIndexer,
    cache: SymbolCache,
) -> WorkspaceIndex:
    try:
        files = [
            str(p.relative_to(workspace_manager.ensure_open(project_id).path)).replace("\\", "/")
            for p in workspace_manager.list_verilog_files(project_id)
        ]
    except InvalidWorkspacePathError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    session = workspace_manager.ensure_open(project_id)
    index = await indexer.index(str(session.path), files)
    index = dataclasses.replace(index, project_id=project_id)
    cache.set(project_id, index)
    return index


@router.post("/reindex", response_model=ReindexResponse)
async def reindex_project(
    request: ReindexRequest,
    workspace_manager: WorkspaceManager = Depends(get_workspace_manager),
    indexer: SurelogIndexer = Depends(get_surelog_indexer),
    cache: SymbolCache = Depends(get_symbol_cache),
) -> ReindexResponse:
    index = await _run_reindex(request.projectId, workspace_manager, indexer, cache)
    return ReindexResponse(
        projectId=request.projectId,
        moduleCount=len(index.modules),
        packageCount=len(index.packages),
        errorCount=len(index.errors),
        indexedAt=index.indexed_at,
    )


@router.get("/symbols", response_model=SymbolsResponse)
async def get_symbols(
    projectId: str = Query(...),
    workspace_manager: WorkspaceManager = Depends(get_workspace_manager),
    indexer: SurelogIndexer = Depends(get_surelog_indexer),
    cache: SymbolCache = Depends(get_symbol_cache),
) -> SymbolsResponse:
    index = cache.get(projectId)
    if index is None:
        index = await _run_reindex(projectId, workspace_manager, indexer, cache)

    return SymbolsResponse(
        projectId=projectId,
        modules=[module_to_schema(m) for m in index.modules.values()],
        packages=[package_to_schema(p) for p in index.packages.values()],
        indexedAt=index.indexed_at,
    )


@router.get("/hierarchy", response_model=HierarchyResponse)
async def get_hierarchy(
    projectId: str = Query(...),
    workspace_manager: WorkspaceManager = Depends(get_workspace_manager),
    indexer: SurelogIndexer = Depends(get_surelog_indexer),
    cache: SymbolCache = Depends(get_symbol_cache),
) -> HierarchyResponse:
    index = cache.get(projectId)
    if index is None:
        index = await _run_reindex(projectId, workspace_manager, indexer, cache)

    return HierarchyResponse(
        projectId=projectId,
        instanceTree=[instance_to_schema(node) for node in index.instance_tree],
        indexedAt=index.indexed_at,
    )
