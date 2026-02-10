"""Node schemas for graph-based chat nodes."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, Field


class QuestionData(BaseModel):
    """Question data for a node."""

    text: str
    language: str = "en"
    source: Literal["user", "system", "llm_suggested"] = "user"


class AnswerData(BaseModel):
    """Answer data for a node."""

    text: Optional[str] = None
    status: Literal["idle", "pending", "ready", "error"] = "idle"
    error_message: Optional[str] = None


class LLMMetadata(BaseModel):
    """LLM metadata for nodes that received an answer."""

    model: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    latency_ms: Optional[int] = None


class EvaluationData(BaseModel):
    """User evaluation data for a node."""

    user_rating: Optional[int] = Field(None, ge=1, le=5)
    flags: list[str] = Field(default_factory=list)


class PositionData(BaseModel):
    """Position data for node on canvas."""

    x: float = 0.0
    y: float = 0.0


class SizeData(BaseModel):
    """Size data for node on canvas."""

    width: float = 320.0
    height: float = 200.0


class NodePayload(BaseModel):
    """Complete node payload matching Firestore schema."""

    id: str
    canvas_id: str
    owner_id: str

    # Tree structure
    parent_id: Optional[str] = None
    depth: int = 0

    # Node type & origin
    node_kind: Literal["turn", "suggestion"] = "turn"
    generation_type: Literal["root", "auto_suggestion", "manual_followup"] = (
        "root"
    )

    # Question and answer
    question: QuestionData
    answer: AnswerData = Field(default_factory=lambda: AnswerData())

    # Position and size
    position: PositionData = Field(default_factory=lambda: PositionData())
    size: SizeData = Field(default_factory=lambda: SizeData())

    # Optional LLM metadata
    llm: Optional[LLMMetadata] = None

    # Optional feedback
    evaluation: EvaluationData = Field(
        default_factory=lambda: EvaluationData()
    )

    # Audit fields
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None

    status: Literal["draft", "in-progress", "final", "deleted"] = "final"
    revision: int = 1

    meta: Dict[str, Any] = Field(default_factory=dict)
    custom: Dict[str, Any] = Field(default_factory=dict)


class NodePatch(BaseModel):
    """Partial node update for autosave (only changed fields)."""

    id: str
    canvas_id: str

    # All fields optional for patching
    parent_id: Optional[str] = None
    depth: Optional[int] = None
    node_kind: Optional[Literal["turn", "suggestion"]] = None
    generation_type: Optional[
        Literal["root", "auto_suggestion", "manual_followup"]
    ] = None
    question: Optional[QuestionData] = None
    answer: Optional[AnswerData] = None
    position: Optional[PositionData] = None
    size: Optional[SizeData] = None
    llm: Optional[LLMMetadata] = None
    evaluation: Optional[EvaluationData] = None
    status: Optional[Literal["draft", "in-progress", "final", "deleted"]] = (
        None
    )
    revision: Optional[int] = None
    meta: Optional[Dict[str, Any]] = None
    custom: Optional[Dict[str, Any]] = None
