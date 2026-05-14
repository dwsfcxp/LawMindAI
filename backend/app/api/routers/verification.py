"""法条审核核查路由"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.verification import (
    LawVerifyRequest,
    LawVerifyResponse,
    BatchVerifyRequest,
    BatchVerifyResponse,
)
from app.services.verification.engine import LawVerificationEngine

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/verify", response_model=LawVerifyResponse)
async def verify_law(
    data: LawVerifyRequest,
    current_user: User = Depends(get_current_user),
):
    """单条法条核查 — 多源交叉验证"""
    engine = LawVerificationEngine()
    return await engine.verify_single(data)


@router.post("/verify-batch", response_model=BatchVerifyResponse)
async def verify_batch(
    data: BatchVerifyRequest,
    current_user: User = Depends(get_current_user),
):
    """批量核查 — 从文书内容中自动提取法条引用并验证"""
    engine = LawVerificationEngine()
    results = await engine.verify_document(data.document_content)

    warnings = []
    for r in results:
        if not r.overall_consistent:
            warnings.append(f"{r.law_name} {r.article_number}: {r.recommendation}")

    return BatchVerifyResponse(
        total_references=len(results),
        verified=results,
        warnings=warnings,
    )
