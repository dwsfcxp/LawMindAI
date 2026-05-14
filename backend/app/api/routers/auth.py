"""认证路由 — 注册、登录、用户信息管理。"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import (
    hash_password, verify_password, create_access_token, get_current_user,
    check_rate_limit, validate_password_strength, require_admin,
)
from app.models.user import User
from app.schemas.auth import UserRegister, UserLogin, Token, UserOut, UserUpdate

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/register", response_model=UserOut, status_code=201)
async def register(
    data: UserRegister,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    # Rate limit registration per IP
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(f"register:{client_ip}", max_requests=5, window_seconds=300):
        raise HTTPException(429, "注册请求过于频繁，请5分钟后再试")

    # Password strength validation
    is_strong, pw_error = validate_password_strength(data.password)
    if not is_strong:
        raise HTTPException(400, pw_error)

    try:
        exists = await db.execute(select(User).where(User.email == data.email))
        if exists.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="该邮箱已注册")
        user = User(
            name=data.name,
            email=data.email,
            password_hash=hash_password(data.password),
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)
        return user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration failed: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail="注册失败，请稍后重试")


@router.post("/login", response_model=Token)
async def login(
    data: UserLogin,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    # Rate limit login per IP
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(f"login:{client_ip}", max_requests=10, window_seconds=60):
        raise HTTPException(429, "登录请求过于频繁，请稍后再试")

    try:
        result = await db.execute(select(User).where(User.email == data.email))
        user = result.scalar_one_or_none()
        if not user or not verify_password(data.password, user.password_hash):
            raise HTTPException(status_code=401, detail="邮箱或密码错误")
        if not user.is_active:
            raise HTTPException(status_code=403, detail="账户已被禁用")
        token = create_access_token({"sub": str(user.id), "email": user.email})
        return Token(access_token=token)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login failed: {e}")
        raise HTTPException(status_code=500, detail="登录失败，请稍后重试")


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserOut)
async def update_me(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        if data.name is not None:
            current_user.name = data.name
        # Only admins can change roles; non-admins silently ignore this field
        if data.role is not None and current_user.role == "admin":
            if data.role not in ("admin", "lawyer", "assistant"):
                raise HTTPException(400, "无效的用户角色")
            current_user.role = data.role
        await db.flush()
        await db.refresh(current_user)
        return current_user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update user failed: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail="更新失败，请稍后重试")
