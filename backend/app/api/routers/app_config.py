"""应用配置路由 — 向量数据库路径、系统参数等"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.app_config import AppConfig
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

logger = logging.getLogger(__name__)
router = APIRouter()


class ConfigItemCreate(BaseModel):
    config_key: str
    config_value: str = ""
    description: str = ""
    category: str = "general"


class ConfigItemUpdate(BaseModel):
    config_key: str
    config_value: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None


class ConfigItemOut(BaseModel):
    id: int
    config_key: str
    config_value: str
    description: str
    category: str
    created_at: datetime
    updated_at: datetime


# 向量数据库默认配置
VECTOR_DB_DEFAULTS = [
    {"config_key": "vector_db_host", "config_value": "localhost", "description": "ChromaDB 主机地址", "category": "vector_db"},
    {"config_key": "vector_db_port", "config_value": "8001", "description": "ChromaDB 端口", "category": "vector_db"},
    {"config_key": "vector_db_cases_path", "config_value": "", "description": "本地案例向量库路径（留空使用默认）", "category": "vector_db"},
    {"config_key": "vector_db_statutes_path", "config_value": "", "description": "本地法条向量库路径（留空使用默认）", "category": "vector_db"},
    {"config_key": "vector_db_knowledge_path", "config_value": "", "description": "个人知识库向量路径（留空使用默认）", "category": "vector_db"},
    {"config_key": "embedding_model", "config_value": "all-MiniLM-L6-v2", "description": "向量嵌入模型", "category": "vector_db"},
    {"config_key": "embedding_base_url", "config_value": "", "description": "嵌入模型API地址（留空使用本地）", "category": "vector_db"},
    {"config_key": "max_upload_size_mb", "config_value": "50", "description": "最大上传文件大小(MB)", "category": "general"},
    {"config_key": "default_llm_temperature", "config_value": "0.7", "description": "LLM默认温度参数", "category": "general"},
]


@router.get("", response_model=list[ConfigItemOut])
async def list_configs(
    category: str = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _ensure_defaults(db, current_user)
    query = select(AppConfig).where(AppConfig.owner_id == current_user.id)
    if category:
        query = query.where(AppConfig.category == category)
    query = query.order_by(AppConfig.category, AppConfig.config_key)
    result = await db.execute(query)
    return result.scalars().all()


@router.put("/{config_id}", response_model=ConfigItemOut)
async def update_config(
    config_id: int,
    data: ConfigItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AppConfig).where(
            AppConfig.id == config_id,
            AppConfig.owner_id == current_user.id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(404, "配置不存在")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    await db.commit()
    await db.refresh(row)

    # 如果修改了向量DB配置，触发重新连接
    if row.category == "vector_db" and row.config_key.startswith("vector_db_"):
        _reset_vector_service()

    return row


@router.post("/batch-update", response_model=list[ConfigItemOut])
async def batch_update(
    items: list[ConfigItemUpdate],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    results = []
    for item in items:
        result = await db.execute(
            select(AppConfig).where(
                AppConfig.owner_id == current_user.id,
                AppConfig.config_key == item.config_key,
            )
        )
        row = result.scalar_one_or_none()
        if row:
            row.config_value = item.config_value
            results.append(row)
    await db.commit()
    for r in results:
        await db.refresh(r)

    _reset_vector_service()
    return results


@router.post("/reset-vector-connection")
async def reset_vector_connection(
    current_user: User = Depends(get_current_user),
):
    _reset_vector_service()
    return {"message": "向量数据库连接已重置"}


def _reset_vector_service():
    try:
        from app.services.vector.store import _vector_service
        import app.services.vector.store as vs
        if _vector_service:
            vs._vector_service = None
    except Exception as e:
        logger.warning(f"Failed to reset vector service: {e}")


async def _ensure_defaults(db: AsyncSession, user: User):
    result = await db.execute(
        select(AppConfig.config_key).where(AppConfig.owner_id == user.id)
    )
    existing_keys = {row[0] for row in result.all()}
    for default in VECTOR_DB_DEFAULTS:
        if default["config_key"] not in existing_keys:
            row = AppConfig(
                owner_id=user.id,
                **default,
            )
            db.add(row)
    await db.commit()
