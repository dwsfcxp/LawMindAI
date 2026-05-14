"""知识库管理路由"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.knowledge import KnowledgeItem
from app.schemas.knowledge import KnowledgeCreate, KnowledgeUpdate, KnowledgeOut

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=list[KnowledgeOut])
async def list_knowledge(
    skip: int = 0,
    limit: int = 50,
    tag: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(KnowledgeItem).where(
        (KnowledgeItem.owner_id == current_user.id) | (KnowledgeItem.team_id == current_user.team_id)
    )
    if tag:
        query = query.where(KnowledgeItem.tags.contains([tag]))
    query = query.order_by(KnowledgeItem.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=KnowledgeOut)
async def create_knowledge(
    data: KnowledgeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = KnowledgeItem(
        title=data.title,
        content=data.content,
        source=data.source,
        tags=data.tags,
        owner_id=current_user.id,
        team_id=data.team_id if data.team_id else current_user.team_id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    # Auto-ingest into vector store
    try:
        from app.services.vector.store import get_vector_service
        svc = get_vector_service()
        await svc.add_statutes([{
            "id": f"knowledge_{row.id}",
            "title": row.title,
            "content": row.content[:5000],
            "metadata": {"source": row.source, "type": "knowledge", "tags": row.tags},
        }])
        row.embedding_id = f"knowledge_{row.id}"
        await db.commit()
        await db.refresh(row)
    except Exception as e:
        logger.warning(f"Auto vector ingest failed for knowledge {row.id}: {e}")

    return row


@router.get("/stats")
async def knowledge_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total = await db.execute(
        select(func.count(KnowledgeItem.id)).where(
            (KnowledgeItem.owner_id == current_user.id) | (KnowledgeItem.team_id == current_user.team_id)
        )
    )
    # Collect all tags
    result = await db.execute(
        select(KnowledgeItem.tags).where(
            (KnowledgeItem.owner_id == current_user.id) | (KnowledgeItem.team_id == current_user.team_id)
        )
    )
    all_tags = set()
    for row in result.scalars().all():
        if row:
            all_tags.update(row)
    return {"total": total.scalar() or 0, "tags": sorted(all_tags)}


@router.post("/upload-text")
async def upload_text_to_knowledge(
    data: KnowledgeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload plain text content as knowledge item"""
    return await create_knowledge(data, db, current_user)


@router.get("/{item_id}", response_model=KnowledgeOut)
async def get_knowledge(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(KnowledgeItem).where(KnowledgeItem.id == item_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(404, "知识条目不存在")
    if row.owner_id != current_user.id and row.team_id != current_user.team_id:
        raise HTTPException(403, "无权访问")
    return row


@router.put("/{item_id}", response_model=KnowledgeOut)
async def update_knowledge(
    item_id: int,
    data: KnowledgeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(KnowledgeItem).where(KnowledgeItem.id == item_id, KnowledgeItem.owner_id == current_user.id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(404, "知识条目不存在或无权编辑")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/{item_id}")
async def delete_knowledge(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(KnowledgeItem).where(KnowledgeItem.id == item_id, KnowledgeItem.owner_id == current_user.id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(404, "知识条目不存在或无权删除")

    # Clean up vector store
    if row.embedding_id:
        try:
            from app.services.vector.store import get_vector_service
            svc = get_vector_service()
            await svc.delete_statutes([row.embedding_id])
        except Exception as e:
            logger.warning(f"Vector delete failed for knowledge {item_id}: {e}")

    await db.delete(row)
    await db.commit()
    return {"message": "已删除"}
