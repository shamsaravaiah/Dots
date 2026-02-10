"""ASGI entrypoint for legacy import paths.

This file exists to maintain compatibility with deployment scripts that expect
an `app` module at `backend.app`. The actual application instance lives in
`app.main`.
"""

from app.main import app  # noqa: F401
