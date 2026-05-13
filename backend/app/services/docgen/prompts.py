"""法律文书AI提示词模板"""

CASE_PARSING_PROMPT = """你是一位专业的中国执业律师。请分析以下案情描述，提取结构化信息。

## 案情描述
{case_facts}

## 请提取以下信息（JSON格式）
```json
{{
  "case_type": "案件类型（民事/刑事/行政/劳动）",
  "cause_of_action": "案由",
  "parties": {{
    "plaintiff": {{"name": "", "identity": "", "address": "", "phone": ""}},
    "defendant": {{"name": "", "identity": "", "address": "", "phone": ""}},
    "third_party": null
  }},
  "facts": "事实概要（200字以内）",
  "claims": ["诉讼请求列表"],
  "legal_relationship": "核心法律关系",
  "key_dates": ["关键时间节点"],
  "amount_involved": "涉及金额（如有）",
  "evidence_summary": ["现有证据概要"]
}}
```

仅输出JSON，不要其他内容。"""

DOCUMENT_GENERATION_PROMPT = """你是一位资深中国执业律师，擅长撰写{doc_type_name}。请根据以下信息生成一份完整、专业的法律文书。

## 文书类型
{doc_type_name}

## 案件信息
{parsed_case}

## 相关法规
{related_laws}

## 参考案例
{related_cases}

## 模板结构要求
{template_structure}

## 额外指示
{extra_instructions}

## 格式要求
1. 使用正式法律文书语言
2. 事实陈述客观准确
3. 法律论述逻辑严密，引用具体法条
4. 诉讼请求明确具体
5. 使用"原告""被告""本院"等规范用语
6. 金额使用中文大写和阿拉伯数字双重表述

请直接输出文书正文内容（不含标题），使用Markdown格式。"""

DOCUMENT_REVIEW_PROMPT = """你是一位资深律师，请审校以下{doc_type_name}，检查以下问题：

## 待审校文书
{content}

## 检查要点
1. **法条引用** — 引用的法条是否准确、现行有效
2. **金额计算** — 诉讼请求金额、利息计算是否正确
3. **当事人信息** — 原被告信息是否完整一致
4. **逻辑一致性** — 事实陈述与诉讼请求是否逻辑自洽
5. **格式规范** — 是否符合法院文书格式要求
6. **遗漏风险** — 是否遗漏重要诉求或证据引用

请输出：
1. 修改后的完整文书（如无需修改则原样输出）
2. 审校意见（如有问题）

---
直接输出修改后的完整文书，末尾用"<!-- REVIEW_NOTES -->"分隔附上审校意见。"""

LAW_SEARCH_QUERY_PROMPT = """根据以下案情，生成用于检索相关法律法规的搜索关键词。

案情：{case_facts}

请输出3-5个最相关的法律检索关键词，用逗号分隔。仅输出关键词，不要解释。"""

CASE_SEARCH_QUERY_PROMPT = """根据以下案情，生成用于检索相似案例的搜索关键词。

案情：{case_facts}

请输出3-5个最相关的案例检索关键词，用逗号分隔。仅输出关键词，不要解释。"""


DOC_TYPE_NAMES = {
    "complaint": "民事起诉状",
    "answer": "答辩状",
    "appeal": "上诉状",
    "counterclaim": "反诉状",
    "agency_opinion": "代理词",
    "defense_opinion": "辩护词",
    "evidence_list": "证据清单",
    "cross_examination": "质证意见",
    "legal_opinion": "法律意见书",
    "lawyer_letter": "律师函",
    "contract": "合同",
    "preservation_application": "财产保全申请书",
    "evidence_preservation": "证据保全申请书",
    "jurisdiction_objection": "管辖权异议申请书",
}
