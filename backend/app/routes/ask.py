"""LLM ask endpoint."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool

from ..dependencies import provide_llm_service, provide_usage_service
from ..schemas.ask import AskRequest, AskResponse
from ..services.llm import LLMService
from ..services.usage import Subject, UsageService

logger = logging.getLogger("dots.ask")
router = APIRouter(tags=["ask"])


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


@router.post("/ask", response_model=AskResponse)
async def ask_question(
    payload: AskRequest,
    request: Request,
    llm_service: LLMService = Depends(provide_llm_service),
    usage_service: UsageService = Depends(provide_usage_service),
) -> AskResponse:
    logger.info("Received ask request: question=%s", payload.question[:50])
    # Get current user if authenticated
    user = await get_current_user_optional(request)
    logger.info("User authenticated: %s", user is not None)

    if user:
        subject = Subject(
            id=user["id"],
            plan=user.get("plan", "free"),
            is_authenticated=True,
        )
    else:
        subject = Subject(
            id="anonymous",
            plan="anonymous",
            is_authenticated=False,
        )

    # Check quotas for free tier users (reads usage ONCE)
    logger.info("Checking quota for plan: %s", subject.plan)
    quota_info = await usage_service.check_ask_quota(
        subject, payload.question
    )
    logger.info("Quota check passed: %s", quota_info)

    # Determine model to use
    requested_model = payload.model
    if quota_info.get("force_mini_model"):
        # Force mini model if flagship trial was used
        requested_model = "gemini-2.5-flash"

    # Check if using flagship model
    used_flagship = (
        requested_model
        and "pro" in requested_model.lower()
        and not quota_info.get("force_mini_model")
    )

    def _invoke():
        return llm_service.ask(
            question=payload.question,
            plan=subject.plan,
            model=requested_model,
        )

    # Image search disabled for now
    images = []  # Default to empty list

    try:
        logger.info("Calling LLM with model: %s", requested_model)
        # Image search disabled - not fetching images

        # Run LLM only (image search disabled)
        llm_answer = await run_in_threadpool(_invoke)
        logger.info("LLM call completed successfully")

        # Increment usage counters after successful call
        # Pass pre-fetched usage data to avoid redundant read
        if subject.is_authenticated and quota_info.get("usage"):
            await usage_service.increment_ask_usage(
                subject,
                usage=quota_info.get("usage", {}),
                now=quota_info.get("now"),
                today_str=quota_info.get("today_str"),
                used_flagship=used_flagship,
            )
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("LLM request failed with error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LLM request failed: {exc}",
        ) from exc

    return AskResponse(
        question=llm_answer.question,
        answer=llm_answer.answer,
        follow_ups=llm_answer.follow_ups,
        latency_ms=llm_answer.latency_ms,
        model=llm_answer.model,
        image_results=images,
    )
