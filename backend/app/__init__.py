"""
Application package initialization.

Exposes the FastAPI app instance for ASGI servers by importing
from `app.main`.
"""

from .main import app

__all__ = ["app"]
