"""Node service for managing nodes in Firestore."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import List, Optional

from fastapi import HTTPException, status
from fastapi.concurrency import run_in_threadpool

from ..schemas.node import NodePatch, NodePayload
from .firestore import get_firestore_client, with_firestore_retry

logger = logging.getLogger("dots.node")


class NodeService:
    """Service for managing nodes in Firestore."""

    def __init__(self) -> None:
        self._db = get_firestore_client()

    async def get_node(self, node_id: str) -> Optional[NodePayload]:
        """Get a single node by ID."""
        logger.debug("Fetching node %s", node_id)

        def _get():
            doc = self._db.collection("nodes").document(node_id).get()
            if not doc.exists:
                return None
            data = doc.to_dict() or {}
            data["id"] = doc.id
            return NodePayload(**data)

        return await run_in_threadpool(_get)

    async def get_nodes_by_canvas(
        self, canvas_id: str
    ) -> List[NodePayload]:
        """Get all nodes for a canvas."""
        logger.debug("Fetching nodes for canvas %s", canvas_id)

        def _get_all():
            query = (
                self._db.collection("nodes")
                .where("canvas_id", "==", canvas_id)
                .stream()
            )
            nodes = []
            for doc in query:
                data = doc.to_dict() or {}
                data["id"] = doc.id
                nodes.append(NodePayload(**data))
            return nodes

        return await run_in_threadpool(_get_all)

    async def get_children(
        self, canvas_id: str, parent_id: str
    ) -> List[NodePayload]:
        """Get all children of a parent node."""
        logger.debug(
            "Fetching children of node %s in canvas %s",
            parent_id,
            canvas_id,
        )

        def _get_children():
            query = (
                self._db.collection("nodes")
                .where("canvas_id", "==", canvas_id)
                .where("parent_id", "==", parent_id)
                .stream()
            )
            children = []
            for doc in query:
                data = doc.to_dict() or {}
                data["id"] = doc.id
                children.append(NodePayload(**data))
            return children

        return await run_in_threadpool(_get_children)

    async def create_node(
        self, node: NodePayload, user_id: str
    ) -> NodePayload:
        """Create a new node."""
        logger.info("Creating node %s in canvas %s", node.id, node.canvas_id)

        now = datetime.utcnow()

        def _create():
            doc_ref = self._db.collection("nodes").document(node.id)
            # Use model_dump() for Pydantic v2, or dict() for v1
            # This properly serializes nested models recursively
            try:
                if hasattr(node, 'model_dump'):
                    # Use mode='python' to get native Python types
                    node_data = node.model_dump(mode='python')
                else:
                    # Pydantic v1 dict() already handles nested models
                    node_data = node.dict()
            except Exception as e:
                logger.warning(
                    "Failed to use model_dump, falling back to dict(): %s", e
                )
                node_data = node.dict()

            # Ensure nested objects are properly serialized
            node_data["created_at"] = now
            node_data["updated_at"] = now
            node_data["created_by"] = user_id
            node_data["updated_by"] = user_id

            logger.info("Saving node data to Firestore: %s", node.id)
            logger.debug("Node data keys: %s", list(node_data.keys()))
            
            # Apply retry to the Firestore operation
            @with_firestore_retry
            def _create_operation():
                doc_ref.set(node_data)
            
            _create_operation()
            logger.info("Node %s saved successfully", node.id)
            return node

        return await run_in_threadpool(_create)

    async def update_node(
        self, node_id: str, patch: NodePatch, user_id: str
    ) -> NodePayload:
        """Update a node with only changed fields (patch)."""
        logger.debug("Updating node %s", node_id)

        # Get current node to check revision
        current_node = await self.get_node(node_id)
        if not current_node:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Node not found",
            )

        # Check revision to prevent overwriting newer changes
        if patch.revision is not None:
            if patch.revision < current_node.revision:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Revision conflict: node has revision "
                        f"{current_node.revision}, but update has "
                        f"revision {patch.revision}"
                    ),
                )

        def _update():
            doc_ref = self._db.collection("nodes").document(node_id)
            # Use model_dump() for Pydantic v2, or dict() for v1
            try:
                if hasattr(patch, 'model_dump'):
                    update_data = patch.model_dump(
                        exclude_none=True, exclude={"id", "canvas_id"}
                    )
                else:
                    update_data = patch.dict(
                        exclude_none=True, exclude={"id", "canvas_id"}
                    )
            except Exception:
                update_data = patch.dict(
                    exclude_none=True, exclude={"id", "canvas_id"}
                )

            update_data["updated_at"] = datetime.utcnow()
            update_data["updated_by"] = user_id
            # Increment revision if not explicitly set
            if "revision" not in update_data:
                update_data["revision"] = current_node.revision + 1

            logger.info(
                "Updating node %s with data: %s",
                node_id,
                list(update_data.keys()),
            )
            
            # Apply retry to the Firestore operation
            @with_firestore_retry
            def _update_operation():
                doc_ref.update(update_data)
            
            _update_operation()
            logger.info("Node %s updated successfully", node_id)

            # Fetch updated node
            doc = doc_ref.get()
            data = doc.to_dict() or {}
            data["id"] = doc.id
            return NodePayload(**data)

        return await run_in_threadpool(_update)

    async def delete_node(self, node_id: str) -> None:
        """Delete a node (soft delete by setting status)."""
        logger.debug("Deleting node %s", node_id)

        def _delete():
            doc_ref = self._db.collection("nodes").document(node_id)
            
            # Apply retry to the Firestore operation
            @with_firestore_retry
            def _delete_operation():
                doc_ref.update(
                    {"status": "deleted", "updated_at": datetime.utcnow()}
                )
            
            _delete_operation()

        await run_in_threadpool(_delete)

    async def create_nodes_batch(
        self, nodes: List[NodePayload], user_id: str
    ) -> List[NodePayload]:
        """Create multiple nodes in a single batch write.
        
        This is much more efficient than creating nodes individually,
        especially when creating many nodes at once. Firestore batch
        writes are limited to 500 operations per batch.
        """
        logger.info(
            "Creating %d nodes in batch for user %s", len(nodes), user_id
        )
        
        if not nodes:
            return []
        
        # Firestore batch limit is 500 operations
        if len(nodes) > 500:
            raise ValueError(
                f"Cannot create more than 500 nodes in a single batch. "
                f"Got {len(nodes)} nodes."
            )
        
        now = datetime.utcnow()
        
        def _create_batch():
            batch = self._db.batch()
            
            for node in nodes:
                doc_ref = self._db.collection("nodes").document(node.id)
                # Use model_dump() for Pydantic v2, or dict() for v1
                try:
                    if hasattr(node, 'model_dump'):
                        node_data = node.model_dump(mode='python')
                    else:
                        node_data = node.dict()
                except Exception as e:
                    logger.warning(
                        "Failed to use model_dump for node %s, "
                        "falling back to dict(): %s", node.id, e
                    )
                    node_data = node.dict()
                
                node_data["created_at"] = now
                node_data["updated_at"] = now
                node_data["created_by"] = user_id
                node_data["updated_by"] = user_id
                
                batch.set(doc_ref, node_data)
            
            # Apply retry to the batch commit
            @with_firestore_retry
            def _commit_batch():
                batch.commit()
            
            _commit_batch()
            logger.info("Successfully created %d nodes in batch", len(nodes))
            return nodes
        
        return await run_in_threadpool(_create_batch)

    async def count_nodes_in_canvas(self, canvas_id: str) -> int:
        """Count active nodes in a canvas."""
        def _count():
            # Simplified query - only filter by canvas_id,
            # then filter status in Python
            # This avoids needing a composite index
            query = (
                self._db.collection("nodes")
                .where("canvas_id", "==", canvas_id)
                .stream()
            )
            # Filter out deleted nodes in Python instead of Firestore
            nodes = [
                doc for doc in query
                if doc.to_dict().get("status") != "deleted"
            ]
            return len(nodes)

        return await run_in_threadpool(_count)
