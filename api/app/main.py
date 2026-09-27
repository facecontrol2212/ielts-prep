from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import admin, attempts, auth, score, speaking, tests, users, writing


@asynccontextmanager
async def lifespan(app: FastAPI):  # pragma: no cover - startup hook
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        docs_url="/docs",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(users.router, prefix="/api/users", tags=["users"])
    app.include_router(tests.router, prefix="/api/tests", tags=["tests"])
    app.include_router(attempts.router, prefix="/api/attempts", tags=["attempts"])
    app.include_router(writing.router, prefix="/api/writing", tags=["writing"])
    app.include_router(score.router, prefix="/api/score", tags=["score"])
    app.include_router(speaking.router, prefix="/api/speaking", tags=["speaking"])
    app.include_router(admin.router, prefix="/api/admin", tags=["admin"])

    @app.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok", "environment": settings.environment}

    return app


app = create_app()
