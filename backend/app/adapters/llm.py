"""LLM adapter (Claude via the official Anthropic SDK).

Used for (a) grounded answers restricted to retrieved chunks, (b) 5th-grade simplification,
(c) translation fallback. Every call is optional: if the SDK/key is missing or the call fails,
callers fall back to deterministic, data-only behaviour.
"""
from __future__ import annotations

import logging

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


def available() -> bool:
    return bool(config.ANTHROPIC_API_KEY)


def _get_client():
    global _client
    if _client is None:
        import anthropic  # optional dependency (requirements-ml.txt)

        _client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY, timeout=20.0, max_retries=1)
    return _client


def _complete(system: str, user: str, max_tokens: int = 1024) -> str | None:
    """One grounded completion. Returns None on any failure so callers can fall back."""
    if not available():
        return None
    try:
        client = _get_client()
        resp = client.beta.messages.create(
            model=config.LLM_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
            output_config={"effort": "low"},  # short, factual chat replies
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",  # server-side retry on another model if a safety classifier declines
        )
        if resp.stop_reason == "refusal":
            log.warning("LLM refused (%s) — using template answer", getattr(resp, "stop_details", None))
            return None
        text = "".join(b.text for b in resp.content if b.type == "text").strip()
        return text or None
    except Exception as e:  # SDK missing, network, auth, rate limit … → deterministic fallback
        log.warning("LLM call failed: %s", e)
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
