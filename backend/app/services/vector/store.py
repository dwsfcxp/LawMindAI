"""向量存储服务 — 基于ChromaDB的案例和法条向量检索"""

import logging
from typing import Optional
from app.config import get_settings

logger = logging.getLogger(__name__)

_vector_service = None


def get_vector_service() -> "VectorStoreService":
    global _vector_service
    if _vector_service is None:
        settings = get_settings()
        _vector_service = VectorStoreService(settings)
    return _vector_service


class VectorStoreService:

    def __init__(self, settings=None):
        if settings is None:
            settings = get_settings()
        self._settings = settings
        self._client = None
        self._cases_col = None
        self._statutes_col = None

    def _ensure_connection(self):
        if self._client is not None:
            return True
        try:
            import chromadb
            self._client = chromadb.HttpClient(
                host=self._settings.CHROMA_HOST,
                port=self._settings.CHROMA_PORT,
            )
            self._client.heartbeat()
            self._cases_col = self._client.get_or_create_collection(
                "legal_cases",
                metadata={"hnsw:space": "cosine", "description": "法律案例向量库"},
            )
            self._statutes_col = self._client.get_or_create_collection(
                "legal_statutes",
                metadata={"hnsw:space": "cosine", "description": "法律法规向量库"},
            )
            logger.info("ChromaDB connected, cases=%d, statutes=%d",
                        self._cases_col.count(), self._statutes_col.count())
            return True
        except Exception as e:
            logger.warning(f"ChromaDB connection failed: {e}")
            self._client = None
            return False

    # ── 添加 ──────────────────────────────────────────────────────────

    async def add_cases(self, items: list[dict]) -> int:
        """批量添加案例。每个item: {id, title, content, metadata?}"""
        if not self._ensure_connection() or not items:
            return 0
        ids = [str(it["id"]) for it in items]
        docs = [f"{it['title']}\n{it['content']}" for it in items]
        metas = [it.get("metadata", {}) for it in items]
        try:
            self._cases_col.upsert(ids=ids, documents=docs, metadatas=metas)
            return len(ids)
        except Exception as e:
            logger.error(f"Add cases failed: {e}")
            return 0

    async def add_statutes(self, items: list[dict]) -> int:
        """批量添加法条。每个item: {id, title, content, metadata?}"""
        if not self._ensure_connection() or not items:
            return 0
        ids = [str(it["id"]) for it in items]
        docs = [f"{it['title']}\n{it['content']}" for it in items]
        metas = [it.get("metadata", {}) for it in items]
        try:
            self._statutes_col.upsert(ids=ids, documents=docs, metadatas=metas)
            return len(ids)
        except Exception as e:
            logger.error(f"Add statutes failed: {e}")
            return 0

    # ── 搜索 ──────────────────────────────────────────────────────────

    async def search_cases(self, query: str, top_k: int = 10) -> list[dict]:
        if not self._ensure_connection():
            return []
        try:
            results = self._cases_col.query(query_texts=[query], n_results=min(top_k, self._cases_col.count() or 1))
            items = []
            for i, doc in enumerate(results["documents"][0] if results["documents"] else []):
                items.append({
                    "id": results["ids"][0][i],
                    "content": doc,
                    "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                    "distance": results["distances"][0][i] if results["distances"] else 0,
                })
            return items
        except Exception as e:
            logger.warning(f"Search cases failed: {e}")
            return []

    async def search_statutes(self, query: str, top_k: int = 10) -> list[dict]:
        if not self._ensure_connection():
            return []
        try:
            results = self._statutes_col.query(query_texts=[query], n_results=min(top_k, self._statutes_col.count() or 1))
            items = []
            for i, doc in enumerate(results["documents"][0] if results["documents"] else []):
                items.append({
                    "id": results["ids"][0][i],
                    "content": doc,
                    "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                    "distance": results["distances"][0][i] if results["distances"] else 0,
                })
            return items
        except Exception as e:
            logger.warning(f"Search statutes failed: {e}")
            return []

    # ── 删除 ──────────────────────────────────────────────────────────

    async def delete_cases(self, ids: list[str]) -> bool:
        if not self._ensure_connection():
            return False
        try:
            self._cases_col.delete(ids=ids)
            return True
        except Exception as e:
            logger.warning(f"Delete cases failed: {e}")
            return False

    async def delete_statutes(self, ids: list[str]) -> bool:
        if not self._ensure_connection():
            return False
        try:
            self._statutes_col.delete(ids=ids)
            return True
        except Exception as e:
            logger.warning(f"Delete statutes failed: {e}")
            return False

    # ── 统计 ──────────────────────────────────────────────────────────

    async def get_stats(self) -> dict:
        if not self._ensure_connection():
            return {"cases_count": 0, "statutes_count": 0, "connected": False}
        try:
            return {
                "cases_count": self._cases_col.count(),
                "statutes_count": self._statutes_col.count(),
                "connected": True,
            }
        except Exception:
            return {"cases_count": 0, "statutes_count": 0, "connected": False}
