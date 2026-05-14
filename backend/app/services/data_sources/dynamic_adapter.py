"""动态外部API适配器 — 从数据库配置动态创建数据源连接"""

import json
import logging
import httpx
from app.services.data_sources.base import (
    LegalDataSourceAdapter,
    LawSearchResult,
    CaseSearchResult,
)

logger = logging.getLogger(__name__)


class DynamicExternalApiAdapter(LegalDataSourceAdapter):
    """根据数据库中的ExternalApiConfig动态创建适配器实例"""

    def __init__(self, config):
        if hasattr(config, "__dict__"):
            c = config
            self.name = f"user_api_{c.id}"
            self.description = c.name
            self._config_id = c.id
            self._base_url = c.base_url.rstrip("/")
            self._auth_type = c.auth_type
            self._auth_token = c.auth_token
            self._auth_header_name = c.auth_header_name
            self._auth_username = c.auth_username
            self._auth_password = c.auth_password
            try:
                self._custom_headers = json.loads(c.custom_headers or "{}")
            except json.JSONDecodeError:
                self._custom_headers = {}
            self._search_law_path = c.search_law_path
            self._search_law_method = c.search_law_method
            self._search_case_path = c.search_case_path
            self._search_case_method = c.search_case_method
            self._get_provision_path = c.get_provision_path
            self._get_provision_method = c.get_provision_method
            self._health_check_path = c.health_check_path
            try:
                self._response_mapping = json.loads(c.response_mapping or "{}")
            except json.JSONDecodeError:
                self._response_mapping = {}
            try:
                self._request_template = json.loads(c.request_template or "{}")
            except json.JSONDecodeError:
                self._request_template = {}
            self._is_enabled = c.is_enabled
        else:
            raise ValueError("Invalid config type")

        self._client = httpx.AsyncClient(timeout=30)

    def _get_headers(self) -> dict:
        headers = dict(self._custom_headers)
        if self._auth_type == "bearer":
            headers["Authorization"] = f"Bearer {self._auth_token}"
        elif self._auth_type == "api_key":
            headers[self._auth_header_name or "X-API-Key"] = self._auth_token
        elif self._auth_type == "basic":
            import base64
            cred = base64.b64encode(
                f"{self._auth_username}:{self._auth_password}".encode()
            ).decode()
            headers["Authorization"] = f"Basic {cred}"
        return headers

    def _build_url(self, path: str) -> str:
        if not path:
            return ""
        if path.startswith("http"):
            return path
        return f"{self._base_url}/{path.lstrip('/')}"

    async def _call_endpoint(
        self, path: str, method: str, query: str = "", **extra_params
    ) -> list[dict] | dict | None:
        if not path or not self._is_enabled:
            return None
        url = self._build_url(path)
        for k, v in extra_params.items():
            url = url.replace(f"{{{k}}}", str(v))
        url = url.replace("{query}", query)

        headers = self._get_headers()
        try:
            if method.upper() == "POST":
                body = dict(self._request_template)
                body["query"] = query
                body.update(extra_params)
                resp = await self._client.post(url, headers=headers, json=body)
            else:
                params = {"query": query}
                params.update(extra_params)
                resp = await self._client.get(url, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json()

            # 响应可能是列表或包裹在某个key下的列表
            if isinstance(data, list):
                return data
            if isinstance(data, dict):
                # 尝试常见的包裹字段
                for key in ("data", "results", "items", "records", "list"):
                    if key in data and isinstance(data[key], list):
                        return data[key]
                return data
            return data
        except Exception as e:
            logger.warning(f"Dynamic API call failed [{self.description}]: {e}")
            return None

    def _map_law_result(self, item: dict) -> LawSearchResult:
        m = self._response_mapping
        law_map = m.get("law", {}) if m else {}
        return LawSearchResult(
            source=self.description,
            document_id=str(item.get(law_map.get("id", "id"), "")),
            title=item.get(law_map.get("title", "title"), ""),
            provision_ref=item.get(law_map.get("provision_ref", "provision_ref"), ""),
            content=item.get(law_map.get("content", "content"), ""),
        )

    def _map_case_result(self, item: dict) -> CaseSearchResult:
        m = self._response_mapping
        case_map = m.get("case", {}) if m else {}
        return CaseSearchResult(
            source=self.description,
            case_id=str(item.get(case_map.get("id", "id"), "")),
            case_number=item.get(case_map.get("case_number", "case_no"), ""),
            title=item.get(case_map.get("title", "title"), ""),
            court=item.get(case_map.get("court", "court_name"), ""),
            date=item.get(case_map.get("date", "judgment_date"), ""),
            content=item.get(case_map.get("content", "summary"), ""),
        )

    async def search_law(self, query: str, **filters) -> list[LawSearchResult]:
        raw = await self._call_endpoint(
            self._search_law_path, self._search_law_method, query, **filters
        )
        if not raw:
            return []
        if isinstance(raw, dict):
            return []
        return [self._map_law_result(item) for item in raw]

    async def search_case(self, query: str, **filters) -> list[CaseSearchResult]:
        raw = await self._call_endpoint(
            self._search_case_path, self._search_case_method, query, **filters
        )
        if not raw:
            return []
        if isinstance(raw, dict):
            return []
        return [self._map_case_result(item) for item in raw]

    async def get_provision(self, doc_id: str, article: str = None) -> dict | None:
        raw = await self._call_endpoint(
            self._get_provision_path,
            self._get_provision_method,
            query="",
            doc_id=doc_id,
            article=article or "",
        )
        return raw if isinstance(raw, dict) else None

    async def health_check(self) -> bool:
        if not self._health_check_path:
            return True
        try:
            url = self._build_url(self._health_check_path)
            resp = await self._client.get(url, headers=self._get_headers())
            return resp.status_code < 400
        except Exception:
            return False

    async def aclose(self):
        """Clean up the HTTP client."""
        await self._client.aclose()


def register_dynamic_adapter(config) -> DynamicExternalApiAdapter:
    adapter = DynamicExternalApiAdapter(config)
    from app.services.data_sources.base import DataSourceRegistry
    DataSourceRegistry.register(adapter)
    return adapter


def unregister_dynamic_adapter(config_id: int):
    from app.services.data_sources.base import DataSourceRegistry
    key = f"user_api_{config_id}"
    adapter = DataSourceRegistry.get(key)
    if adapter and hasattr(adapter, 'aclose'):
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.ensure_future(adapter.aclose())
            else:
                loop.run_until_complete(adapter.aclose())
        except Exception:
            pass
    DataSourceRegistry.unregister(key)
