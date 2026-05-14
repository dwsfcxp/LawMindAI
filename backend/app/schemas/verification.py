"""法条审核核查 Schema"""

from pydantic import BaseModel


class LawVerifyRequest(BaseModel):
    """法条核查请求"""
    law_name: str  # 法律名称，如"民法典"
    article_number: str  # 条款号，如"第584条"
    content: str  # 待核查的法条内容


class LawVerifyResult(BaseModel):
    """单条核查结果"""
    source: str  # 来源名称
    found: bool  # 是否找到
    matched_content: str  # 找到的实际内容
    is_consistent: bool  # 是否一致
    notes: str  # 备注


class LawVerifyResponse(BaseModel):
    """法条核查响应"""
    law_name: str
    article_number: str
    original_content: str
    results: list[LawVerifyResult]
    overall_consistent: bool
    confidence: float  # 0-1 置信度
    recommendation: str  # 建议


class BatchVerifyRequest(BaseModel):
    """批量核查请求 — 从文书中自动提取法条引用"""
    document_content: str  # 文书内容


class BatchVerifyResponse(BaseModel):
    """批量核查响应"""
    total_references: int
    verified: list[LawVerifyResponse]
    warnings: list[str]
