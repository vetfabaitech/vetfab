"""Request/response contracts for /api/v1/user/* -- see app/api/user.py."""

from pydantic import BaseModel, Field


class CheckUsernameResponse(BaseModel):
    available: bool
    reason: str | None = None


class CompleteProfileRequest(BaseModel):
    username: str
    displayName: str = ""
    bio: str | None = Field(default=None, max_length=160)
    country: str | None = None
    timezone: str | None = None
    preferredHdl: str = "verilog"
    theme: str = "system"
    defaultVisibility: str = "private"


class ProfileOut(BaseModel):
    """Parses Supabase's snake_case row on the way in, serializes camelCase
    on the way out -- same `validation_alias` reasoning as the main
    backend's ProjectSummary (see ../../../backend/app/schemas/project.py)."""

    id: str
    username: str
    displayName: str = Field(..., validation_alias="display_name")
    email: str
    avatarUrl: str | None = Field(default=None, validation_alias="avatar_url")
    bio: str | None = None
    country: str | None = None
    timezone: str | None = None
    preferredHdl: str = Field(..., validation_alias="preferred_hdl")
    theme: str
    defaultVisibility: str = Field(..., validation_alias="default_visibility")


class CompleteProfileResponse(BaseModel):
    """Response for POST /complete-profile. Carries a freshly-minted session
    token alongside the new profile: the token the caller authenticated
    this request with still has the pre-onboarding placeholder subject
    ("github:<oauth_id>", see app/api/auth.py's github_callback), not the
    real `users.id` (uuid) this endpoint just created -- callers must swap
    to `accessToken` for every request after this one (see app/api/user.py's
    complete_profile for why leaving that swap out sends a non-uuid value
    to any endpoint that uses it as owner_id)."""

    profile: ProfileOut
    accessToken: str
