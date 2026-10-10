import os
import sys
from pathlib import Path

# Tests must be deterministic and offline: never call paid / remote providers.
for k in ("ANTHROPIC_API_KEY", "BHASHINI_USER_ID", "BHASHINI_API_KEY"):
    os.environ[k] = ""
os.environ.setdefault("VECTOR_STORE", "tfidf")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
