"""LawMind AI -- FastAPI application factory.

Includes request-ID tracing, request-timing middleware, restrictive CORS,
structured startup/shutdown logging, and full resource cleanup.
"""

import logging
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.config import get_settings
from app.core.database import engine, Base, dispose_engine, db_health_check
from app.api.routers import (
    auth, cases, documents, templates, search, health,
    llm_settings, evidence, vector, research, verification,
    contracts, knowledge, external_apis, app_config,
)

logger = logging.getLogger("app")


# ── Middleware ────────────────────────────────────────────────────────────────

class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attach a unique ``X-Request-ID`` header to every request/response
    pair for distributed tracing.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class RequestTimingMiddleware(BaseHTTPMiddleware):
    """Log request duration and attach ``X-Process-Time`` header."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        start = time.monotonic()
        response = await call_next(request)
        elapsed_ms = (time.monotonic() - start) * 1000
        response.headers["X-Process-Time"] = f"{elapsed_ms:.2f}ms"
        logger.debug(
            "request_id=%s %s %s -> %.1fms",
            getattr(request.state, "request_id", "-"),
            request.method,
            request.url.path,
            elapsed_ms,
        )
        return response


# ── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ---- Startup ----
    startup_logger = logging.getLogger("app.startup")
    startup_logger.info("Application starting up...")
    startup_start = time.monotonic()

    settings = get_settings()
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)

    # Database
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    db_health = await db_health_check()
    startup_logger.info("Database ready: %s", db_health)

    # Register external data sources
    try:
        from app.services.data_sources.beida_fabao import register_beida_fabao
        register_beida_fabao()
        startup_logger.info("Beida Fabao data source registered")
    except Exception as e:
        startup_logger.warning("Failed to register data sources: %s", e)

    # Load custom API data sources (YAML)
    try:
        from app.services.data_sources.custom_api import load_custom_data_sources
        load_custom_data_sources()
        startup_logger.info("Custom API data sources loaded")
    except Exception as e:
        startup_logger.warning("Failed to load custom data sources: %s", e)

    # Load user external API configs (database)
    try:
        from app.services.data_sources.dynamic_adapter import register_dynamic_adapter
        from app.models.external_api import ExternalApiConfig
        from sqlalchemy import select
        from app.core.database import async_session
        async with async_session() as session:
            result = await session.execute(
                select(ExternalApiConfig).where(ExternalApiConfig.is_enabled == True)
            )
            for row in result.scalars().all():
                try:
                    register_dynamic_adapter(row)
                except Exception as ex:
                    startup_logger.warning(
                        "Failed to register dynamic adapter '%s': %s", row.name, ex
                    )
    except Exception as e:
        startup_logger.warning("Failed to load dynamic API configs: %s", e)

    # Pre-warm vector service
    try:
        from app.services.vector.store import get_vector_service
        svc = get_vector_service()
        if not svc._ensure_connection():
            startup_logger.warning(
                "ChromaDB not available at startup -- vector features disabled until connection succeeds"
            )
        else:
            startup_logger.info("Vector service warmed up")
    except Exception as e:
        startup_logger.warning("Vector service initialization skipped: %s", e)

    elapsed = time.monotonic() - startup_start
    startup_logger.info(
        "Application startup complete in %.2fs (env=%s)", elapsed, settings.ENVIRONMENT.value
    )

    yield

    # ---- Shutdown ----
    shutdown_logger = logging.getLogger("app.shutdown")
    shutdown_logger.info("Application shutting down...")

    # Dispose database engine
    try:
        await dispose_engine()
    except Exception as e:
        shutdown_logger.warning("Error disposing database engine: %s", e)

    # Reset vector service singleton
    try:
        import app.services.vector.store as _vs_mod
        _vs_mod._vector_service = None
        shutdown_logger.info("Vector service singleton cleared")
    except Exception as e:
        shutdown_logger.warning("Error clearing vector service: %s", e)

    shutdown_logger.info("Application shutdown complete")


# ── App factory ──────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.APP_NAME,
        version="0.1.0",
        lifespan=lifespan,
    )

    # ── Global exception handlers for graceful degradation ────────────────

    @app.exception_handler(OSError)
    async def os_error_handler(request: Request, exc: OSError):
        """Handle filesystem errors (disk full, permission denied, etc.)."""
        logger.error("Filesystem error on %s %s: %s", request.method, request.url.path, exc)
        return JSONResponse(
            status_code=507,
            content={"detail": "文件操作失败，磁盘空间不足或权限错误，请稍后重试"},
        )

    @app.exception_handler(ConnectionError)
    async def connection_error_handler(request: Request, exc: ConnectionError):
        """Handle connection errors to external services."""
        logger.error("Connection error on %s %s: %s", request.method, request.url.path, exc)
        return JSONResponse(
            status_code=503,
            content={"detail": "外部服务连接失败，请稍后重试"},
        )

    @app.exception_handler(TimeoutError)
    async def timeout_error_handler(request: Request, exc: TimeoutError):
        """Handle timeout errors."""
        logger.error("Timeout on %s %s: %s", request.method, request.url.path, exc)
        return JSONResponse(
            status_code=504,
            content={"detail": "请求超时，请稍后重试"},
        )

    # Middleware order matters: last added = first executed.
    # We want: RequestID -> Timing -> CORS -> app
    app.add_middleware(RequestTimingMiddleware)
    app.add_middleware(RequestIDMiddleware)

    # CORS -- restrict methods, support credentials
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID", "X-Process-Time"],
    )

    # ---- Routers ----
    app.include_router(health.router)
    app.include_router(auth.router, prefix="/api/v1/auth", tags=["认证"])
    app.include_router(cases.router, prefix="/api/v1/cases", tags=["案件"])
    app.include_router(documents.router, prefix="/api/v1/documents", tags=["文书"])
    app.include_router(templates.router, prefix="/api/v1/templates", tags=["模板"])
    app.include_router(search.router, prefix="/api/v1/search", tags=["检索"])
    app.include_router(llm_settings.router, prefix="/api/v1/llm-settings", tags=["LLM配置"])
    app.include_router(evidence.router, prefix="/api/v1/evidence", tags=["证据管理"])
    app.include_router(vector.router, prefix="/api/v1/vector", tags=["向量检索"])
    app.include_router(research.router, prefix="/api/v1/research", tags=["法律研究"])
    app.include_router(verification.router, prefix="/api/v1/law-verify", tags=["法条核查"])
    app.include_router(contracts.router, prefix="/api/v1/contracts", tags=["合同审查"])
    app.include_router(knowledge.router, prefix="/api/v1/knowledge", tags=["知识库"])
    app.include_router(external_apis.router, prefix="/api/v1/external-apis", tags=["外部API"])
    app.include_router(app_config.router, prefix="/api/v1/app-config", tags=["系统配置"])

    logger.info(
        "App created: %d routes registered",
        len([r for r in app.routes if hasattr(r, "methods")]),
    )

    return app


app = create_app()
