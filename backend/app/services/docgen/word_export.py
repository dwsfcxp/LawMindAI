"""Word文档导出 — 符合法院标准格式"""

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


async def export_to_docx(doc_record, output_dir: Path) -> str:
    """将文书导出为符合法院格式要求的Word文档"""
    doc = Document()

    # 设置页面边距
    for section in doc.sections:
        section.top_margin = Cm(COURT_FONT_SETTINGS["margins"][0])
        section.right_margin = Cm(COURT_FONT_SETTINGS["margins"][1])
        section.bottom_margin = Cm(COURT_FONT_SETTINGS["margins"][2])
        section.left_margin = Cm(COURT_FONT_SETTINGS["margins"][3])

    # 添加标题
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run(doc_record.title)
    run.font.size = Pt(COURT_FONT_SETTINGS["title_size"])
    run.font.name = COURT_FONT_SETTINGS["title_font"]
    run._element.rPr.rFonts.set(qn("w:eastAsia"), COURT_FONT_SETTINGS["title_font"])
    run.bold = True

    # 设置标题行间距
    title.paragraph_format.line_spacing = Pt(COURT_FONT_SETTINGS["line_spacing"])
    title.paragraph_format.space_after = Pt(0)
    title.paragraph_format.space_before = Pt(0)

    # 解析正文并添加段落
    content = doc_record.content
    paragraphs = content.split("\n")

    for para_text in paragraphs:
        para_text = para_text.strip()
        if not para_text:
            # 空行保留
            p = doc.add_paragraph()
            p.paragraph_format.line_spacing = Pt(COURT_FONT_SETTINGS["line_spacing"])
            continue

        # 检测是否为小标题（以 # 开头的Markdown标题）
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
        else:
            p = doc.add_paragraph()
            # 处理行内加粗 **text**
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

        # 设置段落格式
        p.paragraph_format.line_spacing = Pt(COURT_FONT_SETTINGS["line_spacing"])
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.first_line_indent = Cm(0.74)  # 两个字符缩进

    # 保存文件
    safe_title = "".join(c for c in doc_record.title if c.isalnum() or c in "（）()—")
    filename = f"{doc_record.id}_{safe_title}.docx"
    filepath = output_dir / filename
    doc.save(str(filepath))

    return str(filepath)
