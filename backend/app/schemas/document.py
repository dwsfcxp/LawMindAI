from datetime import datetime
from pydantic import BaseModel


class TemplateCreate(BaseModel):
    name: str
    type: str
    description: str | None = None
    structure: dict
    ai_prompt: str
    format_rules: dict | None = None
    variables: list[dict] | None = None
    is_public: bool = False


class TemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    structure: dict | None = None
    ai_prompt: str | None = None
    format_rules: dict | None = None
    variables: list[dict] | None = None
    is_public: bool | None = None


class TemplateOut(BaseModel):
    id: int
    name: str
    type: str
    description: str | None
    structure: dict
    ai_prompt: str
    format_rules: dict | None
    variables: list | dict
    is_public: bool
    owner_id: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentGenerate(BaseModel):
    case_id: int | None = None
    template_id: int | None = None
    type: str
    title: str | None = None
    case_facts: str
    # 自然语言案情描述
    extra_instructions: str | None = None


class DocumentUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    status: str | None = None


class DocumentOut(BaseModel):
    id: int
    case_id: int | None
    template_id: int | None
    type: str
    title: str
    content: str
    ai_metadata: dict | None
    status: str
    version: int
    exported_path: str | None
    owner_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentExport(BaseModel):
    format: str = "docx"  # docx / markdown
