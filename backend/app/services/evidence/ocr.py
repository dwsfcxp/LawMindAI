"""证据OCR文字提取服务"""

import asyncio
import base64
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {
    ".pdf", ".docx", ".doc", ".txt",
    ".xlsx", ".xls",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff",
    ".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac", ".wma",
}

AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac", ".wma"}


def validate_file_type(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS


async def extract_text(file_path: Path, llm_client=None, model: str = "glm-5.1") -> str:
    """从文件中提取文字内容。"""
    suffix = file_path.suffix.lower()
    try:
        if suffix == ".pdf":
            return await _extract_pdf(file_path)
        elif suffix == ".docx":
            return await _extract_docx(file_path)
        elif suffix == ".doc":
            return await _extract_doc(file_path)
        elif suffix in (".xlsx", ".xls"):
            return await _extract_excel(file_path)
        elif suffix == ".txt":
            return file_path.read_text(encoding="utf-8", errors="ignore")
        elif suffix in (".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff"):
            return await _extract_image(file_path, llm_client, model)
        elif suffix in AUDIO_EXTENSIONS:
            return await _extract_audio(file_path, llm_client, model)
        return ""
    except Exception as e:
        logger.warning(f"OCR extraction failed for {file_path}: {e}")
        return f"[文字提取失败: {e}]"


async def _extract_pdf(file_path: Path) -> str:
    def _sync():
        import pypdf
        reader = pypdf.PdfReader(str(file_path))
        texts = []
        for page in reader.pages:
            t = page.extract_text()
            if t:
                texts.append(t.strip())
        return "\n\n".join(texts) if texts else "[PDF为扫描件，需要OCR识别]"
    return await asyncio.to_thread(_sync)


async def _extract_docx(file_path: Path) -> str:
    def _sync():
        from docx import Document
        doc = Document(str(file_path))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    return await asyncio.to_thread(_sync)


async def _extract_doc(file_path: Path) -> str:
    """提取 .doc 文件文字（尝试用 python-docx 兼容读取，若失败则提示）。"""
    try:
        return await _extract_docx(file_path)
    except Exception:
        return "[.doc 格式暂不支持直接解析，请转换为 .docx 后上传]"


async def _extract_excel(file_path: Path) -> str:
    """提取 Excel 文件文字内容。"""
    def _sync():
        import openpyxl
        wb = openpyxl.load_workbook(str(file_path), read_only=True, data_only=True)
        texts = []
        for sheet in wb.worksheets:
            texts.append(f"=== {sheet.title} ===")
            for row in sheet.iter_rows(values_only=True):
                cells = [str(c) if c is not None else "" for c in row]
                if any(cells):
                    texts.append("\t".join(cells))
        wb.close()
        return "\n".join(texts)
    return await asyncio.to_thread(_sync)


async def _extract_image(file_path: Path, llm_client, model: str) -> str:
    """使用LLM视觉能力从图片中提取文字。"""
    if llm_client is None:
        return "[图片OCR需要配置LLM]"

    image_data = file_path.read_bytes()
    b64 = base64.b64encode(image_data).decode("utf-8")

    suffix = file_path.suffix.lower()
    media_type = "image/png"
    if suffix in (".jpg", ".jpeg"):
        media_type = "image/jpeg"
    elif suffix == ".bmp":
        media_type = "image/bmp"
    elif suffix == ".tiff":
        media_type = "image/tiff"

    try:
        import anthropic
        response = await llm_client.messages.create(
            model=model,
            max_tokens=4096,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": media_type, "data": b64},
                    },
                    {
                        "type": "text",
                        "text": "请识别并提取这张图片中的所有文字内容，按原文格式输出。如果这是法律文件，请保持原文格式不变。",
                    },
                ],
            }],
        )
        return response.content[0].text if response.content else "[未能识别文字]"
    except Exception as e:
        logger.warning(f"Image OCR via LLM failed: {e}")
        return f"[图片文字提取失败: {e}]"


async def _extract_audio(file_path: Path, llm_client=None, model: str = "glm-5.1") -> str:
    """从音频文件中提取文字 — 优先使用Whisper，回退使用LLM。"""
    # 方案1: 尝试使用OpenAI Whisper API
    try:
        import openai
        from app.config import get_settings
        settings = get_settings()
        if settings.CLAUDE_API_KEY and settings.CLAUDE_BASE_URL:
            client = openai.AsyncOpenAI(
                api_key=settings.CLAUDE_API_KEY,
                base_url=settings.CLAUDE_BASE_URL,
            )
            with open(str(file_path), "rb") as audio_file:
                transcript = await client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    language="zh",
                    response_format="text",
                )
            return transcript if isinstance(transcript, str) else transcript.text
    except Exception as e:
        logger.info(f"Whisper API not available, falling back to LLM: {e}")

    # 方案2: 使用LLM处理（将音频文件大小信息告知LLM，提示用户手动转写）
    def _get_size():
        return file_path.stat().st_size / (1024 * 1024)
    file_size_mb = await asyncio.to_thread(_get_size)
    suffix = file_path.suffix.lower()
    return (
        f"[音频文件: {suffix}格式, {file_size_mb:.1f}MB]\n"
        f"提示：当前LLM不支持直接处理音频。请使用以下方式之一：\n"
        f"1. 配置支持Whisper API的LLM服务（如OpenAI）以启用自动语音转文字\n"
        f"2. 手动将音频转为文字后粘贴到文本框中\n"
        f"3. 使用第三方语音转文字工具处理后上传文本文件"
    )
