"""Canvas management endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status

from ..dependencies import provide_canvas_service, provide_usage_service
from ..schemas.canvas import CanvasPayload
from ..services.canvas import CanvasService
from ..services.usage import Subject, UsageService

router = APIRouter(tags=["canvas"])


async def get_current_user_optional(request: Request) -> Optional[dict]:
    """Get current user from token if available, otherwise return None."""
    from ..config import get_settings
    from ..services.auth import AuthService

    settings = get_settings()
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


@router.post("/canvas", response_model=CanvasPayload)
async def create_canvas(
    payload: CanvasPayload,
    request: Request,
    canvas_service: CanvasService = Depends(provide_canvas_service),
    usage_service: UsageService = Depends(provide_usage_service),
) -> CanvasPayload:
    user = await get_current_user_optional(request)
    owner_id = user["id"] if user else "anonymous"

    result = await canvas_service.create_canvas(
        owner_id=owner_id,
        payload=payload,
    )

    # Increment chat usage for free tier users
    if user:
        subject = Subject(
            id=user["id"],
            plan=user.get("plan", "free"),
            is_authenticated=True,
        )
        await usage_service.increment_chat_usage(subject)

    return result


@router.get("/canvas/{canvas_id}", response_model=CanvasPayload | None)
async def get_canvas(
    canvas_id: str,
    canvas_service: CanvasService = Depends(provide_canvas_service),
) -> CanvasPayload | None:
    canvas = await canvas_service.get_canvas(canvas_id)
    if canvas is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canvas not found",
        )
    return canvas


@router.put("/canvas/{canvas_id}", response_model=CanvasPayload)
async def save_canvas(
    canvas_id: str,
    payload: CanvasPayload,
    canvas_service: CanvasService = Depends(provide_canvas_service),
) -> CanvasPayload:
    return await canvas_service.save_canvas(canvas_id, payload)
