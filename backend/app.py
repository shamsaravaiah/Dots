# app.py
# FastAPI backend that proxies a single question to Gemini and returns:
# {
#   "question": string,
#   "answer": string,
#   "follow_ups": [string, string, string],
#   "latency_ms": number
# }

import os
import re
import time
import json
from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import google.generativeai as genai

# --- Config ---
load_dotenv()
API_KEY = os.getenv("GOOGLE_API_KEY")
if not API_KEY:
    raise RuntimeError("Missing GOOGLE_API_KEY in environment.")
genai.configure(api_key=API_KEY)

MODEL_NAME = "gemini-2.5-flash"
model = genai.GenerativeModel(MODEL_NAME)

# --- FastAPI app ---
app = FastAPI(title="LLM Answer Proxy", version="1.0")
app.add_middleware(
    CORSMiddleware,
    # Allow any localhost/127.0.0.1 with any port over HTTP during development
    allow_origins=[],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Schemas ---


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1)


class AskResponse(BaseModel):
    question: str
    answer: str
    follow_ups: List[str]
    latency_ms: int

# --- Prompt helper ---


def build_prompt(question: str) -> str:
    return (
        "You are a helpful assistant. Reply ONLY with valid JSON.\n"
        "The JSON must be exactly:\n"
        "{\n"
        '  \"answer\": string,\n'
        '  \"follow_ups\": [string, string, string]\n'
        "}\n"
        "Rules:\n"
        "- Include no keys besides 'answer' and 'follow_ups'.\n"
        "- 'follow_ups' must be exactly 3 short, natural questions "
        "that logically follow your answer.\n"
        "- Keep the answer concise (2–4 sentences) and plain text "
        "(no markdown)."
        "\n\n"
        f"User question: {question}"
    )


# --- JSON extraction helpers ---

_FENCE = re.compile(r"```(?:json)?\\n([\\s\\S]*?)```", re.IGNORECASE)


def extract_json(text: str) -> dict:
    m = _FENCE.search(text)
    candidate = m.group(1) if m else text
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object found.")
    return json.loads(candidate[start:end + 1])


def coerce_response(parsed: dict, question: str) -> AskResponse:
    answer = str(parsed.get("answer", "")).strip()
    follow_ups = parsed.get("follow_ups", [])
    if not isinstance(follow_ups, list):
        follow_ups = []
    follow_ups = [str(x).strip() for x in follow_ups if str(x).strip()][:3]
    while len(follow_ups) < 3:
        follow_ups.append(
            [
                f"Can you give a simple example related to {question}?",
                f"How does this compare to related concepts for {question}?",
                (
                    "What are common pitfalls or "
                    f"misconceptions about {question}?"
                ),
            ][len(follow_ups)]
        )
    if not answer:
        answer = "No answer provided."
    return AskResponse(
        question=question,
        answer=answer,
        follow_ups=follow_ups,
        latency_ms=0,
    )

# --- Route ---


@app.post("/api/ask", response_model=AskResponse)
async def ask(payload: AskRequest):
    started = time.time()
    q = payload.question.strip()
    prompt = build_prompt(q)

    try:
        result = model.generate_content(prompt)
        raw = result.text or ""

        try:
            parsed = extract_json(raw)
            resp = coerce_response(parsed, q)
        except Exception:
            cleaned = _FENCE.sub("", raw).strip() or (
                "Sorry, I could not parse the model response."
            )
            resp = AskResponse(
                question=q,
                answer=cleaned[:1000],
                follow_ups=[
                    f"Can you give a simple example related to {q}?",
                    f"How does this compare to related concepts for {q}?",
                    f"What are common pitfalls or misconceptions about {q}?",
                ],
                latency_ms=0,
            )

        resp.latency_ms = int((time.time() - started) * 1000)
        return resp

    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Upstream model error: {e}",
        )
