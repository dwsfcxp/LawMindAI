from datetime import datetime
from pydantic import BaseModel, field_validator


class CaseCreate(BaseModel):
    case_number: str | None = None
    title: str
    case_type: str
    court: str | None = None
    plaintiff: str | None = None
    defendant: str | None = None
    description: str | None = None
    filing_date: str | None = None
    hearing_dates: list[str] | None = None
    deadline_dates: list[str] | None = None

    @field_validator("title")
    @classmethod
    def title_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("案件标题不能为空")
        return v.strip()

    @field_validator("case_type")
    @classmethod
    def case_type_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("案件类型不能为空")
        return v.strip()


class CaseUpdate(BaseModel):
    case_number: str | None = None
    title: str | None = None
    case_type: str | None = None
    court: str | None = None
    status: str | None = None
    plaintiff: str | None = None
    defendant: str | None = None
    description: str | None = None
    filing_date: str | None = None
    hearing_dates: list[str] | None = None
    deadline_dates: list[str] | None = None


class CaseOut(BaseModel):
    id: int
    case_number: str | None
    title: str
    case_type: str
    court: str | None
    status: str
    plaintiff: str | None
    defendant: str | None
    description: str | None
    owner_id: int
    team_id: int | None
    filing_date: str | None
    hearing_dates: list | None
    deadline_dates: list | None
    created_at: datetime
    updated_at: datetime
    document_count: int = 0

    model_config = {"from_attributes": True}
