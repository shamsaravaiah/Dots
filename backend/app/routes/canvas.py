"""Canvas management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request, status

from ..dependencies import (
    get_current_user_optional,
    provide_canvas_service,
    provide_usage_service,
    verify_canvas_ownership,
)
from ..schemas.canvas import CanvasPatch, CanvasPayload
from ..services.canvas import CanvasService
from ..services.usage import Subject, UsageService

router = APIRouter(tags=["canvas"])


@router.post("/canvas", response_model=CanvasPayload)
async def create_canvas(
    payload: CanvasPayload,
    request: Request,
    canvas_service: CanvasService = Depends(provide_canvas_service),
    usage_service: UsageService = Depends(provide_usage_service),
) -> CanvasPayload:
    """Create a new canvas."""
    user = await get_current_user_optional(request)
    owner_id = user["id"] if user else "anonymous"
    
    # Prevent owner_id tampering - ensure payload owner_id matches authenticated user
    if payload.owner_id and payload.owner_id != owner_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot set owner_id to a different user",
        )
    
    # Set owner_id from authenticated user
    payload.owner_id = owner_id

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
    request: Request,
    canvas_service: CanvasService = Depends(provide_canvas_service),
) -> CanvasPayload | None:
    """Get a canvas by ID. Requires ownership verification."""
    user = await get_current_user_optional(request)
    user_id = user["id"] if user else None

    # Verify ownership (allows anonymous access to anonymous canvases)
    canvas_dict = await verify_canvas_ownership(
        canvas_id, user_id, canvas_service, allow_anonymous=True
    )
    
    return CanvasPayload(**canvas_dict)


@router.put("/canvas/{canvas_id}", response_model=CanvasPayload)
async def save_canvas(
    canvas_id: str,
    payload: CanvasPayload,
    request: Request,
    canvas_service: CanvasService = Depends(provide_canvas_service),
) -> CanvasPayload:
    """Save a canvas (full update). Requires ownership."""
    user = await get_current_user_optional(request)
    user_id = user["id"] if user else None

    # Verify ownership first
    canvas_dict = await verify_canvas_ownership(
        canvas_id, user_id, canvas_service, allow_anonymous=False
    )

    # Prevent owner_id tampering - ensure it matches the actual owner
    if payload.owner_id and payload.owner_id != canvas_dict.get("owner_id"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot change canvas owner_id",
        )

    # Ensure owner_id is set correctly
    payload.owner_id = canvas_dict.get("owner_id")
    
    return await canvas_service.save_canvas(canvas_id, payload, user_id)


@router.patch("/canvas/{canvas_id}", response_model=CanvasPayload)
async def patch_canvas(
    canvas_id: str,
    patch: CanvasPatch,
    request: Request,
    canvas_service: CanvasService = Depends(provide_canvas_service),
) -> CanvasPayload:
    """Patch a canvas with only changed fields (for autosave). Requires ownership."""
    user = await get_current_user_optional(request)
    user_id = user["id"] if user else None
    
    # Verify ownership
    canvas_dict = await verify_canvas_ownership(
        canvas_id, user_id, canvas_service, allow_anonymous=False
    )
    
    # Prevent owner_id tampering
    if hasattr(patch, 'owner_id') and patch.owner_id:
        if patch.owner_id != canvas_dict.get("owner_id"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot change canvas owner_id",
            )
    
    return await canvas_service.patch_canvas(canvas_id, patch, user_id)


@router.get("/user/canvases", response_model=list[CanvasPayload])
async def get_user_canvases(
    request: Request,
    canvas_service: CanvasService = Depends(provide_canvas_service),
) -> list[CanvasPayload]:
    """Get all canvases for the current user."""
    import logging
    logger = logging.getLogger("dots.canvas")

    try:
        user = await get_current_user_optional(request)
        if user and "id" in user:
            owner_id = user["id"]
            logger.info(
                "Fetching canvases for authenticated user: %s", owner_id
            )
        else:
            owner_id = "anonymous"
            logger.info("Fetching canvases for anonymous user")

        result = await canvas_service.get_user_canvases(owner_id)
        logger.info(
            "Successfully fetched %d canvases for user: %s",
            len(result),
            owner_id
        )
        return result
    except Exception as e:
        logger.error(
            "Error fetching user canvases: %s", str(e), exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch canvases: {str(e)}"
        ) from e
