"""HTML导出 — 严格仿宋字体法院标准排版

排版参数与Word导出保持一致：
- 页边距：上3.7cm 下3.5cm 左2.8cm 右2.6cm
- 标题：方正小标宋 22pt
- 正文：仿宋_GB2312 16pt
- 行距：28.8pt
- 首行缩进：0.74cm（约2字符）
- 一级标题：黑体 16pt
- 二级标题：楷体 16pt
- 页码：底部居中"— X —"
"""

import asyncio
import re
from pathlib import Path


async def export_to_html(doc, output_dir: Path) -> str:
    """将文书内容导出为法院标准排版的HTML文件。"""
    title = doc.title or "法律文书"
    content = doc.content or ""

    # Markdown -> HTML 转换
    html_body = _markdown_to_html(content)

    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{_escape(title)}</title>
<style>
  @page {{
    size: A4;
    margin: 3.7cm 2.6cm 3.5cm 2.8cm;
    @bottom-center {{
      content: "— " counter(page) " —";
      font-family: "Times New Roman", serif;
      font-size: 10pt;
    }}
  }}
  body {{
    font-family: "FangSong_GB2312", "仿宋_GB2312", "FangSong", "仿宋", "STFangsong", serif;
    font-size: 16pt;
    line-height: 28.8pt;
    color: #000;
    max-width: 210mm;
    margin: 0 auto;
    padding: 3.7cm 2.6cm 3.5cm 2.8cm;
  }}
  h1 {{
    font-family: "FZXiaoBiaoSong-B05S", "方正小标宋简体", "方正小标宋", "SimSun", "宋体", serif;
    font-size: 22pt;
    text-align: center;
    line-height: 28.8pt;
    margin-bottom: 24pt;
    font-weight: bold;
  }}
  h2 {{
    font-family: "黑体", "SimHei", "STHeiti", sans-serif;
    font-size: 16pt;
    font-weight: bold;
    margin-top: 18pt;
    margin-bottom: 6pt;
    line-height: 28.8pt;
  }}
  h3 {{
    font-family: "楷体", "KaiTi", "STKaiti", serif;
    font-size: 16pt;
    font-weight: bold;
    margin-top: 12pt;
    margin-bottom: 6pt;
    line-height: 28.8pt;
  }}
  p {{
    text-indent: 0.74cm;
    margin: 0 0 0 0;
    text-align: justify;
    line-height: 28.8pt;
  }}
  .no-indent {{
    text-indent: 0;
  }}
  .center {{
    text-align: center;
    text-indent: 0;
  }}
  strong {{
    font-weight: bold;
  }}
  table {{
    border-collapse: collapse;
    width: 100%;
    margin: 12pt 0;
    font-size: 14pt;
  }}
  th, td {{
    border: 1px solid #000;
    padding: 6pt 8pt;
    text-align: left;
    vertical-align: top;
  }}
  th {{
    font-weight: bold;
    background-color: #f5f5f5;
  }}
  ol {{
    padding-left: 1.5cm;
    margin: 0;
  }}
  ul {{
    list-style: none;
    padding-left: 0.74cm;
    margin: 0;
  }}
  li {{
    margin-bottom: 3pt;
    text-indent: 0;
  }}
  @media print {{
    body {{
      padding: 0;
    }}
  }}
