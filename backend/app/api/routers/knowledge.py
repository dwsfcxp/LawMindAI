"""知识库管理路由"""

import asyncio
import uuid
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.config import get_settings
from app.models.user import User
from app.models.knowledge import KnowledgeItem
from app.schemas.knowledge import KnowledgeCreate, KnowledgeUpdate, KnowledgeOut
from app.services.evidence.ocr import validate_file_type, extract_text

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
        (KnowledgeItem.owner_id == current_user.id) |
        ((current_user.team_id.is_not(None)) & (KnowledgeItem.team_id == current_user.team_id))
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
        await svc.add_knowledge([{
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
    owner_filter = (KnowledgeItem.owner_id == current_user.id)
    team_filter = (
        (current_user.team_id.is_not(None))
        & (KnowledgeItem.team_id == current_user.team_id)
    )
    base_where = owner_filter | team_filter
    total = await db.execute(
        select(func.count(KnowledgeItem.id)).where(base_where)
    )
    # Collect all tags
    result = await db.execute(
        select(KnowledgeItem.tags).where(base_where)
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


@router.post("/upload-file", response_model=KnowledgeOut)
async def upload_file_to_knowledge(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """上传文件到知识库，自动提取文字并向量化入库。"""
    if not validate_file_type(file.filename or ""):
        raise HTTPException(400, "不支持的文件类型，允许: PDF, DOC, DOCX, TXT, XLSX, XLS, PNG, JPG, GIF, WEBP, BMP, TIFF")

    settings = get_settings()
    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"文件大小超过{settings.MAX_UPLOAD_SIZE_MB}MB限制")

    tmp_dir = settings.upload_path / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or ".bin").suffix
    tmp_path = tmp_dir / f"{uuid.uuid4().hex[:12]}{ext}"
    await asyncio.to_thread(tmp_path.write_bytes, content)

    try:
        text = await extract_text(tmp_path)
    finally:
        await asyncio.to_thread(tmp_path.unlink, missing_ok=True)

    if not text or text.startswith("["):
        raise HTTPException(400, f"文件文字提取失败: {text}")

    # 分段：超过2000字则按段落拆分为多条
    chunks = _split_text(text, max_chars=2000)
    items = []
    for i, chunk in enumerate(chunks):
        title = Path(file.filename).stem
        if len(chunks) > 1:
            title = f"{title} (第{i+1}部分)"
        row = KnowledgeItem(
            title=title,
            content=chunk,
            source=file.filename,
            tags=["文件上传"],
            owner_id=current_user.id,
            team_id=current_user.team_id,
        )
        db.add(row)
        await db.flush()
        await db.refresh(row)
        items.append(row)

        # 自动向量化
        try:
            from app.services.vector.store import get_vector_service
            svc = get_vector_service()
            await svc.add_knowledge([{
                "id": f"knowledge_{row.id}",
                "title": row.title,
                "content": row.content[:5000],
                "metadata": {"source": row.source, "type": "knowledge", "tags": row.tags},
            }])
            row.embedding_id = f"knowledge_{row.id}"
        except Exception as e:
            logger.warning(f"Auto vector ingest failed for knowledge {row.id}: {e}")

    await db.commit()
    await db.refresh(items[0])
    return items[0]


def _split_text(text: str, max_chars: int = 2000) -> list[str]:
    """将长文本按段落拆分。"""
    if len(text) <= max_chars:
        return [text]
    paragraphs = text.split("\n\n")
    chunks = []
    current = ""
    for p in paragraphs:
        if len(current) + len(p) + 2 > max_chars and current:
            chunks.append(current.strip())
            current = p
        else:
            current = current + "\n\n" + p if current else p
    if current.strip():
        chunks.append(current.strip())
    return chunks if chunks else [text]


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
    if row.owner_id != current_user.id and (not current_user.team_id or row.team_id != current_user.team_id):
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
            await svc.delete_knowledge([row.embedding_id])
        except Exception as e:
            logger.warning(f"Vector delete failed for knowledge {item_id}: {e}")

    await db.delete(row)
    await db.commit()
    return {"message": "已删除"}
