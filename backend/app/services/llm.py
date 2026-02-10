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
    "You are a concise tutor. Reply in markdown format.\n\n"
    "Answer rules:\n"
    "- Provide a clear, concise answer in 3-6 lines\n"
    "- Use markdown formatting (bold, lists, etc.) as appropriate\n"
    "- Max 550 characters\n"
    "- Be helpful and educational\n\n"
    "After your answer, generate 3 specific follow-up questions that would "
    "help the student learn more about this topic. Make them diverse, "
    "relevant, and build on your answer. Format them as:\n"
    "FOLLOW-UPS:\n"
    "1. [question 1]\n"
    "2. [question 2]\n"
    "3. [question 3]\n\n"
    "Question: {question}\n"
)


def _default_follow_ups(question: str) -> List[str]:
    return [
        f"Can you give a simple example related to {question}?",
        f"How does this compare to related concepts for {question}?",
        f"What are common pitfalls or misconceptions about {question}?",
    ]


def _extract_json(text: str) -> Dict[str, object]:
    import json

    match = _FENCE.search(text)
    candidate = match.group(1) if match else text
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object found in model response.")

    json_str = candidate[start:end + 1]
    try:
        return json.loads(json_str)
    except json.JSONDecodeError as e:
        # Log the actual JSON string for debugging
        logger.warning(
            "JSON decode error: %s. Attempted to parse: %s",
            e,
            json_str[:200],
        )
        raise ValueError(f"Invalid JSON in model response: {e}") from e


def _coerce_answer(
    parsed: Dict[str, object],
    question: str,
) -> Dict[str, object]:
    try:
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
    except Exception as e:
        logger.warning(
            "Error in _coerce_answer: %s. Parsed: %s",
            e,
            parsed,
        )
        # Return safe defaults
        return {
            "answer": "Sorry, I could not process the model response.",
            "follow_ups": _default_follow_ups(question),
        }


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
                logger.error(
                    "API key permission denied; rotating key. "
                    "Error: %s", str(exc)
                )
                self._key_manager.record_failure(slot)
                last_exception = exc
            except Exception as exc:  # pylint: disable=broad-except
                error_msg = str(exc)
                logger.exception(
                    "LLM invocation failed: %s. "
                    "Error type: %s",
                    error_msg,
                    type(exc).__name__,
                )
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
        try:
            model = genai.GenerativeModel(model_name)
            prompt = PROMPT_TEMPLATE.format(question=question)
            logger.debug(
                "Calling model %s with prompt length: %d",
                model_name,
                len(prompt),
            )
            result = model.generate_content(prompt)
            response_text = result.text or ""
            if not response_text:
                logger.warning("Model returned empty response")
                response_text = (
                    "Sorry, I received an empty response from the model."
                )
            logger.info(
                "LLM raw response (first 500 chars): %s",
                response_text[:500],
            )
            return response_text
        except Exception as e:
            logger.error("Error in _invoke_model: %s", str(e))
            raise

    def _parse_response(self, raw: str, question: str) -> Dict[str, object]:
        """Parse markdown response and generate follow-ups."""
        # Clean up the response - remove code fences if present
        cleaned = _FENCE.sub("", raw).strip()
        if not cleaned:
            cleaned = raw.strip()

        if not cleaned:
            cleaned = "Sorry, I could not generate a response."

        # Try to extract follow-up questions from the response
        follow_ups = self._extract_follow_ups(cleaned, question)

        # Remove follow-ups section from the answer
        answer = self._remove_follow_ups_section(cleaned)

        return {
            "answer": answer[:1000],  # Limit answer length
            "follow_ups": follow_ups,
        }

    def _extract_follow_ups(self, text: str, question: str) -> List[str]:
        """Extract follow-up questions from LLM response."""
        # Look for "FOLLOW-UPS:" or "Follow-ups:" section
        follow_ups_pattern = re.compile(
            r'(?:FOLLOW-UPS?|Follow-ups?):\s*\n((?:\d+\.\s*[^\n]+\n?)+)',
            re.IGNORECASE | re.MULTILINE,
        )
        match = follow_ups_pattern.search(text)

        if match:
            follow_ups_text = match.group(1)
            # Extract numbered questions
            questions = re.findall(r'\d+\.\s*([^\n]+)', follow_ups_text)
            if questions and len(questions) >= 3:
                return [q.strip() for q in questions[:3]]

        # Fallback: try to find any numbered list at the end
        numbered_pattern = re.compile(r'(\d+\.\s*[^\n]+)', re.IGNORECASE)
        matches = numbered_pattern.findall(text)
        if len(matches) >= 3:
            return [m.strip() for m in matches[-3:]]

        # Last resort: use default follow-ups
        return _default_follow_ups(question)

    def _remove_follow_ups_section(self, text: str) -> str:
        """Remove the follow-ups section from the answer text."""
        # Remove "FOLLOW-UPS:" section
        text = re.sub(
            r'(?:FOLLOW-UPS?|Follow-ups?):\s*\n(?:\d+\.\s*[^\n]+\n?)+',
            '',
            text,
            flags=re.IGNORECASE | re.MULTILINE,
        )
        return text.strip()
