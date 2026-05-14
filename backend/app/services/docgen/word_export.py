"""Word文档导出 — 符合法院标准格式"""

import asyncio
import re
from pathlib import Path
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn


COURT_FONT_SETTINGS = {
    "title_font": "方正小标宋简体",
    "body_font": "仿宋_GB2312",
    "body_font_fallback": "仿宋",
    "title_size": 22,  # 小二号
    "body_size": 16,   # 三号
    "line_spacing": 28,  # 固定值28磅
    "margins": (3.7, 2.8, 3.5, 2.6),  # 上右下左 cm
}


def _setup_page(doc: Document):
    for section in doc.sections:
        section.top_margin = Cm(COURT_FONT_SETTINGS["margins"][0])
        section.right_margin = Cm(COURT_FONT_SETTINGS["margins"][1])
        section.bottom_margin = Cm(COURT_FONT_SETTINGS["margins"][2])
        section.left_margin = Cm(COURT_FONT_SETTINGS["margins"][3])


def _add_title(doc: Document, text: str):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(text)
    run.font.size = Pt(COURT_FONT_SETTINGS["title_size"])
    run.font.name = COURT_FONT_SETTINGS["title_font"]
    run._element.rPr.rFonts.set(qn("w:eastAsia"), COURT_FONT_SETTINGS["title_font"])
    run.bold = True
    p.paragraph_format.line_spacing = Pt(COURT_FONT_SETTINGS["line_spacing"])
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.space_before = Pt(0)


def _add_markdown_paragraphs(doc: Document, content: str, first_line_indent: bool = True):
    """将 Markdown 文本解析为 Word 段落，复用于文书和研究报告导出。"""
    for para_text in content.split("\n"):
        para_text = para_text.strip()
        if not para_text:
            p = doc.add_paragraph()
            p.paragraph_format.line_spacing = Pt(COURT_FONT_SETTINGS["line_spacing"])
            continue

        if para_text.startswith("# "):
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run(para_text[2:])
            run.font.size = Pt(COURT_FONT_SETTINGS["body_size"] + 2)
            run.bold = True
        elif para_text.startswith("## "):
            p = doc.add_paragraph()
            run = p.add_run(para_text[3:])
            run.font.size = Pt(COURT_FONT_SETTINGS["body_size"])
            run.bold = True
        elif para_text.startswith("### "):
            p = doc.add_paragraph()
            run = p.add_run(para_text[4:])
            run.font.size = Pt(COURT_FONT_SETTINGS["body_size"])
            run.bold = True
        else:
            p = doc.add_paragraph()
            parts = para_text.split("**")
            for i, part in enumerate(parts):
                if part:
                    run = p.add_run(part)
                    run.font.size = Pt(COURT_FONT_SETTINGS["body_size"])
                    run.font.name = COURT_FONT_SETTINGS["body_font_fallback"]
                    run._element.rPr.rFonts.set(
                        qn("w:eastAsia"), COURT_FONT_SETTINGS["body_font"]
                    )
                    if i % 2 == 1:
                        run.bold = True

        p.paragraph_format.line_spacing = Pt(COURT_FONT_SETTINGS["line_spacing"])
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.space_before = Pt(0)
        if first_line_indent:
            p.paragraph_format.first_line_indent = Cm(0.74)


async def export_to_docx(doc_record, output_dir: Path) -> str:
    """将文书导出为符合法院格式要求的Word文档"""
    doc = Document()
    _setup_page(doc)
    _add_title(doc, doc_record.title)
    _add_markdown_paragraphs(doc, doc_record.content, first_line_indent=True)

    safe_title = "".join(c for c in doc_record.title if c.isalnum() or c in "（）()—")
    filename = f"{doc_record.id}_{safe_title}.docx"
    filepath = output_dir / filename
    await asyncio.to_thread(doc.save, str(filepath))
    return str(filepath)


async def export_research_to_docx(report_record, output_dir: Path) -> str:
    """将研究报告导出为Word文档"""
    doc = Document()
    _setup_page(doc)
    _add_title(doc, f"法律研究报告：{report_record.query}")

    # 元信息
    meta = doc.add_paragraph()
    meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = meta.add_run(f"生成时间：{report_record.created_at.strftime('%Y-%m-%d %H:%M')}　来源：{'、'.join(report_record.sources_used)}")
    run.font.size = Pt(12)
    run.font.name = COURT_FONT_SETTINGS["body_font_fallback"]
    run._element.rPr.rFonts.set(qn("w:eastAsia"), COURT_FONT_SETTINGS["body_font"])
    run.font.color.rgb = RGBColor(128, 128, 128)
    meta.paragraph_format.line_spacing = Pt(COURT_FONT_SETTINGS["line_spacing"])
    meta.paragraph_format.space_after = Pt(12)

    _add_markdown_paragraphs(doc, report_record.report, first_line_indent=False)

    safe_query = "".join(c for c in report_record.query[:30] if c.isalnum() or c in "（）()—")
    filename = f"research_{report_record.id}_{safe_query}.docx"
    filepath = output_dir / filename
    await asyncio.to_thread(doc.save, str(filepath))
    return str(filepath)
