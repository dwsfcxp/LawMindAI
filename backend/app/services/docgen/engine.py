"""AI文书生成引擎 — 核心Pipeline（支持智谱GLM/Claude）"""

import json
import re
import logging
from app.config import get_settings
from app.services.llm_client import create_llm_client, create_llm_client_from_settings
from app.services.docgen.prompts import (
    CASE_PARSING_PROMPT,
    DOCUMENT_GENERATION_PROMPT,
    DOCUMENT_REVIEW_PROMPT,
    LAW_SEARCH_QUERY_PROMPT,
    CASE_SEARCH_QUERY_PROMPT,
    DOC_TYPE_NAMES,
)

logger = logging.getLogger(__name__)

_engine_instance = None


def get_engine() -> "DocumentGenerationEngine":
    global _engine_instance
    if _engine_instance is None:
        settings = get_settings()
        _engine_instance = DocumentGenerationEngine(settings)
    return _engine_instance


class DocumentGenerationEngine:

    def __init__(self, settings=None, llm_base_url=None, llm_api_key=None, llm_model=None):
        if settings is None:
            settings = get_settings()
        self._settings = settings
        base_url = llm_base_url or settings.CLAUDE_BASE_URL
        api_key = llm_api_key or settings.CLAUDE_API_KEY
        self.client = create_llm_client(base_url, api_key)
        self.model = llm_model or settings.CLAUDE_MODEL

    async def _call_claude(self, system: str, user: str, max_tokens: int = 4096) -> str:
        try:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            return response.content[0].text
        except Exception as e:
            # Handle both Anthropic and OpenAI-compatible client errors
            error_type = type(e).__name__
            if 'ConnectionError' in error_type or 'connection' in str(e).lower():
                logger.error(f"AI API connection error: {e}")
                raise RuntimeError(f"AI服务连接失败，请检查网络: {e}")
            if 'RateLimitError' in error_type or 'rate' in str(e).lower():
                logger.error("AI API rate limit hit")
                raise RuntimeError("AI服务请求过于频繁，请稍后再试")
            if 'StatusError' in error_type or hasattr(e, 'status_code'):
                status_code = getattr(e, 'status_code', 'unknown')
                message = getattr(e, 'message', str(e))
                logger.error(f"AI API error {status_code}: {message}")
                raise RuntimeError(f"AI服务错误({status_code}): {message}")
            raise

    def _parse_json_response(self, text: str) -> dict:
        text = text.strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r'\{[\s\S]*\}', text)
            if match:
                try:
                    return json.loads(match.group())
                except json.JSONDecodeError:
                    pass
            logger.warning(f"Failed to parse JSON from AI response: {text[:200]}")
            return {}

    async def parse_case(self, case_facts: str) -> dict:
        try:
            result = await self._call_claude(
                system="你是专业的中国法律分析师。",
                user=CASE_PARSING_PROMPT.format(case_facts=case_facts),
            )
            parsed = self._parse_json_response(result)
            if not parsed:
                return {"case_type": "未知", "facts": case_facts, "claims": [], "parties": {}}
            return parsed
        except RuntimeError:
            raise
        except Exception as e:
            logger.warning(f"Case parsing failed, using fallback: {e}")
            return {"case_type": "未知", "facts": case_facts, "claims": [], "parties": {}}

    async def generate_search_queries(self, case_facts: str) -> dict:
        try:
            raw = await self._call_claude(
                system="你是法律检索专家。只输出关键词，用逗号分隔。",
                user=LAW_SEARCH_QUERY_PROMPT.format(case_facts=case_facts),
                max_tokens=200,
            )
            keywords = re.split(r'[,，\n]', raw)
            keywords = [k.strip().strip('"').strip("'") for k in keywords if k.strip()]
            return {"law_keywords": keywords[:5], "case_keywords": keywords[:5]}
        except Exception:
            return {"law_keywords": [case_facts[:20]], "case_keywords": [case_facts[:20]]}

    async def search_related_laws(self, keywords: list[str]) -> str:
        # 用AI直接提供法规检索结果
        try:
            query = "、".join(keywords[:3])
            result = await self._call_claude(
                system="你是中国法律检索专家。列出与查询最相关的5条法规，每条包含法规名、条款号和核心内容。",
                user=f"检索关键词：{query}\n\n请列出5条最相关法规，格式：法规名 第X条：核心内容",
                max_tokens=1500,
            )
            return result
        except Exception:
            return "（法规检索暂不可用）"

    async def search_related_cases(self, keywords: list[str]) -> str:
        try:
            query = "、".join(keywords[:3])
            result = await self._call_claude(
                system="你是中国法律案例检索专家。列出与查询最相关的3个典型案例。",
                user=f"检索关键词：{query}\n\n请列出3个典型案例，包含案号、法院、裁判要旨。",
                max_tokens=1500,
            )
            return result
        except Exception:
            return "（案例检索暂不可用）"

    async def generate(
        self,
        case_facts: str,
        doc_type: str,
        template=None,
        extra_instructions: str | None = None,
        research_context: str | None = None,
    ) -> dict:
        import asyncio

        parsed_case = await self.parse_case(case_facts)
        queries = await self.generate_search_queries(case_facts)

        # 并行检索：AI知识 + 向量库 + 外部API
        async def empty():
            return ""

        tasks = [
            self.search_related_laws(queries["law_keywords"]),
            self.search_related_cases(queries["case_keywords"]),
            self._search_vector_statutes(queries["law_keywords"]),
            self._search_vector_cases(queries["case_keywords"]),
            self._search_external_sources(queries["law_keywords"]),
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        ai_laws = results[0] if not isinstance(results[0], Exception) else "（法规检索暂不可用）"
        ai_cases = results[1] if not isinstance(results[1], Exception) else "（案例检索暂不可用）"
        vec_statutes = results[2] if not isinstance(results[2], Exception) else ""
        vec_cases = results[3] if not isinstance(results[3], Exception) else ""
        ext_laws = results[4] if not isinstance(results[4], Exception) else ""

        # 合并所有来源
        combined_laws = ai_laws
        if vec_statutes:
            combined_laws += f"\n\n【本地法条库参考】\n{vec_statutes}"
        if ext_laws:
            combined_laws += f"\n\n【外部法律数据库参考】\n{ext_laws}"

        combined_cases = ai_cases
        if vec_cases:
            combined_cases += f"\n\n【本地案例库参考】\n{vec_cases}"

        doc_type_name = DOC_TYPE_NAMES.get(doc_type, doc_type)
        template_structure = "无特定模板结构要求"
        if template and hasattr(template, "structure"):
            template_structure = json.dumps(template.structure, ensure_ascii=False, indent=2)

        content = await self._call_claude(
            system="你是一位资深中国执业律师，擅长撰写各类法律文书。请严格遵循中国法律文书格式规范。",
            user=DOCUMENT_GENERATION_PROMPT.format(
                doc_type_name=doc_type_name,
                parsed_case=json.dumps(parsed_case, ensure_ascii=False, indent=2),
                related_laws=combined_laws,
                related_cases=combined_cases,
                research_context=research_context or "无",
                template_structure=template_structure,
                extra_instructions=extra_instructions or "无",
            ),
            max_tokens=self._settings.CLAUDE_MAX_TOKENS,
        )

        plaintiff = parsed_case.get("parties", {}).get("plaintiff", {}).get("name", "")
        defendant = parsed_case.get("parties", {}).get("defendant", {}).get("name", "")
        title = f"{plaintiff}诉{defendant}{doc_type_name}" if plaintiff else doc_type_name

        return {
            "title": title,
            "content": content,
            "metadata": {
                "parsed_case": parsed_case,
                "law_keywords": queries["law_keywords"],
                "case_keywords": queries["case_keywords"],
            },
        }

    async def _search_vector_statutes(self, keywords: list[str]) -> str:
        try:
            from app.services.vector.store import get_vector_service
            svc = get_vector_service()
            query = "、".join(keywords[:3])
            items = await svc.search_statutes(query, top_k=5)
            if not items:
                return ""
            return "\n".join(
                f"- [{it.get('metadata', {}).get('title', '')}] {it.get('content', '')[:300]}"
                for it in items
            )
        except Exception:
            return ""

    async def _search_vector_cases(self, keywords: list[str]) -> str:
        try:
            from app.services.vector.store import get_vector_service
            svc = get_vector_service()
            query = "、".join(keywords[:3])
            items = await svc.search_cases(query, top_k=5)
            if not items:
                return ""
            return "\n".join(
                f"- [{it.get('metadata', {}).get('title', '')}] {it.get('content', '')[:300]}"
                for it in items
            )
        except Exception:
            return ""

    async def _search_external_sources(self, keywords: list[str]) -> str:
        try:
            from app.services.data_sources.base import DataSourceRegistry
            adapters = DataSourceRegistry.get_all()
            if not adapters:
                return ""
            query = "、".join(keywords[:3])
            results = []
            for name, adapter in adapters.items():
                try:
                    laws = await adapter.search_law(query, limit=3)
                    for law in laws:
                        results.append(f"- [{name}] {law.title} {law.provision_ref}: {law.content[:200]}")
                except Exception:
                    pass
            return "\n".join(results) if results else ""
        except Exception:
            return ""

    async def review(self, content: str, doc_type: str) -> str:
        doc_type_name = DOC_TYPE_NAMES.get(doc_type, doc_type)
        result = await self._call_claude(
            system="你是一位资深中国执业律师，负责审校法律文书。",
            user=DOCUMENT_REVIEW_PROMPT.format(
                doc_type_name=doc_type_name,
                content=content,
            ),
            max_tokens=self._settings.CLAUDE_MAX_TOKENS,
        )
        if "<!-- REVIEW_NOTES -->" in result:
            return result.split("<!-- REVIEW_NOTES -->")[0].strip()
        return result

    async def verify_laws_in_content(self, content: str) -> list[dict]:
        """法条核查 — 从文书中提取法条引用并多源交叉验证"""
        try:
            from app.services.verification.engine import LawVerificationEngine
            engine = LawVerificationEngine()
            results = await engine.verify_document(content)
            return [
                {
                    "law_name": r.law_name,
                    "article_number": r.article_number,
                    "overall_consistent": r.overall_consistent,
                    "confidence": r.confidence,
                    "recommendation": r.recommendation,
                    "sources_checked": [
                        {"source": v.source, "found": v.found, "is_consistent": v.is_consistent}
                        for v in r.results
                    ],
                }
                for r in results
            ]
        except Exception as e:
            logger.warning(f"Law verification failed: {e}")
            return []
