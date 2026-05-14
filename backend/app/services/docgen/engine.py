"""AI文书生成引擎 — 核心Pipeline（支持智谱GLM/Claude）

增强功能：
- 智能模板匹配：提取法律争议焦点 + 自动匹配适用法律
- 研究先行：生成文书前先调用研究引擎收集材料
- 法律依据专节：自动引用具体条文
- 事实摘要：从用户输入自动生成结构化事实概要
- 质量核查：生成后自动运行法条/逻辑/一致性验证
- 多文书集合：支持批量生成并确保一致性
"""

import json
import re
import logging
from app.config import get_settings
from app.services.llm_client import create_llm_client, create_llm_client_from_settings
from app.services.docgen.prompts import (
    CASE_PARSING_PROMPT,
    DOCUMENT_GENERATION_PROMPT,
    DOCUMENT_REVIEW_PROMPT,
    DOCUMENT_QUALITY_CHECK_PROMPT,
    LEGAL_ISSUE_EXTRACTION_PROMPT,
    LAW_SEARCH_QUERY_PROMPT,
    CASE_SEARCH_QUERY_PROMPT,
    BUNDLE_CONSISTENCY_CHECK_PROMPT,
    DOC_TYPE_NAMES,
    DOC_TYPE_SPECIFIC_INSTRUCTIONS,
    DOC_TYPE_REQUIRED_ELEMENTS,
    BUNDLE_PRESETS,
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

    # ------------------------------------------------------------------
    # Step 1: 案件解析
    # ------------------------------------------------------------------
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

    # ------------------------------------------------------------------
    # Step 2: 法律争议焦点提取（Smart Template Matching 核心）
    # ------------------------------------------------------------------
    async def extract_legal_issues(self, parsed_case: dict, related_laws: str) -> dict:
        """提取核心法律争议焦点并确定适用法律，用于智能匹配和文书生成。"""
        try:
            result = await self._call_claude(
                system="你是资深中国法律分析师，擅长案件争议焦点归纳和法律适用分析。",
                user=LEGAL_ISSUE_EXTRACTION_PROMPT.format(
                    parsed_case=json.dumps(parsed_case, ensure_ascii=False, indent=2),
                    related_laws=related_laws or "暂无",
                ),
                max_tokens=2000,
            )
            extracted = self._parse_json_response(result)
            if not extracted:
                return {"key_issues": [], "applicable_statutes": [], "burden_of_proof": "", "recommended_strategy": ""}
            return extracted
        except Exception as e:
            logger.warning(f"Legal issue extraction failed: {e}")
            return {"key_issues": [], "applicable_statutes": [], "burden_of_proof": "", "recommended_strategy": ""}

    # ------------------------------------------------------------------
    # Step 3: 检索关键词生成
    # ------------------------------------------------------------------
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

    # ------------------------------------------------------------------
    # Step 4: 多源法律检索
    # ------------------------------------------------------------------
    async def search_related_laws(self, keywords: list[str]) -> str:
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

    # ------------------------------------------------------------------
    # Step 5: 文书生成（主入口）— 研究先行 + 智能匹配
    # ------------------------------------------------------------------
    async def generate(
        self,
        case_facts: str,
        doc_type: str,
        template=None,
        extra_instructions: str | None = None,
        research_context: str | None = None,
    ) -> dict:
        import asyncio

        # 1) 解析案件
        parsed_case = await self.parse_case(case_facts)

        # 2) 生成检索关键词
        queries = await self.generate_search_queries(case_facts)

        # 3) 并行检索：AI知识 + 向量库 + 外部API
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

        # 4) 智能匹配：提取法律争议焦点
        legal_issues = await self.extract_legal_issues(parsed_case, combined_laws)

        # 构建法律依据专节
        legal_basis_section = self._build_legal_basis_section(legal_issues)
        # 构建事实摘要
        facts_summary = self._build_facts_summary(parsed_case)

        # 5) 组装模板结构
        doc_type_name = DOC_TYPE_NAMES.get(doc_type, doc_type)
        template_structure = "无特定模板结构要求"
        if template and hasattr(template, "structure"):
            template_structure = json.dumps(template.structure, ensure_ascii=False, indent=2)

        # 获取文书类型专属规范
        doc_type_specific = DOC_TYPE_SPECIFIC_INSTRUCTIONS.get(doc_type, "")

        # 6) 调用LLM生成文书
        enhanced_parsed_case = {
            **parsed_case,
            "facts_summary": facts_summary,
            "legal_issues": legal_issues.get("key_issues", []),
            "applicable_statutes": legal_issues.get("applicable_statutes", []),
            "burden_of_proof": legal_issues.get("burden_of_proof", ""),
            "recommended_strategy": legal_issues.get("recommended_strategy", ""),
        }

        content = await self._call_claude(
            system="你是一位资深中国执业律师，拥有20年诉讼实务经验。请严格遵循中国法律文书格式规范，使用法言法语撰写。",
            user=DOCUMENT_GENERATION_PROMPT.format(
                doc_type_name=doc_type_name,
                parsed_case=json.dumps(enhanced_parsed_case, ensure_ascii=False, indent=2),
                related_laws=combined_laws,
                related_cases=combined_cases,
                research_context=research_context or "无",
                template_structure=template_structure,
                extra_instructions=extra_instructions or "无",
                doc_type_specific=doc_type_specific,
            ),
            max_tokens=self._settings.CLAUDE_MAX_TOKENS,
        )

        # 7) 插入法律依据专节（如果LLM没有自行生成）
        if "法律依据" not in content and legal_basis_section:
            content = self._inject_legal_basis(content, legal_basis_section)

        # 8) 生成标题
        plaintiff = parsed_case.get("parties", {}).get("plaintiff", {}).get("name", "")
        defendant = parsed_case.get("parties", {}).get("defendant", {}).get("name", "")
        cause = parsed_case.get("cause_of_action", "")
        if plaintiff and defendant:
            title = f"{plaintiff}诉{defendant}{cause}一案{doc_type_name}" if cause else f"{plaintiff}诉{defendant}{doc_type_name}"
        else:
            title = doc_type_name

        return {
            "title": title,
            "content": content,
            "metadata": {
                "parsed_case": parsed_case,
                "legal_issues": legal_issues,
                "law_keywords": queries["law_keywords"],
                "case_keywords": queries["case_keywords"],
                "facts_summary": facts_summary,
                "applicable_statutes": legal_issues.get("applicable_statutes", []),
            },
        }

    # ------------------------------------------------------------------
    # Step 6: 质量核查（自动验证）
    # ------------------------------------------------------------------
    async def quality_check(self, content: str, doc_type: str, parsed_case: dict | None = None) -> dict:
        """对已生成的文书进行质量核查，返回结构化检查结果。"""
        doc_type_name = DOC_TYPE_NAMES.get(doc_type, doc_type)
        try:
            result = await self._call_claude(
                system="你是法律文书质量核查系统，负责自动化验证文书质量。",
                user=DOCUMENT_QUALITY_CHECK_PROMPT.format(
                    doc_type_name=doc_type_name,
                    content=content,
                    parsed_case=json.dumps(parsed_case, ensure_ascii=False, indent=2) if parsed_case else "无",
                ),
                max_tokens=2000,
            )
            check_result = self._parse_json_response(result)
            if not check_result:
                return {"passed": False, "issues": [], "checks": {}, "quality_score": 0, "summary": "核查解析失败"}
            return check_result
        except Exception as e:
            logger.warning(f"Quality check failed: {e}")
            return {"passed": False, "issues": [], "checks": {}, "quality_score": 0, "summary": f"核查失败: {e}"}

    # ------------------------------------------------------------------
    # Step 7: 法条引用核查（多源交叉验证）
    # ------------------------------------------------------------------
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

    # ------------------------------------------------------------------
    # Step 8: 审校（人工辅助）
    # ------------------------------------------------------------------
    async def review(self, content: str, doc_type: str) -> str:
        doc_type_name = DOC_TYPE_NAMES.get(doc_type, doc_type)
        result = await self._call_claude(
            system="你是一位拥有20年执业经验的资深律师，负责审校法律文书。请确保文书法言法语规范、法条引用准确、逻辑自洽。",
            user=DOCUMENT_REVIEW_PROMPT.format(
                doc_type_name=doc_type_name,
                content=content,
            ),
            max_tokens=self._settings.CLAUDE_MAX_TOKENS,
        )
        if "<!-- REVIEW_NOTES -->" in result:
            return result.split("<!-- REVIEW_NOTES -->")[0].strip()
        return result

    # ------------------------------------------------------------------
    # Multi-document Bundle: 批量生成 + 一致性检查
    # ------------------------------------------------------------------
    async def generate_bundle(
        self,
        case_facts: str,
        doc_types: list[str],
        preset: str | None = None,
        extra_instructions: str | None = None,
        research_context: str | None = None,
    ) -> dict:
        """生成多份文书集合，确保交叉一致性。

        Args:
            case_facts: 案件事实
            doc_types: 要生成的文书类型列表
            preset: 预设名称（如 "civil_litigation_full"），覆盖 doc_types
            extra_instructions: 额外指示
            research_context: 研究报告依据

        Returns:
            {
                "documents": [{doc_type, title, content, metadata}, ...],
                "consistency_check": {...},
            }
        """
        import asyncio

        # 如果指定了预设，使用预设的文书类型
        if preset and preset in BUNDLE_PRESETS:
            doc_types = BUNDLE_PRESETS[preset]["doc_types"]

        # 1) 统一解析案件（所有文书共用同一份解析结果）
        parsed_case = await self.parse_case(case_facts)
        queries = await self.generate_search_queries(case_facts)

        # 2) 统一检索法律和案例
        tasks = [
            self.search_related_laws(queries["law_keywords"]),
            self.search_related_cases(queries["case_keywords"]),
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        combined_laws = results[0] if not isinstance(results[0], Exception) else ""
        combined_cases = results[1] if not isinstance(results[1], Exception) else ""

        # 3) 统一提取法律争议焦点
        legal_issues = await self.extract_legal_issues(parsed_case, combined_laws)

        # 构建共享上下文
        shared_context = {
            "parsed_case": parsed_case,
            "legal_issues": legal_issues,
            "combined_laws": combined_laws,
            "combined_cases": combined_cases,
            "facts_summary": self._build_facts_summary(parsed_case),
            "legal_basis_section": self._build_legal_basis_section(legal_issues),
        }

        # 4) 依次生成每份文书（共享上下文确保一致性）
        documents = []
        for doc_type in doc_types:
            try:
                doc_type_name = DOC_TYPE_NAMES.get(doc_type, doc_type)
                doc_type_specific = DOC_TYPE_SPECIFIC_INSTRUCTIONS.get(doc_type, "")

                enhanced_parsed_case = {
                    **parsed_case,
                    "facts_summary": shared_context["facts_summary"],
                    "legal_issues": legal_issues.get("key_issues", []),
                    "applicable_statutes": legal_issues.get("applicable_statutes", []),
                    "burden_of_proof": legal_issues.get("burden_of_proof", ""),
                    "recommended_strategy": legal_issues.get("recommended_strategy", ""),
                }

                content = await self._call_claude(
                    system="你是一位资深中国执业律师，拥有20年诉讼实务经验。请严格遵循中国法律文书格式规范，使用法言法语撰写。注意：你正在为同一案件生成多份文书，请确保当事人信息、金额、日期、事实描述与其他文书完全一致。",
                    user=DOCUMENT_GENERATION_PROMPT.format(
                        doc_type_name=doc_type_name,
                        parsed_case=json.dumps(enhanced_parsed_case, ensure_ascii=False, indent=2),
                        related_laws=combined_laws or "无",
                        related_cases=combined_cases or "无",
                        research_context=research_context or "无",
                        template_structure="无特定模板结构要求",
                        extra_instructions=extra_instructions or "无",
                        doc_type_specific=doc_type_specific,
                    ),
                    max_tokens=self._settings.CLAUDE_MAX_TOKENS,
                )

                plaintiff = parsed_case.get("parties", {}).get("plaintiff", {}).get("name", "")
                defendant = parsed_case.get("parties", {}).get("defendant", {}).get("name", "")
                cause = parsed_case.get("cause_of_action", "")
                if plaintiff and defendant:
                    title = f"{plaintiff}诉{defendant}{cause}一案{doc_type_name}" if cause else f"{plaintiff}诉{defendant}{doc_type_name}"
                else:
                    title = doc_type_name

                documents.append({
                    "doc_type": doc_type,
                    "title": title,
                    "content": content,
                    "metadata": {
                        "parsed_case": parsed_case,
                        "legal_issues": legal_issues,
                        "bundle_preset": preset,
                    },
                })
            except Exception as e:
                logger.error(f"Bundle generation failed for {doc_type}: {e}")
                documents.append({
                    "doc_type": doc_type,
                    "title": DOC_TYPE_NAMES.get(doc_type, doc_type),
                    "content": f"生成失败: {e}",
                    "metadata": {"error": str(e)},
                })

        # 5) 一致性检查
        consistency_check = await self._check_bundle_consistency(documents)

        return {
            "documents": documents,
            "consistency_check": consistency_check,
            "shared_context": {
                "parsed_case": parsed_case,
                "legal_issues": legal_issues,
                "facts_summary": shared_context["facts_summary"],
            },
        }

    async def _check_bundle_consistency(self, documents: list[dict]) -> dict:
        """检查多份文书之间的一致性。"""
        if len(documents) < 2:
            return {"consistent": True, "issues": []}
        try:
            docs_text = ""
            for i, doc in enumerate(documents):
                docs_text += f"\n### 文书{i+1}: {doc.get('title', '')} ({doc.get('doc_type', '')})\n{doc.get('content', '')[:3000]}\n"

            result = await self._call_claude(
                system="你是法律文书一致性核查专家。",
                user=BUNDLE_CONSISTENCY_CHECK_PROMPT.format(documents=docs_text),
                max_tokens=1500,
            )
            check = self._parse_json_response(result)
            return check if check else {"consistent": True, "issues": []}
        except Exception as e:
            logger.warning(f"Bundle consistency check failed: {e}")
            return {"consistent": True, "issues": []}

    # ------------------------------------------------------------------
    # 辅助方法
    # ------------------------------------------------------------------
    def _build_legal_basis_section(self, legal_issues: dict) -> str:
        """构建法律依据专节文本。"""
        statutes = legal_issues.get("applicable_statutes", [])
        if not statutes:
            return ""
        lines = ["**法律依据**\n"]
        for statute in statutes:
            law_name = statute.get("law_name", "")
            articles = statute.get("articles", [])
            relevance = statute.get("relevance", "")
            if law_name and articles:
                articles_str = "、".join(f"第{a}条" for a in articles)
                line = f"- 《{law_name}》{articles_str}"
                if relevance:
                    line += f"：{relevance}"
                lines.append(line)
        return "\n".join(lines)

    def _build_facts_summary(self, parsed_case: dict) -> str:
        """构建事实摘要。"""
        facts = parsed_case.get("facts", "")
        key_dates = parsed_case.get("key_dates", [])
        amount = parsed_case.get("amount_involved", "")
        parties = parsed_case.get("parties", {})
        plaintiff_name = parties.get("plaintiff", {}).get("name", "原告")
        defendant_name = parties.get("defendant", {}).get("name", "被告")

        summary_parts = []
        if facts:
            summary_parts.append(f"事实概要：{facts}")
        if key_dates:
            summary_parts.append("关键时间节点：" + "；".join(key_dates))
        if amount:
            summary_parts.append(f"涉及金额：{amount}")
        summary_parts.append(f"当事人：{plaintiff_name}（原告）vs {defendant_name}（被告）")
        return "\n".join(summary_parts)

    def _inject_legal_basis(self, content: str, legal_basis: str) -> str:
        """在文书中注入法律依据专节（如果LLM没有自行生成）。"""
        # 在"事实与理由"段末或"此致"之前插入
        markers = ["此致", "综上", "## 诉讼请求"]
        for marker in markers:
            idx = content.find(marker)
            if idx > 0:
                return content[:idx] + f"\n\n{legal_basis}\n\n" + content[idx:]
        # 没找到合适位置，追加到末尾
        return content + f"\n\n{legal_basis}"

    # ------------------------------------------------------------------
    # 向量库和外部数据源检索
    # ------------------------------------------------------------------
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
