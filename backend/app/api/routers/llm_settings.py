"""LLM配置管理路由"""

import time
import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
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

# ── 预设大模型模板 ──────────────────────────────────────────────────
LLM_PRESETS = [
    # 国内
    {"key": "zhipu", "name": "智谱 GLM", "category": "国内", "base_url": "https://open.bigmodel.cn/api/coding/paas/v4", "model_name": "glm-5.1", "max_tokens": 4096, "locked": True},
    {"key": "zhipu_free", "name": "智谱 GLM（免费）", "category": "国内", "base_url": "https://open.bigmodel.cn/api/paas/v4", "model_name": "glm-4-flash", "max_tokens": 4096, "locked": False},
    {"key": "qwen", "name": "阿里 通义千问", "category": "国内", "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1", "model_name": "qwen-max", "max_tokens": 8192, "locked": False},
    {"key": "ernie", "name": "百度 文心一言", "category": "国内", "base_url": "https://qianfan.baidubce.com/v2", "model_name": "ernie-4.0-8k", "max_tokens": 4096, "locked": False},
    {"key": "moonshot", "name": "月之暗面 Kimi", "category": "国内", "base_url": "https://api.moonshot.cn/v1", "model_name": "moonshot-v1-128k", "max_tokens": 8192, "locked": False},
    {"key": "deepseek", "name": "DeepSeek", "category": "国内", "base_url": "https://api.deepseek.com", "model_name": "deepseek-chat", "max_tokens": 8192, "locked": False},
    # 国际
    {"key": "openai", "name": "OpenAI GPT-4o", "category": "国际", "base_url": "https://api.openai.com/v1", "model_name": "gpt-4o", "max_tokens": 4096, "locked": False},
    {"key": "claude", "name": "Anthropic Claude", "category": "国际", "base_url": "https://api.anthropic.com", "model_name": "claude-sonnet-4-20250514", "max_tokens": 4096, "locked": False},
    {"key": "gemini", "name": "Google Gemini", "category": "国际", "base_url": "https://generativelanguage.googleapis.com/v1beta/openai", "model_name": "gemini-2.5-pro", "max_tokens": 8192, "locked": False},
    {"key": "mistral", "name": "Mistral AI", "category": "国际", "base_url": "https://api.mistral.ai/v1", "model_name": "mistral-large-latest", "max_tokens": 4096, "locked": False},
]


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
    await ensure_default_config(db, current_user)
    result = await db.execute(
        select(Model).where(Model.owner_id == current_user.id).order_by(Model.is_default.desc(), Model.created_at)
    )
    items = [_row_to_out(r).model_dump(mode="json") for r in result.scalars().all()]
    return JSONResponse(content=items, headers={"X-Total-Count": str(len(items))})


@router.post("", response_model=LLMSettingsOut, status_code=201)
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
    if row.name == "智谱 GLM":
        raise HTTPException(400, "默认智谱配置不可删除")
    await db.delete(row)
    await db.commit()
    return {"message": "已删除"}


@router.post("/test-connectivity", response_model=ConnectivityTestResult)
async def test_connectivity(
    data: ConnectivityTestRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    api_key = data.api_key
    base_url = data.base_url

    if not api_key and data.setting_id:
        from app.models.llm_settings import LLMSettings as Model
        result = await db.execute(
            select(Model).where(Model.id == data.setting_id, Model.owner_id == current_user.id)
        )
        stored = result.scalar_one_or_none()
        if stored:
            api_key = stored.api_key
            if not base_url:
                base_url = stored.base_url

    if not api_key:
        return ConnectivityTestResult(
            success=False,
            message="缺少 API Key，请输入或选择已保存的配置",
            model=data.model_name,
        )

    try:
        client = create_llm_client(base_url, api_key)
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
        logger.warning("LLM connectivity test failed: %s", e)
        msg = "连接失败"
        if "timeout" in str(e).lower():
            msg = "连接超时，请检查网络或API地址"
        elif "401" in str(e) or "auth" in str(e).lower():
            msg = "API Key 无效，请检查密钥是否正确"
        elif "connection" in str(e).lower():
            msg = "无法连接到服务器，请检查API地址"
        return ConnectivityTestResult(
            success=False,
            message=msg,
            model=data.model_name,
        )


@router.get("/presets")
async def get_presets():
    """获取预设大模型模板列表。"""
    return LLM_PRESETS


async def ensure_default_config(db: AsyncSession, user: User):
    """确保用户拥有焊死的智谱默认配置。"""
    from app.models.llm_settings import LLMSettings as Model
    from app.config import get_settings
    settings = get_settings()

    result = await db.execute(
        select(Model).where(Model.owner_id == user.id, Model.name == "智谱 GLM")
    )
    existing = result.scalar_one_or_none()
    if not existing:
        row = Model(
            owner_id=user.id,
            name="智谱 GLM",
            base_url="https://open.bigmodel.cn/api/coding/paas/v4",
            api_key=settings.CLAUDE_API_KEY,
            model_name="glm-5.1",
            max_tokens=4096,
            is_default=True,
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
    elif not existing.is_default:
        await db.execute(
            update(Model).where(Model.owner_id == user.id, Model.is_default == True).values(is_default=False)
        )
        existing.is_default = True
        await db.commit()
