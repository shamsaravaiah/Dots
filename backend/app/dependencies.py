"""Dependency helpers for FastAPI routes."""

from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, Request, status

from .config import Settings, get_settings
from .services.canvas import CanvasService
from .services.llm import LLMService
from .services.node import NodeService
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


def get_node_service_dependency(request: Request) -> NodeService:
    return request.app.state.node_service  # type: ignore[attr-defined]


def provide_node_service(
    node_service: NodeService = Depends(get_node_service_dependency),
) -> NodeService:
    return node_service


# ========== AUTHENTICATION DEPENDENCIES ==========

async def get_current_user_optional(request: Request) -> Optional[dict]:
    """Get current user from token if available, otherwise return None."""
    from .services.auth import AuthService

    settings = get_settings()  # Already imported at top of file
    auth_service = AuthService(settings)

    authorization = request.headers.get("Authorization")
    token: Optional[str] = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    elif authorization:
        token = authorization

    if not token:
        return None

    try:
        user = await auth_service.verify_token(token)
        return user
    except Exception:
        return None


async def get_current_user_required(request: Request) -> dict:
    """Get current user from token, raise 401 if not authenticated."""
    user = await get_current_user_optional(request)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


# ========== AUTHORIZATION HELPERS ==========

async def verify_canvas_ownership(
    canvas_id: str,
    user_id: Optional[str],
    canvas_service: CanvasService,
    allow_anonymous: bool = False,
) -> dict:
    """Verify user owns the canvas, raise 403/404 if not.

    Args:
        canvas_id: Canvas ID to check
        user_id: Current user ID (None for anonymous)
        canvas_service: Canvas service instance
        allow_anonymous: If True, allow anonymous users to access anonymous canvases

    Returns:
        Canvas data dict

    Raises:
        HTTPException: 404 if canvas not found, 403 if access denied
    """
    canvas = await canvas_service.get_canvas(canvas_id)
    if not canvas:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canvas not found",
        )

    # Convert canvas to dict if it's a Pydantic model
    if hasattr(canvas, 'dict'):
        canvas_dict = canvas.dict()
    elif hasattr(canvas, 'model_dump'):
        canvas_dict = canvas.model_dump()
    else:
        canvas_dict = canvas

    owner_id = canvas_dict.get("owner_id")

    # Handle anonymous canvases
    if owner_id == "anonymous":
        if allow_anonymous and not user_id:
            # Anonymous user accessing anonymous canvas - allowed
            return canvas_dict
        elif user_id:
            # Authenticated user trying to access anonymous canvas
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Access denied: Cannot access anonymous canvas"
                ),
            )
        else:
            # Anonymous user, but allow_anonymous is False
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Authentication required",
            )

    # Handle authenticated user canvases
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if owner_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You do not own this canvas",
        )

    return canvas_dict


async def verify_node_ownership(
    node_id: str,
    user_id: Optional[str],
    node_service: NodeService,
    canvas_service: CanvasService,
) -> dict:
    """Verify user owns the canvas that contains this node.

    Args:
        node_id: Node ID to check
        user_id: Current user ID (None for anonymous)
        node_service: Node service instance
        canvas_service: Canvas service instance

    Returns:
        Node data dict

    Raises:
        HTTPException: 404 if node/canvas not found, 403 if access denied
    """
    node = await node_service.get_node(node_id)
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Node not found",
        )

    # Convert node to dict if it's a Pydantic model
    if hasattr(node, 'dict'):
        node_dict = node.dict()
    elif hasattr(node, 'model_dump'):
        node_dict = node.model_dump()
    else:
        node_dict = node

    canvas_id = node_dict.get("canvas_id")
    if not canvas_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Node has no canvas_id",
        )

    # Verify canvas ownership
    await verify_canvas_ownership(
        canvas_id, user_id, canvas_service, allow_anonymous=True
    )

    return node_dict
