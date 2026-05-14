"""Database engine and session management.

Supports both SQLite and Postgres with proper pool settings, lifecycle
logging, health-check, and graceful shutdown.
"""

import logging
import time
from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

# ── Engine creation ─────────────────────────────────────────────────────────
connect_args = {}
engine_kwargs: dict = {"echo": settings.APP_DEBUG}

if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False
    # SQLite pool settings — use StaticPool for single-connection scenario
    # or set pool_size for WAL mode concurrent reads
    engine_kwargs["pool_size"] = 5
    engine_kwargs["pool_recycle"] = 1800  # 30 min
    engine_kwargs["pool_pre_ping"] = True
    # Enable WAL journal mode for better concurrent read performance
    connect_args["timeout"] = 30  # seconds to wait for lock
else:
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20
    engine_kwargs["pool_recycle"] = 1800
    engine_kwargs["pool_pre_ping"] = True

engine = create_async_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    **engine_kwargs,
)

logger.debug(
    "Database engine created: url=%s pool_size=%s",
    settings.DATABASE_URL.split("@")[-1] if "@" in settings.DATABASE_URL else "sqlite",
    engine_kwargs.get("pool_size", "default"),
)

# ── Session factory ─────────────────────────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async_session = AsyncSessionLocal


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields a database session with lifecycle logging.

    Includes slow-query detection: queries taking longer than 2 seconds
    are logged as warnings.
    """
    session_id = id(object())  # lightweight unique-ish id for log correlation
    logger.debug("DB session opened: sid=%s", session_id)
    start = time.monotonic()
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
            elapsed = time.monotonic() - start
            if elapsed > 2.0:
                logger.warning(
                    "Slow DB session: sid=%s elapsed=%.3fs",
                    session_id, elapsed,
                )
            else:
                logger.debug(
                    "DB session committed: sid=%s elapsed=%.3fs",
                    session_id, elapsed,
                )
        except Exception:
            await session.rollback()
            elapsed = time.monotonic() - start
            logger.debug(
                "DB session rolled back: sid=%s elapsed=%.3fs",
                session_id, elapsed,
            )
            raise
        finally:
            logger.debug("DB session closed: sid=%s", session_id)


# ── Health check ────────────────────────────────────────────────────────────

async def db_health_check() -> dict:
    """Return a health status dict for monitoring / readiness probes."""
    start = time.monotonic()
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        latency_ms = (time.monotonic() - start) * 1000
        return {
            "status": "ok",
            "latency_ms": round(latency_ms, 2),
            "database_url": (
                settings.DATABASE_URL.split("@")[-1]
                if "@" in settings.DATABASE_URL
                else "sqlite"
            ),
        }
    except Exception as exc:
        latency_ms = (time.monotonic() - start) * 1000
        logger.error("DB health check failed: %s", exc)
        return {
            "status": "error",
            "latency_ms": round(latency_ms, 2),
            "error": str(exc),
        }


# ── Graceful shutdown ───────────────────────────────────────────────────────

async def dispose_engine() -> None:
    """Dispose of the engine connection pool.  Call on app shutdown."""
    logger.info("Disposing database engine connection pool...")
    await engine.dispose()
    logger.info("Database engine disposed.")
