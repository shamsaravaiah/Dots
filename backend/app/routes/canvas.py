"""Canvas management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status

from ..dependencies import provide_canvas_service
from ..schemas.canvas import CanvasPayload
from ..services.canvas import CanvasService

router = APIRouter(tags=["canvas"])


@router.post("/canvas", response_model=CanvasPayload)
async def create_canvas(
    payload: CanvasPayload,
    canvas_service: CanvasService = Depends(provide_canvas_service),
) -> CanvasPayload:
    return await canvas_service.create_canvas(
        owner_id="anonymous",
        payload=payload,
    )


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
