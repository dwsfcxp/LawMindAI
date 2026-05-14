"""向量检索路由"""

import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from app.core.security import get_current_user
from app.models.user import User
from app.services.vector.store import get_vector_service
from app.schemas.vector import (
    VectorIngestRequest,
    VectorSearchQuery,
    VectorSearchResponse,
    VectorSearchResult,
    VectorStats,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/ingest")
async def ingest_data(
    data: VectorIngestRequest,
    current_user: User = Depends(get_current_user),
):
    svc = get_vector_service()
    items = [it.model_dump() for it in data.items]
    if data.collection == "cases":
        count = await svc.add_cases(items)
    elif data.collection == "statutes":
        count = await svc.add_statutes(items)
    else:
        raise HTTPException(400, "collection 必须是 cases 或 statutes")
    return {"ingested": count, "collection": data.collection}


@router.post("/ingest/file")
async def ingest_file(
    collection: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    import json
    content = await file.read()
    try:
        items = json.loads(content)
        if isinstance(items, dict) and "items" in items:
            items = items["items"]
        if not isinstance(items, list):
            raise HTTPException(400, "文件内容必须是JSON数组")
    except json.JSONDecodeError:
        raise HTTPException(400, "无效的JSON文件")

    svc = get_vector_service()
    formatted = [{"id": str(it.get("id", i)), "title": it.get("title", ""), "content": it.get("content", ""), "metadata": it.get("metadata")} for i, it in enumerate(items)]

    if collection == "cases":
        count = await svc.add_cases(formatted)
    elif collection == "statutes":
        count = await svc.add_statutes(formatted)
    else:
        raise HTTPException(400, "collection 必须是 cases 或 statutes")

    return {"ingested": count, "collection": collection, "total": len(formatted)}


@router.post("/search", response_model=VectorSearchResponse)
async def search_vector(
    data: VectorSearchQuery,
    current_user: User = Depends(get_current_user),
):
    svc = get_vector_service()
    cases, statutes = [], []

    async def empty():
        return []

    tasks = []
    if data.collection in ("all", "cases"):
        tasks.append(svc.search_cases(data.query, data.top_k))
    else:
        tasks.append(empty())
    if data.collection in ("all", "statutes"):
        tasks.append(svc.search_statutes(data.query, data.top_k))
    else:
        tasks.append(empty())

    results = await asyncio.gather(*tasks, return_exceptions=True)
    if results and not isinstance(results[0], Exception):
        cases = [VectorSearchResult(**r) for r in results[0]]
    if len(results) > 1 and not isinstance(results[1], Exception):
        statutes = [VectorSearchResult(**r) for r in results[1]]

    return VectorSearchResponse(query=data.query, cases=cases, statutes=statutes)


@router.get("/stats", response_model=VectorStats)
async def get_stats(current_user: User = Depends(get_current_user)):
    svc = get_vector_service()
    return VectorStats(**await svc.get_stats())


@router.delete("/{collection}/{item_id}")
async def delete_item(
    collection: str,
    item_id: str,
    current_user: User = Depends(get_current_user),
):
    svc = get_vector_service()
    if collection == "cases":
        ok = await svc.delete_cases([item_id])
    elif collection == "statutes":
        ok = await svc.delete_statutes([item_id])
    else:
        raise HTTPException(400, "collection 必须是 cases 或 statutes")
    return {"deleted": ok}
