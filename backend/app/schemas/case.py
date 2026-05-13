from datetime import datetime
from pydantic import BaseModel


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
