import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy import select, or_, and_, false as sa_false
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.document import Template
from app.schemas.document import TemplateCreate, TemplateUpdate, TemplateOut

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=list[TemplateOut])
async def list_templates(
    type: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        team_filter = (
            and_(Template.team_id == current_user.team_id)
            if current_user.team_id is not None
            else sa_false()
        )
        base_where = or_(
            Template.is_public == True,
            Template.owner_id == current_user.id,
            team_filter,
        )
        # Count query for pagination header
        from sqlalchemy import func as sa_func
        count_q = select(sa_func.count(Template.id)).where(base_where)
        if type:
            count_q = count_q.where(Template.type == type)
        total = (await db.execute(count_q)).scalar() or 0

        q = select(Template).where(base_where)
        if type:
            q = q.where(Template.type == type)
        q = q.order_by(Template.created_at.desc()).offset(skip).limit(limit)
        result = await db.execute(q)
        items = result.scalars().all()
        from app.schemas.document import TemplateOut
        data = [TemplateOut.model_validate(t).model_dump(mode="json") for t in items]
        return JSONResponse(content=data, headers={"X-Total-Count": str(total)})
    except Exception as e:
        logger.error(f"List templates failed: {e}")
        raise HTTPException(500, "查询模板列表失败")


@router.post("", response_model=TemplateOut, status_code=201)
async def create_template(
    data: TemplateCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        tmpl = Template(
            **data.model_dump(),
            owner_id=current_user.id,
            team_id=current_user.team_id,
        )
        db.add(tmpl)
        await db.flush()
        await db.refresh(tmpl)
        return tmpl
    except Exception as e:
        logger.error(f"Create template failed: {e}")
        await db.rollback()
        raise HTTPException(500, "创建模板失败")


@router.get("/{template_id}", response_model=TemplateOut)
async def get_template(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        tmpl = await db.get(Template, template_id)
        if not tmpl:
            raise HTTPException(404, "模板不存在")
        return tmpl
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get template failed: {e}")
        raise HTTPException(500, "查询模板失败")


@router.put("/{template_id}", response_model=TemplateOut)
async def update_template(
    template_id: int,
    data: TemplateUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        tmpl = await db.get(Template, template_id)
        if not tmpl or (tmpl.owner_id != current_user.id):
            raise HTTPException(404, "模板不存在或无权编辑")
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(tmpl, k, v)
        await db.flush()
        await db.refresh(tmpl)
        return tmpl
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update template failed: {e}")
        await db.rollback()
        raise HTTPException(500, "更新模板失败")


@router.delete("/{template_id}")
async def delete_template(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        tmpl = await db.get(Template, template_id)
        if not tmpl or tmpl.owner_id != current_user.id:
            raise HTTPException(404, "模板不存在或无权删除")
        await db.delete(tmpl)
        await db.flush()
        return {"message": "已删除"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete template failed: {e}")
        await db.rollback()
        raise HTTPException(500, "删除模板失败")
