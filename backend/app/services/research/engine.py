"""多源法律研究引擎 — 并行采集多源数据 + LLM综合推理

优化版本包含:
1. 增强研究提示词 — 争议焦点/诉讼策略/风险等级/双方视角
2. 多轮研究策略 — 初始报告 + 补充深挖
3. 来源质量评分 — 权威性加权排序
4. 智能查询分解 — 法律问题/事实要素/程序要求/关键术语
5. 报告结构优化 — 结论摘要前置
6. 引文准确性 — 内联验证标记
"""

import re
import json
import logging
import asyncio
from datetime import datetime
from app.config import get_settings
from app.services.llm_client import create_llm_client_from_settings
from app.services.vector.store import get_vector_service

logger = logging.getLogger(__name__)

# ══════════════════════════════════════════════════════════════════════════════
# 1. 增强研究提示词
# ══════════════════════════════════════════════════════════════════════════════

RESEARCH_SYSTEM_PROMPT = """你是一位拥有20年执业经验的资深法律研究专家，精通中国法律体系，
擅长综合分析多个信息源并撰写高质量的法律研究报告。你的报告应达到律所合伙人审阅标准，
严谨、详实、具有实务指导价值。"""

RESEARCH_PROMPT = """请基于以下多源检索结果，撰写一份专业的法律研究报告。

## 研究课题：{query}

## 查询分解分析：
{query_decomposition}

## 信息来源（按权威性排序）：

### 一、外部法律数据库（权威来源）：
{external_api_results}

### 二、本地法条库检索结果：
{local_statutes}

### 三、本地案例库检索结果：
{local_cases}

### 四、AI法律知识：
{ai_knowledge}

### 五、网络搜索结果：
{web_search_results}

### 六、个人知识库：
{knowledge_base_results}

## 报告要求：

请严格按以下结构撰写研究报告（使用Markdown格式），每个部分必须完整、有实质内容：

### 结论摘要
- **2-3句话概括核心结论**，直接回答研究课题的核心问题
- 放在报告最前面，让读者第一时间获得关键信息

### 一、争议焦点归纳
- 明确列出本案/本问题的核心争议焦点（编号列出）
- 对每个争议焦点进行简要分析
- 评估各争议焦点的重要程度（★★★关键 / ★★重要 / ★一般）

### 二、法律关系分析
- 分析涉及的法律关系主体
- 明确法律关系性质（合同、侵权、劳动等）
- 如涉及多个法律关系，分析其相互关系

### 三、相关法律法规分析
- **必须使用完整法律名称**，格式为《中华人民共和国XXX法》第X条第X款
- 列出核心法律依据，按效力层级排序（法律 > 行政法规 > 司法解释 > 部门规章）
- 分析法条之间的逻辑关系和适用顺序
- 指出适用的司法解释或指导性文件
- 对每条引用标注置信度：[高确信]/[中确信]/[需进一步核实]
- 如存在法律冲突或新旧法衔接问题，明确指出

### 四、冲突法与管辖权分析
- 如涉及跨法域问题，分析法律适用规则
- 确定有管辖权的法院/仲裁机构
- 分析诉讼时效、除斥期间等程序性要求

### 五、典型案例分析
- 选取3-5个最具参考价值的案例（优先选取最高法、高院案例）
- 对每个案例说明：案号、法院、裁判要旨、裁判逻辑
- 对比分析各案的异同
- 总结法院的裁判倾向和趋势
- 标注案例参考价值：[最高法指导案例]/[高院典型案例]/[参考案例]

### 六、法律风险分析
- 列出主要法律风险点
- 对每个风险点标注：
  - **风险等级**：🔴高风险 / 🟡中风险 / 🟢低风险
  - **发生概率**：高/中/低
  - **影响程度**：严重/较大/一般
  - **风险描述**：具体说明
- 从原告（申请人）和被告（被申请人）两个视角分别分析风险

### 七、诉讼策略建议
- **原告（申请人）视角**：
  - 诉讼请求设计建议
  - 证据收集要点
  - 诉讼策略路径
- **被告（被申请人）视角**：
  - 抗辩理由分析
  - 反诉可能性评估
  - 防御策略路径
- 和解/调解的可行性和建议方案

### 八、实务建议
- 给出具体可行的法律建议（编号列出）
- 建议的行动方案和时间表
- 需要进一步调查的事项
- 费用估算参考

### 九、结论
- 综合性结论意见
- 对各争议焦点的逐一回应
- 整体风险评估总结

**引用规范：**
- 引用法条必须使用完整法律全名，如《中华人民共和国民法典》第五百八十四条
- 不得编造不存在的法条或案例
- 如果某个来源无数据，则跳过该部分，不要编造
- 对AI生成的内容和网络搜索结果，请标注「需进一步核实」"""


