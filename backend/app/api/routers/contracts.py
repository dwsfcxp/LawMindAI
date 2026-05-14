"""合同审查路由"""

import uuid
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.config import get_settings
from app.models.user import User
from app.models.case import Case
from app.models.contract import Contract
from app.schemas.contract import ContractOut, ReviewReportExport
from app.services.contract.parser import validate_contract_file, parse_contract_document
from app.services.contract.engine import review_contract

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=list[ContractOut])
async def list_contracts(
    case_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Contract).where(Contract.owner_id == current_user.id)
    if case_id:
        query = query.where(Contract.case_id == case_id)
    query = query.order_by(Contract.created_at.desc())
    result = await db.execute(query)
    items = []
    for c in result.scalars().all():
        out = ContractOut.model_validate(c)
        out.has_file = c.file_path is not None
        items.append(out)
    return items


@router.post("/upload", response_model=ContractOut)
async def upload_contract(
    file: UploadFile = File(...),
    title: str = Form(...),
    case_id: int | None = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not validate_contract_file(file.filename or ""):
        raise HTTPException(400, "不支持的文件类型，允许: PDF, DOCX, DOC, TXT, PNG, JPG, BMP, TIFF")

    settings = get_settings()
    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"文件大小超过{settings.MAX_UPLOAD_SIZE_MB}MB限制")

    # Validate case ownership
    if case_id:
        case = await db.execute(select(Case).where(Case.id == case_id, Case.owner_id == current_user.id))
        if not case.scalar_one_or_none():
            raise HTTPException(404, "案件不存在")

    upload_dir = settings.upload_path / "contracts"
    upload_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename or ".bin").suffix
    safe_name = f"{uuid.uuid4().hex[:12]}{ext}"
    dest = upload_dir / safe_name
    dest.write_bytes(content)

    row = Contract(
        owner_id=current_user.id,
        case_id=case_id,
        title=title,
        file_path=f"contracts/{safe_name}",
        file_type=ext.lstrip("."),
        status="pending",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    # Auto-parse
    try:
        row.status = "parsing"
        await db.commit()

        from app.services.llm_client import create_llm_client_from_settings
        client = create_llm_client_from_settings(settings)
        parsed = await parse_contract_document(dest, client, settings.CLAUDE_MODEL)
        row.parsed_text = parsed["text"]
        row.clauses = parsed["clauses"]
        row.status = "pending"
        await db.commit()
        await db.refresh(row)
    except Exception as e:
        logger.warning(f"Auto-parse failed for contract {row.id}: {e}")
        row.status = "pending"
        await db.commit()
        await db.refresh(row)

    out = ContractOut.model_validate(row)
    out.has_file = True
    return out


@router.get("/{contract_id}", response_model=ContractOut)
async def get_contract(
    contract_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Contract).where(Contract.id == contract_id, Contract.owner_id == current_user.id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(404, "合同不存在")
    out = ContractOut.model_validate(row)
    out.has_file = row.file_path is not None
    return out


@router.post("/{contract_id}/review", response_model=ContractOut)
async def review_contract_endpoint(
    contract_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Contract).where(Contract.id == contract_id, Contract.owner_id == current_user.id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(404, "合同不存在")

    # Ensure parsed text exists
    if not row.parsed_text:
        settings = get_settings()
        if row.file_path:
            fp = settings.upload_path / row.file_path
            if fp.exists():
                from app.services.llm_client import create_llm_client_from_settings
                client = create_llm_client_from_settings(settings)
                parsed = await parse_contract_document(fp, client, settings.CLAUDE_MODEL)
                row.parsed_text = parsed["text"]
                row.clauses = parsed["clauses"]
                await db.commit()
                await db.refresh(row)

    if not row.parsed_text:
        raise HTTPException(400, "合同文本为空，无法审查")

    # Get case context
    case_context = ""
    if row.case_id:
        case_result = await db.execute(select(Case).where(Case.id == row.case_id))
        case = case_result.scalar_one_or_none()
        if case and case.description:
            case_context = case.description

    row.status = "reviewing"
    await db.commit()

    try:
        review_result = await review_contract(row.parsed_text, row.clauses, case_context)
        row.review_report = review_result["report"]
        row.risk_items = review_result["risk_items"]
        row.risk_score = review_result["risk_score"]
        row.status = "completed"
    except Exception as e:
        logger.error(f"Contract review failed for {contract_id}: {e}")
        row.status = "failed"
        row.review_report = f"审查失败: {e}"

    await db.commit()
    await db.refresh(row)

    out = ContractOut.model_validate(row)
    out.has_file = row.file_path is not None
    return out


@router.post("/{contract_id}/export")
async def export_report(
    contract_id: int,
    data: ReviewReportExport,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Contract).where(Contract.id == contract_id, Contract.owner_id == current_user.id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(404, "合同不存在")
    if not row.review_report:
        raise HTTPException(400, "尚未完成审查，无报告可导出")

    if data.format == "docx":
        return await _export_docx(row)
    else:
        from fastapi.responses import PlainTextResponse
        return PlainTextResponse(row.review_report, media_type="text/markdown")


async def _export_docx(row: Contract) -> "FileResponse":
    from docx import Document
    from docx.shared import Pt, Cm
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from fastapi.responses import FileResponse
    from app.config import get_settings

    doc = Document()

    for section in doc.sections:
        section.top_margin = Cm(3.7)
        section.right_margin = Cm(2.8)
        section.bottom_margin = Cm(3.5)
        section.left_margin = Cm(2.6)

    # Title
    title_p = doc.add_paragraph()
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title_p.add_run(f"合同审查报告 — {row.title}")
    run.font.size = Pt(22)
    run.bold = True

    # Parse markdown-like report into paragraphs
    lines = (row.review_report or "").split("\n")
    for line in lines:
        line = line.strip()
        if not line:
            doc.add_paragraph()
            continue

        if line.startswith("# "):
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run(line[2:])
            run.font.size = Pt(18)
            run.bold = True
        elif line.startswith("## "):
            p = doc.add_paragraph()
            run = p.add_run(line[3:])
            run.font.size = Pt(16)
            run.bold = True
        elif line.startswith("### "):
            p = doc.add_paragraph()
            run = p.add_run(line[4:])
            run.font.size = Pt(15)
            run.bold = True
        elif line.startswith("> "):
            p = doc.add_paragraph()
            run = p.add_run(line[2:])
            run.font.size = Pt(12)
            run.italic = True
        elif line.startswith("- "):
            p = doc.add_paragraph()
            run = p.add_run(line[2:])
            run.font.size = Pt(14)
        else:
            p = doc.add_paragraph()
            run = p.add_run(line)
            run.font.size = Pt(14)

        p.paragraph_format.line_spacing = Pt(28)

    settings = get_settings()
    output_dir = settings.upload_path / "exports"
    output_dir.mkdir(parents=True, exist_ok=True)
    safe_title = "".join(c for c in row.title if c.isalnum() or c in "（）()—")[:50]
    filename = f"审查报告_{row.id}_{safe_title}.docx"
    filepath = output_dir / filename
    doc.save(str(filepath))

    return FileResponse(str(filepath), filename=filename, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")


@router.delete("/{contract_id}")
async def delete_contract(
    contract_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Contract).where(Contract.id == contract_id, Contract.owner_id == current_user.id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(404, "合同不存在")

    if row.file_path:
        settings = get_settings()
        fp = settings.upload_path / row.file_path
        if fp.exists():
            fp.unlink()

    await db.delete(row)
    await db.commit()
    return {"message": "已删除"}
