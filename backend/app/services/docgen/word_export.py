"""Word文档导出 — 严格符合中国法院文书标准格式

排版规范：
- 纸张：A4
- 页边距：上3.7cm 下3.5cm 左2.8cm 右2.6cm
- 标题：方正小标宋简体 22pt（小二号）
- 正文：仿宋_GB2312 16pt（三号），回退仿宋
- 一级标题（##）：黑体 16pt（三号）加粗
- 二级标题（###）：楷体 16pt（三号）加粗
- 行距：固定值28.8pt
- 首行缩进：2字符（约0.74cm）
- 页码：底部居中
"""

import asyncio
import re
import logging
from pathlib import Path
from docx import Document
from docx.shared import Pt, Cm, RGBColor, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

logger = logging.getLogger(__name__)

# 法院标准排版参数
COURT_FONT_SETTINGS = {
    "title_font": "方正小标宋简体",
    "title_font_alt": "FZXiaoBiaoSong-B05S",
    "heading1_font": "黑体",
    "heading2_font": "楷体",
    "body_font": "仿宋_GB2312",
    "body_font_fallback": "仿宋",
    "body_font_en": "Times New Roman",
    "title_size": 22,       # 小二号
    "body_size": 16,        # 三号
    "heading_size": 16,     # 三号
    "line_spacing": 28.8,   # 固定值28.8磅
    "first_line_indent": 0.74,  # 2字符 ≈ 0.74cm（三号字）
    # 页边距：上、右、下、左（cm）
    "margin_top": 3.7,
    "margin_right": 2.6,
    "margin_bottom": 3.5,
    "margin_left": 2.8,
}


def _setup_page(doc: Document):
    """设置页面格式：法院标准A4页边距。"""
    for section in doc.sections:
        section.page_width = Cm(21.0)    # A4
        section.page_height = Cm(29.7)   # A4
        section.top_margin = Cm(COURT_FONT_SETTINGS["margin_top"])
        section.bottom_margin = Cm(COURT_FONT_SETTINGS["margin_bottom"])
        section.left_margin = Cm(COURT_FONT_SETTINGS["margin_left"])
        section.right_margin = Cm(COURT_FONT_SETTINGS["margin_right"])

        # 设置页码（底部居中）
        _add_page_number(section)


def _add_page_number(section):
    """添加页码（底部居中），格式为"— 1 —"。"""
    footer = section.footer
    footer.is_linked_to_previous = False
    p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER

    # 段落格式
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)

    # 添加"— "前缀
    run_prefix = p.add_run("— ")
    run_prefix.font.size = Pt(10)
    run_prefix.font.name = "Times New Roman"

    # 添加页码域代码
    fld_char_begin = OxmlElement("w:fldChar")
    fld_char_begin.set(qn("w:fldCharType"), "begin")
    run_field = p.add_run()
    run_field._element.append(fld_char_begin)

    instr_text = OxmlElement("w:instrText")
    instr_text.set(qn("xml:space"), "preserve")
    instr_text.text = " PAGE "
    run_instr = p.add_run()
    run_instr._element.append(instr_text)

    fld_char_end = OxmlElement("w:fldChar")
    fld_char_end.set(qn("w:fldCharType"), "end")
    run_end = p.add_run()
    run_end._element.append(fld_char_end)

    # 添加" —"后缀
    run_suffix = p.add_run(" —")
    run_suffix.font.size = Pt(10)
    run_suffix.font.name = "Times New Roman"


def _set_run_font(run, font_name: str, size_pt: float, bold: bool = False, east_asia: str | None = None):
    """统一设置run的字体属性。"""
    run.font.size = Pt(size_pt)
    run.font.name = COURT_FONT_SETTINGS["body_font_en"]
    run.bold = bold

    east_asia_font = east_asia or font_name
    r = run._element
    rPr = r.find(qn("w:rPr"))
    if rPr is None:
        rPr = OxmlElement("w:rPr")
        r.insert(0, rPr)

    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.insert(0, rFonts)

    rFonts.set(qn("w:eastAsia"), east_asia_font)
    rFonts.set(qn("w:ascii"), COURT_FONT_SETTINGS["body_font_en"])
    rFonts.set(qn("w:hAnsi"), COURT_FONT_SETTINGS["body_font_en"])


