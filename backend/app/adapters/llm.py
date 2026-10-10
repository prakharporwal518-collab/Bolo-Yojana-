"""LLM adapter — Google Gemini (REST via httpx) or Claude (official Anthropic SDK).

Pick with LLM_PROVIDER=auto|gemini|anthropic|none. "auto" uses whichever key is set
(GEMINI_API_KEY first, then ANTHROPIC_API_KEY). Used for (a) grounded answers restricted to retrieved chunks, (b) 5th-grade simplification,
(c) translation fallback. Every call is optional: if the SDK/key is missing or the call fails,
callers fall back to deterministic, data-only behaviour.
"""
from __future__ import annotations

import logging

import httpx

from .. import config

log = logging.getLogger("bolo.llm")
_client = None

LANG_STYLE = {
    "hi": "Hindi in Devanagari script",
    "hl": "Hinglish — Hindi written in Roman script, the way people type on WhatsApp",
    "en": "simple Indian English",
}
UNSURE_MARKERS = ("pakki jaankari nahi", "पक्की जानकारी नहीं", "don't have verified information")

SYSTEM_ANSWER = """You are "Bolo Yojana", a voice assistant helping rural and semi-literate citizens in India understand government schemes.

Rules (strict):
- Answer ONLY from the facts inside <context>. Never use outside knowledge, never guess numbers, dates or rules.
- If <context> does not contain the answer, reply with exactly one short sentence saying "Mujhe iski pakki jaankari nahi hai" (in the reply language) and suggest calling the helpline from the context, or 181.
- Reply in {style}. Use respectful "aap". Very short, simple sentences (5th-grade level), at most 6 sentences or a short numbered list.
- Keep these terms exactly as written, never translate them: Aadhaar, e-KYC, KYC, Samagra ID, Patwari, Gram Panchayat, CSC, DBT, Khasra, OTP, Anganwadi.
- Use Indian formats: ₹6,000 / ₹1,50,000, "lakh", dates as DD/MM/YYYY.
- The text will be read aloud: no markdown, no tables, no URLs."""

SYSTEM_SIMPLIFY = """Rewrite the government text for a reader with 5th-grade literacy, in the SAME language as the input.
Keep every fact, number, date, amount, name and these terms unchanged: Aadhaar, e-KYC, Samagra ID, Patwari, Gram Panchayat, CSC, DBT.
Use short sentences (max 12 words), everyday words, respectful tone. Output only the rewritten text."""


GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def provider() -> str | None:
    """Which LLM is active, or None (then callers use deterministic, data-only answers)."""
    p = config.LLM_PROVIDER
    if p in ("gemini", "auto") and config.GEMINI_API_KEY:
        return "gemini"
    if p in ("anthropic", "claude", "auto") and config.ANTHROPIC_API_KEY:
        return "anthropic"
    return None


def available() -> bool:
    return provider() is not None


def model_name() -> str | None:
    return {"gemini": config.GEMINI_MODEL, "anthropic": config.LLM_MODEL}.get(provider())


def _get_client():
    global _client
    if _client is None:
        import anthropic  # optional dependency (requirements-ml.txt)

        _client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY, timeout=20.0, max_retries=1)
    return _client


def _complete_anthropic(system: str, user: str, max_tokens: int) -> str | None:
    resp = _get_client().beta.messages.create(
        model=config.LLM_MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
        output_config={"effort": "low"},  # short, factual chat replies
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",  # server-side retry on another model if a safety classifier declines
    )
    if resp.stop_reason == "refusal":
        log.warning("Claude refused (%s) — using template answer", getattr(resp, "stop_details", None))
        return None
    return "".join(b.text for b in resp.content if b.type == "text").strip() or None


def _complete_gemini(system: str, user: str, max_tokens: int) -> str | None:
    body = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        # Extra headroom: on "thinking" Gemini models, reasoning tokens count toward this limit.
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": max_tokens + 1024},
    }
    r = httpx.post(
        GEMINI_URL.format(model=config.GEMINI_MODEL),
        json=body,
        headers={"x-goog-api-key": config.GEMINI_API_KEY},  # header, so the key never appears in URLs/logs
        timeout=20.0,
    )
    r.raise_for_status()
    j = r.json()
    if j.get("promptFeedback", {}).get("blockReason"):
        log.warning("Gemini blocked the prompt: %s", j["promptFeedback"]["blockReason"])
        return None
    cand = (j.get("candidates") or [{}])[0]
    if cand.get("finishReason") in ("SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT"):
        log.warning("Gemini stopped: %s — using template answer", cand.get("finishReason"))
        return None
    text = "".join(p.get("text", "") for p in cand.get("content", {}).get("parts", []) if not p.get("thought"))
    return text.strip() or None


def _complete(system: str, user: str, max_tokens: int = 1024) -> str | None:
    """One grounded completion. Returns None on any failure so callers can fall back."""
    p = provider()
    if not p:
        return None
    try:
        if p == "gemini":
            return _complete_gemini(system, user, max_tokens)
        return _complete_anthropic(system, user, max_tokens)
    except Exception as e:  # SDK missing, network, auth, quota, rate limit … → deterministic fallback
        log.warning("%s call failed: %s", p, e)
        return None


def grounded_answer(question: str, chunks: list[dict], lang: str) -> str | None:
    if not chunks:
        return None
    ctx = "\n\n".join(
        f'<chunk id="{c["id"]}" source="{c["source"]["url"]}">\n{c["text"].get("en", "")}\n{c["text"].get("hi", "")}\n</chunk>' for c in chunks
    )
    user = f"<context>\n{ctx}\n</context>\n\nCitizen's question: {question}"
    return _complete(SYSTEM_ANSWER.format(style=LANG_STYLE.get(lang, LANG_STYLE["hi"])), user, max_tokens=700)


def simplify(text: str) -> str | None:
    return _complete(SYSTEM_SIMPLIFY, text, max_tokens=1200)


def translate(text: str, source: str, target: str) -> str | None:
    names = {"hi": "Hindi (Devanagari)", "hl": "Hinglish", "en": "English"}
    system = (
        f"Translate from {names.get(source, source)} to {names.get(target, target)}. Keep placeholders like [[0]] unchanged. "
        "Keep it simple and natural for rural speakers. Output only the translation."
    )
    return _complete(system, text, max_tokens=800)


def is_unsure(text: str) -> bool:
    t = text.lower()
    return any(m.lower() in t for m in UNSURE_MARKERS)
