"""共享LLM客户端工厂"""

import anthropic


def create_llm_client(base_url: str, api_key: str) -> anthropic.AsyncAnthropic:
    """根据配置创建 Anthropic 兼容的异步客户端。"""
    kwargs = {}
    if base_url:
        kwargs["base_url"] = base_url
        kwargs["auth_token"] = api_key
    else:
        kwargs["api_key"] = api_key
    return anthropic.AsyncAnthropic(**kwargs)


def create_llm_client_from_settings(settings) -> anthropic.AsyncAnthropic:
    """从 Settings 对象创建客户端。"""
    return create_llm_client(settings.CLAUDE_BASE_URL, settings.CLAUDE_API_KEY)