def _set_paragraph_format(p, first_line_indent: bool = True, alignment=None, line_spacing: float | None = None):
    """统一设置段落格式。"""
    ls = line_spacing or COURT_FONT_SETTINGS["line_spacing"]
    p.paragraph_format.line_spacing = Pt(ls)
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.space_before = Pt(0)
    if alignment is not None:
        p.alignment = alignment
    if first_line_indent:
        p.paragraph_format.first_line_indent = Cm(COURT_FONT_SETTINGS["first_line_indent"])


def _add_title(doc: Document, text: str):
    """添加文书标题：方正小标宋 22pt，居中。"""
    p = doc.add_paragraph()
    _set_paragraph_format(p, first_line_indent=False, alignment=WD_ALIGN_PARAGRAPH.CENTER)

    run = p.add_run(text)
    _set_run_font(run, COURT_FONT_SETTINGS["title_font"], COURT_FONT_SETTINGS["title_size"], bold=True,
                  east_asia=COURT_FONT_SETTINGS["title_font"])

    # 标题后空一行
    empty_p = doc.add_paragraph()
    _set_paragraph_format(empty_p, first_line_indent=False)


def _parse_inline_formatting(p, text: str):
    """解析并添加行内格式（加粗）到段落。"""
    parts = text.split("**")
    for i, part in enumerate(parts):
        if not part:
            continue
        run = p.add_run(part)
        is_bold = (i % 2 == 1)
        _set_run_font(run, COURT_FONT_SETTINGS["body_font"], COURT_FONT_SETTINGS["body_size"], bold=is_bold,
                      east_asia=COURT_FONT_SETTINGS["body_font"])


