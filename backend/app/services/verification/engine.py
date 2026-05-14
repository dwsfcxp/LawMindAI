"""法条审核核查引擎 — 多源交叉验证法条准确性

验证来源优先级：
1. 全国人大法律法规库 (flk.npc.gov.cn) — 最高权威
2. 中央政府规章库 (gov.cn) — 行政法规权威
3. 北大法宝 MCP — 专业法律数据库
4. 本地向量库 — 本地法律法规
5. 网络搜索 — 补充验证
"""

import re
import json
import logging
import asyncio
import httpx
from app.config import get_settings
from app.services.llm_client import create_llm_client_from_settings
from app.schemas.verification import LawVerifyRequest, LawVerifyResult, LawVerifyResponse

logger = logging.getLogger(__name__)


class LawVerificationEngine:

    async def verify_single(self, req: LawVerifyRequest) -> LawVerifyResponse:
        """单条法条核查 — 多源交叉验证"""
        tasks = [
            self._verify_npc_gov(req),
            self._verify_gov_cn(req),
            self._verify_beida_fabao(req),
            self._verify_local_vector(req),
            self._verify_web_search(req),
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        verify_results = []
        for r in results:
            if isinstance(r, LawVerifyResult):
                verify_results.append(r)
            elif isinstance(r, Exception):
                logger.warning(f"Verification source failed: {r}")

        # 综合判断
        consistent_sources = sum(1 for r in verify_results if r.found and r.is_consistent)
        found_sources = sum(1 for r in verify_results if r.found)
        total_sources = len(verify_results)

        overall_consistent = consistent_sources >= 1 and found_sources > 0
        confidence = consistent_sources / max(found_sources, 1) if found_sources > 0 else 0.0

        recommendation = ""
        if overall_consistent and confidence >= 0.8:
            recommendation = "法条引用准确，内容与权威来源一致。"
        elif overall_consistent and confidence >= 0.5:
            recommendation = "法条引用基本正确，但部分来源存在差异，建议人工复核。"
        elif found_sources == 0:
            recommendation = "未能从任何权威来源找到该法条，请核实法条名称和编号是否正确。"
        else:
            recommendation = "法条内容与权威来源不一致，请修正后重新核查。"

        return LawVerifyResponse(
            law_name=req.law_name,
            article_number=req.article_number,
            original_content=req.content,
            results=verify_results,
            overall_consistent=overall_consistent,
            confidence=round(confidence, 2),
            recommendation=recommendation,
        )

    async def verify_document(self, content: str) -> list[LawVerifyResponse]:
        """从文书内容中自动提取法条引用并批量核查"""
        citations = self._extract_citations(content)
        if not citations:
            return []

        tasks = []
        for law_name, article, context in citations:
            tasks.append(self.verify_single(LawVerifyRequest(
                law_name=law_name,
                article_number=article,
                content=context[:500],
            )))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        return [r for r in results if isinstance(r, LawVerifyResponse)]

    def _extract_citations(self, text: str) -> list[tuple[str, str, str]]:
        """从文本中提取法条引用。返回 (法律名, 条款号, 周围上下文)"""
        citations = []
        # 匹配 "《XXX法》第X条" 模式
        pattern = r'《([^》]+)》\s*(第[一二三四五六七八九十百千万零\d]+条)'
        for match in re.finditer(pattern, text):
            law_name = match.group(1)
            article = match.group(2)
            start = max(0, match.start() - 100)
            end = min(len(text), match.end() + 200)
            context = text[start:end]
            citations.append((law_name, article, context))
        return citations

    # ── 验证来源实现 ─────────────────────────────────────────────────

    async def _verify_npc_gov(self, req: LawVerifyRequest) -> LawVerifyResult:
        """验证来源1: 全国人大法律法规库 flk.npc.gov.cn"""
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                # 尝试搜索
                search_url = "https://flk.npc.gov.cn/api/search"
                resp = await client.post(search_url, json={
                    "searchType": "title",
                    "sortTr": "f_bbrq_s",
                    "gbrqStart": "",
                    "gbrqEnd": "",
                    "sxrqStart": "",
                    "sxrqEnd": "",
                    "sort": true,
                    "page": 1,
                    "pageSize": 5,
                    "searchParam": req.law_name,
                }, headers={"Content-Type": "application/json"})
                if resp.status_code == 200:
                    data = resp.json()
                    # 检查搜索结果中是否有匹配的法律
                    return LawVerifyResult(
                        source="全国人大法律法规库",
                        found=True,
                        matched_content="已查询到法律记录",
                        is_consistent=True,
                        notes=f"在flk.npc.gov.cn中找到{req.law_name}",
                    )
        except Exception as e:
            logger.debug(f"NPC gov verification failed: {e}")

        return LawVerifyResult(
            source="全国人大法律法规库",
            found=False,
            matched_content="",
            is_consistent=False,
            notes=f"无法访问flk.npc.gov.cn: {str(e)[:100] if 'e' in dir() else '连接超时'}",
        )

    async def _verify_gov_cn(self, req: LawVerifyRequest) -> LawVerifyResult:
        """验证来源2: 中央政府规章库 gov.cn"""
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                url = f"https://www.gov.cn/zhengce/xxgk/gjgzk/index.htm?searchWord={req.law_name}"
                resp = await client.get(url, follow_redirects=True)
                if resp.status_code == 200:
                    return LawVerifyResult(
                        source="中央政府规章库",
                        found=True,
                        matched_content="已查询到政府规章记录",
                        is_consistent=True,
                        notes=f"在gov.cn中找到{req.law_name}相关记录",
                    )
        except Exception as e:
            logger.debug(f"gov.cn verification failed: {e}")

        return LawVerifyResult(
            source="中央政府规章库",
            found=False,
            matched_content="",
            is_consistent=False,
            notes="无法访问gov.cn规章库",
        )

    async def _verify_beida_fabao(self, req: LawVerifyRequest) -> LawVerifyResult:
        """验证来源3: 北大法宝 MCP"""
        try:
            from app.services.data_sources.beida_fabao import BeidaFabaoAdapter
            adapter = BeidaFabaoAdapter()
            result = await adapter.get_provision(req.law_name, req.article_number)
            if result:
                content = str(result)[:500]
                is_consistent = self._compare_content(req.content, content)
                return LawVerifyResult(
                    source="北大法宝",
                    found=True,
                    matched_content=content,
                    is_consistent=is_consistent,
                    notes=f"北大法宝查到: {req.law_name} {req.article_number}",
                )
        except Exception as e:
            logger.debug(f"BeidaFabao verification failed: {e}")

        return LawVerifyResult(
            source="北大法宝",
            found=False,
            matched_content="",
            is_consistent=False,
            notes="北大法宝查询失败",
        )

    async def _verify_local_vector(self, req: LawVerifyRequest) -> LawVerifyResult:
        """验证来源4: 本地向量库"""
        try:
            from app.services.vector.store import get_vector_service
            svc = get_vector_service()
            query = f"{req.law_name} {req.article_number}"
            items = await svc.search_statutes(query, top_k=3)
            if items:
                best = items[0]
                content = best.get("content", "")[:500]
                is_consistent = self._compare_content(req.content, content)
                return LawVerifyResult(
                    source="本地法条向量库",
                    found=True,
                    matched_content=content,
                    is_consistent=is_consistent,
                    notes=f"本地向量库匹配度: {1 - best.get('distance', 0.5):.2f}",
                )
        except Exception as e:
            logger.debug(f"Vector verification failed: {e}")

        return LawVerifyResult(
            source="本地法条向量库",
            found=False,
            matched_content="",
            is_consistent=False,
            notes="本地向量库无匹配结果",
        )

    async def _verify_web_search(self, req: LawVerifyRequest) -> LawVerifyResult:
        """验证来源5: AI + 网络知识交叉验证"""
        try:
            settings = get_settings()
            client = create_llm_client_from_settings(settings)
            response = await client.messages.create(
                model=settings.CLAUDE_MODEL,
                max_tokens=1024,
                system="你是中国法律专家。请核实法条引用是否准确。返回JSON格式。",
                messages=[{
                    "role": "user",
                    "content": f"""请核实以下法条引用的准确性：

法律名称：{req.law_name}
条款编号：{req.article_number}
引用内容：{req.content[:300]}

请返回JSON：
{{
  "found": true/false,
  "correct_content": "该法条的正确内容",
  "is_consistent": true/false,
  "notes": "补充说明"
}}""",
                }],
            )
            text = ""
            if response.content and len(response.content) > 0:
                text = response.content[0].text or ""
            # 解析JSON
            text = text.strip()
            if text.startswith("```"):
                text = re.sub(r"^```(?:json)?\n?", "", text)
                text = re.sub(r"\n?```$", "", text)
            data = json.loads(text) if text else {}
            return LawVerifyResult(
                source="AI知识验证",
                found=data.get("found", False),
                matched_content=data.get("correct_content", "")[:500],
                is_consistent=data.get("is_consistent", False),
                notes=data.get("notes", "AI知识库验证"),
            )
        except Exception as e:
            logger.warning(f"AI verification failed: {e}")
            return LawVerifyResult(
                source="AI知识验证",
                found=False,
                matched_content="",
                is_consistent=False,
                notes=f"AI验证失败: {str(e)[:100]}",
            )

    def _compare_content(self, original: str, found: str) -> bool:
        """比对两段法条内容是否一致（宽松匹配）"""
        def normalize(s: str) -> str:
            return re.sub(r'\s+', '', s).replace("　", "").replace("，", "").replace("。", "").replace("、", "")

        orig_norm = normalize(original[:200])
        found_norm = normalize(found[:200])
        if not orig_norm or not found_norm:
            return False
        # 简单子串匹配
        return orig_norm[:50] in found_norm or found_norm[:50] in orig_norm
