"""法律研究路由"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.research import ResearchReport
from app.schemas.research import ResearchRequest, ResearchReportOut
from app.services.research.engine import LegalResearchEngine

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("", response_model=ResearchReportOut)
async def create_research(
    data: ResearchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    engine = LegalResearchEngine()
    result = await engine.research(data.query, data.sources, data.case_id)

    row = ResearchReport(
        owner_id=current_user.id,
        query=data.query,
        report=result["report"],
        sources_used=result["sources_used"],
        case_id=data.case_id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return ResearchReportOut.model_validate(row)


@router.get("", response_model=list[ResearchReportOut])
async def list_research(
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ResearchReport)
        .where(ResearchReport.owner_id == current_user.id)
        .order_by(ResearchReport.created_at.desc())
        .offset(skip).limit(limit)
    )
    return [ResearchReportOut.model_validate(r) for r in result.scalars().all()]


@router.get("/{report_id}", response_model=ResearchReportOut)
async def get_research(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ResearchReport).where(ResearchReport.id == report_id, ResearchReport.owner_id == current_user.id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(404, "研究报告不存在")
    return ResearchReportOut.model_validate(row)


@router.delete("/{report_id}")
async def delete_research(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ResearchReport).where(ResearchReport.id == report_id, ResearchReport.owner_id == current_user.id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(404, "研究报告不存在")
    await db.delete(row)
    await db.commit()
    return {"message": "已删除"}
