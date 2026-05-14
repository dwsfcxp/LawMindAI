"""知识库管理 Schema"""

from datetime import datetime
from pydantic import BaseModel


class KnowledgeCreate(BaseModel):
    title: str
    content: str
    source: str | None = None
    tags: list[str] | None = None
    team_id: int | None = None


class KnowledgeUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    source: str | None = None
    tags: list[str] | None = None


class KnowledgeOut(BaseModel):
    id: int
    title: str
    content: str
    source: str | None = None
    tags: list[str] | None = None
    embedding_id: str | None = None
    owner_id: int | None = None
    team_id: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
