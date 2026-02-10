"""Plan-based policy helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from .config import Settings


@dataclass(frozen=True)
class PlanPolicy:
    name: str
    max_canvases: Optional[int]
    node_quota: Dict[str, Optional[int]]
    autosave_interval_seconds: int
    models: list[str]
    features: Dict[str, bool]

    @classmethod
    def from_dict(cls, name: str, data: Dict[str, Any]) -> "PlanPolicy":
        return cls(
            name=name,
            max_canvases=data.get("max_canvases"),
            node_quota=data.get("node_quota", {}),
            autosave_interval_seconds=int(
                data.get("autosave_interval_seconds", 60)
            ),
            models=list(data.get("models", [])),
            features=data.get("features", {}),
        )

    def feature_enabled(self, key: str) -> bool:
        return bool(self.features.get(key, False))

    def allows_model(self, model: str) -> bool:
        return not self.models or model in self.models


def get_plan_policy(settings: Settings, plan_name: str) -> PlanPolicy:
    """Return the plan policy for the provided plan name."""
    plans = settings.plans or {}
    data = plans.get(plan_name) or plans.get("anonymous") or {}
    return PlanPolicy.from_dict(plan_name, data)