# ══════════════════════════════════════════════════════════════════════════════
# 查询分解提示词
# ══════════════════════════════════════════════════════════════════════════════

QUERY_DECOMPOSITION_PROMPT = """请分析以下法律研究问题，将其分解为结构化的搜索要素。

研究问题：{query}

请返回严格的JSON格式（不要返回其他内容）：
```json
{{
  "legal_issues": ["涉及的法律问题1", "涉及的法律问题2"],
  "factual_elements": ["需要验证的事实要素1", "需要验证的事实要素2"],
  "procedural_requirements": ["程序性要求1", "程序性要求2"],
  "key_legal_terms": ["关键法律术语1", "关键法律术语2"],
  "sub_queries": ["分解后的子查询1（用于分别检索）", "分解后的子查询2", "分解后的子查询3"],
  "applicable_law_areas": ["涉及的法律领域1", "涉及的法律领域2"]
}}
```

要求：
1. legal_issues: 识别涉及的核心法律争议点
2. factual_elements: 识别需要查明的事实要素
3. procedural_requirements: 识别程序性要求（时效、管辖等）
4. key_legal_terms: 提取需要精确检索的法律术语
5. sub_queries: 生成3-5个针对性子查询，每个覆盖不同角度
6. applicable_law_areas: 识别涉及的法律领域"""


# ══════════════════════════════════════════════════════════════════════════════
# 深挖/补充研究提示词
# ══════════════════════════════════════════════════════════════════════════════

DEEP_DIVE_PROMPT = """你是一位法律研究质量审核专家。请审阅以下初步研究报告，识别其中的不足之处。

## 研究课题：{query}

## 初步报告：
{initial_report}

请分析以下方面并返回JSON格式：
```json
{{
  "gaps": [
    {{
      "area": "缺失领域（如：某个法律问题未被充分分析）",
      "description": "具体说明缺失了什么",
      "suggested_query": "建议的补充搜索查询"
    }}
  ],
  "weak_citations": ["引用不够具体或可能不准确的法条引用"],
  "missing_perspectives": ["缺少的分析视角"],
  "follow_up_queries": ["建议的补充检索查询1", "建议的补充检索查询2"]
}}
```

要求：
1. 至少识别2-3个需要补充的领域
2. 为每个缺失领域提供具体的补充搜索建议
3. 检查是否有法条引用过于笼统（如只提法律名未提具体条文号）
4. 检查是否缺少某一方当事人视角的分析"""


# ══════════════════════════════════════════════════════════════════════════════
# 来源质量评分系统
# ══════════════════════════════════════════════════════════════════════════════

# 来源类型权重 — 越高越权威
SOURCE_QUALITY_WEIGHTS = {
    # 一级权威来源
    "外部法律数据库": 1.0,    # 北大法宝、权威法律数据库
    "external_api": 1.0,
    # 二级来源
    "本地法条库": 0.9,        # 本地向量库中的法条
    "vector_db_statutes": 0.9,
    # 三级来源
    "本地案例库": 0.8,        # 本地案例
    "vector_db_cases": 0.8,
    # 四级来源
    "AI法规检索": 0.7,
    "AI案例检索": 0.7,
    "ai_knowledge": 0.6,      # AI生成 — 需验证
    # 五级来源
    "web_search": 0.4,        # 网络搜索 — 需验证
    "knowledge_base": 0.5,    # 个人知识库
}

# 案例法院层级加分
COURT_LEVEL_BONUS = {
    "最高人民法院": 0.3,
    "最高法": 0.3,
    "高级人民法院": 0.2,
    "高院": 0.2,
    "中级人民法院": 0.1,
    "中院": 0.1,
}


