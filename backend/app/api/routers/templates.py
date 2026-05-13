from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.document import Template
from app.schemas.document import TemplateCreate, TemplateUpdate, TemplateOut

router = APIRouter()


@router.get("", response_model=list[TemplateOut])
async def list_templates(
    type: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Template).where(
        (Template.is_public == True) |
        (Template.owner_id == current_user.id) |
        (Template.team_id == current_user.team_id)
    )
    if type:
        q = q.where(Template.type == type)
    q = q.order_by(Template.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=TemplateOut, status_code=201)
async def create_template(
    data: TemplateCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tmpl = Template(
        **data.model_dump(),
        owner_id=current_user.id,
        team_id=current_user.team_id,
    )
    db.add(tmpl)
    await db.flush()
    await db.refresh(tmpl)
    return tmpl


@router.get("/{template_id}", response_model=TemplateOut)
async def get_template(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tmpl = await db.get(Template, template_id)
    if not tmpl:
        raise HTTPException(404, "模板不存在")
    return tmpl


@router.put("/{template_id}", response_model=TemplateOut)
async def update_template(
    template_id: int,
    data: TemplateUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tmpl = await db.get(Template, template_id)
    if not tmpl or (tmpl.owner_id != current_user.id):
        raise HTTPException(404, "模板不存在或无权编辑")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(tmpl, k, v)
    await db.flush()
    await db.refresh(tmpl)
    return tmpl


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tmpl = await db.get(Template, template_id)
    if not tmpl or tmpl.owner_id != current_user.id:
        raise HTTPException(404, "模板不存在或无权删除")
    await db.delete(tmpl)
