"""Loads the shared knowledge base (the same JSON files the frontend bundles)."""
from __future__ import annotations

import json
from functools import lru_cache

from .config import DATA_DIR


def _load(name: str) -> dict:
    path = DATA_DIR / name
    if not path.exists():
        raise RuntimeError(f"Knowledge file not found: {path}. Set DATA_DIR in .env")
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache
def schemes() -> list[dict]:
    return _load("schemes.json")["schemes"]


@lru_cache
def dialect_glossary() -> dict:
    return _load("dialectGlossary.json")


@lru_cache
def domain_glossary() -> list[dict]:
    return _load("domainGlossary.json")["terms"]


@lru_cache
def intents() -> dict:
    return _load("intents.json")


def get_scheme(scheme_id: str | None) -> dict | None:
    return next((s for s in schemes() if s["id"] == scheme_id), None)


def pick(obj: dict | None, lang: str) -> str:
    """Pick a language variant ('hi' | 'hl' | 'en'), falling back to Hindi."""
    if not obj:
        return ""
    return obj.get(lang) or obj.get("hi") or ""