def score_source_quality(source_name: str, metadata: dict | None = None) -> float:
    """计算来源质量分数 (0.0-1.0)"""
    base_score = SOURCE_QUALITY_WEIGHTS.get(source_name, 0.3)

    if metadata is None:
        return base_score

    # 案例来源加分
    court = metadata.get("court", "") if metadata else ""
    for court_name, bonus in COURT_LEVEL_BONUS.items():
        if court_name in court:
            base_score = min(1.0, base_score + bonus)
            break

    return base_score


def format_source_with_score(source_name: str, content: str, metadata: dict | None = None) -> str:
    """格式化来源条目，附带质量评分标签"""
    score = score_source_quality(source_name, metadata)
    if score >= 0.9:
        label = "[权威]"
    elif score >= 0.7:
        label = "[可信]"
    elif score >= 0.5:
        label = "[参考]"
    else:
        label = "[需核实]"

    return f"{label} {content}"


# ══════════════════════════════════════════════════════════════════════════════
# 引文提取与内联验证
# ══════════════════════════════════════════════════════════════════════════════

def extract_citations(text: str) -> list[tuple[str, str]]:
    """从文本中提取所有法条引用。返回 [(法律名, 条款号)]"""
    citations = []
    # 匹配 《中华人民共和国XXX法》第X条 和 《XXX法》第X条
    pattern = r'《([^》]+)》\s*(第[一二三四五六七八九十百千万零\d]+条)'
    for match in re.finditer(pattern, text):
        law_name = match.group(1)
        article = match.group(2)
        citations.append((law_name, article))
    # 去重
    seen = set()
    unique = []
    for c in citations:
        key = (c[0], c[1])
        if key not in seen:
            seen.add(key)
            unique.append(c)
    return unique


def annotate_citations_inline(report: str, verification_results: list[dict]) -> str:
    """在报告中对已验证的引文添加内联标记"""
    verified_map = {}
    for vr in verification_results:
        key = (vr.get("law_name", ""), vr.get("article_number", ""))
        verified_map[key] = vr.get("consistent", False)

    def replace_citation(match):
        law_name = match.group(1)
        article = match.group(2)
        key = (law_name, article)
        if key in verified_map:
            if verified_map[key]:
                return f"《{law_name}》{article} [已验证✓]"
            else:
                return f"《{law_name}》{article} [待核实⚠]"
        return match.group(0)

    return re.sub(
        r'《([^》]+)》\s*(第[一二三四五六七八九十百千万零\d]+条)',
        replace_citation,
        report,
    )


# ══════════════════════════════════════════════════════════════════════════════
# 核心研究引擎
# ══════════════════════════════════════════════════════════════════════════════

