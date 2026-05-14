"""向量检索 Schema"""

from pydantic import BaseModel


class VectorIngestItem(BaseModel):
    id: str
    title: str
    content: str
    metadata: dict | None = None


class VectorIngestRequest(BaseModel):
    collection: str  # "cases" or "statutes"
    items: list[VectorIngestItem]


class VectorSearchQuery(BaseModel):
    query: str
    collection: str = "all"  # "cases", "statutes", "all"
    top_k: int = 10


class VectorSearchResult(BaseModel):
    id: str
    content: str
    metadata: dict
    distance: float


class VectorSearchResponse(BaseModel):
    query: str
    cases: list[VectorSearchResult]
    statutes: list[VectorSearchResult]


class VectorStats(BaseModel):
    cases_count: int
    statutes_count: int
    connected: bool
