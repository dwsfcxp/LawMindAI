from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.case import Case
from app.models.document import Document
from app.schemas.case import CaseCreate, CaseUpdate, CaseOut

router = APIRouter()


def _case_to_out(case: Case, doc_count: int = 0) -> dict:
    return {
        "id": case.id,
        "case_number": case.case_number,
        "title": case.title,
        "case_type": case.case_type,
        "court": case.court,
        "status": case.status,
        "plaintiff": case.plaintiff,
        "defendant": case.defendant,
        "description": case.description,
        "owner_id": case.owner_id,
        "team_id": case.team_id,
        "filing_date": case.filing_date,
        "hearing_dates": case.hearing_dates,
        "deadline_dates": case.deadline_dates,
        "created_at": case.created_at,
        "updated_at": case.updated_at,
        "document_count": doc_count,
    }


@router.get("", response_model=list[CaseOut])
async def list_cases(
    status: str | None = None,
    case_type: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc_count_sq = (
        select(func.count(Document.id))
        .where(Document.case_id == Case.id)
        .correlate(Case)
        .scalar_subquery()
        .label("document_count")
    )

    q = (
        select(Case, doc_count_sq)
        .where(
            (Case.owner_id == current_user.id) | (Case.team_id == current_user.team_id)
        )
    )
    if status:
        q = q.where(Case.status == status)
    if case_type:
        q = q.where(Case.case_type == case_type)
    q = q.order_by(Case.updated_at.desc()).offset(skip).limit(limit)

    result = await db.execute(q)
    rows = result.all()
    return [CaseOut.model_validate(_case_to_out(case, count)) for case, count in rows]


@router.post("", response_model=CaseOut, status_code=201)
async def create_case(
    data: CaseCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    case = Case(
        **data.model_dump(),
        owner_id=current_user.id,
        team_id=current_user.team_id,
    )
    db.add(case)
    await db.flush()
    await db.refresh(case)
    return CaseOut.model_validate(_case_to_out(case, 0))


@router.get("/{case_id}", response_model=CaseOut)
async def get_case(
    case_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    case = await db.get(Case, case_id)
    if not case or (case.owner_id != current_user.id and case.team_id != current_user.team_id):
        raise HTTPException(404, "案件不存在")
    doc_count = await db.execute(
        select(func.count()).where(Document.case_id == case.id)
    )
    return CaseOut.model_validate(_case_to_out(case, doc_count.scalar() or 0))


@router.put("/{case_id}", response_model=CaseOut)
async def update_case(
    case_id: int,
    data: CaseUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    case = await db.get(Case, case_id)
    if not case or case.owner_id != current_user.id:
        raise HTTPException(404, "案件不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(case, k, v)
    await db.flush()
    await db.refresh(case)
    doc_count = await db.execute(
        select(func.count()).where(Document.case_id == case.id)
    )
    return CaseOut.model_validate(_case_to_out(case, doc_count.scalar() or 0))
