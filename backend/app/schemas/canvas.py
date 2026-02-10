"""Schemas related to canvas operations."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class LayoutConfig(BaseModel):
    """Canvas view configuration for UI."""

    zoom: float = 1.0
    pan_x: float = 0.0
    pan_y: float = 0.0
    grid_enabled: bool = True
    grid_size: int = 16
    snap_to_grid: bool = True


class Collaborator(BaseModel):
    """Collaborator information."""

    user_id: str
    role: Literal["viewer", "editor"] = "viewer"


class CanvasPayload(BaseModel):
    """Complete canvas payload matching Firestore schema."""

    id: Optional[str] = None
    owner_id: Optional[str] = None

    title: str = ""
    description: str = ""

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None

    status: Literal["active", "archived", "deleted"] = "active"

    # Tree structure
    root_node_id: Optional[str] = None
    node_count: int = 0

    # Canvas view config
    layout: LayoutConfig = Field(default_factory=lambda: LayoutConfig())

    # Sharing and access
    visibility: Literal["private", "shared", "public"] = "private"
    collaborators: List[Collaborator] = Field(default_factory=list)

    tags: List[str] = Field(default_factory=list)

    version: int = 1

    meta: Dict[str, Any] = Field(default_factory=dict)
    custom: Dict[str, Any] = Field(default_factory=dict)


class CanvasPatch(BaseModel):
    """Partial canvas update for autosave (only changed fields)."""

    id: str

    # All fields optional for patching
    title: Optional[str] = None
    description: Optional[str] = None
    updated_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None
    status: Optional[Literal["active", "archived", "deleted"]] = None
    root_node_id: Optional[str] = None
    node_count: Optional[int] = None
    layout: Optional[LayoutConfig] = None
    visibility: Optional[Literal["private", "shared", "public"]] = None
    collaborators: Optional[List[Collaborator]] = None
    tags: Optional[List[str]] = None
    version: Optional[int] = None
    meta: Optional[Dict[str, Any]] = None
    custom: Optional[Dict[str, Any]] = None


# Legacy schemas for backward compatibility
class CanvasNode(BaseModel):
    """Legacy node schema (for ReactFlow compatibility)."""

    id: str
    type: str
    position: Dict[str, float]
    data: Dict[str, Any] = Field(default_factory=dict)
    size: Optional[Dict[str, float]] = None


class CanvasEdge(BaseModel):
    """Legacy edge schema (for ReactFlow compatibility)."""

    id: str
    source: str
    target: str
    type: Optional[str] = "default"
    data: Dict[str, Any] = Field(default_factory=dict)
