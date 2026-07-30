"""In-memory workspace representation.

A `WorkspaceSession` is a thin record of one project's on-disk directory --
the actual files live on disk (see `app/workspace/manager.py`), this just
tracks which projects are currently open and when they were last touched.
"""

import time
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class WorkspaceSession:
    """One open project's on-disk workspace."""

    project_id: str
    path: Path
    created_at: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)

    def touch(self) -> None:
        self.last_activity = time.time()
