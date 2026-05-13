"""北大法宝MCP适配器 — 通过chinese-law MCP工具检索法规和案例"""

async def search_law_via_mcp(query: str, limit: int = 10) -> list[dict]:
    """通过chinese-law MCP search_legislation 工具检索法规"""
    try:
        # 使用MCP工具直接调用（在同进程中）
        import subprocess
        result = subprocess.run(
            ["npx", "-y", "@ansvar/chinese-law-mcp", "search", query, "--limit", str(limit)],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0:
            import json
            return json.loads(result.stdout)
    except Exception:
        pass

    # Fallback: 返回空结果（MCP不可用时由Claude API内置知识补充）
    return []


async def search_case_via_mcp(query: str, limit: int = 10) -> list[dict]:
    """检索案例（当前北大法宝MCP主要支持法规，案例检索后续扩展）"""
    # TODO: 集成裁判文书网爬虫
    return []


async def get_provision_via_mcp(document_id: str, article: str = None) -> dict | None:
    """获取具体法条"""
    try:
        import subprocess
        cmd = ["npx", "-y", "@ansvar/chinese-law-mcp", "get", document_id]
        if article:
            cmd.extend(["--article", article])
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            import json
            return json.loads(result.stdout)
    except Exception:
        pass
    return None
