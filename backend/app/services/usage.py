"""Usage tracking and quota enforcement service."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict

from ..config import Settings
from ..policy import PlanPolicy, get_plan_policy

logger = logging.getLogger("dots.usage")


@dataclass
class Subject:
    id: str
    plan: str
    is_authenticated: bool = False


class UsageService:
    """Placeholder usage service integrating with Firestore."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def get_plan(self, subject: Subject) -> PlanPolicy:
        return get_plan_policy(self._settings, subject.plan)

    def check_and_increment(
        self,
        subject: Subject,
        event: str,
        amount: int = 1,
    ) -> Dict[str, Any]:
        """Validate quotas and return summary. TODO: integrate Firestore."""
        policy = self.get_plan(subject)
        logger.debug(
            "Checking quotas for subject=%s event=%s",
            subject.id,
            event,
        )
        # TODO: Implement Firestore-backed counters.
        # For now, just return policy metadata.
        return {
            "plan": policy.name,
            "event": event,
            "delta": amount,
        }
