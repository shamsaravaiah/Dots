"""Node management endpoints."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status

from ..dependencies import (
    get_current_user_optional,
    provide_canvas_service,
    provide_node_service,
    verify_canvas_ownership,
    verify_node_ownership,
)
from ..schemas.node import NodePatch, NodePayload
from ..services.canvas import CanvasService
from ..services.node import NodeService

router = APIRouter(tags=["node"])


@router.post("/node", response_model=NodePayload)
async def create_node(
    node: NodePayload,
    request: Request,
    node_service: NodeService = Depends(provide_node_service),
    canvas_service: CanvasService = Depends(provide_canvas_service),
) -> NodePayload:
    """Create a new node. Requires canvas ownership."""
    user = await get_current_user_optional(request)
    user_id = user["id"] if user else "anonymous"
    
    # Verify canvas ownership before allowing node creation
    canvas_dict = await verify_canvas_ownership(
        node.canvas_id, user_id, canvas_service, allow_anonymous=True
    )
    
    # Prevent owner_id tampering
    if node.owner_id and node.owner_id != canvas_dict.get("owner_id"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Node owner_id must match canvas owner_id",
        )
    
    # Set owner_id from canvas
    node.owner_id = canvas_dict.get("owner_id", "anonymous")

    result = await node_service.create_node(node, user_id)

    # Atomically increment node_count (much faster than recounting)
    await canvas_service.increment_node_count(node.canvas_id, delta=1)

    return result


@router.get("/node/{node_id}", response_model=NodePayload)
async def get_node(
    node_id: str,
    request: Request,
    node_service: NodeService = Depends(provide_node_service),
    canvas_service: CanvasService = Depends(provide_canvas_service),
) -> NodePayload:
    """Get a single node by ID. Requires canvas ownership."""
    user = await get_current_user_optional(request)
    user_id = user["id"] if user else None
    
    # Verify ownership through canvas
    node_dict = await verify_node_ownership(
        node_id, user_id, node_service, canvas_service
    )
    
    return NodePayload(**node_dict)


@router.get("/canvas/{canvas_id}/nodes", response_model=List[NodePayload])
async def get_canvas_nodes(
    canvas_id: str,
    request: Request,
    node_service: NodeService = Depends(provide_node_service),
    canvas_service: CanvasService = Depends(provide_canvas_service),
) -> List[NodePayload]:
    """Get all nodes for a canvas. Requires canvas ownership."""
    user = await get_current_user_optional(request)
    user_id = user["id"] if user else None
    
    # Verify canvas ownership
    await verify_canvas_ownership(
        canvas_id, user_id, canvas_service, allow_anonymous=True
    )
    
    return await node_service.get_nodes_by_canvas(canvas_id)


@router.get(
    "/canvas/{canvas_id}/node/{parent_id}/children",
    response_model=List[NodePayload],
)
async def get_node_children(
    canvas_id: str,
    parent_id: str,
    request: Request,
    node_service: NodeService = Depends(provide_node_service),
    canvas_service: CanvasService = Depends(provide_canvas_service),
) -> List[NodePayload]:
    """Get all children of a parent node. Requires canvas ownership."""
    user = await get_current_user_optional(request)
    user_id = user["id"] if user else None
    
    # Verify canvas ownership
    await verify_canvas_ownership(
        canvas_id, user_id, canvas_service, allow_anonymous=True
    )
    
    return await node_service.get_children(canvas_id, parent_id)


@router.patch("/node/{node_id}", response_model=NodePayload)
async def patch_node(
    node_id: str,
    patch: NodePatch,
    request: Request,
    node_service: NodeService = Depends(provide_node_service),
    canvas_service: CanvasService = Depends(provide_canvas_service),
) -> NodePayload:
    """Patch a node with only changed fields (for autosave). Requires ownership."""
    user = await get_current_user_optional(request)
    user_id = user["id"] if user else "anonymous"
    
    # Verify ownership
    node_dict = await verify_node_ownership(
        node_id, user_id, node_service, canvas_service
    )
    
    # Prevent canvas_id tampering
    if hasattr(patch, 'canvas_id') and patch.canvas_id:
        if patch.canvas_id != node_dict.get("canvas_id"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot change node canvas_id",
            )
    
    # Ensure canvas_id is set correctly
    if hasattr(patch, 'canvas_id'):
        patch.canvas_id = node_dict.get("canvas_id")

    return await node_service.update_node(node_id, patch, user_id)


@router.put("/node/{node_id}", response_model=NodePayload)
async def update_node(
    node_id: str,
    node: NodePayload,
    request: Request,
    node_service: NodeService = Depends(provide_node_service),
    canvas_service: CanvasService = Depends(provide_canvas_service),
) -> NodePayload:
    """Update a node (full update). Requires ownership."""
    user = await get_current_user_optional(request)
    user_id = user["id"] if user else "anonymous"
    
    # Verify ownership
    node_dict = await verify_node_ownership(
        node_id, user_id, node_service, canvas_service
    )
    
    # Prevent canvas_id and owner_id tampering
    if node.canvas_id != node_dict.get("canvas_id"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot change node canvas_id",
        )

    if node.owner_id != node_dict.get("owner_id"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot change node owner_id",
        )
    
    # Ensure IDs match
    node.canvas_id = node_dict.get("canvas_id")
    node.owner_id = node_dict.get("owner_id")

    # Convert full node to patch for update
    patch = NodePatch(
        id=node.id,
        canvas_id=node.canvas_id,
        **node.dict(exclude={"id", "canvas_id", "owner_id"}),
    )
    return await node_service.update_node(node_id, patch, user_id)


@router.delete("/node/{node_id}")
async def delete_node(
    node_id: str,
    request: Request,
    node_service: NodeService = Depends(provide_node_service),
    canvas_service: CanvasService = Depends(provide_canvas_service),
) -> dict:
    """Delete a node (soft delete). Requires ownership."""
    user = await get_current_user_optional(request)
    user_id = user["id"] if user else "anonymous"
    
    # Verify ownership
    node_dict = await verify_node_ownership(
        node_id, user_id, node_service, canvas_service
    )
    
    canvas_id = node_dict.get("canvas_id")

    await node_service.delete_node(node_id)

    # Atomically decrement node_count (much faster than recounting)
    await canvas_service.increment_node_count(canvas_id, delta=-1)

    return {"status": "deleted"}


@router.post("/nodes/batch", response_model=List[NodePayload])
async def create_nodes_batch(
    nodes: List[NodePayload],
    request: Request,
    node_service: NodeService = Depends(provide_node_service),
    canvas_service: CanvasService = Depends(provide_canvas_service),
) -> List[NodePayload]:
    """Create multiple nodes in a single batch operation.
    
    This is more efficient than creating nodes individually when
    creating many nodes at once. Maximum 500 nodes per batch.
    Requires canvas ownership.
    """
    if not nodes:
        return []
    
    user = await get_current_user_optional(request)
    user_id = user["id"] if user else "anonymous"
    
    # Get canvas_id from first node (all should be same canvas)
    canvas_id = nodes[0].canvas_id if nodes else None
    if not canvas_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nodes must have a canvas_id",
        )
    
    # Verify canvas ownership
    canvas_dict = await verify_canvas_ownership(
        canvas_id, user_id, canvas_service, allow_anonymous=True
    )
    
    # Verify all nodes are for the same canvas
    for node in nodes:
        if node.canvas_id != canvas_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="All nodes must belong to the same canvas",
            )
        
        # Prevent owner_id tampering
        if node.owner_id and node.owner_id != canvas_dict.get("owner_id"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Node owner_id must match canvas owner_id",
            )
        
        # Set owner_id from canvas
        node.owner_id = canvas_dict.get("owner_id", "anonymous")
    
    result = await node_service.create_nodes_batch(nodes, user_id)
    
    # Atomically increment node_count by the number of nodes created
    await canvas_service.increment_node_count(canvas_id, delta=len(nodes))
    
    return result
