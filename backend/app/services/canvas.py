"""Canvas persistence service (Firestore integration to be added)."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import List, Optional

from fastapi import HTTPException, status
from fastapi.concurrency import run_in_threadpool

from ..config import Settings
from ..policy import get_plan_policy
from ..schemas.canvas import CanvasPatch, CanvasPayload
from .firestore import get_firestore_client, with_firestore_retry
from .node import NodeService

logger = logging.getLogger("dots.canvas")


class CanvasService:
    """Canvas service with Firestore integration and quota enforcement."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._db = get_firestore_client()
        self._node_service = NodeService()

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

    async def count_canvas_nodes(self, canvas_id: str) -> int:
        """Count active nodes in a canvas."""
        return await self._node_service.count_nodes_in_canvas(canvas_id)

    async def get_user_canvases(self, user_id: str) -> List[CanvasPayload]:
        """Get all canvases owned by a user."""
        logger.info("Fetching canvases for user %s", user_id)

        def _get_all():
            try:
                canvases_ref = self._db.collection("canvases")
                # Query by owner_id and order by updated_at
                # Note: Firestore requires an index for this query,
                # but we'll handle errors gracefully
                try:
                    query = (
                        canvases_ref.where("owner_id", "==", user_id)
                        .order_by("updated_at", direction="DESCENDING")
                    )
                    docs = list(query.stream())
                    logger.debug(
                        "Found %d canvases with ordering", len(docs)
                    )
                except Exception as e:
                    logger.warning(
                        "Failed to order by updated_at, "
                        "falling back to simple query: %s",
                        e,
                    )
                    # Fallback: just filter by owner_id
                    query = canvases_ref.where("owner_id", "==", user_id)
                    docs = list(query.stream())
                    logger.debug(
                        "Found %d canvases without ordering", len(docs)
                    )

                results = []
                for doc in docs:
                    try:
                        data = doc.to_dict() or {}
                        data["id"] = doc.id

                        # Ensure required fields have defaults
                        if "title" not in data:
                            data["title"] = ""
                        if "description" not in data:
                            data["description"] = ""
                        if "status" not in data:
                            data["status"] = "active"
                        if "node_count" not in data:
                            data["node_count"] = 0

                        # Convert Firestore timestamps
                        timestamp_fields = [
                            "created_at", "updated_at", "archived_at"
                        ]
                        for field in timestamp_fields:
                            if field in data and data[field]:
                                if hasattr(data[field], "timestamp"):
                                    data[field] = datetime.fromtimestamp(
                                        data[field].timestamp()
                                    )
                                elif hasattr(data[field], "replace"):
                                    # Already a datetime object
                                    pass

                        # Parse with Pydantic
                        canvas = CanvasPayload(**data)
                        results.append(canvas)
                    except Exception as e:
                        logger.error(
                            "Failed to parse canvas %s: %s. Data: %s",
                            doc.id, e, str(data)[:200]
                        )
                        # Continue with next canvas instead of failing
                        continue

                logger.info(
                    "Successfully parsed %d canvases for user %s",
                    len(results), user_id
                )
                return results
            except Exception as e:
                logger.error(
                    "Error in _get_all for user %s: %s",
                    user_id, str(e), exc_info=True
                )
                raise

        return await run_in_threadpool(_get_all)

    async def get_canvas(self, canvas_id: str) -> Optional[CanvasPayload]:
        logger.debug("Fetching canvas %s", canvas_id)

        def _get():
            doc = self._db.collection("canvases").document(canvas_id).get()
            if not doc.exists:
                return None
            data = doc.to_dict() or {}
            data["id"] = doc.id
            # Convert Firestore timestamps to datetime
            for field in ["created_at", "updated_at", "archived_at"]:
                if field in data and data[field]:
                    if hasattr(data[field], "timestamp"):
                        data[field] = datetime.fromtimestamp(
                            data[field].timestamp()
                        )
            return CanvasPayload(**data)
        return await run_in_threadpool(_get)

    async def save_canvas(
        self,
        canvas_id: str,
        payload: CanvasPayload,
        user_id: Optional[str] = None,
    ) -> CanvasPayload:
        """Save a canvas (full update)."""
        logger.debug("Saving canvas %s", canvas_id)

        # Get canvas to check ownership
        canvas = await self.get_canvas(canvas_id)
        if not canvas:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Canvas not found",
            )

        owner_id = canvas.owner_id
        if not owner_id:
            owner_id = "anonymous"

        # Check node count limit for free tier
        if owner_id != "anonymous":
            plan = await self.get_user_plan(owner_id)
            if plan == "free":
                # Count actual nodes in Firestore
                node_count = await self.count_canvas_nodes(canvas_id)
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
            doc_ref = self._db.collection("canvases").document(canvas_id)
            # Use model_dump() for Pydantic v2, or dict() for v1
            try:
                if hasattr(payload, 'model_dump'):
                    canvas_data = payload.model_dump(exclude_none=True)
                else:
                    canvas_data = payload.dict(exclude_none=True)
            except Exception:
                canvas_data = payload.dict(exclude_none=True)

            canvas_data["updated_at"] = datetime.utcnow()
            if user_id:
                canvas_data["updated_by"] = user_id
            
            # Prevent owner_id tampering - ensure it matches the actual owner
            if canvas_data.get("owner_id") != owner_id:
                logger.warning(
                    "Attempted owner_id tampering on canvas %s: "
                    "expected %s, got %s",
                    canvas_id, owner_id, canvas_data.get("owner_id")
                )
                canvas_data["owner_id"] = owner_id
            
            logger.info("Saving canvas %s", canvas_id)
            
            # Apply retry to the Firestore operation
            @with_firestore_retry
            def _save_operation():
                doc_ref.set(canvas_data, merge=True)
            
            _save_operation()
            logger.info("Canvas %s saved successfully", canvas_id)
            return payload

        return await run_in_threadpool(_save)

    async def patch_canvas(
        self,
        canvas_id: str,
        patch: CanvasPatch,
        user_id: Optional[str] = None,
    ) -> CanvasPayload:
        """Patch a canvas with only changed fields (for autosave)."""
        logger.debug("Patching canvas %s", canvas_id)

        # Get current canvas to check revision
        current_canvas = await self.get_canvas(canvas_id)
        if not current_canvas:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Canvas not found",
            )

        # Check revision if provided
        if patch.version is not None:
            if patch.version < current_canvas.version:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Version conflict: canvas has version "
                        f"{current_canvas.version}, but update has "
                        f"version {patch.version}"
                    ),
                )

        def _patch():
            doc_ref = self._db.collection("canvases").document(canvas_id)
            # Use model_dump() for Pydantic v2, or dict() for v1
            try:
                if hasattr(patch, 'model_dump'):
                    update_data = patch.model_dump(
                        exclude_none=True, exclude={"id"}
                    )
                else:
                    update_data = patch.dict(exclude_none=True, exclude={"id"})
            except Exception:
                update_data = patch.dict(exclude_none=True, exclude={"id"})

            update_data["updated_at"] = datetime.utcnow()
            if user_id:
                update_data["updated_by"] = user_id
            # Increment version if not explicitly set
            if "version" not in update_data:
                update_data["version"] = current_canvas.version + 1
            logger.info(
                "Patching canvas %s with fields: %s",
                canvas_id,
                list(update_data.keys()),
            )
            
            # Apply retry to the Firestore operation
            @with_firestore_retry
            def _patch_operation():
                doc_ref.update(update_data)
            
            _patch_operation()
            logger.info("Canvas %s patched successfully", canvas_id)

            # Fetch updated canvas
            doc = doc_ref.get()
            data = doc.to_dict() or {}
            data["id"] = doc.id
            # Convert Firestore timestamps
            for field in ["created_at", "updated_at", "archived_at"]:
                if field in data and data[field]:
                    if hasattr(data[field], "timestamp"):
                        data[field] = datetime.fromtimestamp(
                            data[field].timestamp()
                        )
            return CanvasPayload(**data)

        return await run_in_threadpool(_patch)

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

        def _create():
            doc_ref = self._db.collection("canvases").document()
            now = datetime.utcnow()
            # Use model_dump() for Pydantic v2, or dict() for v1
            try:
                if hasattr(payload, 'model_dump'):
                    # Use mode='python' to get native Python types
                    canvas_data = payload.model_dump(
                        exclude_none=True, mode='python'
                    )
                else:
                    canvas_data = payload.dict(exclude_none=True)
            except Exception as e:
                logger.warning(
                    "Failed to use model_dump, falling back to dict(): %s", e
                )
                canvas_data = payload.dict(exclude_none=True)

            canvas_data["owner_id"] = owner_id
            canvas_data["id"] = doc_ref.id
            canvas_data["created_at"] = now
            canvas_data["updated_at"] = now
            canvas_data["node_count"] = 0  # Start with 0 nodes

            logger.info(
                "Creating canvas %s for owner %s", doc_ref.id, owner_id
            )
            logger.debug("Canvas data keys: %s", list(canvas_data.keys()))
            
            # Apply retry to the Firestore operation
            @with_firestore_retry
            def _create_operation():
                doc_ref.set(canvas_data)
            
            _create_operation()
            logger.info("Canvas %s created successfully", doc_ref.id)
            return CanvasPayload(**canvas_data)

        result = await run_in_threadpool(_create)
        return result

    async def update_node_count(self, canvas_id: str) -> None:
        """Update the node_count field on a canvas.
        
        DEPRECATED: Use increment_node_count instead for better performance.
        This method still exists for backward compatibility and quota checks.
        """
        node_count = await self.count_canvas_nodes(canvas_id)

        def _update_count():
            self._db.collection("canvases").document(canvas_id).update(
                {"node_count": node_count, "updated_at": datetime.utcnow()}
            )

        await run_in_threadpool(_update_count)

    async def increment_node_count(
        self, canvas_id: str, delta: int = 1
    ) -> None:
        """Atomically increment or decrement the node_count field on a canvas.
        
        This is much more efficient than recounting all nodes, especially
        for large canvases. Use delta=1 to increment, delta=-1 to decrement.
        """
        from google.cloud.firestore import Increment

        def _increment():
            doc_ref = self._db.collection("canvases").document(canvas_id)
            
            # Apply retry to the Firestore operation
            @with_firestore_retry
            def _increment_operation():
                doc_ref.update({
                    "node_count": Increment(delta),
                    "updated_at": datetime.utcnow()
                })
            
            _increment_operation()
            logger.debug(
                "Incremented node_count by %d for canvas %s", delta, canvas_id
            )

        await run_in_threadpool(_increment)
