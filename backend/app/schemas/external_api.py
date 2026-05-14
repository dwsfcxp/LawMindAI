"""外部API配置 Schema"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class ExternalApiCreate(BaseModel):
    name: str
    description: str = ""
    base_url: str
    auth_type: str = "none"
    auth_token: str = ""
    auth_header_name: str = "Authorization"
    auth_username: str = ""
    auth_password: str = ""
    custom_headers: str = "{}"
    search_law_path: str = ""
    search_law_method: str = "GET"
    search_case_path: str = ""
    search_case_method: str = "GET"
    get_provision_path: str = ""
    get_provision_method: str = "GET"
    health_check_path: str = ""
    response_mapping: str = "{}"
    request_template: str = "{}"
    is_enabled: bool = True
    category: str = "custom"


class ExternalApiUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    base_url: Optional[str] = None
    auth_type: Optional[str] = None
    auth_token: Optional[str] = None
    auth_header_name: Optional[str] = None
    auth_username: Optional[str] = None
    auth_password: Optional[str] = None
    custom_headers: Optional[str] = None
    search_law_path: Optional[str] = None
    search_law_method: Optional[str] = None
    search_case_path: Optional[str] = None
    search_case_method: Optional[str] = None
    get_provision_path: Optional[str] = None
    get_provision_method: Optional[str] = None
    health_check_path: Optional[str] = None
    response_mapping: Optional[str] = None
    request_template: Optional[str] = None
    is_enabled: Optional[bool] = None
    category: Optional[str] = None


class ExternalApiOut(BaseModel):
    id: int
    name: str
    description: str
    base_url: str
    auth_type: str
    auth_token_masked: str = ""
    auth_header_name: str
    auth_username: str
    auth_password_masked: str = ""
    custom_headers: str
    search_law_path: str
    search_law_method: str
    search_case_path: str
    search_case_method: str
    get_provision_path: str
    get_provision_method: str
    health_check_path: str
    response_mapping: str
    request_template: str
    is_enabled: bool
    category: str
    created_at: datetime
    updated_at: datetime


class ExternalApiTestResult(BaseModel):
    success: bool
    message: str
    latency_ms: int = 0


class ExternalApiPreset(BaseModel):
    key: str
    name: str
    category: str
    description: str
    base_url: str
    auth_type: str = "bearer"
    search_law_path: str = ""
    search_law_method: str = "GET"
    search_case_path: str = ""
    search_case_method: str = "GET"
    get_provision_path: str = ""
    get_provision_method: str = "GET"
    health_check_path: str = ""
    response_mapping: str = "{}"
    request_template: str = "{}"
