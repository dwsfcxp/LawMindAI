from pydantic import BaseModel


class SearchQuery(BaseModel):
    query: str
    result_type: str = "all"  # law / case / all
    sources: list[str] | None = None
    top_k: int = 20
    case_id: int | None = None


class LawSearchResult(BaseModel):
    source: str
    document_id: str
    title: str
    provision_ref: str | None = None
    content: str
    relevance_score: float = 0.0
    metadata: dict = {}


class CaseSearchResult(BaseModel):
    source: str
    case_id: str
    case_number: str
    title: str
    court: str
    date: str
    judgment_type: str
    content: str
    relevance_score: float = 0.0
    metadata: dict = {}


class UnifiedSearchResult(BaseModel):
    query: str
    laws: list[LawSearchResult] = []
    cases: list[CaseSearchResult] = []
    total: int = 0
    sources_used: list[str] = []
