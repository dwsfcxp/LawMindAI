"""证据OCR文字提取服务"""

import base64
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".png", ".jpg", ".jpeg", ".bmp", ".tiff"}


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
        elif suffix == ".txt":
            return file_path.read_text(encoding="utf-8", errors="ignore")
        elif suffix in (".png", ".jpg", ".jpeg", ".bmp", ".tiff"):
            return await _extract_image(file_path, llm_client, model)
        return ""
    except Exception as e:
        logger.warning(f"OCR extraction failed for {file_path}: {e}")
        return f"[文字提取失败: {e}]"


async def _extract_pdf(file_path: Path) -> str:
    import pypdf
    reader = pypdf.PdfReader(str(file_path))
    texts = []
    for page in reader.pages:
        t = page.extract_text()
        if t:
            texts.append(t.strip())
    if texts:
        return "\n\n".join(texts)
    return "[PDF为扫描件，需要OCR识别]"


async def _extract_docx(file_path: Path) -> str:
    from docx import Document
    doc = Document(str(file_path))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


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
