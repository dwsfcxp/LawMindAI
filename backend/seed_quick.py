"""快速种子模板脚本"""
import asyncio
import json
from datetime import datetime
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

TEMPLATES = [
    {"name": "民事起诉状", "type": "complaint",
     "description": "民事诉讼起诉状模板",
     "structure": {"sections": [{"name": "首部", "required": True, "fields": ["原告信息", "被告信息"]}, {"name": "诉讼请求", "required": True, "fields": ["请求事项"]}, {"name": "事实与理由", "required": True, "fields": ["事实陈述", "法律依据"]}, {"name": "证据", "required": True, "fields": ["证据清单"]}, {"name": "尾部", "required": True, "fields": ["致法院", "具状人", "日期"]}]},
     "ai_prompt": "请撰写一份民事起诉状。要求：1.准确列明原被告身份信息 2.诉讼请求具体明确 3.事实陈述客观完整 4.法律论证引用具体法条 5.证据与事实对应",
     "format_rules": {"font": "仿宋", "size": 16, "title_size": 22, "line_spacing": 28},
     "variables": [{"name": "plaintiff_name", "label": "原告姓名", "type": "text", "required": True}, {"name": "defendant_name", "label": "被告姓名", "type": "text", "required": True}]},
    {"name": "民事答辩状", "type": "answer",
     "description": "民事答辩状模板",
     "structure": {"sections": [{"name": "首部", "required": True, "fields": ["答辩人信息"]}, {"name": "答辩意见", "required": True, "fields": ["逐项答辩"]}, {"name": "尾部", "required": True, "fields": ["致法院", "答辩人", "日期"]}]},
     "ai_prompt": "请撰写一份民事答辩状。要求：1.针对原告每一项诉讼请求逐一答辩 2.反驳有理有据引用法条",
     "format_rules": {"font": "仿宋", "size": 16, "title_size": 22, "line_spacing": 28},
     "variables": []},
    {"name": "代理词", "type": "agency_opinion",
     "description": "诉讼代理词模板",
     "structure": {"sections": [{"name": "开头", "required": True, "fields": ["案件概况"]}, {"name": "代理意见", "required": True, "fields": ["分点论述"]}, {"name": "结语", "required": True, "fields": ["总结", "代理人", "日期"]}]},
     "ai_prompt": "请撰写一份代理词。要求：1.开头简明陈述案件概况 2.代理意见分点详细论述引用法条和证据 3.结尾明确请求法院支持",
     "format_rules": {"font": "仿宋", "size": 16, "title_size": 22, "line_spacing": 28},
     "variables": []},
    {"name": "辩护词", "type": "defense_opinion",
     "description": "刑事辩护词模板",
     "structure": {"sections": [{"name": "开头", "required": True, "fields": ["案件概况"]}, {"name": "辩护意见", "required": True, "fields": ["事实辩护", "证据辩护", "法律辩护"]}, {"name": "量刑意见", "required": True, "fields": ["从轻减轻情节"]}, {"name": "结语", "required": True, "fields": ["辩护人", "日期"]}]},
     "ai_prompt": "请撰写一份刑事辩护词。要求：1.从事实认定、证据采信、法律适用三个维度辩护 2.指出证据链不足 3.提出从轻减轻情节 4.引用刑法和司法解释",
     "format_rules": {"font": "仿宋", "size": 16, "title_size": 22, "line_spacing": 28},
     "variables": []},
    {"name": "法律意见书", "type": "legal_opinion",
     "description": "法律意见书模板",
     "structure": {"sections": [{"name": "委托事项", "required": True, "fields": ["委托内容"]}, {"name": "事实概述", "required": True, "fields": ["相关事实"]}, {"name": "法律分析", "required": True, "fields": ["法律关系分析"]}, {"name": "结论建议", "required": True, "fields": ["操作建议"]}]},
     "ai_prompt": "请撰写一份法律意见书。要求：1.准确界定法律关系 2.全面检索适用法规 3.分析利弊给出实务建议 4.提示法律风险",
     "format_rules": {"font": "仿宋", "size": 16, "title_size": 22, "line_spacing": 28},
     "variables": []},
    {"name": "律师函", "type": "lawyer_letter",
     "description": "律师函模板",
     "structure": {"sections": [{"name": "致函对象", "required": True, "fields": ["收函方"]}, {"name": "事实陈述", "required": True, "fields": ["事件经过"]}, {"name": "法律依据", "required": True, "fields": ["引用法规"]}, {"name": "要求事项", "required": True, "fields": ["具体要求", "期限"]}, {"name": "后果告知", "required": True, "fields": ["法律后果"]}]},
     "ai_prompt": "请撰写一份律师函。要求：1.说明律师受托身份 2.事实客观准确 3.法律依据明确 4.要求具体可执行 5.告知后果但不过度威胁",
     "format_rules": {"font": "仿宋", "size": 16, "title_size": 22, "line_spacing": 28},
     "variables": []},
    {"name": "证据清单", "type": "evidence_list",
     "description": "证据清单模板",
     "structure": {"sections": [{"name": "证据列表", "required": True, "fields": ["序号", "证据名称", "证据类型", "证明目的"]}]},
     "ai_prompt": "请整理一份证据清单。要求：1.证据编号连续 2.名称准确 3.注明类型（书证/物证/电子数据等）4.证明目的明确",
     "format_rules": {"font": "仿宋", "size": 16, "title_size": 22, "line_spacing": 28},
     "variables": []},
    {"name": "质证意见", "type": "cross_examination",
     "description": "质证意见模板",
     "structure": {"sections": [{"name": "质证意见", "required": True, "fields": ["逐份证据质证"]}]},
     "ai_prompt": "请撰写质证意见。要求：1.逐份证据分别质证 2.从真实性合法性关联性三方面分析 3.指出证明力问题",
     "format_rules": {"font": "仿宋", "size": 16, "title_size": 22, "line_spacing": 28},
     "variables": []},
    {"name": "财产保全申请书", "type": "preservation_application",
     "description": "财产保全申请书模板",
     "structure": {"sections": [{"name": "首部", "required": True, "fields": ["申请人", "被申请人"]}, {"name": "请求事项", "required": True, "fields": ["保全财产范围"]}, {"name": "事实与理由", "required": True, "fields": ["紧急情况"]}, {"name": "尾部", "required": True, "fields": ["致法院", "申请人", "日期"]}]},
     "ai_prompt": "请撰写财产保全申请书。要求：1.说明不保全将导致判决难以执行 2.保全财产范围明确 3.引用民诉法保全条款",
     "format_rules": {"font": "仿宋", "size": 16, "title_size": 22, "line_spacing": 28},
     "variables": []},
]

