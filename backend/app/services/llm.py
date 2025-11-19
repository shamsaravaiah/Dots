"""LLM proxy service with prompt construction and response coercion."""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from typing import Dict, List, Optional

import google.generativeai as genai
from google.api_core import exceptions as google_exceptions

from ..config import Settings
from ..policy import PlanPolicy, get_plan_policy
from .key_manager import KeyManager

logger = logging.getLogger("dots.llm")

_FENCE = re.compile(r"```(?:json)?\n([\s\S]*?)```", re.IGNORECASE)


PROMPT_TEMPLATE = (
    "You are a concise tutor. Reply ONLY with JSON:\n"
    "{\n"
    '  "answer": string,\n'
    '  "follow_ups": [string, string, string]\n'
    "}\n\n"
    "Answer rules:\n"
    '- 3-6 lines total, each starting with "- ".\n'
    "- Line 1 = gist. Lines 2-4 = key facts. Optional 'Note: ...'.\n"
    "- Max 550 characters, plain text only.\n\n"
    "Follow-up rules:\n"
    "- Exactly 3 questions, short (≤12 words), ending with '?'.\n\n"
    "No extra keys. Reply in the user's language.\n\n"
    "Question: {question}\n"
)


def _default_follow_ups(question: str) -> List[str]:
    return [
        f"Can you give a simple example related to {question}?",
        f"How does this compare to related concepts for {question}?",
        f"What are common pitfalls or misconceptions about {question}?",
    ]


def _extract_json(text: str) -> Dict[str, object]:
    match = _FENCE.search(text)
    candidate = match.group(1) if match else text
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object found in model response.")
    import json

    return json.loads(candidate[start:end + 1])


def _coerce_answer(
    parsed: Dict[str, object],
    question: str,
) -> Dict[str, object]:
    answer = str(parsed.get("answer", "")).strip()
    follow_ups = parsed.get("follow_ups", [])
    if not isinstance(follow_ups, list):
        follow_ups = []
    follow_ups = [
        str(item).strip()
        for item in follow_ups
        if str(item).strip()
    ][:3]
    while len(follow_ups) < 3:
        follow_ups.append(_default_follow_ups(question)[len(follow_ups)])
    if not answer:
        answer = "No answer provided."
    return {"answer": answer, "follow_ups": follow_ups}


def sanitize_question(question: str, max_length: int = 500) -> str:
    """Normalize whitespace and clamp length to reduce token usage."""
    cleaned = " ".join(question.strip().split())
    if len(cleaned) > max_length:
        cleaned = cleaned[: max_length - 1].rstrip() + "…"
    return cleaned


@dataclass
class LLMAnswer:
    question: str
    answer: str
    follow_ups: List[str]
    latency_ms: int
    model: str
    raw_text: str


class LLMService:
    """High-level interface for prompting external LLMs."""

    def __init__(self, settings: Settings, key_manager: KeyManager) -> None:
        self._settings = settings
        self._key_manager = key_manager

    def ask(
        self,
        question: str,
        plan: str,
        model: Optional[str] = None,
    ) -> LLMAnswer:
        sanitized = sanitize_question(question)
        policy = get_plan_policy(self._settings, plan)
        model_name = self._select_model(policy, model)

        attempts = max(self._key_manager.total_keys, 1)
        last_exception: Optional[Exception] = None

        for _ in range(attempts):
            slot = self._key_manager.acquire()
            try:
                start = time.time()
                genai.configure(api_key=slot.value)
                response = self._invoke_model(model_name, sanitized)
                latency_ms = int((time.time() - start) * 1000)
                result = self._parse_response(response, sanitized)
                self._key_manager.record_success(slot)
                return LLMAnswer(
                    question=sanitized,
                    answer=result["answer"],
                    follow_ups=result["follow_ups"],
                    latency_ms=latency_ms,
                    model=model_name,
                    raw_text=response,
                )
            except google_exceptions.PermissionDenied as exc:
                logger.error("API key permission denied; rotating key.")
                self._key_manager.record_failure(slot)
                last_exception = exc
            except Exception as exc:  # pylint: disable=broad-except
                logger.exception("LLM invocation failed: %s", exc)
                self._key_manager.record_failure(slot)
                last_exception = exc

        message = f"All LLM keys failed: {last_exception}"
        raise RuntimeError(message) from last_exception

    def _select_model(
        self,
        policy: PlanPolicy,
        requested: Optional[str],
    ) -> str:
        if requested and policy.allows_model(requested):
            return requested
        if policy.models:
            if policy.allows_model(self._settings.google_default_model):
                return self._settings.google_default_model
            return policy.models[0]
        return self._settings.google_default_model

    def _invoke_model(self, model_name: str, question: str) -> str:
        model = genai.GenerativeModel(model_name)
        prompt = PROMPT_TEMPLATE.format(question=question)
        result = model.generate_content(prompt)
        return result.text or ""

    def _parse_response(self, raw: str, question: str) -> Dict[str, object]:
        try:
            parsed = _extract_json(raw)
            return _coerce_answer(parsed, question)
        except Exception:  # pylint: disable=broad-except
            logger.warning(
                "Failed to parse model response, returning raw text.",
            )
            cleaned = _FENCE.sub("", raw).strip()
            if not cleaned:
                cleaned = "Sorry, I could not parse the model response."
            return {
                "answer": cleaned[:1000],
                "follow_ups": _default_follow_ups(question),
            }
