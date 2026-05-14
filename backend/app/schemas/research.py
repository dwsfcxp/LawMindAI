"""法律研究 Schema"""

from datetime import datetime
from pydantic import BaseModel, field_validator


class ResearchRequest(BaseModel):
    query: str
    sources: list[str] = ["vector_db", "ai_knowledge"]
    case_id: int | None = None

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "query": "民间借贷利率上限及违约金标准",
                    "sources": ["vector_db", "ai_knowledge"],
                    "case_id": None,
                }
            ]
        }
    }

    @field_validator("query")
    @classmethod
    def query_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("研究问题不能为空")
        return v.strip()


class ResearchReportOut(BaseModel):
    id: int
    query: str
    report: str
    sources_used: list[str]
    case_id: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ResearchExport(BaseModel):
    format: str = "docx"  # docx / markdown

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"format": "docx"}
            ]
        }
    }
