"""Usage tracking and quota enforcement service."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict

from fastapi import HTTPException, status
from fastapi.concurrency import run_in_threadpool

from ..config import Settings
from ..policy import PlanPolicy, get_plan_policy
from .firestore import get_firestore_client

logger = logging.getLogger("dots.usage")


@dataclass
class Subject:
    id: str
    plan: str
    is_authenticated: bool = False


class UsageService:
    """Usage service with Firestore integration for quota enforcement."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._db = get_firestore_client()

    def get_plan(self, subject: Subject) -> PlanPolicy:
        return get_plan_policy(self._settings, subject.plan)

    async def get_user_usage(self, user_id: str) -> Dict[str, Any]:
        """Get user usage data from Firestore."""
        def _get_usage():
            doc = self._db.collection("users").document(user_id).get()
            if not doc.exists:
                return {}
            data = doc.to_dict() or {}
            return {
                "chats_used": data.get("chats_used", 0),
                "messages_used": data.get("messages_used", 0),
                "last_message_at": data.get("last_message_at"),
                "messages_today": data.get("messages_today", 0),
                "last_message_date": data.get("last_message_date"),
                "flagship_trial_used": data.get("flagship_trial_used", False),
                "flagship_trial_used_at": data.get("flagship_trial_used_at"),
            }
        return await run_in_threadpool(_get_usage)

    async def update_user_usage(
        self,
        user_id: str,
        updates: Dict[str, Any],
    ) -> None:
        """Update user usage counters in Firestore."""
        def _update():
            user_ref = self._db.collection("users").document(user_id)
            user_ref.update(updates)
        await run_in_threadpool(_update)

    async def check_ask_quota(
        self,
        subject: Subject,
        question: str,
    ) -> Dict[str, Any]:
        """Check all quotas for ask requests and return usage info."""
        if not subject.is_authenticated or subject.plan != "free":
            # For non-free or anonymous users, skip strict quota checks
            return {
                "allowed": True,
                "flagship_trial_used": False,
                "force_mini_model": False,
                "usage": {},
                "needs_daily_reset": False,
            }

        # Read user usage ONCE
        usage = await self.get_user_usage(subject.id)
        now = datetime.utcnow()
        today_str = now.date().isoformat()

        # Check if daily counter needs reset (but don't write yet)
        last_date = usage.get("last_message_date")
        needs_daily_reset = last_date != today_str
        if needs_daily_reset:
            usage["messages_today"] = 0
            usage["last_message_date"] = today_str

        # Check chats_used >= 3
        if usage.get("chats_used", 0) >= 3:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "message": (
                        "You've reached the maximum number of chats (3) "
                        "for the free tier. Upgrade to unlock unlimited chats "
                        "and more features!"
                    ),
                    "upgrade_required": True,
                    "upgrade_url": "/pricing",
                    "limit_type": "chats",
                    "current_usage": usage.get("chats_used", 0),
                    "limit": 3,
                },
            )

        # Check messages_used >= 5
        if usage.get("messages_used", 0) >= 5:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "message": (
                        "You've reached the maximum number of messages (5) "
                        "for the free tier. Upgrade to unlock unlimited "
                        "messages and more features!"
                    ),
                    "upgrade_required": True,
                    "upgrade_url": "/pricing",
                    "limit_type": "messages",
                    "current_usage": usage.get("messages_used", 0),
                    "limit": 5,
                },
            )

     

        # Check token size (rough estimate: 1 token ≈ 4 characters)
        token_estimate = len(question) / 4
        if token_estimate > 1000:
            # Reject prompts over 1000 tokens
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Prompt too long. Maximum 1000 tokens "
                    "allowed for free tier"
                ),
            )

        # Check messages_today >= 3
        if usage.get("messages_today", 0) >= 3:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "message": (
                        "You've reached your daily message limit (3) "
                        "for the free tier. Upgrade to unlock more daily "
                        "messages and features!"
                    ),
                    "upgrade_required": True,
                    "upgrade_url": "/pricing",
                    "limit_type": "daily_messages",
                    "current_usage": usage.get("messages_today", 0),
                    "limit": 3,
                },
            )

        # Check flagship trial status
        flagship_trial_used = usage.get("flagship_trial_used", False)
        force_mini_model = flagship_trial_used

        return {
            "allowed": True,
            "flagship_trial_used": flagship_trial_used,
            "force_mini_model": force_mini_model,
            "usage": usage,
            "needs_daily_reset": needs_daily_reset,
            "today_str": today_str,
            "now": now,
        }

    async def increment_ask_usage(
        self,
        subject: Subject,
        usage: Dict[str, Any],
        now: datetime,
        today_str: str,
        used_flagship: bool = False,
    ) -> None:
        """Increment usage counters after successful ask request.

        Uses pre-fetched usage data to avoid redundant Firestore reads.
        """
        if not subject.is_authenticated or subject.plan != "free":
            return

        # Build all updates in one batch
        updates = {
            "messages_used": (usage.get("messages_used", 0) + 1),
            "messages_today": (usage.get("messages_today", 0) + 1),
            "last_message_at": now.isoformat(),
            "last_message_date": today_str,
        }

        # Mark flagship trial as used if they used flagship model
        if used_flagship and not usage.get("flagship_trial_used", False):
            updates["flagship_trial_used"] = True
            updates["flagship_trial_used_at"] = now.isoformat()

        # Single Firestore write for all updates
        await self.update_user_usage(subject.id, updates)

    async def increment_chat_usage(self, subject: Subject) -> None:
        """Increment chat counter when a new chat/canvas is created."""
        if not subject.is_authenticated or subject.plan != "free":
            return

        usage = await self.get_user_usage(subject.id)
        await self.update_user_usage(
            subject.id,
            {"chats_used": (usage.get("chats_used", 0) + 1)},
        )

    def check_and_increment(
        self,
        subject: Subject,
        event: str,
        amount: int = 1,
    ) -> Dict[str, Any]:
        """Legacy method for backward compatibility."""
        policy = self.get_plan(subject)
        logger.debug(
            "Checking quotas for subject=%s event=%s",
            subject.id,
            event,
        )
        return {
            "plan": policy.name,
            "event": event,
            "delta": amount,
        }
