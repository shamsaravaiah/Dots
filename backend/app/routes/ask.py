"""LLM ask endpoint."""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool

from ..dependencies import provide_llm_service, provide_usage_service
from ..schemas.ask import AskRequest, AskResponse
from ..services.llm import LLMService
from ..services.usage import Subject, UsageService

router = APIRouter(tags=["ask"])


@router.post("/ask", response_model=AskResponse)
async def ask_question(
    payload: AskRequest,
    llm_service: LLMService = Depends(provide_llm_service),
    usage_service: UsageService = Depends(provide_usage_service),
) -> AskResponse:
    # NOTE: Subject handling will be replaced with real session/auth data.
    subject = Subject(id="anonymous", plan="anonymous", is_authenticated=False)
    usage_service.check_and_increment(subject, event="ask")

    def _invoke():
        return llm_service.ask(
            question=payload.question,
            plan=subject.plan,
            model=payload.model,
        )

    try:
        llm_answer = await run_in_threadpool(_invoke)
    except Exception as exc:  # pylint: disable=broad-except
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
    )
