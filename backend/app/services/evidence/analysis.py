"""证据AI分析服务"""

import logging
from app.services.llm_client import create_llm_client_from_settings
from app.config import get_settings

logger = logging.getLogger(__name__)

EVIDENCE_ANALYSIS_PROMPT = """你是一位经验丰富的中国律师，请对以下证据材料进行专业分析。

## 证据内容：
{ocr_text}

## 案件背景：
{case_context}

请从以下角度分析这份证据：
1. **证据类型与形式**：该证据属于何种类型，形式是否符合法定要求
2. **证明力评估**：该证据对案件事实的证明力强弱
3. **关联性分析**：该证据与案件争议焦点的关联程度
4. **真实性判断**：从形式和内容角度判断证据的真实性
5. **合法性审查**：该证据的收集方式是否合法
6. **质证要点**：对方律师可能提出的质证意见及应对建议
7. **补充建议**：是否需要补充其他证据以形成完整证据链

请用专业但易懂的语言进行回答。"""


async def analyze_evidence(ocr_text: str, case_context: str = "", llm_base_url=None, llm_api_key=None, llm_model=None) -> str:
    """使用LLM对证据进行专业法律分析。"""
    if not ocr_text or ocr_text.startswith("["):
        return "无法分析：证据文字提取失败或为空"

    settings = get_settings()
    client = create_llm_client_from_settings(settings)
    model = llm_model or settings.CLAUDE_MODEL

    try:
        response = await client.messages.create(
            model=model,
            max_tokens=4096,
            system="你是一位资深中国执业律师，擅长证据分析和质证。",
            messages=[{
                "role": "user",
                "content": EVIDENCE_ANALYSIS_PROMPT.format(
                    ocr_text=ocr_text[:8000],
                    case_context=case_context or "未提供案件背景信息",
                ),
            }],
        )
        return response.content[0].text if response.content else "分析完成但无结果"
    except Exception as e:
        logger.warning(f"Evidence analysis failed: {e}")
        return f"分析失败: {e}"
