"""Custom application exceptions."""


class JobNotFoundError(Exception):
    """Raised when a job id does not exist in the job store."""

    def __init__(self, job_id: str):
        self.job_id = job_id
        super().__init__(f"Job '{job_id}' not found")


class JobAlreadyTerminatedError(Exception):
    """Raised when attempting to act on a job that already reached a terminal state."""

    def __init__(self, job_id: str, status: str):
        self.job_id = job_id
        self.status = status
        super().__init__(f"Job '{job_id}' is already '{status}'")


class DockerExecutionError(Exception):
    """Raised when the Docker daemon/container fails in a way that aborts the run.

    Handlers should map this to an HTTP 500 per the execution spec.
    """


class WorkspaceReconstructionError(DockerExecutionError):
    """Raised when a Project Execution Payload can't be rebuilt into a file tree

    e.g. `workspace.tree` references a file id that isn't in `files`. Subclasses
    DockerExecutionError so it's handled by the same exception handler/HTTP 500
    mapping without registering a second handler.
    """


class ProjectAccessDeniedError(Exception):
    """Raised when the authenticated caller isn't this project's owner --
    handlers should map this to an HTTP 404 (not 403), so a caller probing
    another user's project id can't tell "exists but not yours" apart from
    "doesn't exist"."""

    def __init__(self, project_id: str):
        self.project_id = project_id
        super().__init__(f"Project '{project_id}' not found")


class SupabaseError(Exception):
    """Raised when a Supabase Postgres metadata call fails (projects/
    folders/files/file_versions rows -- never file content, that's S3).

    Handlers should map this to an HTTP 500.
    """


class S3StorageError(Exception):
    """Raised when an AWS S3 call (upload/download/delete of file content)
    fails, including when S3 isn't configured at all.

    Handlers should map this to an HTTP 500.
    """


class WorkspaceNotFoundError(Exception):
    """Raised when a project id has no open/on-disk workspace."""

    def __init__(self, project_id: str):
        self.project_id = project_id
        super().__init__(f"Workspace '{project_id}' not found")


class InvalidWorkspacePathError(Exception):
    """Raised when a relative file path would escape its workspace root
    (e.g. via '..' segments or an absolute path) -- always a client bug or
    a hostile payload, never a legitimate request."""

    def __init__(self, path: str):
        self.path = path
        super().__init__(f"Invalid workspace-relative path: '{path}'")


class LspProcessError(Exception):
    """Raised when a project's svlangserver process fails to start, crashes,
    or does not respond -- handlers should map this to an HTTP 502/503, and
    WebSocket callers should close the socket with an error frame."""


class ToolExecutionError(Exception):
    """Raised when an external tool invocation (Verilator, Verible, Surelog)
    fails to launch entirely (e.g. the binary is missing) -- distinct from a
    non-zero exit code, which is normal (a lint failure) and handled as data,
    not an exception."""

    def __init__(self, tool: str, detail: str):
        self.tool = tool
        super().__init__(f"Failed to run '{tool}': {detail}")


class UnsupportedSimulatorError(DockerExecutionError):
    """Raised when a Project Execution Payload names a simulator id that has
    no registered adapter (see app/services/simulators/factory.py). Subclasses
    DockerExecutionError so an unknown `execution.simulator` value fails a job
    cleanly (status=failed, stderr=message) through the same handling
    ExecutionManager/ExecutionService already have, rather than crashing."""

    def __init__(self, simulator_id: str, available: list[str]):
        self.simulator_id = simulator_id
        self.available = available
        super().__init__(
            f"Unsupported simulator '{simulator_id}'. Available: {', '.join(available) or 'none'}"
        )
