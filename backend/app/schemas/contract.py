"""合同审查 Schema"""

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, model_validator


class ContractOut(BaseModel):
    id: int
    case_id: int | None = None
    owner_id: int
    title: str
    file_type: str | None = None
    parsed_text: str | None = None
    clauses: list[dict] | None = None
    review_report: str | None = None
    risk_items: list[dict] | None = None
    risk_score: float | None = None
    status: str = "pending"
    has_file: bool = False
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def _set_has_file(self) -> "ContractOut":
        # has_file defaults to False; routers set it explicitly after model_validate
        return self

    model_config = {"from_attributes": True}


class ContractRiskItem(BaseModel):
    dimension: str      # legality / completeness / fairness / clarity / enforceability
    level: str          # high / medium / low
    clause: str         # related clause text
    issue: str          # description of the issue
    suggestion: str     # suggested fix


class ContractClause(BaseModel):
    type: str           # clause type (e.g. "违约责任", "争议解决", "保密条款")
    text: str           # clause content
    position: int       # position index in document


class ReviewReportExport(BaseModel):
    format: Literal["markdown", "docx"] = "markdown"
