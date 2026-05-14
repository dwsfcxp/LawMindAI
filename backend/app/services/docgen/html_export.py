"""HTML导出 — 仿宋字体法院标准排版"""

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
    margin: 3.7cm 2.8cm 3.5cm 2.6cm;
  }}
  body {{
    font-family: "FangSong_GB2312", "仿宋_GB2312", "FangSong", "仿宋", serif;
    font-size: 16pt;
    line-height: 28pt;
    color: #000;
    max-width: 210mm;
    margin: 0 auto;
    padding: 3.7cm 2.8cm 3.5cm 2.6cm;
  }}
  h1 {{
    font-family: "FZXiaoBiaoSong-B05", "方正小标宋", "SimSun", serif;
    font-size: 22pt;
    text-align: center;
    line-height: 36pt;
    margin-bottom: 24pt;
    font-weight: normal;
  }}
  h2 {{
    font-family: "黑体", "SimHei", sans-serif;
    font-size: 16pt;
    font-weight: bold;
    margin-top: 18pt;
    margin-bottom: 12pt;
  }}
  h3 {{
    font-family: "楷体", "KaiTi", serif;
    font-size: 16pt;
    font-weight: bold;
    margin-top: 12pt;
    margin-bottom: 6pt;
  }}
  p {{
    text-indent: 0.74cm;
    margin: 0 0 12pt 0;
    text-align: justify;
  }}
  .no-indent {{
    text-indent: 0;
  }}
  strong {{
    font-weight: bold;
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
    filepath.write_text(html, encoding="utf-8")
    return str(filepath)


def _markdown_to_html(text: str) -> str:
    """将Markdown文本转换为HTML。"""
    lines = text.split("\n")
    html_parts = []
    in_list = False

    for line in lines:
        stripped = line.strip()

        if not stripped:
            if in_list:
                html_parts.append("</ul>")
                in_list = False
            continue

        # 标题
        if stripped.startswith("### "):
            if in_list:
                html_parts.append("</ul>")
                in_list = False
            html_parts.append(f"<h3>{_format_inline(stripped[4:])}</h3>")
        elif stripped.startswith("## "):
            if in_list:
                html_parts.append("</ul>")
                in_list = False
            html_parts.append(f"<h2>{_format_inline(stripped[3:])}</h2>")
        elif stripped.startswith("# "):
            if in_list:
                html_parts.append("</ul>")
                in_list = False
            html_parts.append(f"<h1>{_format_inline(stripped[2:])}</h1>")
        # 列表
        elif re.match(r'^[-*]\s', stripped):
            if not in_list:
                html_parts.append('<ul style="list-style:none; padding-left:0.74cm;">')
                in_list = True
            html_parts.append(f"<li>{_format_inline(stripped[2:])}</li>")
        elif re.match(r'^\d+[.、)]\s', stripped):
            if not in_list:
                html_parts.append('<ol style="padding-left:1.5cm;">')
                in_list = True
            content = re.sub(r'^\d+[.、)]\s', '', stripped)
            html_parts.append(f"<li>{_format_inline(content)}</li>")
        else:
            if in_list:
                html_parts.append("</ul>" if html_parts[-1] != "</ul>" else "")
                in_list = False
            html_parts.append(f"<p>{_format_inline(stripped)}</p>")

    if in_list:
        html_parts.append("</ul>")

    return "\n".join(html_parts)


def _format_inline(text: str) -> str:
    """处理行内格式：加粗。"""
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'__(.+?)__', r'<strong>\1</strong>', text)
    return text


def _escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _safe_filename(title: str) -> str:
    return re.sub(r'[^\w一-鿿]', '_', title)[:50]
