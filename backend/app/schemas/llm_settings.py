"""LLM配置管理 Schema"""

from datetime import datetime
from pydantic import BaseModel


class LLMSettingsCreate(BaseModel):
    name: str
    base_url: str
    api_key: str
    model_name: str = "glm-5.1"
    max_tokens: int = 4096
    is_default: bool = False


class LLMSettingsUpdate(BaseModel):
    name: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    model_name: str | None = None
    max_tokens: int | None = None
    is_default: bool | None = None


class LLMSettingsOut(BaseModel):
    id: int
    name: str
    base_url: str
    api_key_masked: str
    model_name: str
    max_tokens: int
    is_default: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConnectivityTestRequest(BaseModel):
    base_url: str
    api_key: str
    model_name: str


class ConnectivityTestResult(BaseModel):
    success: bool
    message: str
    model: str = ""
    latency_ms: int = 0
