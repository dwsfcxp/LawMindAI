import json
import asyncio
import logging
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.config import get_settings
from app.models.user import User
from app.models.document import Document, Template
from app.schemas.document import DocumentGenerate, DocumentUpdate, DocumentOut, DocumentExport
from app.services.docgen.engine import get_engine
from app.services.evidence.ocr import validate_file_type, extract_text

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/extract-text")
async def extract_text_from_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """上传文件并提取文字内容，供文书生成和法律研究使用。"""
    if not validate_file_type(file.filename or ""):
        raise HTTPException(400, "不支持的文件类型，允许: PDF, DOC, DOCX, TXT, XLSX, XLS, PNG, JPG, GIF, WEBP, BMP, TIFF")

    settings = get_settings()
    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"文件大小超过{settings.MAX_UPLOAD_SIZE_MB}MB限制")

    tmp_dir = settings.upload_path / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or ".bin").suffix
    tmp_path = tmp_dir / f"{uuid.uuid4().hex[:12]}{ext}"
    await asyncio.to_thread(tmp_path.write_bytes, content)

    try:
        text = await extract_text(tmp_path)
    finally:
        await asyncio.to_thread(tmp_path.unlink, missing_ok=True)

    return {"filename": file.filename, "text": text}


@router.get("", response_model=list[DocumentOut])
async def list_documents(
    case_id: int | None = None,
    type: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Document).where(Document.owner_id == current_user.id)
    if case_id:
        q = q.where(Document.case_id == case_id)
    if type:
        q = q.where(Document.type == type)
    q = q.order_by(Document.updated_at.desc()).offset(skip).limit(limit)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/generate", response_model=DocumentOut, status_code=201)
async def generate_document(
    data: DocumentGenerate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 获取模板
    template = None
    if data.template_id:
        template = await db.get(Template, data.template_id)
        if template and not template.is_public and template.owner_id != current_user.id:
            raise HTTPException(403, "无权使用该模板")
    elif data.type:
        result = await db.execute(
            select(Template).where(Template.type == data.type).limit(1)
        )
        template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(400, f"未找到类型为 '{data.type}' 的文书模板，请先创建模板")

    # 查询研究报告作为生成依据
    research_context = ""
    if data.research_report_ids:
        from app.models.research import ResearchReport
        rr_result = await db.execute(
            select(ResearchReport).where(
                ResearchReport.id.in_(data.research_report_ids),
                ResearchReport.owner_id == current_user.id,
            )
        )
        reports = rr_result.scalars().all()
        if reports:
            research_context = "\n\n---\n\n".join(
                f"【研究报告：{r.query}】\n{r.report[:4000]}"
                for r in reports
            )[:8000]

    # 调用AI生成引擎（单例）
    engine = get_engine()
    try:
        gen_result = await engine.generate(
            case_facts=data.case_facts,
            doc_type=data.type,
            template=template,
            extra_instructions=data.extra_instructions,
            research_context=research_context or None,
        )
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        logger.exception(f"Document generation failed: {e}")
        raise HTTPException(500, f"文书生成失败: {str(e)[:200]}")

    # 保存文书
    doc = Document(
        case_id=data.case_id,
        template_id=template.id,
        type=data.type,
        title=data.title or gen_result.get("title", f"{data.type}文书"),
        content=gen_result["content"],
        ai_metadata=gen_result.get("metadata", {}),
        status="generated",
        owner_id=current_user.id,
    )
    db.add(doc)
    await db.flush()
    await db.refresh(doc)
    return doc


@router.get("/{doc_id}", response_model=DocumentOut)
async def get_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(Document, doc_id)
    if not doc or doc.owner_id != current_user.id:
        raise HTTPException(404, "文书不存在")
    return doc


@router.put("/{doc_id}", response_model=DocumentOut)
async def update_document(
    doc_id: int,
    data: DocumentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(Document, doc_id)
    if not doc or doc.owner_id != current_user.id:
        raise HTTPException(404, "文书不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(doc, k, v)
    await db.flush()
    await db.refresh(doc)
    return doc


@router.post("/{doc_id}/export")
async def export_document(
    doc_id: int,
    data: DocumentExport,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(Document, doc_id)
    if not doc or doc.owner_id != current_user.id:
        raise HTTPException(404, "文书不存在")

    settings = get_settings()
    output_dir = settings.upload_path / "exports"
    output_dir.mkdir(parents=True, exist_ok=True)

    if data.format == "docx":
        from app.services.docgen.word_export import export_to_docx
        filepath = await export_to_docx(doc, output_dir)
        return FileResponse(
            filepath,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=Path(filepath).name,
        )
    elif data.format == "html":
        from app.services.docgen.html_export import export_to_html
        filepath = await export_to_html(doc, output_dir)
        return FileResponse(
            filepath,
            media_type="text/html",
            filename=Path(filepath).name,
        )
    elif data.format == "pdf":
        try:
            from app.services.docgen.pdf_export import export_to_pdf
            filepath = await export_to_pdf(doc, output_dir)
            return FileResponse(
                filepath,
                media_type="application/pdf",
                filename=Path(filepath).name,
            )
        except RuntimeError as e:
            raise HTTPException(400, str(e))
    elif data.format == "markdown":
        filepath = output_dir / f"{doc.id}_{doc.title}.md"
        await asyncio.to_thread(filepath.write_text, doc.content, "utf-8")
        return FileResponse(
            filepath,
            media_type="text/markdown",
            filename=filepath.name,
        )
    else:
        raise HTTPException(400, f"不支持的导出格式: {data.format}")


@router.post("/{doc_id}/review", response_model=DocumentOut)
async def review_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(Document, doc_id)
    if not doc or doc.owner_id != current_user.id:
        raise HTTPException(404, "文书不存在")

    engine = get_engine()
    try:
        reviewed_content = await engine.review(doc.content, doc.type)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    doc.content = reviewed_content
    doc.status = "reviewed"
    await db.flush()
    await db.refresh(doc)
    return doc


@router.post("/{doc_id}/verify-laws")
async def verify_document_laws(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """法条核查 — 多源交叉验证文书中引用的法条准确性"""
    doc = await db.get(Document, doc_id)
    if not doc or doc.owner_id != current_user.id:
        raise HTTPException(404, "文书不存在")

    engine = get_engine()
    results = await engine.verify_laws_in_content(doc.content)
    return {"document_id": doc_id, "verification_results": results, "total": len(results)}
