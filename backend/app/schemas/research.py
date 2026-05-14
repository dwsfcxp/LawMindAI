"""法律研究 Schema"""

from datetime import datetime
from pydantic import BaseModel


class ResearchRequest(BaseModel):
    query: str
    sources: list[str] = ["vector_db", "ai_knowledge"]
    case_id: int | None = None


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