</style>
</head>
<body>
<h1>{_escape(title)}</h1>
{html_body}
</body>
</html>"""

    filename = f"{doc.id}_{_safe_filename(title)}.html"
    filepath = output_dir / filename
    await asyncio.to_thread(filepath.write_text, html, "utf-8")
    return str(filepath)


def _markdown_to_html(text: str) -> str:
    """将Markdown文本转换为HTML，支持标题、列表、表格、加粗。"""
    lines = text.split("\n")
    html_parts = []
    in_list = False
    list_type = None  # 'ul' or 'ol'

    i = 0
    while i < len(lines):
        stripped = lines[i].strip()

        if not stripped:
            if in_list:
                html_parts.append(f"</{list_type}>")
                in_list = False
                list_type = None
            # 空行 -> 空段落（保持间距）
            html_parts.append('<p class="no-indent">&nbsp;</p>')
            i += 1
            continue

        # 标题
        if stripped.startswith("### "):
            if in_list:
                html_parts.append(f"</{list_type}>")
                in_list = False
                list_type = None
            html_parts.append(f"<h3>{_format_inline(stripped[4:])}</h3>")
            i += 1
            continue
        elif stripped.startswith("## "):
            if in_list:
                html_parts.append(f"</{list_type}>")
                in_list = False
                list_type = None
            html_parts.append(f"<h2>{_format_inline(stripped[3:])}</h2>")
            i += 1
            continue
        elif stripped.startswith("# "):
            if in_list:
                html_parts.append(f"</{list_type}>")
                in_list = False
                list_type = None
            html_parts.append(f'<h1 class="center">{_format_inline(stripped[2:])}</h1>')
            i += 1
            continue

        # 表格
        if stripped.startswith("|") and "|" in stripped[1:]:
            if in_list:
                html_parts.append(f"</{list_type}>")
                in_list = False
                list_type = None
            table_html, rows_consumed = _parse_table(lines, i)
            html_parts.append(table_html)
            i += rows_consumed
            continue

        # 有序列表
        ordered_match = re.match(r'^(\d+)[.、)]\s(.*)', stripped)
        if ordered_match:
            if in_list and list_type != 'ol':
                html_parts.append(f"</{list_type}>")
                in_list = False
                list_type = None
            if not in_list:
                html_parts.append('<ol>')
                in_list = True
                list_type = 'ol'
            html_parts.append(f"<li>{_format_inline(ordered_match.group(2))}</li>")
            i += 1
            continue

        # 无序列表
        if re.match(r'^[-*]\s', stripped):
            if in_list and list_type != 'ul':
                html_parts.append(f"</{list_type}>")
                in_list = False
                list_type = None
            if not in_list:
                html_parts.append('<ul>')
                in_list = True
                list_type = 'ul'
            html_parts.append(f"<li>{_format_inline(stripped[2:])}</li>")
            i += 1
            continue

        # 普通段落
        if in_list:
            html_parts.append(f"</{list_type}>")
            in_list = False
            list_type = None
        html_parts.append(f"<p>{_format_inline(stripped)}</p>")
        i += 1

    if in_list:
        html_parts.append(f"</{list_type}>")

    return "\n".join(html_parts)


def _parse_table(lines: list[str], start_idx: int) -> tuple[str, int]:
    """解析Markdown表格并返回HTML表格和消耗的行数。"""
    table_lines = []
    j = start_idx
    while j < len(lines) and lines[j].strip().startswith("|") and "|" in lines[j].strip()[1:]:
        stripped_line = lines[j].strip()
        # 跳过分隔行
        if re.match(r'^\|[\s\-:|]+\|$', stripped_line):
            j += 1
            continue
        cells = [c.strip() for c in stripped_line.split("|")[1:-1]]
        table_lines.append(cells)
        j += 1

    if not table_lines:
        return ("<p></p>", 1)

    max_cols = max(len(row) for row in table_lines) if table_lines else 0
    html_parts = ['<table>']

    for row_idx, row in enumerate(table_lines):
        tag = 'th' if row_idx == 0 else 'td'
        cells_html = ""
        for col_idx in range(max_cols):
            cell_text = row[col_idx] if col_idx < len(row) else ""
            cells_html += f"<{tag}>{_format_inline(cell_text)}</{tag}>"
        html_parts.append(f"<tr>{cells_html}</tr>")

    html_parts.append('</table>')
    return ("\n".join(html_parts), j - start_idx)


def _format_inline(text: str) -> str:
    """处理行内格式：加粗、斜体。"""
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'__(.+?)__', r'<strong>\1</strong>', text)
    text = re.sub(r'\*(.+?)\*', r'<em>\1</em>', text)
    return text


def _escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _safe_filename(title: str) -> str:
    return re.sub(r'[^\w一-鿿]', '_', title)[:50]
