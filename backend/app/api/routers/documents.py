import asyncio
import json
import logging
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, validate_upload, sanitize_filename, check_rate_limit
from app.config import get_settings
from app.models.user import User
from app.models.document import Document, Template
from app.schemas.document import DocumentGenerate, DocumentUpdate, DocumentOut, DocumentExport, DocumentBundleGenerate
from app.services.docgen.engine import get_engine
from app.services.evidence.ocr import extract_text

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_CONTENT_LENGTH = 200000


# ---------------------------------------------------------------------------
# Quality check response schema
# ---------------------------------------------------------------------------

class QualityCheckIssue(BaseModel):
    """A single quality check issue."""
    category: str = ""
    severity: str = "info"  # error / warning / info
    description: str = ""
    location: str = ""
    suggestion: str = ""


class QualityCheckResponse(BaseModel):
    """Structured response for document quality check."""
    document_id: int
    quality_check: dict  # Contains: passed, issues, checks, quality_score, summary



@router.post("/extract-text")
async def extract_text_from_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """上传文件并提取文字内容，供文书生成和法律研究使用。"""
    content = await validate_upload(file)

    settings = get_settings()
    tmp_dir = settings.upload_path / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or ".bin").suffix
    tmp_path = tmp_dir / f"{uuid.uuid4().hex[:12]}{ext}"

    try:
        await asyncio.to_thread(tmp_path.write_bytes, content)
        text = await extract_text(tmp_path)
    finally:
        await asyncio.to_thread(tmp_path.unlink, missing_ok=True)

    return {"filename": sanitize_filename(file.filename or ""), "text": text}


