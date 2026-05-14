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

# ---------------------------------------------------------------------------
# OpenAPI tag metadata for grouped documentation
# ---------------------------------------------------------------------------

TAGS_METADATA = [
    {
        "name": "认证",
        "description": "用户注册、登录和身份验证。所有接口需要 JWT Token（除了注册和登录）。",
    },
    {
        "name": "案件",
        "description": "案件管理 — 创建、查询、更新、删除案件。支持按状态和类型筛选。",
    },
    {
        "name": "文书",
        "description": "法律文书生成与管理 — AI驱动的文书生成、审查、质量核查和多格式导出。",
    },
    {
        "name": "模板",
        "description": "文书模板管理 — 创建和管理各类法律文书的模板结构。",
    },
    {
        "name": "检索",
        "description": "统一法律检索 — 跨法规、案例、知识库的智能搜索。支持AI检索和向量检索。",
    },
    {
        "name": "LLM配置",
        "description": "大语言模型配置 — 管理默认模型和API连接参数。",
    },
    {
        "name": "证据管理",
        "description": "证据文件管理 — 上传、OCR文字提取、AI分析、证据链分析和质证意见生成。",
    },
    {
        "name": "向量检索",
        "description": "向量数据库操作 — 数据导入、语义搜索和统计。基于ChromaDB。",
    },
    {
        "name": "法律研究",
        "description": "深度法律研究 — AI驱动的多源法律研究报告生成，支持导出。",
    },
    {
        "name": "法条核查",
        "description": "法条引用验证 — 检查文书中引用的法律条文是否准确和现行有效。",
    },
    {
        "name": "合同审查",
        "description": "合同智能审查 — 风险条款识别、条款建议和合规性检查。",
    },
    {
        "name": "知识库",
        "description": "个人知识库管理 — 文本和文件上传、全文检索、向量索引。",
    },
    {
        "name": "外部API",
        "description": "外部数据源配置 — 接入第三方法律数据库和搜索引擎。支持北大法宝、元典等预设。",
    },
    {
        "name": "系统配置",
        "description": "系统级配置 — 应用参数和功能开关管理。需要管理员权限。",
    },
]

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

    # In production, disable docs/redoc/openapi for security
    is_prod = settings.is_production

    app = FastAPI(
        title=settings.APP_NAME,
        version="0.1.0",
        lifespan=lifespan,
        description=(
            "# LawMind AI 后端 API\n\n"
            "法律AI助手平台后端服务，提供案件管理、法律文书生成、智能检索、"
            "证据分析、法律研究等功能。\n\n"
            "## 认证方式\n\n"
            "大部分接口需要在请求头中携带 JWT Token：\n\n"
            "```\n"
            "Authorization: Bearer <token>\n"
            "```\n\n"
            "通过 `/api/v1/auth/login` 获取 Token。\n\n"
            "## 通用响应头\n\n"
            "| Header | 说明 |\n"
            "|--------|------|\n"
            "| `X-Request-ID` | 请求唯一标识，用于追踪 |\n"
            "| `X-Process-Time` | 服务器处理时间（毫秒） |\n"
            "| `X-Total-Count` | 分页列表的总记录数 |\n"
        ),
        summary="法律AI助手平台 API",
        contact={
            "name": "LawMind AI Support",
        },
        license_info={
            "name": "Proprietary",
        },
        openapi_tags=TAGS_METADATA,
        openapi_url="/api/openapi.json" if not is_prod else None,
        docs_url="/api/docs" if not is_prod else None,
        redoc_url="/api/redoc" if not is_prod else None,
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
