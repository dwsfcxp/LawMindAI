"""共享LLM客户端工厂 — 支持 Anthropic 和 OpenAI 两种协议"""

import anthropic
import openai


def _is_openai_compatible(base_url: str) -> bool:
    """判断 base_url 是否为 OpenAI 兼容协议。"""
    url = base_url.lower().rstrip("/")
    # 明确的 Anthropic 端点用 Anthropic SDK
    if "anthropic.com" in url or "/api/anthropic" in url:
        return False
    # 其余全部走 OpenAI 兼容（智谱、通义、文心、Kimi、DeepSeek、OpenAI、Gemini、Mistral）
    return True


def create_llm_client(base_url: str, api_key: str):
    """根据 base_url 自动选择 Anthropic 或 OpenAI 客户端。"""
    if not base_url or _is_openai_compatible(base_url):
        # OpenAI 兼容协议
        return OpenAICompatClient(base_url, api_key)
    else:
        # Anthropic 原生协议
        return anthropic.AsyncAnthropic(base_url=base_url, api_key=api_key)


def create_llm_client_from_settings(settings):
    """从 Settings 对象创建客户端。"""
    return create_llm_client(settings.CLAUDE_BASE_URL, settings.CLAUDE_API_KEY)


class OpenAICompatClient:
    """包装 OpenAI SDK，提供与 Anthropic SDK 一致的 messages.create 接口。"""

    def __init__(self, base_url: str, api_key: str):
        self._client = openai.AsyncOpenAI(
            api_key=api_key,
            base_url=base_url or None,
        )
        self.messages = _MessagesShim(self._client)


class _MessagesShim:
    def __init__(self, client: openai.AsyncOpenAI):
        self._client = client

    async def create(self, model: str, max_tokens: int, messages: list[dict], **kwargs) -> "_MessageResponse":
        # system 提取 — 支持 messages 内的 system 角色和 kwargs 中的 system 参数
        system = kwargs.get("system") or kwargs.get("system_message")
        chat_msgs = []
        for m in messages:
            if m.get("role") == "system":
                system = m["content"]
            else:
                chat_msgs.append(m)

        # 处理 multimodal content (图片等)
        formatted = []
        for m in chat_msgs:
            content = m.get("content", "")
            if isinstance(content, list):
                # Anthropic 格式的 multimodal -> OpenAI 格式
                parts = []
                for block in content:
                    if block.get("type") == "text":
                        parts.append({"type": "text", "text": block["text"]})
                    elif block.get("type") == "image":
                        img = block.get("image", block.get("source", {}))
                        url = img.get("url")
                        if not url:
                            b64 = img.get("data")
                            mt = img.get("media_type", "image/png")
                            url = f"data:{mt};base64,{b64}"
                        parts.append({"type": "image_url", "image_url": {"url": url}})
                formatted.append({"role": m["role"], "content": parts})
            else:
                formatted.append({"role": m["role"], "content": content})

        call_kwargs = {
            "model": model,
            "messages": formatted,
            "max_tokens": max_tokens,
        }
        if system:
            call_kwargs["messages"] = [{"role": "system", "content": system}] + call_kwargs["messages"]

        resp = await self._client.chat.completions.create(**call_kwargs)
        text = resp.choices[0].message.content or ""
        return _MessageResponse(text)


class _MessageResponse:
    def __init__(self, text: str):
        self.content = [_ContentBlock(text)]


class _ContentBlock:
    def __init__(self, text: str):
        self.text = text
