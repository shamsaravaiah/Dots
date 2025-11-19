"""Dependency helpers for FastAPI routes."""

from __future__ import annotations

from fastapi import Depends, Request

from .config import Settings, get_settings
from .services.canvas import CanvasService
from .services.llm import LLMService
from .services.usage import UsageService


def get_settings_dependency() -> Settings:
    return get_settings()


def get_llm_service_dependency(request: Request) -> LLMService:
    return request.app.state.llm_service  # type: ignore[attr-defined]


def get_usage_service_dependency(request: Request) -> UsageService:
    return request.app.state.usage_service  # type: ignore[attr-defined]


def get_canvas_service_dependency(request: Request) -> CanvasService:
    return request.app.state.canvas_service  # type: ignore[attr-defined]


def provide_llm_service(
    llm_service: LLMService = Depends(get_llm_service_dependency),
) -> LLMService:
    return llm_service


def provide_usage_service(
    usage_service: UsageService = Depends(get_usage_service_dependency),
) -> UsageService:
    return usage_service


def provide_canvas_service(
    canvas_service: CanvasService = Depends(get_canvas_service_dependency),
) -> CanvasService:
    return canvas_service
