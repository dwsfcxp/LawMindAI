"""证据管理 Schema"""

from datetime import datetime
from pydantic import BaseModel


EVIDENCE_TYPES = ["documentary", "physical", "electronic", "testimony", "audio_visual", "expert"]


class EvidenceCreate(BaseModel):
    case_id: int
    type: str
    title: str
    tags: list[str] | None = None


class EvidenceUpdate(BaseModel):
    title: str | None = None
    type: str | None = None
    tags: list[str] | None = None
    sort_order: int | None = None
    analysis: str | None = None


class EvidenceOut(BaseModel):
    id: int
    case_id: int
    type: str
    title: str
    file_path: str | None = None
    ocr_text: str | None = None
    tags: list[str] | None = None
    sort_order: int = 0
    analysis: str | None = None
    has_file: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}
