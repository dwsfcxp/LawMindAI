"""合同智能审查引擎 — 5维度风险分析 + 修改建议 + 报告生成"""

import json
import logging
from app.services.llm_client import create_llm_client_from_settings
from app.config import get_settings
from app.schemas.contract import ContractRiskItem

logger = logging.getLogger(__name__)

REVIEW_DIMENSIONS = {
    "legality": "合法性",
    "completeness": "完备性",
    "fairness": "公平性",
    "clarity": "明确性",
    "enforceability": "可执行性",
}


def _validate_risk_items(raw_items: list) -> list[dict]:
    """Validate and sanitize LLM-returned risk items."""
    valid = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        try:
            validated = ContractRiskItem(
                dimension=str(item.get("dimension", "enforceability")),
                level=str(item.get("level", "low")) if item.get("level") in ("high", "medium", "low") else "low",
                clause=str(item.get("clause", "")),
                issue=str(item.get("issue", "")),
                suggestion=str(item.get("suggestion", "")),
            )
            valid.append(validated.model_dump())
        except Exception:
            continue
    return valid


async def review_contract(
    contract_text: str,
    clauses: list[dict] | None = None,
    case_context: str = "",
) -> dict:
    """
    审查合同，返回 {report, risk_items, risk_score}
    """
    settings = get_settings()
    client = create_llm_client_from_settings(settings)
    model = settings.CLAUDE_MODEL

    clauses_text = ""
    if clauses:
        clauses_text = "\n\n".join(
            f"【{c.get('type', '未知类型')}】(第{c.get('position', i+1)}条)\n{c.get('text', '')}"
            for i, c in enumerate(clauses)
        )

    prompt = f"""你是一位资深合同审查律师。请对以下合同进行全面审查。

## 审查维度
1. **合法性** — 条款是否违反强制性法律规定
2. **完备性** — 是否缺少必要条款（违约责任、争议解决、知识产权、保密条款等）
3. **公平性** — 权利义务是否明显失衡，是否存在霸王条款
4. **明确性** — 表述是否清晰无歧义，关键条款是否具体可量化
5. **可执行性** — 条款是否具备实际可操作性，履行标准是否明确

{"## 案件背景" if case_context else ""}
{case_context}

## 合同条款
{clauses_text if clauses_text else contract_text[:15000]}

## 审查要求
请以JSON格式返回审查结果，结构如下：
{{
  "risk_items": [
    {{
      "dimension": "legality|completeness|fairness|clarity|enforceability",
      "level": "high|medium|low",
      "clause": "相关条款原文摘要",
      "issue": "具体问题描述",
      "suggestion": "修改建议（包含具体修改后的条款文字）"
    }}
  ],
  "summary": "整体审查摘要（200字以内）",
  "risk_score": 75,
  "recommendations": ["建议1", "建议2", ...],
  "missing_clauses": ["缺少的必要条款类型列表"]
}}

注意：
- risk_score 范围 0-100，越高表示风险越大
- 每个风险项必须给出具体的修改建议文字
- 如果合同有明显违法条款，标记为 high 级别
- 检查是否缺少常见必要条款

请直接返回JSON，不要包含其他文字。"""

    raw_text = ""
    try:
        response = await client.messages.create(
            model=model,
            max_tokens=8192,
            messages=[{"role": "user", "content": prompt}],
        )
        raw_text = response.content[0].text.strip()
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

        result = json.loads(raw_text)
    except json.JSONDecodeError as e:
        logger.warning(f"AI contract review JSON parse failed: {e}")
        result = {
            "risk_items": [],
            "summary": f"审查引擎返回格式异常，原始响应:\n{raw_text[:2000]}",
            "risk_score": None,
            "recommendations": [],
            "missing_clauses": [],
        }
    except Exception as e:
        logger.error(f"AI contract review call failed: {e}")
        return {
            "report": f"审查服务暂时不可用，请稍后重试。",
            "risk_items": [],
            "risk_score": None,
        }

    # Validate risk items from LLM output
    risk_items = _validate_risk_items(result.get("risk_items", []))

    # Sanitize risk_score
    try:
        risk_score = float(result.get("risk_score", 0))
        risk_score = max(0, min(100, risk_score))
    except (TypeError, ValueError):
        risk_score = None

    result["risk_items"] = risk_items
    result["risk_score"] = risk_score

    report = _build_report(result)
    return {
        "report": report,
        "risk_items": risk_items,
        "risk_score": risk_score,
    }


def _build_report(result: dict) -> str:
    """将审查结果转为可读的报告文本"""
    parts = []

    summary = result.get("summary", "")
    score = result.get("risk_score")
    if score is not None:
        level = "低风险" if score < 30 else "中等风险" if score < 60 else "高风险" if score < 80 else "极高风险"
        parts.append(f"# 合同审查报告\n")
        parts.append(f"**风险等级**: {level}（评分: {score}/100）\n")
    parts.append(f"\n{summary}\n")

    # Risk items grouped by dimension
    risk_items = result.get("risk_items", [])
    if risk_items:
        parts.append("\n---\n\n## 风险项详情\n")

        high_items = [r for r in risk_items if r.get("level") == "high"]
        medium_items = [r for r in risk_items if r.get("level") == "medium"]
        low_items = [r for r in risk_items if r.get("level") == "low"]

        for level_name, items in [("高风险", high_items), ("中等风险", medium_items), ("低风险", low_items)]:
            if not items:
                continue
            parts.append(f"\n### {level_name}\n")
            for i, item in enumerate(items, 1):
                dim = REVIEW_DIMENSIONS.get(item.get("dimension", ""), item.get("dimension", ""))
                parts.append(f"\n**{i}. [{dim}]** {item.get('issue', '')}\n")
                clause = item.get("clause", "")
                if clause:
                    parts.append(f"> 相关条款: {clause}\n")
                suggestion = item.get("suggestion", "")
                if suggestion:
                    parts.append(f"- 修改建议: {suggestion}\n")

    # Missing clauses
    missing = result.get("missing_clauses", [])
    if missing:
        parts.append("\n---\n\n## 缺少的必要条款\n")
        for m in missing:
            parts.append(f"- {m}\n")

    # Recommendations
    recs = result.get("recommendations", [])
    if recs:
        parts.append("\n---\n\n## 综合建议\n")
        for r in recs:
            parts.append(f"- {r}\n")

    return "\n".join(parts)
