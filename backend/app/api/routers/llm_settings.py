"""LLM配置管理路由"""

import time
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services.llm_client import create_llm_client
from app.schemas.llm_settings import (
    LLMSettingsCreate,
    LLMSettingsUpdate,
    LLMSettingsOut,
    ConnectivityTestRequest,
    ConnectivityTestResult,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _mask_api_key(key: str) -> str:
    if len(key) <= 8:
        return "*" * len(key)
    return key[:4] + "*" * (len(key) - 8) + key[-4:]


def _row_to_out(row) -> LLMSettingsOut:
    return LLMSettingsOut(
        id=row.id,
        name=row.name,
        base_url=row.base_url,
        api_key_masked=_mask_api_key(row.api_key),
        model_name=row.model_name,
        max_tokens=row.max_tokens,
        is_default=row.is_default,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=list[LLMSettingsOut])
async def list_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.llm_settings import LLMSettings as Model
    result = await db.execute(
        select(Model).where(Model.owner_id == current_user.id).order_by(Model.is_default.desc(), Model.created_at)
    )
    return [_row_to_out(r) for r in result.scalars().all()]


@router.post("", response_model=LLMSettingsOut)
async def create_settings(
    data: LLMSettingsCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.llm_settings import LLMSettings as Model
    if data.is_default:
        await db.execute(
            update(Model).where(Model.owner_id == current_user.id, Model.is_default == True).values(is_default=False)
        )
    row = Model(
        owner_id=current_user.id,
        name=data.name,
        base_url=data.base_url,
        api_key=data.api_key,
        model_name=data.model_name,
        max_tokens=data.max_tokens,
        is_default=data.is_default,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _row_to_out(row)


@router.put("/{setting_id}", response_model=LLMSettingsOut)
async def update_settings(
    setting_id: int,
    data: LLMSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.llm_settings import LLMSettings as Model
    result = await db.execute(
        select(Model).where(Model.id == setting_id, Model.owner_id == current_user.id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(404, "配置不存在")
    if data.is_default:
        await db.execute(
            update(Model).where(Model.owner_id == current_user.id, Model.is_default == True).values(is_default=False)
        )
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    await db.commit()
    await db.refresh(row)
    return _row_to_out(row)


@router.delete("/{setting_id}")
async def delete_settings(
    setting_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.llm_settings import LLMSettings as Model
    result = await db.execute(
        select(Model).where(Model.id == setting_id, Model.owner_id == current_user.id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(404, "配置不存在")
    await db.delete(row)
    await db.commit()
    return {"message": "已删除"}


@router.post("/test-connectivity", response_model=ConnectivityTestResult)
async def test_connectivity(
    data: ConnectivityTestRequest,
    current_user: User = Depends(get_current_user),
):
    try:
        client = create_llm_client(data.base_url, data.api_key)
        start = time.time()
        response = await client.messages.create(
            model=data.model_name,
            max_tokens=32,
            messages=[{"role": "user", "content": "你好，请回复'连接成功'"}],
        )
        latency = int((time.time() - start) * 1000)
        text = response.content[0].text if response.content else ""
        return ConnectivityTestResult(
            success=True,
            message=f"连接成功，模型回复: {text[:50]}",
            model=data.model_name,
            latency_ms=latency,
        )
    except Exception as e:
        logger.warning(f"LLM connectivity test failed: {e}")
        return ConnectivityTestResult(
            success=False,
            message=f"连接失败: {str(e)[:200]}",
            model=data.model_name,
        )
