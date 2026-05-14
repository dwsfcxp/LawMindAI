"""LawMind AI MCP Server — 将核心能力暴露为MCP工具，支持Claude Desktop/Code调用"""

import asyncio
import logging
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp import types

logger = logging.getLogger(__name__)

app = Server("lawmind-ai")


def _get_services():
    """延迟导入避免循环依赖"""
    from app.config import get_settings
    from app.services.llm_client import create_llm_client_from_settings
    settings = get_settings()
    client = create_llm_client_from_settings(settings)
    return settings, client


@app.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="lawmind_search_law",
            description="搜索中国法律法规。输入关键词，返回相关法条、司法解释等。",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词（中文）"},
                },
                "required": ["query"],
            },
        ),
        types.Tool(
            name="lawmind_generate_document",
            description="AI生成法律文书。输入案情描述和文书类型，生成完整的法律文书。",
            inputSchema={
                "type": "object",
                "properties": {
                    "case_facts": {"type": "string", "description": "案情描述（中文）"},
                    "doc_type": {"type": "string", "description": "文书类型: complaint/answer/appeal/agency_opinion/defense_opinion/legal_opinion/lawyer_letter"},
                    "extra_instructions": {"type": "string", "description": "额外指示（可选）"},
                },
                "required": ["case_facts", "doc_type"],
            },
        ),
        types.Tool(
            name="lawmind_review_contract",
            description="AI审查合同。输入合同文本，从合法性/完备性/公平性/明确性/可执行性5个维度进行风险分析。",
            inputSchema={
                "type": "object",
                "properties": {
                    "contract_text": {"type": "string", "description": "合同全文"},
                    "case_context": {"type": "string", "description": "案件背景（可选）"},
                },
                "required": ["contract_text"],
            },
        ),
        types.Tool(
            name="lawmind_analyze_evidence",
            description="AI分析证据材料。输入证据文本和案件背景，从类型/证明力/关联性/真实性/合法性角度分析。",
            inputSchema={
                "type": "object",
                "properties": {
                    "evidence_text": {"type": "string", "description": "证据文字内容"},
                    "case_context": {"type": "string", "description": "案件背景（可选）"},
                },
                "required": ["evidence_text"],
            },
        ),
        types.Tool(
            name="lawmind_cross_examine",
            description="为对方证据生成质证意见。从真实性/合法性/关联性/证明力四维度分析。",
            inputSchema={
                "type": "object",
                "properties": {
                    "evidence_text": {"type": "string", "description": "对方证据文字内容"},
                    "evidence_type": {"type": "string", "description": "证据类型（如：书证/电子数据/证人证言）"},
                    "case_context": {"type": "string", "description": "案件背景"},
                    "our_side": {"type": "string", "description": "我方身份（原告/被告），默认被告"},
                },
                "required": ["evidence_text", "evidence_type"],
            },
        ),
        types.Tool(
            name="lawmind_legal_research",
            description="多源法律研究。综合AI知识、法规检索、案例分析，生成研究报告。",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "研究问题（中文）"},
                },
                "required": ["query"],
            },
        ),
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    settings, client = _get_services()
    model = settings.CLAUDE_MODEL

    try:
        if name == "lawmind_search_law":
            return await _search_law(arguments["query"], settings, client, model)

        elif name == "lawmind_generate_document":
            return await _generate_document(arguments, settings, client, model)

        elif name == "lawmind_review_contract":
            return await _review_contract(arguments, settings, client, model)

        elif name == "lawmind_analyze_evidence":
            return await _analyze_evidence(arguments, settings, client, model)

        elif name == "lawmind_cross_examine":
            return await _cross_examine(arguments, settings, client, model)

        elif name == "lawmind_legal_research":
            return await _legal_research(arguments["query"], settings, client, model)

        else:
            return [types.TextContent(type="text", text=f"未知工具: {name}")]

    except Exception as e:
        logger.error(f"MCP tool {name} failed: {e}")
        return [types.TextContent(type="text", text=f"工具调用失败: {e}")]


async def _search_law(query: str, settings, client, model) -> list[types.TextContent]:
    """法规检索"""
    results_text = ""

    # Try Chinese Law MCP
    try:
        from app.services.data_sources.beida_fabao import register_beida_fabao, DataSourceRegistry
        register_beida_fabao()
        adapter = DataSourceRegistry.get("beida_fabao")
        if adapter:
            result = await adapter.search(query, {"limit": 10})
            if result:
                results_text = result.get("text", "") or str(result)
    except Exception:
        pass

    if not results_text:
        # Fallback: use AI knowledge
        response = await client.messages.create(
            model=model,
            max_tokens=4096,
            messages=[{"role": "user", "content": f"请搜索并列出与以下关键词相关的中国法律法规、司法解释，包括具体法条内容：\n\n{query}"}],
        )
        results_text = response.content[0].text if response.content else "未找到相关法规"

    return [types.TextContent(type="text", text=results_text)]


async def _generate_document(args: dict, settings, client, model) -> list[types.TextContent]:
    """文书生成"""
    from app.services.docgen.engine import DocumentGenerationEngine
    engine = DocumentGenerationEngine(settings)
    # Use the engine's generate method directly
    case_facts = args["case_facts"]
    doc_type = args["doc_type"]
    extra = args.get("extra_instructions", "")

    result = await engine.generate_document(
        case_facts=case_facts,
        document_type=doc_type,
        extra_instructions=extra,
    )
    return [types.TextContent(type="text", text=result.get("content", "生成失败"))]

async def _review_contract(args: dict, settings, client, model) -> list[types.TextContent]:
    """合同审查"""
    from app.services.contract.engine import review_contract
    result = await review_contract(
        contract_text=args["contract_text"],
        case_context=args.get("case_context", ""),
    )
    return [types.TextContent(type="text", text=result.get("report", "审查失败"))]


async def _analyze_evidence(args: dict, settings, client, model) -> list[types.TextContent]:
    """证据分析"""
    from app.services.evidence.analysis import analyze_evidence
    result = await analyze_evidence(
        ocr_text=args["evidence_text"],
        case_context=args.get("case_context", ""),
    )
    return [types.TextContent(type="text", text=result)]


async def _cross_examine(args: dict, settings, client, model) -> list[types.TextContent]:
    """质证意见"""
    from app.services.evidence.chain import generate_cross_examination
    result = await generate_cross_examination(
        evidence_text=args["evidence_text"],
        evidence_type=args["evidence_type"],
        case_context=args.get("case_context", ""),
        our_side=args.get("our_side", "被告"),
    )
    return [types.TextContent(type="text", text=result)]


async def _legal_research(query: str, settings, client, model) -> list[types.TextContent]:
    """法律研究"""
    from app.services.research.engine import ResearchEngine
    engine = ResearchEngine(settings)
    result = await engine.research(query, sources=["ai_knowledge"])
    if isinstance(result, dict):
        return [types.TextContent(type="text", text=result.get("report", str(result)))]
    return [types.TextContent(type="text", text=str(result))]


async def run_server():
    """启动MCP Server"""
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())


def main():
    """CLI入口点"""
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_server())


if __name__ == "__main__":
    main()
