from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.core.database import engine, Base
from app.api.routers import auth, cases, documents, templates, search, health
from pathlib import Path


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.APP_NAME,
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(auth.router, prefix="/api/v1/auth", tags=["认证"])
    app.include_router(cases.router, prefix="/api/v1/cases", tags=["案件"])
    app.include_router(documents.router, prefix="/api/v1/documents", tags=["文书"])
    app.include_router(templates.router, prefix="/api/v1/templates", tags=["模板"])
    app.include_router(search.router, prefix="/api/v1/search", tags=["检索"])

    return app


app = create_app()
