"""Schemas related to canvas operations."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class CanvasNode(BaseModel):
    id: str
    type: str
    position: Dict[str, float]
    data: Dict[str, Any] = Field(default_factory=dict)
    size: Optional[Dict[str, float]] = None


class CanvasEdge(BaseModel):
    id: str
    source: str
    target: str
    type: Optional[str] = "default"
    data: Dict[str, Any] = Field(default_factory=dict)


class CanvasPayload(BaseModel):
    title: Optional[str] = None
    nodes: List[CanvasNode] = Field(default_factory=list)
    edges: List[CanvasEdge] = Field(default_factory=list)
    updated_at: Optional[datetime] = None
    last_opened_at: Optional[datetime] = None
