"""Application settings, loaded from environment variables / .env."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Env-driven config for wiring the backend to the frontend and to Docker.

    MVP scope: single local user, no auth, no queue/worker pool. Every /run
    request spins up one fresh container directly from the request handler.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Docker execution
    docker_image: str = "hdl-webide-iverilog:latest"
    docker_workdir: str = "/workspace"
    # 45s (was 15s under Icarus-only): Verilator's `--binary` compile step
    # verilates to C++ *and* invokes make/g++ to build a native executable,
    # which is meaningfully slower than iverilog's near-instant bytecode
    # compile for the same design -- 15s was tuned for iverilog and is too
    # tight for Verilator on anything beyond a trivial testbench.
    docker_exec_timeout: int = 45  # seconds, applied to each compile/simulate step
    # Verilator's C++ build (make -j2, see VerilatorAdapter) needs more
    # headroom than iverilog's bytecode compile ever did -- 256m was fine
    # for iverilog alone but risks the build step being OOM-killed under
    # Verilator. Only the per-run execution container uses this (see
    # ExecutionManager/ExecutionService); terminal containers are unaffected.
    docker_mem_limit: str = "1g"

    # Terminal sessions: one long-lived container per browser tab, backed by a
    # single named Docker volume (not the container's own writable layer) so a
    # container can be reaped cheaply without losing anything a user created
    # by hand in the shell -- the container is disposable compute, the volume
    # is the durable bit. This timeout is now just a resource-cleanup cadence,
    # not a data-loss risk (see POST /api/v1/terminal/reset-workspace for how
    # the volume itself eventually gets reclaimed).
    terminal_idle_timeout: int = 1800  # seconds
    # Single slot, matching the rest of this MVP's single active on-disk
    # workspace model (everything keys off one fixed "local-project" identity,
    # not a real per-cloud-project one -- see app/workspace/manager.py).
    terminal_volume_name: str = "hdl-webide-term-workspace"

    # Session verification: this backend never issues sessions itself --
    # log-in/backend (see its app/services/session.py) does, on successful
    # GitHub/Google sign-in. Must be the *same* secret/algorithm as that
    # service's JWT_SECRET/JWT_ALGORITHM (copy the value, don't invent a
    # new one) or every token this backend receives will fail to decode.
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"

    # Supabase: relational metadata ONLY (projects/folders/files/
    # file_versions rows) lives here, via postgrest. No file content and no
    # Supabase Storage usage -- see AWS S3 settings below for that. Service
    # role key is backend-only -- it bypasses Row Level Security, so it must
    # never reach the frontend.
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""

    # AWS S3: every project file's actual content lives here, one object per
    # file version, keyed by the file's stable node id (not its human path,
    # so renames/moves never require an S3 copy) -- see
    # app/services/s3_service.py and app/services/project_storage_service.py.
    # IAM credentials should be scoped to this one bucket only. Never expose
    # these to the frontend.
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = ""
    aws_bucket_name: str = ""
    # Only needed for non-AWS S3-compatible storage (e.g. Cloudflare R2,
    # MinIO). Leave blank for real AWS S3 -- a bucket-specific virtual-hosted
    # URL here would make boto3 double up the bucket name in every request
    # path (it already gets Bucket= on each call).
    s3_endpoint_url: str = ""
    # Key prefix every object is written under: projects/{project_id}/files/{node_id}/v{version}
    s3_prefix: str = "projects"

    # -- Verilog/SystemVerilog language intelligence service -----------------
    # Real, on-disk workspaces (one directory per open project) that back
    # svlangserver / Verilator / Verible / Surelog -- these are native Linux
    # tools invoked as subprocesses, so this backend must run on Linux/WSL or
    # inside `backend/Dockerfile` for language-intelligence features to work.
    lsp_workspace_root: str = "./data/workspaces"

    # Executable names/paths -- overridable so a container image or WSL
    # install can point at a non-PATH location without code changes.
    svlangserver_cmd: str = "svlangserver"
    verilator_cmd: str = "verilator"
    verible_format_cmd: str = "verible-verilog-format"
    surelog_cmd: str = "surelog"

    # Idle cleanup: a project with no LSP/WS activity for this long has its
    # svlangserver process stopped; its on-disk workspace is left in place
    # (only /workspace/delete removes it) since it's cheap and may be reopened.
    lsp_idle_timeout: int = 1800  # seconds

    # Debounce window the frontend is expected to honor before calling
    # POST /lint after an edit (Verilator is never kept running continuously).
    verilator_debounce_ms: int = 800
    verilator_timeout: int = 20  # seconds, per lint invocation
    surelog_timeout: int = 60  # seconds, per reindex invocation
    verible_timeout: int = 15  # seconds, per format invocation

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def supabase_project_url(self) -> str:
        """`create_client` wants the bare project URL (it appends /rest/v1,
        /storage/v1, etc. itself) -- strip any path a user pasted from the
        API settings page (e.g. the .../rest/v1/ endpoint URL)."""

        return self.supabase_url.split("/rest/")[0].split("/storage/")[0].rstrip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings()
