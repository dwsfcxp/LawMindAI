"""证据管理路由"""

import asyncio
import uuid
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import JSONResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, validate_upload, sanitize_filename
from app.config import get_settings
from app.models.user import User
from app.models.case import Case
from app.models.evidence import Evidence
from app.schemas.evidence import EvidenceCreate, EvidenceUpdate, EvidenceOut
from app.services.evidence.ocr import validate_file_type, extract_text
from app.services.evidence.analysis import analyze_evidence
from app.services.evidence.chain import analyze_evidence_chain, generate_cross_examination

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=list[EvidenceOut])
async def list_evidence(
    case_id: int | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        base_where = Case.owner_id == current_user.id
        # Count query
        count_q = select(func.count(Evidence.id)).join(Case).where(base_where)
        if case_id:
            count_q = count_q.where(Evidence.case_id == case_id)
        total = (await db.execute(count_q)).scalar() or 0

        query = select(Evidence).join(Case).where(base_where)
        if case_id:
            query = query.where(Evidence.case_id == case_id)
        query = query.order_by(Evidence.sort_order, Evidence.created_at.desc()).offset(skip).limit(limit)
        result = await db.execute(query)
        items = []
        for e in result.scalars().all():
            out = EvidenceOut.model_validate(e)
            out.has_file = e.file_path is not None
            # Truncate large text fields in list view
            if out.ocr_text and len(out.ocr_text) > 300:
                out.ocr_text = out.ocr_text[:300] + "..."
            if out.analysis and len(out.analysis) > 300:
                out.analysis = out.analysis[:300] + "..."
            items.append(out)
        return JSONResponse(
            content=[i.model_dump(mode="json") for i in items],
            headers={"X-Total-Count": str(total)},
        )
    except Exception as e:
        logger.error(f"List evidence failed: {e}")
        raise HTTPException(500, "查询证据列表失败")


@router.post("", response_model=EvidenceOut, status_code=201)
async def create_evidence(
    data: EvidenceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        # 验证案件归属
        case = await db.execute(select(Case).where(Case.id == data.case_id, Case.owner_id == current_user.id))
        if not case.scalar_one_or_none():
            raise HTTPException(404, "案件不存在")
        row = Evidence(
            case_id=data.case_id,
            type=data.type,
            title=data.title,
            tags=data.tags,
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        out = EvidenceOut.model_validate(row)
        out.has_file = False
        return out
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create evidence failed: {e}")
        await db.rollback()
        raise HTTPException(500, "创建证据失败")


@router.post("/{evidence_id}/upload", response_model=EvidenceOut)
async def upload_file(
    evidence_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        result = await db.execute(
            select(Evidence).join(Case).where(Evidence.id == evidence_id, Case.owner_id == current_user.id)
        )
        row = result.scalar_one_or_none()
        if not row:
            raise HTTPException(404, "证据不存在")

        # Use centralized upload validation (extension + MIME + size + injection scan)
        content = await validate_upload(file)

        settings = get_settings()
        upload_dir = settings.upload_path / "evidence" / str(row.case_id)
        upload_dir.mkdir(parents=True, exist_ok=True)

        ext = Path(file.filename or ".bin").suffix
        safe_name = f"{uuid.uuid4().hex[:12]}{ext}"
        dest = upload_dir / safe_name
        await asyncio.to_thread(dest.write_bytes, content)

        row.file_path = f"evidence/{row.case_id}/{safe_name}"
        await db.commit()
        await db.refresh(row)

        # 自动OCR
        try:
            ocr_text = await extract_text(dest)
            row.ocr_text = ocr_text
            await db.commit()
            await db.refresh(row)
        except Exception as e:
            logger.warning(f"Auto OCR failed for evidence {evidence_id}: {e}")

        out = EvidenceOut.model_validate(row)
        out.has_file = True
        return out
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload evidence file failed: {e}")
        await db.rollback()
        raise HTTPException(500, "上传证据文件失败")


@router.get("/{evidence_id}", response_model=EvidenceOut)
async def get_evidence(
    evidence_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Evidence).join(Case).where(Evidence.id == evidence_id, Case.owner_id == current_user.id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(404, "证据不存在")
    out = EvidenceOut.model_validate(row)
    out.has_file = row.file_path is not None
    return out


@router.put("/{evidence_id}", response_model=EvidenceOut)
async def update_evidence(
    evidence_id: int,
    data: EvidenceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        result = await db.execute(
            select(Evidence).join(Case).where(Evidence.id == evidence_id, Case.owner_id == current_user.id)
        )
        row = result.scalar_one_or_none()
        if not row:
            raise HTTPException(404, "证据不存在")
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(row, field, value)
        await db.commit()
        await db.refresh(row)
        out = EvidenceOut.model_validate(row)
        out.has_file = row.file_path is not None
        return out
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update evidence failed: {e}")
        await db.rollback()
        raise HTTPException(500, "更新证据失败")


@router.delete("/{evidence_id}")
async def delete_evidence(
    evidence_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        result = await db.execute(
            select(Evidence).join(Case).where(Evidence.id == evidence_id, Case.owner_id == current_user.id)
        )
        row = result.scalar_one_or_none()
        if not row:
            raise HTTPException(404, "证据不存在")
        if row.file_path:
            settings = get_settings()
            fp = settings.upload_path / row.file_path
            if fp.exists():
                fp.unlink()
        await db.delete(row)
        await db.commit()
        return {"message": "已删除"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete evidence failed: {e}")
        await db.rollback()
        raise HTTPException(500, "删除证据失败")


@router.post("/{evidence_id}/analyze", response_model=EvidenceOut)
async def analyze_evidence_endpoint(
    evidence_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        result = await db.execute(
            select(Evidence).join(Case).where(Evidence.id == evidence_id, Case.owner_id == current_user.id)
        )
        row = result.scalar_one_or_none()
        if not row:
            raise HTTPException(404, "证据不存在")

        # 如果有文件但还没OCR，先提取文字
        if row.file_path and not row.ocr_text:
            settings = get_settings()
            fp = settings.upload_path / row.file_path
            if fp.exists():
                row.ocr_text = await extract_text(fp)
                await db.commit()
                await db.refresh(row)

        # 获取案件背景
        case_result = await db.execute(select(Case).where(Case.id == row.case_id))
        case = case_result.scalar_one_or_none()
        case_context = case.description if case else ""

        import time
        start = time.time()
        row.analysis = await analyze_evidence(row.ocr_text or "", case_context)
        logger.info(f"Evidence analysis took {time.time()-start:.2f}s for evidence {evidence_id}")
        await db.commit()
        await db.refresh(row)

        out = EvidenceOut.model_validate(row)
        out.has_file = row.file_path is not None
        return out
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Analyze evidence failed: {e}")
        raise HTTPException(500, f"证据分析失败: {str(e)[:200]}")


@router.get("/{evidence_id}/download")
async def download_evidence(
    evidence_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from fastapi.responses import FileResponse

    result = await db.execute(
        select(Evidence).join(Case).where(Evidence.id == evidence_id, Case.owner_id == current_user.id)
    )
    row = result.scalar_one_or_none()
    if not row or not row.file_path:
        raise HTTPException(404, "文件不存在")

    settings = get_settings()
    fp = settings.upload_path / row.file_path
    if not fp.exists():
        raise HTTPException(404, "文件已被删除")

    return FileResponse(str(fp), filename=fp.name, media_type="application/octet-stream")


@router.post("/chain-analysis/{case_id}")
async def chain_analysis(
    case_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """分析案件的证据链完整性"""
    try:
        case_result = await db.execute(
            select(Case).where(Case.id == case_id, Case.owner_id == current_user.id)
        )
        case = case_result.scalar_one_or_none()
        if not case:
            raise HTTPException(404, "案件不存在")

        ev_result = await db.execute(
            select(Evidence).where(Evidence.case_id == case_id).order_by(Evidence.sort_order)
        )
        evidence_list = []
        for ev in ev_result.scalars().all():
            evidence_list.append({
                "id": ev.id,
                "title": ev.title,
                "type": ev.type,
                "ocr_text": ev.ocr_text,
                "analysis": ev.analysis,
                "tags": ev.tags,
            })

        if not evidence_list:
            raise HTTPException(400, "该案件暂无证据，无法进行证据链分析")

        result = await analyze_evidence_chain(case.description or case.title, evidence_list)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chain analysis failed: {e}")
        raise HTTPException(500, f"证据链分析失败: {str(e)[:200]}")


@router.post("/{evidence_id}/cross-examination")
async def cross_examination(
    evidence_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """为证据生成质证意见"""
    try:
        result = await db.execute(
            select(Evidence).join(Case).where(Evidence.id == evidence_id, Case.owner_id == current_user.id)
        )
        row = result.scalar_one_or_none()
        if not row:
            raise HTTPException(404, "证据不存在")

        if not row.ocr_text:
            raise HTTPException(400, "证据文字为空，请先上传文件并完成OCR")

        case_result = await db.execute(select(Case).where(Case.id == row.case_id))
        case = case_result.scalar_one_or_none()
        case_context = f"{case.description or ''} {case.title or ''}" if case else ""

        opinion = await generate_cross_examination(
            evidence_text=row.ocr_text,
            evidence_type=row.type,
            case_context=case_context,
        )
        return {"cross_examination": opinion}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cross examination failed: {e}")
        raise HTTPException(500, f"质证意见生成失败: {str(e)[:200]}")
