"""Symbol Cache: holds the latest `WorkspaceIndex` per project.

Populated by `app/indexer/surelog.py` on reindex (project open/reload, file
added/removed, or an explicit `POST /reindex`) and read by `GET /symbols`
and `GET /hierarchy`. Deliberately just an in-memory dict, keyed by
project id -- reusable by future features (VHDL indexing, AI context, etc.)
without changing this interface, since those would just populate the same
`WorkspaceIndex` shape from a different indexer.
"""

from app.models.symbol import WorkspaceIndex


class SymbolCache:
    """Thread-unsafe (single-event-loop) in-memory cache, one entry per project."""

    def __init__(self) -> None:
        self._index: dict[str, WorkspaceIndex] = {}

    def set(self, project_id: str, index: WorkspaceIndex) -> None:
        self._index[project_id] = index

    def get(self, project_id: str) -> WorkspaceIndex | None:
        return self._index.get(project_id)

    def invalidate(self, project_id: str) -> None:
        self._index.pop(project_id, None)


_symbol_cache: SymbolCache | None = None


def get_symbol_cache() -> SymbolCache:
    """FastAPI dependency provider -- module-level singleton."""

    global _symbol_cache
    if _symbol_cache is None:
        _symbol_cache = SymbolCache()
    return _symbol_cache
