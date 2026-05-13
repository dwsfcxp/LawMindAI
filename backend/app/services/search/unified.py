"""统一搜索服务 — AI驱动的法律检索"""

import json
import re
import logging
import anthropic
from app.config import get_settings
from app.schemas.search import (
    UnifiedSearchResult, LawSearchResult, CaseSearchResult,
)

logger = logging.getLogger(__name__)

_settings = None
_client = None


def _get_client():
    global _client, _settings
    if _client is None:
        _settings = get_settings()
        kwargs = {}
        if _settings.CLAUDE_BASE_URL:
            kwargs["base_url"] = _settings.CLAUDE_BASE_URL
            kwargs["auth_token"] = _settings.CLAUDE_API_KEY
        else:
            kwargs["api_key"] = _settings.CLAUDE_API_KEY
        _client = anthropic.AsyncAnthropic(**kwargs)
    return _client


LAW_SEARCH_PROMPT = """你是一位专业的中国法律检索专家。请根据用户的查询，检索相关的中国法律法规。

查询：{query}

请返回最多{limit}条最相关的法规条文。严格使用以下JSON格式返回，不要返回其他内容：

```json
[
  {{
    "title": "法律法规名称",
    "provision_ref": "第X条",
    "content": "条文核心内容（200字以内）",
    "relevance": 0.95
  }}
]
```

要求：
1. 引用的法规必须真实存在且现行有效
2. 优先引用法律和行政法规，其次引用司法解释
3. relevance分数0-1，越高越相关
4. 如果查询涉及具体案由，引用对应的法律依据"""

CASE_SEARCH_PROMPT = """你是一位专业的中国法律案例检索专家。请根据用户的查询，提供相关典型案例。

查询：{query}

请返回最多{limit}个最相关的典型案例。严格使用以下JSON格式返回：

```json
[
  {{
    "case_number": "案号（如 (2023)京01民初xxx号）",
    "title": "案例标题",
    "court": "审理法院",
    "date": "裁判日期",
    "judgment_type": "判决/裁定/调解",
    "content": "裁判要旨（200字以内）",
    "relevance": 0.90
  }}
]
```

要求：
1. 案例应具有代表性和参考价值
2. 案号格式要规范
3. 裁判要旨要突出核心法律观点"""


class UnifiedSearchService:

    async def search(
        self,
        query: str,
        result_type: str = "all",
        sources: list[str] | None = None,
        top_k: int = 20,
    ) -> UnifiedSearchResult:
        laws: list[LawSearchResult] = []
        cases: list[CaseSearchResult] = []

        import asyncio

        tasks = []
        if result_type in ("all", "law"):
            tasks.append(self._search_laws_ai(query, min(top_k, 10)))
        else:
            tasks.append(self._empty())

        if result_type in ("all", "case"):
            tasks.append(self._search_cases_ai(query, min(top_k, 10)))
        else:
            tasks.append(self._empty())

        results = await asyncio.gather(*tasks, return_exceptions=True)

        if results and not isinstance(results[0], Exception):
            laws = results[0]
        if len(results) > 1 and not isinstance(results[1], Exception):
            cases = results[1]

        sources_used = []
        if laws:
            sources_used.append("AI法规检索")
        if cases:
            sources_used.append("AI案例检索")

        return UnifiedSearchResult(
            query=query,
            laws=laws,
            cases=cases,
            total=len(laws) + len(cases),
            sources_used=sources_used,
        )

    async def _empty(self):
        return []

    async def _search_laws_ai(self, query: str, limit: int) -> list[LawSearchResult]:
        try:
            client = _get_client()
            response = await client.messages.create(
                model=_settings.CLAUDE_MODEL,
                max_tokens=4096,
                system="你是中国法律检索系统。只返回JSON数据，不要其他文字。",
                messages=[{
                    "role": "user",
                    "content": LAW_SEARCH_PROMPT.format(query=query, limit=limit),
                }],
            )
            text = response.content[0].text.strip()
            items = self._parse_json_array(text)
            results = []
            for item in items[:limit]:
                results.append(LawSearchResult(
                    source="AI法规检索",
                    document_id=item.get("title", ""),
                    title=item.get("title", ""),
                    provision_ref=item.get("provision_ref", ""),
                    content=item.get("content", ""),
                    relevance_score=float(item.get("relevance", 0.5)),
                ))
            return results
        except Exception as e:
            logger.warning(f"AI law search failed: {e}")
            return []

    async def _search_cases_ai(self, query: str, limit: int) -> list[CaseSearchResult]:
        try:
            client = _get_client()
            response = await client.messages.create(
                model=_settings.CLAUDE_MODEL,
                max_tokens=4096,
                system="你是中国法律案例检索系统。只返回JSON数据，不要其他文字。",
                messages=[{
                    "role": "user",
                    "content": CASE_SEARCH_PROMPT.format(query=query, limit=limit),
                }],
            )
            text = response.content[0].text.strip()
            items = self._parse_json_array(text)
            results = []
            for item in items[:limit]:
                results.append(CaseSearchResult(
                    source="AI案例检索",
                    case_id=item.get("case_number", ""),
                    case_number=item.get("case_number", ""),
                    title=item.get("title", ""),
                    court=item.get("court", ""),
                    date=item.get("date", ""),
                    judgment_type=item.get("judgment_type", ""),
                    content=item.get("content", ""),
                    relevance_score=float(item.get("relevance", 0.5)),
                ))
            return results
        except Exception as e:
            logger.warning(f"AI case search failed: {e}")
            return []

    def _parse_json_array(self, text: str) -> list[dict]:
        text = text.strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
        try:
            result = json.loads(text)
            return result if isinstance(result, list) else []
        except json.JSONDecodeError:
            match = re.search(r'\[[\s\S]*\]', text)
            if match:
                try:
                    return json.loads(match.group())
                except json.JSONDecodeError:
                    pass
            return []
