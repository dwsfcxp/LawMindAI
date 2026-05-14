"""北大法宝MCP适配器 — LegalDataSourceAdapter实现"""

import json
import asyncio
import logging
import subprocess
from app.services.data_sources.base import (
    LegalDataSourceAdapter,
    LawSearchResult,
    CaseSearchResult,
    DataSourceRegistry,
)

logger = logging.getLogger(__name__)


class BeidaFabaoAdapter(LegalDataSourceAdapter):
    name = "beida_fabao"
    description = "北大法宝法律法规数据库"
    supported_types = ["law"]

    async def search_law(self, query: str, limit: int = 10, **filters) -> list[LawSearchResult]:
        try:
            result = await asyncio.to_thread(
                subprocess.run,
                ["npx", "-y", "@ansvar/chinese-law-mcp"],
                capture_output=True, text=True, timeout=30,
                input=json.dumps({"method": "search", "query": query, "limit": limit}),
            )
            if result.returncode == 0 and result.stdout.strip():
                data = json.loads(result.stdout)
                items = data if isinstance(data, list) else data.get("results", [])
                return [
                    LawSearchResult(
                        source="北大法宝",
                        document_id=it.get("document_id", ""),
                        title=it.get("title", ""),
                        provision_ref=it.get("provision_ref", ""),
                        content=it.get("snippet", it.get("content", ""))[:500],
                        relevance_score=it.get("relevance_score", 0.5),
                    ) for it in items[:limit]
                ]
        except Exception as e:
            logger.warning(f"BeidaFabao MCP search failed: {e}")
        return []

    async def search_case(self, query: str, limit: int = 10, **filters) -> list[CaseSearchResult]:
        # 北大法宝MCP主要支持法规，案例检索后续扩展
        return []

    async def get_provision(self, doc_id: str, article: str = None) -> dict | None:
        try:
            result = await asyncio.to_thread(
                subprocess.run,
                ["npx", "-y", "@ansvar/chinese-law-mcp"],
                capture_output=True, text=True, timeout=30,
                input=json.dumps({"method": "get", "document_id": doc_id, "article": article}),
            )
            if result.returncode == 0 and result.stdout.strip():
                return json.loads(result.stdout)
        except Exception as e:
            logger.warning(f"BeidaFabao MCP get_provision failed: {e}")
        return None

    async def health_check(self) -> bool:
        try:
            result = await asyncio.to_thread(
                subprocess.run,
                ["npx", "-y", "@ansvar/chinese-law-mcp"],
                capture_output=True, text=True, timeout=15,
            )
            return result.returncode == 0
        except Exception:
            return False


def register_beida_fabao():
    """注册北大法宝适配器到DataSourceRegistry"""
    adapter = BeidaFabaoAdapter()
    DataSourceRegistry.register(adapter)
    logger.info("BeidaFabao adapter registered")
