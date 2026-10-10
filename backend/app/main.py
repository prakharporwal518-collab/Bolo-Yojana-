"""Bolo Yojana API.

Endpoints: /health, /detect-language, /translate, /simplify, /ask (RAG), /eligibility, /ocr, /tts, /stt, /schemes
Every model-backed endpoint degrades gracefully: 501/503 tells the frontend to use its in-browser fallback.

Run:  uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import base64
import io
import re
import logging
from typing import Any, Literal

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import config, eligibility, nlp, rag
from .adapters import bhashini, indictrans, llm
from .data import get_scheme, schemes

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("bolo.api")

app = FastAPI(title="Bolo Yojana API", version="1.0.0", description="हर योजना, आपकी भाषा में — grounded, multilingual scheme assistance.")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

Lang = Literal["hi", "hl", "en"]
MAX_TEXT = 4000


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    """Never leak stack traces; the frontend falls back to on-device logic on any 5xx."""
    log.exception("Unhandled error: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "internal error", "fallback": "use on-device processing"})


# ------------------------------------------------------------------ models
class TextIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=MAX_TEXT)


class AskIn(TextIn):
    lang_override: Literal["auto", "hi", "hl", "en"] = "auto"
    context_scheme_id: str | None = None


class TranslateIn(TextIn):
    source: str = "hi"
    target: str = "en"


class SimplifyIn(TextIn):
    lang: str | None = None


class EligibilityIn(BaseModel):
    scheme_id: str
    answers: dict[str, Any] = {}


class TtsIn(TextIn):
    lang: str = "hi"


class SttIn(BaseModel):
    audio_base64: str = Field(..., max_length=8_000_000)
    mime: str = "audio/webm"
    lang: str = "hi-IN"


# ------------------------------------------------------------------ endpoints
@app.get("/health")
def health():
    return {
        "status": "ok",
        "schemes": len(schemes()),
        "vectorStore": rag.store().name,
        "llm": config.LLM_MODEL if llm.available() else None,
        "bhashini": bhashini.available(),
    }


@app.get("/schemes")
def list_schemes():
    return {"schemes": schemes()}


@app.post("/detect-language")
def detect_language(body: TextIn):
    det = nlp.detect_language(body.text)
    return {**det, "dialect": nlp.normalize_dialect(body.text)}


@app.post("/ask")
def ask(body: AskIn):
    """Grounded answer from verified scheme data + confidence + sources."""
    return rag.answer(body.text, body.lang_override, body.context_scheme_id)


@app.post("/simplify")
def simplify(body: SimplifyIn):
    out = llm.simplify(body.text) if llm.available() else None
    if out:
        sentences = [s for s in re.split(r"(?<=[.!?।])\s+", out) if s.strip()]
        return {"simple": out, "sentences": sentences, "provider": config.LLM_MODEL}
    return nlp.simplify(body.text, body.lang)


@app.post("/translate")
def translate(body: TranslateIn):
    if body.source == body.target:
        return {"text": body.text, "provider": "identity"}
    masked, kept = nlp.protect_terms(body.text)
    order = {
        "auto": ["bhashini", "indictrans2", "llm"],
        "bhashini": ["bhashini"], "indictrans2": ["indictrans2"], "llm": ["llm"],
    }.get(config.TRANSLATE_PROVIDER, ["bhashini", "indictrans2", "llm"])
    for provider in order:
        try:
            if provider == "bhashini" and bhashini.available():
                out = bhashini.translate(masked, body.source, body.target)
            elif provider == "indictrans2":
                out = indictrans.translate(masked, body.source, body.target)
            elif provider == "llm" and llm.available():
                out = llm.translate(masked, body.source, body.target)
            else:
                continue
            if out:
                return {"text": nlp.restore_terms(out, kept), "provider": provider}
        except Exception as e:  # ImportError for heavy optional models, HTTP errors, …
            log.info("translate via %s unavailable: %s", provider, e)
    raise HTTPException(503, "No translation model configured — client uses its offline phrasebook")


@app.post("/eligibility")
def check_eligibility(body: EligibilityIn):
    scheme = get_scheme(body.scheme_id)
    if not scheme:
        raise HTTPException(404, f"Unknown scheme '{body.scheme_id}'")
    return eligibility.evaluate(scheme, body.answers)


@app.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    data = await file.read()
    if len(data) > 12 * 1024 * 1024:
        raise HTTPException(413, "Image too large (max 12 MB)")
    try:
        import pytesseract  # type: ignore
        from PIL import Image  # type: ignore
    except ImportError:
        raise HTTPException(501, "Server OCR not installed — client uses Tesseract.js")
    try:
        img = Image.open(io.BytesIO(data))
        d = pytesseract.image_to_data(img, lang="hin+eng", output_type=pytesseract.Output.DICT)
        confs = [float(c) for c in d["conf"] if str(c) not in ("-1", "")]
        text = pytesseract.image_to_string(img, lang="hin+eng")
        return {"text": text, "confidence": round(sum(confs) / len(confs)) if confs else 0, "provider": "pytesseract"}
    except Exception as e:
        log.warning("OCR failed: %s", e)
        raise HTTPException(422, "Could not read the image")


@app.post("/tts")
def tts(body: TtsIn):
    if not bhashini.available():
        raise HTTPException(501, "No server TTS configured — client uses browser SpeechSynthesis")
    try:
        return {"audio_base64": bhashini.tts(body.text, body.lang), "mime": "audio/wav", "provider": "bhashini"}
    except Exception as e:
        log.warning("Bhashini TTS failed: %s", e)
        raise HTTPException(502, "TTS provider error")


@app.post("/stt")
def stt(body: SttIn):
    """Speech-to-text via Bhashini ASR (IndicConformer). Audio is processed in memory and never stored."""
    if not bhashini.available():
        raise HTTPException(501, "No server ASR configured — client uses Web Speech API")
    try:
        base64.b64decode(body.audio_base64, validate=True)
    except Exception:
        raise HTTPException(400, "audio_base64 is not valid base64")
    fmt = "webm" if "webm" in body.mime else "wav"
    try:
        return {"transcript": bhashini.asr(body.audio_base64, body.lang.split("-")[0], fmt), "provider": "bhashini"}
    except Exception as e:
        log.warning("Bhashini ASR failed: %s", e)
        raise HTTPException(502, "ASR provider error")
