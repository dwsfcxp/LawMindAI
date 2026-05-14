import logging
import sys
import warnings
from enum import Enum
from pydantic import field_validator
from pydantic_settings import BaseSettings
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)

# Default secrets that must NEVER be used in production
_INSECURE_SECRETS = {
    "dev-secret-key",
    "dev-secret-key-local",
    "dev-jwt-secret",
    "dev-jwt-secret-local",
    "changeme",
    "secret",
    "your-api-key-here",
}


class Environment(str, Enum):
    """Supported deployment environments."""
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


class Settings(BaseSettings):
    APP_NAME: str = "LawMind AI"
    ENVIRONMENT: Environment = Environment.DEVELOPMENT
    # Backward compatibility alias: APP_ENV is deprecated, use ENVIRONMENT instead
    APP_ENV: str = ""
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

    # Logging configuration
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"

    model_config = {
        "env_file": [str(Path(__file__).resolve().parent.parent.parent / ".env"), ".env"],
        "env_file_encoding": "utf-8",
    }

    @field_validator("ENVIRONMENT", mode="before")
    @classmethod
    def normalize_environment(cls, v):
        """Accept string values for ENVIRONMENT."""
        if isinstance(v, str):
            return Environment(v.lower())
        return v

    @field_validator("APP_ENV", mode="before")
    @classmethod
    def deprecate_app_env(cls, v):
        """Swallow APP_ENV value -- it's a backward-compat alias."""
        return v

    @field_validator("CHROMA_PORT")
    @classmethod
    def validate_port(cls, v: int) -> int:
        if not (1 <= v <= 65535):
            raise ValueError(f"CHROMA_PORT must be between 1 and 65535, got {v}")
        return v

    def model_post_init(self, __context) -> None:
        """Validate security settings based on environment.

        If APP_ENV is set (backward compat), use it to override ENVIRONMENT
        when ENVIRONMENT is still at its default.
        """
        if self.APP_ENV and self.APP_ENV.strip():
            try:
                self.ENVIRONMENT = Environment(self.APP_ENV.strip().lower())
            except ValueError:
                pass  # Ignore invalid APP_ENV values

        is_production = self.ENVIRONMENT == Environment.PRODUCTION

        # Debug mode must be off in production
        if is_production and self.APP_DEBUG:
            warnings.warn(
                "APP_DEBUG is True in production! This should be disabled.",
                stacklevel=2,
            )

        # Production: enforce secure secrets
        if is_production:
            if self.JWT_SECRET_KEY in _INSECURE_SECRETS:
                raise ValueError(
                    "SECURITY ERROR: JWT_SECRET_KEY is set to an insecure default in "
                    "production. Generate a strong secret with: "
                    "python -c \"import secrets; print(secrets.token_urlsafe(48))\""
                )
            if self.APP_SECRET_KEY in _INSECURE_SECRETS:
                raise ValueError(
                    "SECURITY ERROR: APP_SECRET_KEY is set to an insecure default in "
                    "production. Generate a strong secret with: "
                    "python -c \"import secrets; print(secrets.token_urlsafe(32))\""
                )

        # Staging: warn about insecure secrets
        if self.ENVIRONMENT == Environment.STAGING:
            if self.JWT_SECRET_KEY in _INSECURE_SECRETS:
                logger.critical(
                    "SECURITY: JWT_SECRET_KEY is set to a default value in staging! "
                    "Please set a strong random secret."
                )
            if self.APP_SECRET_KEY in _INSECURE_SECRETS:
                logger.critical(
                    "SECURITY: APP_SECRET_KEY is set to a default value in staging! "
                    "Please set a strong random secret."
                )

        # Development: mild warning
        if self.ENVIRONMENT == Environment.DEVELOPMENT:
            if self.JWT_SECRET_KEY in _INSECURE_SECRETS:
                warnings.warn(
                    "JWT_SECRET_KEY is using the development default. "
                    "This is acceptable for local development only.",
                    stacklevel=2,
                )

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == Environment.PRODUCTION

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == Environment.DEVELOPMENT

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    @property
    def upload_path(self) -> Path:
        p = Path(self.UPLOAD_DIR)
        p.mkdir(parents=True, exist_ok=True)
        return p

    def configure_logging(self) -> None:
        """Set up logging based on the current environment."""
        log_level = getattr(logging, self.LOG_LEVEL.upper(), logging.INFO)

        root_logger = logging.getLogger()
        root_logger.setLevel(log_level)

        # Remove existing handlers to avoid duplicates
        root_logger.handlers.clear()

        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(log_level)

        if self.is_production:
            # Production: structured format with timestamps
            formatter = logging.Formatter(
                "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
                datefmt="%Y-%m-%dT%H:%M:%S",
            )
        else:
            # Development: more readable format
            formatter = logging.Formatter(
                "%(asctime)s %(levelname)-8s %(name)s: %(message)s",
                datefmt="%H:%M:%S",
            )

        handler.setFormatter(formatter)
        root_logger.addHandler(handler)

        # Reduce noise from third-party libraries in production
        if self.is_production:
            for noisy in ("uvicorn.access", "httpx", "httpcore"):
                logging.getLogger(noisy).setLevel(logging.WARNING)

        logger.info(
            "Logging configured: level=%s env=%s",
            self.LOG_LEVEL,
            self.ENVIRONMENT.value,
        )

    def get_llm_client_config(self) -> dict:
        """Return a dict of the active default LLM client config.

        Useful for constructing clients or passing config to engines
        without coupling to the full Settings object.
        """
        return {
            "base_url": self.CLAUDE_BASE_URL,
            "api_key": self.CLAUDE_API_KEY,
            "model": self.CLAUDE_MODEL,
            "max_tokens": self.CLAUDE_MAX_TOKENS,
        }


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.configure_logging()
    return settings
