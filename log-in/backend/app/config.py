"""Application settings, loaded from environment variables / .env.

Nothing in app/api/auth.py actually reads most of these yet -- they're
declared now so the real implementation has a single, already-named place
to pull config from instead of each endpoint inventing its own env var.
See .env.example for what each one is for.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    host: str = "0.0.0.0"
    port: int = 8010
    cors_origins: str = "http://localhost:5174,http://localhost:3000"

    # -- Session / JWT (not implemented yet -- see app/api/auth.py) --------
    jwt_secret: str = "CHANGE_ME_INSECURE_DEV_ONLY"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60 * 24  # 24 hours -- sessions require a fresh sign-in after this

    # -- Google OAuth --------------------------------------------------------
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:5174/auth/callback/google"

    # -- GitHub OAuth ----------------------------------------------------------
    github_client_id: str = ""
    github_client_secret: str = ""
    github_redirect_uri: str = "http://localhost:5174/auth/callback/github"

    # Where to send the browser after a successful login.
    frontend_url: str = "http://localhost:3000"

    # -- User store: Supabase Postgres, SAME project as the main WebIDE
    # backend's `projects`/`folders`/`files` tables (see ../../backend/.env's
    # SUPABASE_URL -- copy that project's values here too). Service role key
    # is backend-only -- bypasses Row Level Security, never expose it to the
    # frontend. See app/services/user_service.py.
    supabase_url: str = ""
    supabase_service_role_key: str = ""

    # Base URL of the main WebIDE backend (../../backend), used once, by
    # app/services/project_bootstrap.py, to create a first "Welcome Project"
    # via its existing POST /api/v1/project/save -- reuses that backend's
    # own S3+metadata logic instead of duplicating it here.
    main_api_url: str = "http://localhost:8000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def supabase_project_url(self) -> str:
        """Same normalization as ../../backend/app/config.py's version --
        `create_client` wants the bare project URL, so strip any path a user
        pasted from the API settings page."""

        return self.supabase_url.split("/rest/")[0].split("/storage/")[0].rstrip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings()