class LegalResearchEngine:

    async def research(self, query: str, sources: list[str], case_id: int | None = None) -> dict:
        """多源法律研究 — 含查询分解、多轮深挖、来源评分、引文验证"""
        settings = get_settings()
        client = create_llm_client_from_settings(settings)

        # ── Step 0: 智能查询分解 ──────────────────────────────────────
        decomposition = await self._decompose_query(client, settings.CLAUDE_MODEL, query)
        sub_queries = decomposition.get("sub_queries", [query])

        # ── Step 1: 多查询并行检索 ──────────────────────────────────────
        local_cases = "（未选择本地案例库）"
        local_statutes = "（未选择本地法条库）"
        ai_knowledge = "（未选择AI知识源）"
        external_api_results = "（未选择外部API）"
        web_search_results = "（未选择网络搜索）"
        knowledge_base_results = "（未选择知识库）"

        tasks = {}

        # 1. 本地向量库 — 使用主查询 + 子查询
        if "vector_db" in sources:
            tasks["cases"] = self._search_vector_cases_multi(query, sub_queries)
            tasks["statutes"] = self._search_vector_statutes_multi(query, sub_queries)

        # 2. AI知识
        if "ai_knowledge" in sources:
            tasks["ai"] = self._search_ai(client, settings.CLAUDE_MODEL, query, decomposition)

        # 3. 外部API
        if "external_api" in sources:
            tasks["external"] = self._search_external_apis(query, sub_queries)

        # 4. 网络搜索
        if "web_search" in sources:
            tasks["web"] = self._search_web(client, settings.CLAUDE_MODEL, query, decomposition)

        # 5. 个人知识库
        if "knowledge_base" in sources:
            tasks["kb"] = self._search_knowledge_base_multi(query, sub_queries)

        results = {}
        if tasks:
            gathered = await asyncio.gather(*tasks.values(), return_exceptions=True)
            for key, result in zip(tasks.keys(), gathered):
                if not isinstance(result, Exception):
                    results[key] = result
                else:
                    logger.warning(f"Research source '{key}' failed: {result}")
                    results[key] = f"（检索失败: {result}）"

        # ── Step 1b: 格式化来源结果（含质量评分） ──────────────────────
        if "cases" in results:
            items = results["cases"]
            if isinstance(items, list) and items:
                scored_items = []
                for it in items[:8]:
                    meta = it.get("metadata", {})
                    title = meta.get("title", it["id"])
                    content = it["content"][:300]
                    source_label = format_source_with_score("本地案例库", f"- [{title}] {content}", meta)
                    scored_items.append(source_label)
                local_cases = "\n".join(scored_items)
            else:
                local_cases = "（本地案例库无匹配结果）"

        if "statutes" in results:
            items = results["statutes"]
            if isinstance(items, list) and items:
                scored_items = []
                for it in items[:8]:
                    meta = it.get("metadata", {})
                    title = meta.get("title", it["id"])
                    content = it["content"][:300]
                    source_label = format_source_with_score("本地法条库", f"- [{title}] {content}", meta)
                    scored_items.append(source_label)
                local_cases_text = "\n".join(scored_items)
                local_statutes = local_cases_text
            else:
                local_statutes = "（本地法条库无匹配结果）"

        if "ai" in results:
            ai_raw = results["ai"] if isinstance(results["ai"], str) else str(results["ai"])
            ai_knowledge = f"[需核实] 以下内容由AI生成，请核实关键法条引用：\n{ai_raw}"

        if "external" in results:
            ext_raw = results["external"] if isinstance(results["external"], str) else str(results["external"])
            external_api_results = f"[权威] {ext_raw}"

        if "web" in results:
            web_raw = results["web"] if isinstance(results["web"], str) else str(results["web"])
            web_search_results = f"[需核实] 以下内容来自网络搜索，准确性需要验证：\n{web_raw}"

        if "kb" in results:
            knowledge_base_results = results["kb"] if isinstance(results["kb"], str) else str(results["kb"])

        # ── Step 2: 生成初步报告 ────────────────────────────────────────
        decomposition_text = self._format_decomposition(decomposition)

        prompt = RESEARCH_PROMPT.format(
            query=query,
            query_decomposition=decomposition_text,
            local_cases=local_cases,
            local_statutes=local_statutes,
            ai_knowledge=ai_knowledge,
            external_api_results=external_api_results,
            web_search_results=web_search_results,
            knowledge_base_results=knowledge_base_results,
        )

        try:
            response = await client.messages.create(
                model=settings.CLAUDE_MODEL,
                max_tokens=settings.CLAUDE_MAX_TOKENS,
                system=RESEARCH_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )
            initial_report = response.content[0].text if response.content else "报告生成失败"
        except Exception as e:
            logger.error(f"Initial report generation failed: {e}")
            initial_report = f"报告生成失败: {e}"

        # ── Step 3: 多轮深挖 — 识别不足并补充 ──────────────────────────
        final_report = await self._deep_dive_pass(
            client, settings, query, initial_report, sources,
            local_cases, local_statutes, ai_knowledge,
            external_api_results, web_search_results, knowledge_base_results,
        )

        # ── Step 4: 引文验证 + 内联标记 ────────────────────────────────
        law_verification = await self._verify_laws_in_report(final_report)
        final_report = annotate_citations_inline(final_report, law_verification)

        return {
            "report": final_report,
            "sources_used": [s for s in sources if s in results],
            "query": query,
            "law_verification": law_verification,
            "query_decomposition": decomposition,
        }

    # ── 查询分解 ─────────────────────────────────────────────────────────

    async def _decompose_query(self, client, model: str, query: str) -> dict:
        """将用户查询分解为结构化搜索要素"""
        try:
            response = await client.messages.create(
                model=model,
                max_tokens=2000,
                system="你是法律检索分析专家。请严格按照JSON格式返回查询分解结果。",
                messages=[{
                    "role": "user",
                    "content": QUERY_DECOMPOSITION_PROMPT.format(query=query),
                }],
            )
            text = response.content[0].text.strip() if response.content else ""
            text = re.sub(r'^```(?:json)?\n?', '', text)
            text = re.sub(r'\n?```$', '', text)
            data = json.loads(text)
            return data
        except Exception as e:
            logger.warning(f"Query decomposition failed: {e}")
            return {
                "legal_issues": [query],
                "factual_elements": [],
                "procedural_requirements": [],
                "key_legal_terms": [],
                "sub_queries": [query],
                "applicable_law_areas": [],
            }

    def _format_decomposition(self, decomposition: dict) -> str:
        """格式化查询分解结果为可读文本"""
        lines = []
        if decomposition.get("legal_issues"):
            lines.append("**涉及的法律问题：**")
            for issue in decomposition["legal_issues"]:
                lines.append(f"  - {issue}")
        if decomposition.get("factual_elements"):
            lines.append("\n**需要验证的事实要素：**")
            for elem in decomposition["factual_elements"]:
                lines.append(f"  - {elem}")
        if decomposition.get("procedural_requirements"):
            lines.append("\n**程序性要求：**")
            for req in decomposition["procedural_requirements"]:
                lines.append(f"  - {req}")
        if decomposition.get("key_legal_terms"):
            lines.append("\n**关键法律术语：**")
            for term in decomposition["key_legal_terms"]:
                lines.append(f"  - {term}")
        if decomposition.get("applicable_law_areas"):
            lines.append("\n**涉及法律领域：**")
            for area in decomposition["applicable_law_areas"]:
                lines.append(f"  - {area}")
        return "\n".join(lines) if lines else "（自动分解不可用，使用原始查询）"

    # ── 多轮深挖 ─────────────────────────────────────────────────────────

    async def _deep_dive_pass(
        self, client, settings, query: str, initial_report: str,
        sources: list[str],
        local_cases: str, local_statutes: str, ai_knowledge: str,
        external_api_results: str, web_search_results: str,
        knowledge_base_results: str,
    ) -> str:
        """第二遍深挖：识别不足，补充搜索，合并结果"""
        try:
            # 1. 让LLM识别报告不足之处
            dive_prompt = DEEP_DIVE_PROMPT.format(
                query=query,
                initial_report=initial_report[:6000],
            )
            response = await client.messages.create(
                model=settings.CLAUDE_MODEL,
                max_tokens=2000,
                system="你是法律研究质量审核专家。请严格按JSON格式返回审核结果。",
                messages=[{"role": "user", "content": dive_prompt}],
            )
            text = response.content[0].text.strip() if response.content else ""
            text = re.sub(r'^```(?:json)?\n?', '', text)
            text = re.sub(r'\n?```$', '', text)
            dive_analysis = json.loads(text)
        except Exception as e:
            logger.warning(f"Deep dive analysis failed: {e}")
            return initial_report

        # 2. 根据不足之处执行补充搜索
        follow_up_queries = dive_analysis.get("follow_up_queries", [])
        gaps = dive_analysis.get("gaps", [])
        for gap in gaps:
            sq = gap.get("suggested_query", "")
            if sq and sq not in follow_up_queries:
                follow_up_queries.append(sq)

        if not follow_up_queries:
            return initial_report

        # 执行补充搜索（最多3个查询）
        supplement_results = []
        for fq in follow_up_queries[:3]:
            sup_tasks = []
            sup_keys = []

            if "vector_db" in sources:
                sup_tasks.append(self._search_vector_statutes(fq))
                sup_keys.append("statutes")
                sup_tasks.append(self._search_vector_cases(fq))
                sup_keys.append("cases")

            if "ai_knowledge" in sources:
                sup_tasks.append(self._search_ai_simple(client, settings.CLAUDE_MODEL, fq))
                sup_keys.append("ai")

            if sup_tasks:
                sup_gathered = await asyncio.gather(*sup_tasks, return_exceptions=True)
                sup_data = {}
                for k, r in zip(sup_keys, sup_gathered):
                    if not isinstance(r, Exception):
                        sup_data[k] = r

                # 格式化补充结果
                parts = []
                if "statutes" in sup_data and sup_data["statutes"]:
                    for it in sup_data["statutes"][:3]:
                        meta = it.get("metadata", {})
                        parts.append(f"- [补充法条] [{meta.get('title', it['id'])}] {it['content'][:200]}")
                if "cases" in sup_data and sup_data["cases"]:
                    for it in sup_data["cases"][:3]:
                        meta = it.get("metadata", {})
                        parts.append(f"- [补充案例] [{meta.get('title', it['id'])}] {it['content'][:200]}")
                if "ai" in sup_data and sup_data["ai"]:
                    parts.append(f"- [补充AI分析] {str(sup_data['ai'])[:500]}")

                if parts:
                    supplement_results.append(f"**补充查询「{fq}」的结果：**\n" + "\n".join(parts))

        if not supplement_results:
            return initial_report

        # 3. 让LLM将补充结果合并入报告
        supplement_text = "\n\n".join(supplement_results)
        merge_prompt = f"""请将以下补充研究结果融入初步报告中，完善相关部分。
不要删除初步报告中的任何现有内容，只在需要的地方补充增强。
保持原有的报告结构和格式。

## 补充研究结果：
{supplement_text}

## 初步报告：
{initial_report}

请返回合并后的完整报告（Markdown格式），保持原有结构不变，在相关章节中融入补充信息。"""

        try:
            merge_response = await client.messages.create(
                model=settings.CLAUDE_MODEL,
                max_tokens=settings.CLAUDE_MAX_TOKENS,
                system=RESEARCH_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": merge_prompt}],
            )
            merged_report = merge_response.content[0].text if merge_response.content else initial_report
            return merged_report
        except Exception as e:
            logger.warning(f"Report merge failed: {e}")
            return initial_report

    # ── 来源检索方法 ─────────────────────────────────────────────────────

    async def _search_vector_cases(self, query: str) -> list[dict]:
        svc = get_vector_service()
        return await svc.search_cases(query, top_k=5)

    async def _search_vector_statutes(self, query: str) -> list[dict]:
        svc = get_vector_service()
        return await svc.search_statutes(query, top_k=5)

    async def _search_vector_cases_multi(self, main_query: str, sub_queries: list[str]) -> list[dict]:
        """多查询并行检索案例，合并去重"""
        all_queries = [main_query] + (sub_queries or [])
        tasks = [self._search_vector_cases(q) for q in all_queries[:4]]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        seen_ids = set()
        merged = []
        for result in results:
            if isinstance(result, list):
                for item in result:
                    item_id = item.get("id", "")
                    if item_id not in seen_ids:
                        seen_ids.add(item_id)
                        merged.append(item)
        return merged

    async def _search_vector_statutes_multi(self, main_query: str, sub_queries: list[str]) -> list[dict]:
        """多查询并行检索法条，合并去重"""
        all_queries = [main_query] + (sub_queries or [])
        tasks = [self._search_vector_statutes(q) for q in all_queries[:4]]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        seen_ids = set()
        merged = []
        for result in results:
            if isinstance(result, list):
                for item in result:
                    item_id = item.get("id", "")
                    if item_id not in seen_ids:
                        seen_ids.add(item_id)
                        merged.append(item)
        return merged

    async def _search_ai(self, client, model: str, query: str, decomposition: dict = None) -> str:
        """AI法律知识检索 — 利用分解结果增强查询"""
        try:
            # 利用分解信息构建更精确的查询
            enhanced_query = query
            if decomposition:
                issues = decomposition.get("legal_issues", [])
                terms = decomposition.get("key_legal_terms", [])
                if issues or terms:
                    extra = "；".join(issues[:3] + terms[:3])
                    enhanced_query = f"{query}\n\n请特别关注以下方面：{extra}"

            response = await client.messages.create(
                model=model,
                max_tokens=4000,
                system="""你是一位资深中国法律专家。请提供关于以下问题的专业法律分析。

要求：
1. 引用法条时必须使用完整法律全名，如《中华人民共和国民法典》第五百八十四条
2. 区分法律、行政法规、司法解释的不同效力层级
3. 如果存在法律冲突或新旧法衔接问题，请明确指出
4. 对每个法律观点给出你的确信程度""",
                messages=[{"role": "user", "content": f"法律研究问题：{enhanced_query}"}],
            )
            return response.content[0].text if response.content else ""
        except Exception as e:
            return f"（AI检索失败: {e}）"

    async def _search_ai_simple(self, client, model: str, query: str) -> str:
        """简化版AI检索（用于补充搜索）"""
        try:
            response = await client.messages.create(
                model=model,
                max_tokens=2000,
                system="你是中国法律专家。请简要回答以下法律问题，重点引用具体法条。",
                messages=[{"role": "user", "content": f"法律问题：{query}"}],
            )
            return response.content[0].text if response.content else ""
        except Exception as e:
            return f"（AI补充检索失败: {e}）"

    async def _search_external_apis(self, query: str, sub_queries: list[str] = None) -> str:
        """查询外部法律数据源（北大法宝MCP等）— 多查询"""
        from app.services.data_sources.base import DataSourceRegistry
        adapters = DataSourceRegistry.get_all()
        if not adapters:
            return "（未配置外部法律数据源）"

        all_queries = [query] + (sub_queries or [])[:2]
        results = []
        for name, adapter in adapters.items():
            for q in all_queries[:2]:
                try:
                    laws = await adapter.search_law(q, limit=5)
                    for law in laws[:3]:
                        score = score_source_quality(name)
                        label = "[权威]" if score >= 0.9 else "[可信]"
                        results.append(f"- {label} [{name}] {law.title} {law.provision_ref}: {law.content[:200]}")
                except Exception as e:
                    results.append(f"- [{name}] 检索失败: {e}")

        return "\n".join(results) if results else "（外部API无结果）"

    async def _search_web(self, client, model: str, query: str, decomposition: dict = None) -> str:
        """网络搜索 — 优先使用配置的搜索API，回退使用AI知识"""
        from app.services.data_sources.base import DataSourceRegistry
        adapters = DataSourceRegistry.get_all()
        for name, adapter in adapters.items():
            if hasattr(adapter, '_config_id'):
                if "search" in (adapter.description or "").lower() or "搜索" in (adapter.description or ""):
                    try:
                        laws = await adapter.search_law(query)
                        if laws:
                            lines = [f"- [{adapter.description}] {law.title}: {law.content[:200]}" for law in laws[:5]]
                            return "\n".join(lines)
                    except Exception:
                        pass

        # 方案2: AI网络知识搜索
        try:
            enhanced_query = query
            if decomposition and decomposition.get("key_legal_terms"):
                terms = "、".join(decomposition["key_legal_terms"][:5])
                enhanced_query = f"{query}\n\n请特别关注以下法律术语：{terms}"

            response = await client.messages.create(
                model=model,
                max_tokens=3000,
                system="你是一位法律研究专家。请基于你的知识库和网络公开信息，回答以下法律问题。所有信息请标注「需进一步核实」。引用法条时使用完整法律全名和条文号。",
                messages=[{"role": "user", "content": f"请搜索并提供关于以下法律问题的最新信息：{enhanced_query}"}],
            )
            return response.content[0].text if response.content else ""
        except Exception as e:
            return f"（网络搜索失败: {e}）"

    async def _search_knowledge_base(self, query: str) -> str:
        """从个人知识库向量检索"""
        try:
            from app.services.vector.store import get_vector_service
            svc = get_vector_service()
            results = await svc.search_cases(query, top_k=5, collection="knowledge")
            if results:
                lines = [f"- [{it.get('id', '')}] {it.get('content', '')[:300]}" for it in results[:5]]
                return "\n".join(lines)
        except Exception:
            pass

        try:
            from app.core.database import async_session
            from app.models.knowledge import KnowledgeItem
            from sqlalchemy import select, or_
            async with async_session() as session:
                result = await session.execute(
                    select(KnowledgeItem)
                    .where(or_(
                        KnowledgeItem.title.contains(query),
                        KnowledgeItem.content.contains(query),
                    ))
                    .limit(5)
                )
                items = result.scalars().all()
                if items:
                    lines = [f"- [{it.title}] {it.content[:300]}" for it in items]
                    return "\n".join(lines)
        except Exception:
            pass

        return "（知识库无匹配结果）"

    async def _search_knowledge_base_multi(self, query: str, sub_queries: list[str] = None) -> str:
        """多查询知识库检索"""
        all_queries = [query] + (sub_queries or [])[:2]
        all_results = []
        for q in all_queries[:3]:
            result = await self._search_knowledge_base(q)
            if result and "无匹配结果" not in result:
                all_results.append(result)

        return "\n".join(all_results) if all_results else "（知识库无匹配结果）"

    # ── 引文验证 ─────────────────────────────────────────────────────────

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
