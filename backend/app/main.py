"""Application entrypoint for the Dots backend proxy service."""

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routes import ask as ask_router
from .routes import canvas as canvas_router
from .routes import auth as auth_router
from .routes import node as node_router
from .services.key_manager import KeyManager
from .services.llm import LLMService
from .services.usage import UsageService
from .services.canvas import CanvasService
from .services.node import NodeService
import os


# Resolve backend directory: .../dots/backend
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"

# Load .env for THIS process (including the uvicorn reloader child)
load_dotenv(ENV_PATH)


def create_app() -> FastAPI:
    """Construct the FastAPI application with shared state."""
    import logging

    _backend_dir = Path(__file__).parent.parent
    _env_path = _backend_dir / ".env"

    logger = logging.getLogger("dots.main")
    logger.info("Creating app, looking for .env at: %s", _env_path)
    logger.info(".env file exists: %s", _env_path.exists())

    # Load .env file if it exists
    if _env_path.exists():
        load_dotenv(dotenv_path=_env_path, override=True)
        logger.info("Loaded .env file from %s", _env_path)
    else:
        logger.warning(
            ".env file not found at %s. Trying to continue with "
            "environment variables.",
            _env_path,
        )

    # 1) Collect all available paid Gemini keys from environment
    key_1 = os.getenv("GEMINI_DOTS_PAID_1")
    key_2 = os.getenv("GEMINI_DOTS_PAID_2")
    key_3 = os.getenv("GEMINI_DOTS_PAID_3")

    # Log which keys are found
    if key_1:
        logger.info("GEMINI_DOTS_PAID_1 is set (length: %d)", len(key_1))
    else:
        logger.warning("GEMINI_DOTS_PAID_1 not found in environment")

    if key_2:
        logger.info("GEMINI_DOTS_PAID_2 is set (length: %d)", len(key_2))
    else:
        logger.warning("GEMINI_DOTS_PAID_2 not found in environment")

    if key_3:
        logger.info("GEMINI_DOTS_PAID_3 is set (length: %d)", len(key_3))
    else:
        logger.warning("GEMINI_DOTS_PAID_3 not found in environment")

    # Require at least one key
    if not (key_1 or key_2 or key_3):
        logger.error(
            "No GEMINI_DOTS_PAID keys found in environment. "
            "Checked .env at: %s",
            _env_path,
        )
        raise RuntimeError(
            "At least one GEMINI_DOTS_PAID key must be configured. "
            "Set GEMINI_DOTS_PAID_1, GEMINI_DOTS_PAID_2, or "
            "GEMINI_DOTS_PAID_3 in your .env file at %s" % _env_path
        )

    # 2) Now get settings (for everything else)
    settings = get_settings()

    # 3) Patch settings with keys from env if needed
    if not settings.google_dots_paid_api_key_1 and key_1:
        settings.google_dots_paid_api_key_1 = key_1
    if not settings.google_dots_paid_api_key_2 and key_2:
        settings.google_dots_paid_api_key_2 = key_2
    if not settings.google_dots_paid_api_key_3 and key_3:
        settings.google_dots_paid_api_key_3 = key_3

    # 4) Build API key list (use settings if available, else use env)
    api_keys = []
    if settings.google_dots_paid_api_key_1:
        api_keys.append(settings.google_dots_paid_api_key_1)
    elif key_1:
        api_keys.append(key_1)

    if settings.google_dots_paid_api_key_2:
        api_keys.append(settings.google_dots_paid_api_key_2)
    elif key_2:
        api_keys.append(key_2)

    if settings.google_dots_paid_api_key_3:
        api_keys.append(settings.google_dots_paid_api_key_3)
    elif key_3:
        api_keys.append(key_3)

    logger.info("Total API keys loaded: %d", len(api_keys))

    key_manager = KeyManager(
        keys=api_keys,
        cooldown_seconds=settings.key_cooldown_seconds,
    )
    llm_service = LLMService(
        settings=settings,
        key_manager=key_manager,
    )
    usage_service = UsageService(settings=settings)
    canvas_service = CanvasService(settings=settings)
    node_service = NodeService()

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
    app.state.node_service = node_service

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
    app.include_router(node_router.router, prefix="/api")

    @app.get("/health", tags=["system"])
    async def health_check() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
