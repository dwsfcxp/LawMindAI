from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.core.database import engine, Base
from app.api.routers import auth, cases, documents, templates, search, health, llm_settings, evidence, vector, research, verification, contracts, knowledge
from pathlib import Path


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 注册外部数据源
    try:
        from app.services.data_sources.beida_fabao import register_beida_fabao
        register_beida_fabao()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to register data sources: {e}")

    # 加载自定义API数据源
    try:
        from app.services.data_sources.custom_api import load_custom_data_sources
        load_custom_data_sources()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to load custom data sources: {e}")

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
    app.include_router(llm_settings.router, prefix="/api/v1/llm-settings", tags=["LLM配置"])
    app.include_router(evidence.router, prefix="/api/v1/evidence", tags=["证据管理"])
    app.include_router(vector.router, prefix="/api/v1/vector", tags=["向量检索"])
    app.include_router(research.router, prefix="/api/v1/research", tags=["法律研究"])
    app.include_router(verification.router, prefix="/api/v1/law-verify", tags=["法条核查"])
    app.include_router(contracts.router, prefix="/api/v1/contracts", tags=["合同审查"])
    app.include_router(knowledge.router, prefix="/api/v1/knowledge", tags=["知识库"])

    return app


app = create_app()
