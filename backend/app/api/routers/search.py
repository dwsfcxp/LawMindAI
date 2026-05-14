import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, check_rate_limit
from app.core.cache import search_cache, cache_key
from app.models.user import User
from app.models.search import SearchRecord
from app.schemas.search import SearchQuery, UnifiedSearchResult
from app.services.search.unified import UnifiedSearchService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("", response_model=UnifiedSearchResult)
async def unified_search(
    data: SearchQuery,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not data.query or not data.query.strip():
        raise HTTPException(400, "搜索内容不能为空")

    # Rate limit search: 30 per minute per user
    if not check_rate_limit(f"search:{current_user.id}", max_requests=30, window_seconds=60):
        raise HTTPException(429, "搜索请求过于频繁，请稍后再试")

    try:
        import time
        start = time.time()

        # Check search cache (120s TTL for identical queries)
        ckey = cache_key("unified_search", data.query.strip(), data.result_type, str(data.top_k))
        cached = search_cache.get(ckey)
        if cached is not None:
            logger.debug("Search cache hit for query=%r", data.query[:50])
            return cached

        service = UnifiedSearchService()
        result = await service.search(
            query=data.query.strip(),
            result_type=data.result_type,
            sources=data.sources,
            top_k=data.top_k,
        )
        elapsed = time.time() - start
        logger.info(f"Search completed in {elapsed:.2f}s, query={data.query[:50]!r}")

        # Cache the result
        search_cache.set(ckey, result)

        record = SearchRecord(
            user_id=current_user.id,
            case_id=data.case_id,
            query=data.query.strip(),
            result_type=data.result_type,
            sources_used=result.sources_used,
        )
        db.add(record)
        await db.commit()

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Search failed: {e}")
        raise HTTPException(500, f"搜索失败: {str(e)[:200]}")
