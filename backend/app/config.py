"""Settings from environment variables (see .env.example). No key is mandatory."""
from __future__ import annotations

import os
from pathlib import Path


def _load_dotenv() -> None:
    """Minimal .env loader (avoids an extra dependency)."""
    env = Path(__file__).resolve().parent.parent / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


_load_dotenv()
BASE = Path(__file__).resolve().parent.parent

DATA_DIR = (BASE / os.getenv("DATA_DIR", "../frontend/src/data")).resolve()
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:4173").split(",") if o.strip()]
# Optional regex, e.g. ^https://bolo-yojana(-[a-z0-9]+)?\.onrender\.com$ (Render may add a suffix to the URL)
CORS_ORIGIN_REGEX = os.getenv("CORS_ORIGIN_REGEX") or None

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "claude-opus-5-5")

VECTOR_STORE = os.getenv("VECTOR_STORE", "auto")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")

BHASHINI_USER_ID = os.getenv("BHASHINI_USER_ID", "")
BHASHINI_API_KEY = os.getenv("BHASHINI_API_KEY", "")
BHASHINI_PIPELINE_ID = os.getenv("BHASHINI_PIPELINE_ID", "64392f96daac500b55c543cd")

TRANSLATE_PROVIDER = os.getenv("TRANSLATE_PROVIDER", "auto")
