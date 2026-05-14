"""知识库管理 Schema"""

from datetime import datetime
from pydantic import BaseModel, field_validator


class KnowledgeCreate(BaseModel):
    title: str
    content: str
    source: str | None = None
    tags: list[str] | None = None
    team_id: int | None = None

    @field_validator("title")
    @classmethod
    def title_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("标题不能为空")
        return v.strip()

    @field_validator("content")
    @classmethod
    def content_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("内容不能为空")
        return v.strip()


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
