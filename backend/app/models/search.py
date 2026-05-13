from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class SearchRecord(Base):
    __tablename__ = "search_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    case_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("cases.id"), nullable=True)

    query: Mapped[str] = mapped_column(Text, nullable=False)
    result_type: Mapped[str] = mapped_column(String(20), default="all")
    # law / case / all
    results: Mapped[str | None] = mapped_column(JSON, nullable=True)
    sources_used: Mapped[str | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
