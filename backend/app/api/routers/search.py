import json
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.search import SearchRecord
from app.schemas.search import SearchQuery, UnifiedSearchResult
from app.services.search.unified import UnifiedSearchService

router = APIRouter()


@router.post("", response_model=UnifiedSearchResult)
async def unified_search(
    data: SearchQuery,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = UnifiedSearchService()
    result = await service.search(
        query=data.query,
        result_type=data.result_type,
        sources=data.sources,
        top_k=data.top_k,
    )

    record = SearchRecord(
        user_id=current_user.id,
        case_id=data.case_id,
        query=data.query,
        result_type=data.result_type,
        sources_used=result.sources_used,
    )
    db.add(record)

    return result
