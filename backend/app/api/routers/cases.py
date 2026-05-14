import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.case import Case
from app.models.document import Document
from app.schemas.case import CaseCreate, CaseUpdate, CaseOut

logger = logging.getLogger(__name__)
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
            or_(
                Case.owner_id == current_user.id,
                and_(current_user.team_id.isnot(None), Case.team_id == current_user.team_id),
            )
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
    if not case or (case.owner_id != current_user.id and (not current_user.team_id or case.team_id != current_user.team_id)):
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


@router.post("/{case_id}/analyze")
async def analyze_case(
    case_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI 分析案件：提取当事人、案由、关键时间、争议焦点、策略建议。"""
    case = await db.get(Case, case_id)
    if not case or (case.owner_id != current_user.id and (not current_user.team_id or case.team_id != current_user.team_id)):
        raise HTTPException(404, "案件不存在")

    if not case.description:
        raise HTTPException(400, "案件描述为空，无法分析")

    from app.services.llm_client import create_llm_client_from_settings
    from app.config import get_settings
    settings = get_settings()

    prompt = f"""你是资深中国执业律师。请分析以下案件，输出结构化的法律分析报告：

## 案件信息
标题：{case.title}
类型：{case.case_type}
原告：{case.plaintiff or '未知'}
被告：{case.defendant or '未知'}
描述：{case.description}

## 请输出以下内容（用 Markdown 格式）：
1. **案件概要** — 一句话概括案件核心
2. **当事人信息** — 原被告基本信息及法律地位
3. **案由认定** — 案由及法律关系分析
4. **关键时间节点** — 诉讼时效、重要日期提醒
5. **争议焦点** — 双方核心争议点
6. **适用法条** — 相关法律法规引用
7. **诉讼策略建议** — 原告/被告各应如何应对
8. **风险评估** — 胜诉概率及风险提示"""

    try:
        client = create_llm_client_from_settings(settings)
        response = await client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=settings.CLAUDE_MAX_TOKENS,
            messages=[{"role": "user", "content": prompt}],
        )
        analysis = response.content[0].text if response.content else ""
    except Exception as e:
        logger.error(f"Case analysis failed for {case_id}: {e}")
        raise HTTPException(503, f"AI分析失败: {str(e)[:200]}")

    return {"case_id": case_id, "analysis": analysis}
