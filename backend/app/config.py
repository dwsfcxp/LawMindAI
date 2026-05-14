from pydantic_settings import BaseSettings
from functools import lru_cache
from pathlib import Path


class Settings(BaseSettings):
    APP_NAME: str = "LawMind AI"
    APP_ENV: str = "development"
    APP_DEBUG: bool = True
    APP_SECRET_KEY: str = "dev-secret-key"
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000

    DATABASE_URL: str = "sqlite+aiosqlite:///./lawmind.db"
    DATABASE_URL_SYNC: str = "sqlite:///./lawmind.db"

    REDIS_URL: str = "redis://localhost:6379/0"

    JWT_SECRET_KEY: str = "dev-jwt-secret"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    CLAUDE_API_KEY: str = ""
    CLAUDE_BASE_URL: str = ""
    CLAUDE_MODEL: str = "glm-5.1"
    CLAUDE_MAX_TOKENS: int = 4096

    CHROMA_HOST: str = "localhost"
    CHROMA_PORT: int = 8001
    CHROMA_COLLECTION: str = "lawmind_docs"

    CHINESE_LAW_MCP_ENABLED: bool = True

    TIANYANCHA_API_KEY: str = ""
    TIANYANCHA_API_URL: str = "https://open.api.tianyancha.com"

    QICHACHA_API_KEY: str = ""
    QICHACHA_API_URL: str = "https://api.qichacha.com"

    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    EMBEDDING_BASE_URL: str = ""

    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE_MB: int = 50

    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    model_config = {
        "env_file": [str(Path(__file__).resolve().parent.parent.parent / ".env"), ".env"],
        "env_file_encoding": "utf-8",
    }

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    @property
    def upload_path(self) -> Path:
        p = Path(self.UPLOAD_DIR)
        p.mkdir(parents=True, exist_ok=True)
        return p


@lru_cache
def get_settings() -> Settings:
    return Settings()