def _add_markdown_paragraphs(doc: Document, content: str, first_line_indent: bool = True):
    """将 Markdown 文本解析为 Word 段落，严格遵循法院标准排版。

    解析规则：
    - # → 标题级别（居中，方正小标宋）
    - ## → 一级标题（黑体加粗，不缩进）
    - ### → 二级标题（楷体加粗，不缩进）
    - **粗体** → 加粗
    - 普通段落 → 仿宋，首行缩进2字符
    - 空行 → 空段落（保持行距）
    """
    lines = content.split("\n")
    i = 0
    in_list = False

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # 空行
        if not stripped:
            if in_list:
                in_list = False
            p = doc.add_paragraph()
            _set_paragraph_format(p, first_line_indent=False)
            i += 1
            continue

        # 标题级别（#）— 居中
        if stripped.startswith("### "):
            in_list = False
            p = doc.add_paragraph()
            _set_paragraph_format(p, first_line_indent=False)
            _parse_inline_formatting(p, stripped[4:])
            # 设置为楷体
            for run in p.runs:
                _set_run_font(run, COURT_FONT_SETTINGS["heading2_font"],
                              COURT_FONT_SETTINGS["heading_size"], bold=True,
                              east_asia=COURT_FONT_SETTINGS["heading2_font"])
            i += 1
            continue

        if stripped.startswith("## "):
            in_list = False
            p = doc.add_paragraph()
            _set_paragraph_format(p, first_line_indent=False)
            _parse_inline_formatting(p, stripped[3:])
            # 设置为黑体
            for run in p.runs:
                _set_run_font(run, COURT_FONT_SETTINGS["heading1_font"],
                              COURT_FONT_SETTINGS["heading_size"], bold=True,
                              east_asia=COURT_FONT_SETTINGS["heading1_font"])
            i += 1
            continue

        if stripped.startswith("# "):
            in_list = False
            p = doc.add_paragraph()
            _set_paragraph_format(p, first_line_indent=False, alignment=WD_ALIGN_PARAGRAPH.CENTER)
            _parse_inline_formatting(p, stripped[2:])
            for run in p.runs:
                _set_run_font(run, COURT_FONT_SETTINGS["title_font"],
                              COURT_FONT_SETTINGS["title_size"], bold=True,
                              east_asia=COURT_FONT_SETTINGS["title_font"])
            i += 1
            continue

        # 有序列表（数字. 或 数字、或 数字)）
        ordered_match = re.match(r'^(\d+)[.、)]\s*(.*)', stripped)
        if ordered_match:
            in_list = False
            num = ordered_match.group(1)
            rest = ordered_match.group(2)
            p = doc.add_paragraph()
            indent = first_line_indent
            _set_paragraph_format(p, first_line_indent=indent)
            # 编号部分
            num_run = p.add_run(f"{num}. ")
            _set_run_font(num_run, COURT_FONT_SETTINGS["body_font"], COURT_FONT_SETTINGS["body_size"])
            # 内容部分
            _parse_inline_formatting(p, rest)
            i += 1
            continue

        # 无序列表（- 或 *）
        if re.match(r'^[-*]\s', stripped):
            in_list = True
            content_text = stripped[2:]
            p = doc.add_paragraph()
            _set_paragraph_format(p, first_line_indent=first_line_indent)
            bullet_run = p.add_run("• ")
            _set_run_font(bullet_run, COURT_FONT_SETTINGS["body_font"], COURT_FONT_SETTINGS["body_size"])
            _parse_inline_formatting(p, content_text)
            i += 1
            continue

        # 表格行检测（| 分隔）
        if stripped.startswith("|") and "|" in stripped[1:]:
            in_list = False
            # 收集连续表格行
            table_lines = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                stripped_line = lines[i].strip()
                # 跳过分隔行
                if re.match(r'^\|[\s\-:|]+\|$', stripped_line):
                    i += 1
                    continue
                cells = [c.strip() for c in stripped_line.split("|")[1:-1]]
                table_lines.append(cells)
                i += 1

            if table_lines:
                max_cols = max(len(row) for row in table_lines)
                table = doc.add_table(rows=len(table_lines), cols=max_cols)
                table.style = 'Table Grid'
                for row_idx, row_data in enumerate(table_lines):
                    for col_idx, cell_text in enumerate(row_data):
                        if col_idx < max_cols:
                            cell = table.cell(row_idx, col_idx)
                            cell.text = ""
                            p = cell.paragraphs[0]
                            _set_paragraph_format(p, first_line_indent=False)
                            run = p.add_run(cell_text)
                            _set_run_font(run, COURT_FONT_SETTINGS["body_font"],
                                          COURT_FONT_SETTINGS["body_size"],
                                          bold=(row_idx == 0))
            continue

        # 普通段落
        in_list = False
        p = doc.add_paragraph()
        _set_paragraph_format(p, first_line_indent=first_line_indent)
        _parse_inline_formatting(p, stripped)
        i += 1


async def export_to_docx(doc_record, output_dir: Path) -> str:
    """将文书导出为符合法院格式要求的Word文档"""
    doc = Document()
    _setup_page(doc)
    _add_title(doc, doc_record.title)
    _add_markdown_paragraphs(doc, doc_record.content, first_line_indent=True)

    safe_title = "".join(c for c in doc_record.title if c.isalnum() or c in "（）()—_")
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
    r = run._element
    rPr = r.find(qn("w:rPr"))
    if rPr is None:
        rPr = OxmlElement("w:rPr")
        r.insert(0, rPr)
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.insert(0, rFonts)
    rFonts.set(qn("w:eastAsia"), COURT_FONT_SETTINGS["body_font"])
    run.font.color.rgb = RGBColor(128, 128, 128)
    _set_paragraph_format(meta, first_line_indent=False)

    _add_markdown_paragraphs(doc, report_record.report, first_line_indent=False)

    safe_query = "".join(c for c in report_record.query[:30] if c.isalnum() or c in "（）()—_")
    filename = f"research_{report_record.id}_{safe_query}.docx"
    filepath = output_dir / filename
    await asyncio.to_thread(doc.save, str(filepath))
    return str(filepath)
