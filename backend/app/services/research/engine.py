"""多源法律研究引擎 — 并行采集多源数据 + LLM综合推理"""

import json
import logging
import asyncio
from datetime import datetime
from app.config import get_settings
from app.services.llm_client import create_llm_client_from_settings
from app.services.vector.store import get_vector_service

logger = logging.getLogger(__name__)

RESEARCH_SYSTEM_PROMPT = """你是一位资深法律研究专家，擅长综合分析多个信息源并撰写专业的法律研究报告。"""

RESEARCH_PROMPT = """请基于以下多源检索结果，撰写一份专业的法律研究报告。

## 研究课题：{query}

## 信息来源：

### 一、本地案例库检索结果：
{local_cases}

### 二、本地法条库检索结果：
{local_statutes}

### 三、AI法律知识：
{ai_knowledge}

### 四、外部法律数据库：
{external_api_results}

## 报告要求：
请按以下结构撰写研究报告（使用Markdown格式）：

### 一、研究概述
- 简要说明研究背景和目的

### 二、相关法律法规分析
- 列出核心法律依据
- 分析法条之间的逻辑关系
- 指出适用的司法解释或指导性文件

### 三、典型案例分析
- 选取3-5个最具参考价值的案例
- 分析各案的裁判要旨和裁判逻辑
- 总结法院的裁判倾向

### 四、法律风险分析
- 列出主要法律风险点
- 分析各风险的严重程度和发生概率

### 五、实务建议
- 给出具体可行的法律建议
- 建议的行动方案和策略

### 六、结论
- 综合性结论意见

注意：引用法条和案例时请注明信息来源。如果某个来源无数据，则跳过该部分，不要编造。"""


class LegalResearchEngine:

    async def research(self, query: str, sources: list[str], case_id: int | None = None) -> dict:
        """多源法律研究。sources 可选: vector_db, ai_knowledge, external_api"""
        settings = get_settings()
        client = create_llm_client_from_settings(settings)

        local_cases = "（未选择本地案例库）"
        local_statutes = "（未选择本地法条库）"
        ai_knowledge = "（未选择AI知识源）"
        external_api_results = "（未选择外部API）"

        tasks = {}

        # 1. 本地向量库
        if "vector_db" in sources:
            tasks["cases"] = self._search_vector_cases(query)
            tasks["statutes"] = self._search_vector_statutes(query)

        # 2. AI知识
        if "ai_knowledge" in sources:
            tasks["ai"] = self._search_ai(client, settings.CLAUDE_MODEL, query)

        # 3. 外部API
        if "external_api" in sources:
            tasks["external"] = self._search_external_apis(query)

        results = {}
        if tasks:
            gathered = await asyncio.gather(*tasks.values(), return_exceptions=True)
            for key, result in zip(tasks.keys(), gathered):
                if not isinstance(result, Exception):
                    results[key] = result
                else:
                    logger.warning(f"Research source '{key}' failed: {result}")
                    results[key] = f"（检索失败: {result}）"

        if "cases" in results:
            items = results["cases"]
            if isinstance(items, list) and items:
                local_cases = "\n".join(
                    f"- [{it.get('metadata', {}).get('title', it['id'])}] {it['content'][:300]}"
                    for it in items[:5]
                )
            else:
                local_cases = "（本地案例库无匹配结果）"

        if "statutes" in results:
            items = results["statutes"]
            if isinstance(items, list) and items:
                local_statutes = "\n".join(
                    f"- [{it.get('metadata', {}).get('title', it['id'])}] {it['content'][:300]}"
                    for it in items[:5]
                )
            else:
                local_statutes = "（本地法条库无匹配结果）"

        if "ai" in results:
            ai_knowledge = results["ai"] if isinstance(results["ai"], str) else str(results["ai"])

        if "external" in results:
            external_api_results = results["external"] if isinstance(results["external"], str) else str(results["external"])

        # 综合生成报告
        prompt = RESEARCH_PROMPT.format(
            query=query,
            local_cases=local_cases,
            local_statutes=local_statutes,
            ai_knowledge=ai_knowledge,
            external_api_results=external_api_results,
        )

        try:
            response = await client.messages.create(
                model=settings.CLAUDE_MODEL,
                max_tokens=settings.CLAUDE_MAX_TOKENS,
                system=RESEARCH_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )
            report = response.content[0].text if response.content else "报告生成失败"
        except Exception as e:
            logger.error(f"Report generation failed: {e}")
            report = f"报告生成失败: {e}"

        return {
            "report": report,
            "sources_used": [s for s in sources if s in results],
            "query": query,
            "law_verification": await self._verify_laws_in_report(report),
        }

    async def _verify_laws_in_report(self, report: str) -> list[dict]:
        """对研究报告中的法条引用进行交叉验证"""
        try:
            from app.services.verification.engine import LawVerificationEngine
            engine = LawVerificationEngine()
            verify_results = await engine.verify_document(report)
            return [
                {
                    "law_name": r.law_name,
                    "article_number": r.article_number,
                    "consistent": r.overall_consistent,
                    "confidence": r.confidence,
                    "note": r.recommendation,
                }
                for r in verify_results
            ]
        except Exception:
            return []

    async def _search_vector_cases(self, query: str) -> list[dict]:
        svc = get_vector_service()
        return await svc.search_cases(query, top_k=5)

    async def _search_vector_statutes(self, query: str) -> list[dict]:
        svc = get_vector_service()
        return await svc.search_statutes(query, top_k=5)

    async def _search_ai(self, client, model: str, query: str) -> str:
        try:
            response = await client.messages.create(
                model=model,
                max_tokens=3000,
                system="你是中国法律专家。请提供关于以下问题的专业法律分析，包括相关法规、案例参考和实务建议。",
                messages=[{"role": "user", "content": f"法律研究问题：{query}"}],
            )
            return response.content[0].text if response.content else ""
        except Exception as e:
            return f"（AI检索失败: {e}）"

    async def _search_external_apis(self, query: str) -> str:
        """查询外部法律数据源（北大法宝MCP等）"""
        from app.services.data_sources.base import DataSourceRegistry
        adapters = DataSourceRegistry.get_all()
        if not adapters:
            return "（未配置外部法律数据源）"

        results = []
        for name, adapter in adapters.items():
            try:
                laws = await adapter.search_law(query, limit=5)
                for law in laws[:3]:
                    results.append(f"- [{name}] {law.title} {law.provision_ref}: {law.content[:200]}")
            except Exception as e:
                results.append(f"- [{name}] 检索失败: {e}")

        return "\n".join(results) if results else "（外部API无结果）"
