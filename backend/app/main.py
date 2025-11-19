"""Application entrypoint for the Dots backend proxy service."""

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routes import ask as ask_router
from .routes import canvas as canvas_router
from .routes import auth as auth_router
from .services.key_manager import KeyManager
from .services.llm import LLMService
from .services.usage import UsageService
from .services.canvas import CanvasService


load_dotenv()


def create_app() -> FastAPI:
    """Construct the FastAPI application with shared state."""
    settings = get_settings()

    if not settings.google_api_keys:
        raise RuntimeError(
            "No Google API keys configured. "
            "Set GOOGLE_API_KEYS or GOOGLE_API_KEY."
        )

    key_manager = KeyManager(
        keys=settings.google_api_keys,
        cooldown_seconds=settings.key_cooldown_seconds,
    )
    llm_service = LLMService(
        settings=settings,
        key_manager=key_manager,
    )
    usage_service = UsageService(settings=settings)
    canvas_service = CanvasService(settings=settings)

    openapi_url = "/openapi.json" if settings.enable_openapi else None
    app = FastAPI(
        title="Dots Backend Proxy",
        version="0.1.0",
        openapi_url=openapi_url,
    )

    app.state.settings = settings
    app.state.llm_service = llm_service
    app.state.usage_service = usage_service
    app.state.canvas_service = canvas_service

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_origin_regex=settings.cors_allow_origin_regex,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allow_headers=["*"],
        allow_credentials=settings.cors_allow_credentials,
        expose_headers=["*"],
    )

    app.include_router(auth_router.router, prefix="/api")
    app.include_router(ask_router.router, prefix="/api")
    app.include_router(canvas_router.router, prefix="/api")

    @app.get("/health", tags=["system"])
    async def health_check() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
