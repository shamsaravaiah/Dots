"""Schemas for the LLM ask endpoint."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field, constr


class AskRequest(BaseModel):
    question: constr(  # type: ignore[valid-type]
        min_length=1,
        max_length=2000,
    )
    canvas_id: Optional[str] = Field(
        default=None,
        description="Canvas to which this answer belongs.",
    )
    model: Optional[str] = Field(
        default=None,
        description=(
            "Preferred model identifier, subject to plan restrictions."
        ),
    )


class AskFollowUps(BaseModel):
    questions: List[str] = Field(default_factory=list, max_items=3)


class AskResponse(BaseModel):
    question: str
    answer: str
    follow_ups: List[str]
    latency_ms: int = Field(default=0)
    model: str = Field(default="")
    image_results: Optional[List[dict]] = None
