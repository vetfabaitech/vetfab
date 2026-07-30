"""FastAPI entrypoint for the auth backend -- GitHub OAuth + onboarding are
real (see app/api/auth.py, app/api/user.py); Google/password login are
still 501 stubs."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, user
from app.config import get_settings

settings = get_settings()

app = FastAPI(title="HDL WebIDE Auth API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(user.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
