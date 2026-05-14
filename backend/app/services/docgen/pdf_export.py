"""PDF导出 — 基于HTML转PDF"""

import asyncio
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


async def export_to_pdf(doc, output_dir: Path) -> str:
    """将文书内容导出为PDF文件（通过HTML中转）。"""
    from app.services.docgen.html_export import export_to_html

    # 先生成HTML
    html_path = await export_to_html(doc, output_dir)
    html_content = await asyncio.to_thread(Path(html_path).read_text, "utf-8")

    title = doc.title or "法律文书"
    filename = f"{doc.id}_{_safe_filename(title)}.pdf"
    pdf_path = output_dir / filename

    # 尝试使用 weasyprint
    try:
        from weasyprint import HTML
        await asyncio.to_thread(lambda: HTML(string=html_content).write_pdf(str(pdf_path)))
        return str(pdf_path)
    except ImportError:
        logger.warning("weasyprint not installed, trying alternative")
    except Exception as e:
        logger.warning(f"weasyprint failed: {e}")

    # 备选：使用 pdfkit (需要 wkhtmltopdf)
    try:
        import pdfkit
        await asyncio.to_thread(
            pdfkit.from_string,
            html_content,
            str(pdf_path),
            {
                'encoding': 'UTF-8',
                'page-size': 'A4',
                'margin-top': '37mm',
                'margin-right': '28mm',
                'margin-bottom': '35mm',
                'margin-left': '26mm',
            },
        )
        return str(pdf_path)
    except ImportError:
        logger.warning("pdfkit not installed either")
    except Exception as e:
        logger.warning(f"pdfkit failed: {e}")

    # 最终备选：返回HTML文件并重命名
    logger.warning("No PDF converter available, returning HTML instead")
    raise RuntimeError("PDF导出需要安装 weasyprint 或 wkhtmltopdf。请运行: pip install weasyprint")


def _safe_filename(title: str) -> str:
    import re
    return re.sub(r'[^\w一-鿿]', '_', title)[:50]
