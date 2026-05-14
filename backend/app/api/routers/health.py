"""Health check endpoint — detailed component-level status."""

import logging
import time

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()
logger = logging.getLogger(__name__)

_VERSION = "0.1.0"


async def _check_database() -> dict:
    """Check database connectivity."""
    try:
        from app.core.database import db_health_check
        result = await db_health_check()
        return {"status": result.get("status", "ok"), "latency_ms": result.get("latency_ms")}
    except Exception as e:
        return {"status": "error", "error": str(e)}


async def _check_chromadb() -> dict:
    """Check ChromaDB vector store connectivity."""
    try:
        from app.services.vector.store import get_vector_service
        svc = get_vector_service()
        start = time.monotonic()
        connected = svc._ensure_connection()
        latency_ms = round((time.monotonic() - start) * 1000, 2)
        if connected:
            return {"status": "ok", "latency_ms": latency_ms}
        return {"status": "unavailable", "latency_ms": latency_ms, "error": "connection failed"}
    except Exception as e:
        return {"status": "error", "error": str(e)}


async def _check_llm() -> dict:
    """Check LLM API connectivity (best-effort, non-blocking)."""
    try:
        from app.config import get_settings
        settings = get_settings()
        if not settings.CLAUDE_API_KEY:
            return {"status": "not_configured", "note": "No API key set"}
        # We do NOT make a real LLM call here to avoid latency/cost.
        # Just verify the client can be instantiated.
        from app.services.llm_client import create_llm_client_from_settings
        client = create_llm_client_from_settings(settings)
        return {"status": "configured", "model": settings.CLAUDE_MODEL}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@router.get("/health")
async def health_check():
    """Return detailed health status with component-level checks."""
    start = time.monotonic()

    db_status = await _check_database()
    chroma_status = await _check_chromadb()
    llm_status = await _check_llm()

    total_latency = round((time.monotonic() - start) * 1000, 2)

    # Overall status: "ok" only if database (critical) is healthy.
    # ChromaDB and LLM are non-critical — degraded status if they're down.
    overall = "ok" if db_status.get("status") == "ok" else "degraded"
    if db_status.get("status") == "error":
        overall = "error"

    return JSONResponse(
        status_code=200 if overall != "error" else 503,
        content={
            "status": overall,
            "app": "LawMind AI",
            "version": _VERSION,
            "latency_ms": total_latency,
            "components": {
                "database": db_status,
                "chromadb": chroma_status,
                "llm": llm_status,
            },
        },
    )
