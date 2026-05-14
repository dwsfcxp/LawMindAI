"""证据链分析服务 — 分析案件证据完整性，识别缺失环节"""

import json
import logging
from app.services.llm_client import create_llm_client_from_settings
from app.config import get_settings

logger = logging.getLogger(__name__)


async def analyze_evidence_chain(
    case_description: str,
    evidence_list: list[dict],
) -> dict:
    """
    分析证据链完整性。
    evidence_list: [{id, title, type, ocr_text, analysis, tags}]
    返回: {chain_report, completeness_score, missing_evidence, timeline}
    """
    settings = get_settings()
    client = create_llm_client_from_settings(settings)
    model = settings.CLAUDE_MODEL

    evidence_summary = []
    for ev in evidence_list:
        text_preview = (ev.get("ocr_text") or "")[:500]
        analysis_preview = (ev.get("analysis") or "")[:300]
        evidence_summary.append({
            "id": ev.get("id"),
            "title": ev.get("title", ""),
            "type": ev.get("type", ""),
            "tags": ev.get("tags", []),
            "text_preview": text_preview,
            "analysis_preview": analysis_preview,
        })

    prompt = f"""你是一位资深诉讼律师，请对以下案件的证据链进行完整性分析。

## 案件描述
{case_description[:3000]}

## 已有证据（{len(evidence_summary)}份）
{json.dumps(evidence_summary, ensure_ascii=False, indent=2)}

## 分析要求

请从以下角度分析证据链：

1. **证据链完整性**：现有证据能否形成完整的证明链？是否存在断链？
2. **待证事实覆盖**：案件的核心待证事实有哪些？每项待证事实是否有足够证据支撑？
3. **证据矛盾**：各证据之间是否存在矛盾或冲突？
4. **缺失证据**：还需要补充哪些类型的证据？
5. **证据排序建议**：建议的举证顺序

请以JSON格式返回：
{{
  "completeness_score": 75,
  "chain_status": "基本完整|存在缺口|严重不足",
  "facts_to_prove": [
    {{"fact": "待证事实描述", "supported": true, "supporting_evidence": [证据ID列表], "gap": ""}}
  ],
  "contradictions": ["矛盾1", "矛盾2"],
  "missing_evidence": [
    {{"type": "需要的证据类型", "purpose": "证明什么", "urgency": "high|medium|low"}}
  ],
  "suggested_order": [证据ID的举证顺序],
  "summary": "整体分析摘要（300字以内）"
}}

请直接返回JSON，不要包含其他文字。"""

    try:
        response = await client.messages.create(
            model=model,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        result = json.loads(raw)
    except (json.JSONDecodeError, Exception) as e:
        logger.warning(f"Evidence chain analysis failed: {e}")
        raw_text = ""
        try:
            raw_text = response.content[0].text
        except Exception:
            pass
        result = {
            "completeness_score": None,
            "chain_status": "分析失败",
            "facts_to_prove": [],
            "contradictions": [],
            "missing_evidence": [],
            "suggested_order": [],
            "summary": f"证据链分析失败。{raw_text[:500]}" if raw_text else "证据链分析服务暂时不可用。",
        }

    # Build readable report
    report = _build_chain_report(result)
    return {
        "chain_report": report,
        "completeness_score": result.get("completeness_score"),
        "chain_status": result.get("chain_status", "未知"),
        "missing_evidence": result.get("missing_evidence", []),
    }


async def generate_cross_examination(
    evidence_text: str,
    evidence_type: str,
    case_context: str,
    our_side: str = "被告",
) -> str:
    """为对方证据生成质证意见"""
    settings = get_settings()
    client = create_llm_client_from_settings(settings)
    model = settings.CLAUDE_MODEL

    prompt = f"""你是一位资深诉讼律师，{our_side}方代理人。请针对以下对方提交的证据，从真实性、合法性、关联性三个维度撰写质证意见。

## 对方证据
类型：{evidence_type}
内容：
{evidence_text[:8000]}

## 案件背景
{case_context[:3000] or '未提供案件背景'}

## 质证要求

请从以下维度逐一质证：
1. **真实性**：证据是否真实，是否有伪造或变造的可能
2. **合法性**：证据收集方式是否合法，是否存在非法证据排除情形
3. **关联性**：证据与案件待证事实的关联程度
4. **证明力**：即使证据三性没有问题，其证明力大小如何

请输出完整的质证意见，语言专业有力，适当引用法条。"""

    try:
        response = await client.messages.create(
            model=model,
            max_tokens=4096,
            system="你是一位资深中国执业律师，擅长证据质证和法庭辩论。",
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text if response.content else "质证意见生成失败"
    except Exception as e:
        logger.warning(f"Cross-examination generation failed: {e}")
        return "质证意见生成失败，请稍后重试。"


def _build_chain_report(result: dict) -> str:
    parts = []

    score = result.get("completeness_score")
    status = result.get("chain_status", "未知")
    if score is not None:
        parts.append(f"# 证据链分析报告\n")
        parts.append(f"**完整度**: {score}/100 — {status}\n")
    parts.append(f"\n{result.get('summary', '')}\n")

    facts = result.get("facts_to_prove", [])
    if facts:
        parts.append("\n---\n\n## 待证事实覆盖\n")
        for f in facts:
            mark = "已证明" if f.get("supported") else "待补充"
            parts.append(f"- **{f.get('fact', '')}** [{mark}]\n")
            if f.get("gap"):
                parts.append(f"  缺口: {f['gap']}\n")

    contradictions = result.get("contradictions", [])
    if contradictions:
        parts.append("\n---\n\n## 证据矛盾\n")
        for c in contradictions:
            parts.append(f"- {c}\n")

    missing = result.get("missing_evidence", [])
    if missing:
        parts.append("\n---\n\n## 需要补充的证据\n")
        for m in missing:
            urgency = {"high": "紧急", "medium": "一般", "low": "可选"}.get(m.get("urgency", "low"), "一般")
            parts.append(f"- **[{urgency}]** {m.get('type', '')} — {m.get('purpose', '')}\n")

    return "\n".join(parts)