@router.get("", response_model=list[DocumentOut])
async def list_documents(
    case_id: int | None = None,
    type: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    limit = min(max(limit, 1), 100)
    base_filter = Document.owner_id == current_user.id
    # Count query
    count_q = select(func.count(Document.id)).where(base_filter)
    if case_id:
        count_q = count_q.where(Document.case_id == case_id)
    if type:
        count_q = count_q.where(Document.type == type)
    total = (await db.execute(count_q)).scalar() or 0

    q = select(Document).where(base_filter)
    if case_id:
        q = q.where(Document.case_id == case_id)
    if type:
        q = q.where(Document.type == type)
    q = q.order_by(Document.updated_at.desc()).offset(skip).limit(limit)
    result = await db.execute(q)
    items = result.scalars().all()

    # Truncate content in list view
    response_data = []
    for doc in items:
        out = DocumentOut.model_validate(doc)
        if out.content and len(out.content) > 500:
            out.content = out.content[:500] + "..."
        response_data.append(out)

    return JSONResponse(
        content=[r.model_dump(mode="json") for r in response_data],
        headers={"X-Total-Count": str(total)},
    )


@router.post("/generate", response_model=DocumentOut, status_code=201)
async def generate_document(
    data: DocumentGenerate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Rate limit document generation: 10 per hour per user
    if not check_rate_limit(f"doc_gen:{current_user.id}", max_requests=10, window_seconds=3600):
        raise HTTPException(429, "文书生成请求过于频繁，请一小时后再试")

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

    if data.case_facts and len(data.case_facts) > MAX_CONTENT_LENGTH:
        raise HTTPException(400, f"案件事实内容不能超过 {MAX_CONTENT_LENGTH} 个字符")

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
        raise HTTPException(503, "文书生成服务暂时不可用，请稍后重试")
    except Exception as e:
        logger.exception("Document generation failed: %s", e)
        raise HTTPException(500, "文书生成失败，请稍后重试")

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


@router.post("/generate-stream")
async def generate_document_stream(
    data: DocumentGenerate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """SSE endpoint that streams document generation progress steps."""
    import time as _time

    if not check_rate_limit(f"doc_gen:{current_user.id}", max_requests=10, window_seconds=3600):
        raise HTTPException(429, "文书生成请求过于频繁，请一小时后再试")

    template = None
    if data.template_id:
        template = await db.get(Template, data.template_id)
    elif data.type:
        result = await db.execute(
            select(Template).where(Template.type == data.type).limit(1)
        )
        template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(400, "未找到对应模板")

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
                f"【研究报告：{r.query}】\n{r.report[:4000]}" for r in reports
            )[:8000]

    STEPS = [
        ("parsing", "解析案件信息"),
        ("searching", "检索相关法规"),
        ("extracting", "提取法律要点"),
        ("matching", "匹配文书模板"),
        ("generating", "AI生成文书"),
        ("checking", "质量检查"),
        ("reviewing", "最终审查"),
    ]

    async def event_stream():
        start = _time.monotonic()
        try:
            for step_key, step_label in STEPS:
                elapsed = round(_time.monotonic() - start, 1)
                yield f"data: {json.dumps({'step': step_key, 'label': step_label, 'elapsed': elapsed}, ensure_ascii=False)}\n\n"

            engine = get_engine()
            gen_result = await engine.generate(
                case_facts=data.case_facts,
                doc_type=data.type,
                template=template,
                extra_instructions=data.extra_instructions,
                research_context=research_context or None,
            )

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

            elapsed = round(_time.monotonic() - start, 1)
            yield f"data: {json.dumps({'step': 'completed', 'label': '生成完成', 'elapsed': elapsed, 'document_id': doc.id}, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.error("SSE document generation failed: %s", e)
            yield f"data: {json.dumps({'step': 'error', 'label': '生成失败', 'error': '文书生成失败，请稍后重试'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/generate-bundle")
async def generate_document_bundle(
    data: DocumentBundleGenerate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """多文书集合生成 — 一次性生成多份关联文书并确保一致性。

    支持预设（preset）或自定义文书类型列表（doc_types）。
    """
    from app.services.docgen.prompts import BUNDLE_PRESETS

    # 验证参数
    if not data.preset and not data.doc_types:
        raise HTTPException(400, "请指定 preset（预设名称）或 doc_types（文书类型列表）")

    if data.preset and data.preset not in BUNDLE_PRESETS:
        available = ", ".join(BUNDLE_PRESETS.keys())
        raise HTTPException(400, f"未知预设 '{data.preset}'，可用预设: {available}")

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

    # 调用引擎生成集合
    engine = get_engine()
    try:
        bundle_result = await engine.generate_bundle(
            case_facts=data.case_facts,
            doc_types=data.doc_types or [],
            preset=data.preset,
            extra_instructions=data.extra_instructions,
            research_context=research_context or None,
        )
    except RuntimeError as e:
        raise HTTPException(503, "文书集合生成服务暂时不可用，请稍后重试")
    except Exception as e:
        logger.exception("Bundle generation failed: %s", e)
        raise HTTPException(500, "文书集合生成失败，请稍后重试")

    # 保存所有文书到数据库
    saved_docs = []
    for doc_data in bundle_result.get("documents", []):
        doc = Document(
            case_id=data.case_id,
            type=doc_data["doc_type"],
            title=doc_data.get("title", doc_data["doc_type"]),
            content=doc_data.get("content", ""),
            ai_metadata=doc_data.get("metadata", {}),
            status="generated",
            owner_id=current_user.id,
        )
        db.add(doc)
        saved_docs.append(doc)

    await db.flush()
    for doc in saved_docs:
        await db.refresh(doc)

    return {
        "documents": [
            {
                "id": doc.id,
                "type": doc.type,
                "title": doc.title,
                "status": doc.status,
                "created_at": doc.created_at.isoformat(),
            }
            for doc in saved_docs
        ],
        "consistency_check": bundle_result.get("consistency_check", {}),
        "total": len(saved_docs),
    }


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
        raise HTTPException(503, "文书审查服务暂时不可用，请稍后重试")
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


@router.post("/{doc_id}/quality-check", response_model=QualityCheckResponse)
async def quality_check_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """文书质量核查 — 自动化验证文书质量（法条、金额、逻辑、格式、要素完整性）"""
    doc = await db.get(Document, doc_id)
    if not doc or doc.owner_id != current_user.id:
        raise HTTPException(404, "文书不存在")

    engine = get_engine()
    parsed_case = None
    if doc.ai_metadata and isinstance(doc.ai_metadata, dict):
        parsed_case = doc.ai_metadata.get("parsed_case")

    try:
        check_result = await engine.quality_check(doc.content, doc.type, parsed_case)
    except RuntimeError as e:
        raise HTTPException(503, "质量核查服务暂时不可用，请稍后重试")
    except Exception as e:
        logger.exception("Quality check failed: %s", e)
        raise HTTPException(500, "质量核查失败，请稍后重试")

    return QualityCheckResponse(document_id=doc_id, quality_check=check_result)