async def seed():
    engine = create_async_engine("sqlite+aiosqlite:///./lawmind.db")
    async with engine.begin() as conn:
        for t in TEMPLATES:
            existing = await conn.execute(
                text("SELECT id FROM templates WHERE type = :type"),
                {"type": t["type"]}
            )
            if existing.fetchone():
                print(f"  Skip: {t['name']} (exists)")
                continue
            now = datetime.utcnow().isoformat()
            await conn.execute(text(
                "INSERT INTO templates (name, type, description, structure, ai_prompt, format_rules, variables, is_public, created_at, updated_at) "
                "VALUES (:name, :type, :description, :structure, :ai_prompt, :format_rules, :variables, 1, :created_at, :updated_at)"
            ), {
                "name": t["name"],
                "type": t["type"],
                "description": t["description"],
                "structure": json.dumps(t["structure"], ensure_ascii=False),
                "ai_prompt": t["ai_prompt"],
                "format_rules": json.dumps(t["format_rules"], ensure_ascii=False),
                "variables": json.dumps(t["variables"], ensure_ascii=False),
                "created_at": now,
                "updated_at": now,
            })
            print(f"  Added: {t['name']}")
    await engine.dispose()
    print("Done!")

if __name__ == "__main__":
    asyncio.run(seed())
