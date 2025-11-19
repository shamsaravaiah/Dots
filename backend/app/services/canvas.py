"""Canvas persistence service (Firestore integration to be added)."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import HTTPException, status
from fastapi.concurrency import run_in_threadpool

from ..config import Settings
from ..policy import get_plan_policy
from ..schemas.canvas import CanvasPayload
from .firestore import get_firestore_client

logger = logging.getLogger("dots.canvas")


class CanvasService:
    """Canvas service with Firestore integration and quota enforcement."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._db = get_firestore_client()

    async def get_user_plan(self, user_id: str) -> str:
        """Get user's plan from Firestore."""
        def _get_plan():
            doc = self._db.collection("users").document(user_id).get()
            if not doc.exists:
                return "anonymous"
            data = doc.to_dict() or {}
            return data.get("plan", "free")
        return await run_in_threadpool(_get_plan)

    async def count_user_canvases(self, user_id: str) -> int:
        """Count how many canvases a user has."""
        def _count():
            canvases_ref = self._db.collection("canvases")
            query = canvases_ref.where("owner_id", "==", user_id)
            return len(list(query.stream()))
        return await run_in_threadpool(_count)

    async def count_canvas_nodes(self, payload: CanvasPayload) -> int:
        """Count nodes in a canvas payload."""
        # Assuming CanvasPayload has a nodes field or similar
        # Adjust based on actual schema
        if hasattr(payload, "nodes"):
            return len(payload.nodes) if payload.nodes else 0
        if isinstance(payload, dict):
            nodes = payload.get("nodes", [])
            return len(nodes) if nodes else 0
        return 0

    async def get_canvas(self, canvas_id: str) -> Optional[CanvasPayload]:
        logger.debug("Fetching canvas %s", canvas_id)

        def _get():
            doc = self._db.collection("canvases").document(canvas_id).get()
            if not doc.exists:
                return None
            data = doc.to_dict() or {}
            # Store owner_id separately for access
            owner_id = data.pop("owner_id", None)
            canvas = CanvasPayload(**data)
            # Add owner_id as attribute for later access
            if owner_id:
                setattr(canvas, "owner_id", owner_id)
            return canvas
        return await run_in_threadpool(_get)

    async def save_canvas(
        self,
        canvas_id: str,
        payload: CanvasPayload,
    ) -> CanvasPayload:
        logger.debug("Saving canvas %s", canvas_id)

        # Get canvas owner
        canvas = await self.get_canvas(canvas_id)
        if not canvas:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Canvas not found",
            )

        owner_id = canvas.owner_id if hasattr(canvas, "owner_id") else None
        if not owner_id:
            # If no owner, allow save (anonymous)
            def _save():
                self._db.collection("canvases").document(canvas_id).set(
                    payload.dict() if hasattr(payload, "dict") else payload,
                    merge=True,
                )
            await run_in_threadpool(_save)
            return payload

        # Check node count limit for free tier
        plan = await self.get_user_plan(owner_id)
        if plan == "free":
            node_count = await self.count_canvas_nodes(payload)
            policy = get_plan_policy(self._settings, plan)
            max_nodes = policy.node_quota.get("per_canvas")
            if max_nodes and node_count > max_nodes:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={
                        "message": (
                            f"Maximum nodes per canvas ({max_nodes}) "
                            f"exceeded. You have {node_count} nodes. "
                            "Upgrade to unlock more nodes per canvas and "
                            "more features!"
                        ),
                        "upgrade_required": True,
                        "upgrade_url": "/pricing",
                        "limit_type": "nodes_per_canvas",
                        "current_usage": node_count,
                        "limit": max_nodes,
                    },
                )

        def _save():
            self._db.collection("canvases").document(canvas_id).set(
                payload.dict() if hasattr(payload, "dict") else payload,
                merge=True,
            )
        await run_in_threadpool(_save)
        return payload

    async def create_canvas(
        self,
        owner_id: str,
        payload: CanvasPayload,
    ) -> CanvasPayload:
        logger.debug("Creating canvas for owner %s", owner_id)

        # Check canvas count limit for free tier
        if owner_id != "anonymous":
            plan = await self.get_user_plan(owner_id)
            if plan == "free":
                canvas_count = await self.count_user_canvases(owner_id)
                policy = get_plan_policy(self._settings, plan)
                max_canvases = policy.max_canvases
                if max_canvases and canvas_count >= max_canvases:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail={
                            "message": (
                                f"You've reached the maximum number of "
                                f"canvases ({max_canvases}) for the free "
                                "tier. Upgrade to unlock unlimited canvases "
                                "and more features!"
                            ),
                            "upgrade_required": True,
                            "upgrade_url": "/pricing",
                            "limit_type": "canvases",
                            "current_usage": canvas_count,
                            "limit": max_canvases,
                        },
                    )

        # Check node count limit
        if owner_id != "anonymous":
            plan = await self.get_user_plan(owner_id)
            if plan == "free":
                node_count = await self.count_canvas_nodes(payload)
                policy = get_plan_policy(self._settings, plan)
                max_nodes = policy.node_quota.get("per_canvas")
                if max_nodes and node_count > max_nodes:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail={
                            "message": (
                                f"Maximum nodes per canvas ({max_nodes}) "
                                f"exceeded. You have {node_count} nodes. "
                                "Upgrade to unlock more nodes per canvas and "
                                "more features!"
                            ),
                            "upgrade_required": True,
                            "upgrade_url": "/pricing",
                            "limit_type": "nodes_per_canvas",
                            "current_usage": node_count,
                            "limit": max_nodes,
                        },
                    )

        def _create():
            doc_ref = self._db.collection("canvases").document()
            canvas_data = (
                payload.dict() if hasattr(payload, "dict") else payload
            )
            canvas_data["owner_id"] = owner_id
            canvas_data["id"] = doc_ref.id
            doc_ref.set(canvas_data)
            return CanvasPayload(**canvas_data)

        result = await run_in_threadpool(_create)
        return result
