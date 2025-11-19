"""Canvas persistence service (Firestore integration to be added)."""

from __future__ import annotations

import logging
from typing import Optional

from ..config import Settings
from ..schemas.canvas import CanvasPayload

logger = logging.getLogger("dots.canvas")


class CanvasService:
    """Stub service that will manage canvas CRUD operations."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def get_canvas(self, canvas_id: str) -> Optional[CanvasPayload]:
        logger.debug("Fetching canvas %s", canvas_id)
        # TODO: integrate Firestore read.
        return None

    async def save_canvas(
        self,
        canvas_id: str,
        payload: CanvasPayload,
    ) -> CanvasPayload:
        logger.debug("Saving canvas %s", canvas_id)
        # TODO: integrate Firestore write.
        return payload

    async def create_canvas(
        self,
        owner_id: str,
        payload: CanvasPayload,
    ) -> CanvasPayload:
        logger.debug("Creating canvas for owner %s", owner_id)
        # TODO: integrate Firestore create.
        return payload
