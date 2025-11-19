"""Configuration management for the Dots backend proxy."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from pydantic import Field, validator
from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_PLANS: Dict[str, Dict[str, Any]] = {
    "anonymous": {
        "max_canvases": 1,
        "node_quota": {"lifetime": 5},
        "autosave_interval_seconds": 120,
        "models": ["gemini-2.5-flash"],
        "features": {"image_search": False},
    },
    "free": {
        "max_canvases": 3,
        "node_quota": {"per_canvas": 5},
        "autosave_interval_seconds": 60,
        "models": ["gemini-2.5-flash", "gemini-2.5-pro"],
        "features": {"image_search": True},
    },
    "pro": {
        "max_canvases": None,
        "node_quota": {"daily": None},
        "autosave_interval_seconds": 15,
        "models": ["gemini-2.5-pro"],
        "features": {"image_search": True, "collaboration": True},
    },
    "dev": {
        "max_canvases": None,
        "node_quota": {"daily": None},
        "autosave_interval_seconds": 15,
        "models": ["gemini-2.5-flash", "gemini-2.5-pro"],
        "features": {"image_search": True, "collaboration": True},
    },
}


class Settings(BaseSettings):
    """Global application settings loaded from environment variables."""

    # Correct: backend/.env, no absolute path concatenation
    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).parent.parent / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    google_api_keys: List[str] = Field(
        default_factory=list,
        env="GOOGLE_API_KEYS",
    )
    google_dots_paid_api_key_1: Optional[str] = Field(
        None, env="GEMINI_DOTS_PAID_1"
    )
    google_dots_paid_api_key_2: Optional[str] = Field(
        None, env="GEMINI_DOTS_PAID_2"
    )
    google_dots_paid_api_key_3: Optional[str] = Field(
        None, env="GEMINI_DOTS_PAID_3"
    )
    google_default_model: str = Field("gemini-2.5-flash", env="GOOGLE_MODEL")
    key_cooldown_seconds: int = Field(600, env="GOOGLE_KEY_COOLDOWN_SECONDS")

    enable_openapi: bool = Field(True, env="ENABLE_OPENAPI")

    cors_allow_origins: List[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5174",
        ],
        env="CORS_ALLOW_ORIGINS",
    )
    cors_allow_origin_regex: Optional[str] = Field(
        None,
        env="CORS_ALLOW_ORIGIN_REGEX",
    )
    cors_allow_methods: List[str] = Field(
        default_factory=lambda: ["*"],
        env="CORS_ALLOW_METHODS",
    )
    cors_allow_headers: List[str] = Field(
        default_factory=lambda: ["*"],
        env="CORS_ALLOW_HEADERS",
    )
    cors_allow_credentials: bool = Field(True, env="CORS_ALLOW_CREDENTIALS")

    plans: Dict[str, Dict[str, Any]] = Field(
        default_factory=lambda: DEFAULT_PLANS,
        env="DOTS_PLANS",
    )

    # OAuth Configuration
    google_client_id: Optional[str] = Field(
        None, env="GOOGLE_CLIENT_ID"
    )
    google_client_secret: Optional[str] = Field(
        None, env="GOOGLE_CLIENT_SECRET"
    )
    github_client_id: Optional[str] = Field(None, env="GITHUB_CLIENT_ID")
    github_client_secret: Optional[str] = Field(
        None, env="GITHUB_CLIENT_SECRET"
    )
    oauth_redirect_uri: str = Field(
        "http://localhost:5173/api/auth/callback",
        env="OAUTH_REDIRECT_URI",
    )
    frontend_url: str = Field(
        "http://localhost:5173",
        env="FRONTEND_URL",
    )
    jwt_secret: str = Field(
        "change-me-in-production",
        env="JWT_SECRET",
    )
    jwt_algorithm: str = Field("HS256", env="JWT_ALGORITHM")
    jwt_expiration_hours: int = Field(24, env="JWT_EXPIRATION_HOURS")

    @validator("google_api_keys", pre=True)
    def _split_keys(cls, value: Any) -> List[str]:
        if not value:
            import os
            fallback = os.getenv("GOOGLE_API_KEY")
            return [fallback] if fallback else []
        if isinstance(value, str):
            return [key.strip() for key in value.split(",") if key.strip()]
        return list(value)

    @validator("cors_allow_origins", pre=True)
    def _split_origins(cls, value: Any) -> List[str]:
        if not value:
            return []
        if isinstance(value, str):
            return [
                origin.strip()
                for origin in value.split(",")
                if origin.strip()
            ]
        return list(value)

    @validator("plans", pre=True)
    def _load_plans(cls, value: Any) -> Dict[str, Dict[str, Any]]:
        if not value:
            return DEFAULT_PLANS
        if isinstance(value, str):
            import json
            return json.loads(value)
        return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
