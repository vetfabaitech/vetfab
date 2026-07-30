"""Workspace Reconstructor: rebuilds the flat (relative_path, content) file
list a project needs on disk, purely from `workspace.tree` + `files` -- no
filesystem access, no re-scanning. The tree defines structure; `files` (keyed
by id) defines content; this is the one place that recombines them.
"""

from app.schemas.execution_payload import ProjectExecutionPayload, WorkspaceTreeFile, WorkspaceTreeNode
from app.utils.exceptions import WorkspaceReconstructionError


class WorkspaceReconstructor:
    """Stateless: walks `workspace.tree`, resolving each file node's id against
    `files` to recover its content, preserving the exact folder hierarchy the
    client authored."""

    def reconstruct(self, payload: ProjectExecutionPayload) -> list[tuple[str, str]]:
        results: list[tuple[str, str]] = []
        self._walk(payload.workspace.tree, payload, results)
        return results

    def _walk(
        self,
        node: WorkspaceTreeNode,
        payload: ProjectExecutionPayload,
        results: list[tuple[str, str]],
    ) -> None:
        if isinstance(node, WorkspaceTreeFile):
            file_entry = payload.files.get(node.id)
            if file_entry is None:
                raise WorkspaceReconstructionError(
                    f"workspace.tree references file id '{node.id}' ('{node.path}') "
                    "which is missing from the payload's files dictionary"
                )
            results.append((file_entry.path, file_entry.content))
            return

        for child in node.children:
            self._walk(child, payload, results)
