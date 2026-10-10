"""API tests — run with:  cd backend && python -m pytest -q"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    r = client.get("/health").json()
    assert r["status"] == "ok" and r["schemes"] == 3


def test_detect_language_and_dialect():
    r = client.post("/detect-language", json={"text": "म्हारो पइसो नी आयो"}).json()
    assert r["lang"] == "hi"
    assert r["dialect"]["dialect"] == "malwi"
    assert "मेरा पैसा नहीं आया" in r["dialect"]["normalized"]
    assert client.post("/detect-language", json={"text": "mera kisan wala paisa nahi aaya"}).json()["lang"] == "hl"


def test_ask_grounded_hinglish():
    r = client.post("/ask", json={"text": "mera kisan wala paisa nahi aaya, kya karu?"}).json()
    assert r["schemeId"] == "pm-kisan"
    assert r["lang"] == "hl"
    assert r["confidence"] == "high"
    assert "e-KYC" in r["text"]
    assert r["sources"][0]["url"] == "https://pmkisan.gov.in/"


def test_ask_unknown_never_guesses():
    r = client.post("/ask", json={"text": "ujjwala gas connection kaise milega"}).json()
    assert r["confidence"] == "low"
    assert "pakki jaankari nahi" in r["text"]


def test_ask_context_followup():
    r = client.post("/ask", json={"text": "kaun se kagaz chahiye?", "context_scheme_id": "pmjay"}).json()
    assert r["schemeId"] == "pmjay" and "Aadhaar" in r["text"]


def test_eligibility_engine():
    sunita = {"gender": "female", "state": "mp", "age": 34, "marital": "married", "income": 150000,
              "taxpayer": "no", "govtjob": "no", "land": "no", "car": "no"}
    assert client.post("/eligibility", json={"scheme_id": "ladli-behna", "answers": sunita}).json()["result"] == "eligible"
    r = client.post("/eligibility", json={"scheme_id": "ladli-behna", "answers": {**sunita, "income": 300000}}).json()
    assert r["result"] == "not_eligible"
    partial = client.post("/eligibility", json={"scheme_id": "pmjay", "answers": {"age": 40}}).json()
    assert partial["done"] is False and partial["nextQuestion"]["id"] == "govtjob"
    assert client.post("/eligibility", json={"scheme_id": "nope", "answers": {}}).status_code == 404


def test_simplify_rule_based():
    r = client.post("/simplify", json={"text": "आवेदक द्वारा दस्तावेज़ प्रस्तुत करें। ई-केवाईसी अनिवार्य है।"}).json()
    assert "ज़रूरी" in r["simple"] and "अर्ज़ी देने वाला" in r["simple"]


def test_protected_terms_roundtrip():
    from app.nlp import protect_terms, restore_terms

    masked, kept = protect_terms("Patwari se Khasra aur Aadhaar lo")
    assert "Aadhaar" not in masked and restore_terms(masked, kept) == "Patwari se Khasra aur Aadhaar lo"


def test_optional_providers_degrade_gracefully():
    # No keys configured in CI → 501/503 so the client uses its on-device fallback.
    assert client.post("/tts", json={"text": "नमस्ते"}).status_code == 501
    assert client.post("/stt", json={"audio_base64": "AAAA"}).status_code == 501
    assert client.post("/translate", json={"text": "नमस्ते", "source": "hi", "target": "en"}).status_code in (200, 503)
    assert client.post("/ask", json={"text": ""}).status_code == 422


def test_cors_origin_regex(monkeypatch):
    import importlib

    from app import config, main

    monkeypatch.setenv("CORS_ORIGIN_REGEX", r"^https://bolo-yojana(-[a-z0-9]+)?\.onrender\.com$")
    importlib.reload(config)
    c = TestClient(importlib.reload(main).app)
    ok = c.get("/health", headers={"Origin": "https://bolo-yojana-x7k2.onrender.com"})
    bad = c.get("/health", headers={"Origin": "https://evil.example.com"})
    assert ok.headers.get("access-control-allow-origin") == "https://bolo-yojana-x7k2.onrender.com"
    assert "access-control-allow-origin" not in bad.headers
    monkeypatch.delenv("CORS_ORIGIN_REGEX")
    importlib.reload(config)
    importlib.reload(main)


class _FakeResp:
    def __init__(self, payload, status=200):
        self._p, self.status_code = payload, status

    def raise_for_status(self):
        if self.status_code >= 400:
            import httpx

            raise httpx.HTTPStatusError("err", request=httpx.Request("POST", "https://x"), response=httpx.Response(self.status_code))

    def json(self):
        return self._p


def _use_gemini(monkeypatch, fake_post):
    from app import config
    from app.adapters import llm

    monkeypatch.setattr(config, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(config, "LLM_PROVIDER", "auto")
    monkeypatch.setattr(llm.httpx, "post", fake_post)


def test_gemini_grounded_answer(monkeypatch):
    seen = {}

    def fake_post(url, json, headers, timeout):
        seen.update(url=url, headers=headers, body=json)
        return _FakeResp({"candidates": [{"content": {"parts": [{"text": "Aapka e-KYC poora karein. Helpline 155261."}]}, "finishReason": "STOP"}]})

    _use_gemini(monkeypatch, fake_post)
    r = client.post("/ask", json={"text": "mera kisan wala paisa nahi aaya"}).json()
    assert r["text"] == "Aapka e-KYC poora karein. Helpline 155261."
    assert "gemini" in r["provider"] and r["confidence"] == "high"
    assert "test-key" not in seen["url"] and seen["headers"]["x-goog-api-key"] == "test-key"
    assert "<context>" in seen["body"]["contents"][0]["parts"][0]["text"]
    assert client.get("/health").json()["llm"].startswith("gemini")


def test_gemini_failures_fall_back_to_verified_data(monkeypatch):
    blocked = lambda *a, **k: _FakeResp({"candidates": [{"finishReason": "SAFETY"}]})  # noqa: E731
    _use_gemini(monkeypatch, blocked)
    r = client.post("/ask", json={"text": "mera kisan wala paisa nahi aaya"}).json()
    assert "e-KYC" in r["text"] and "gemini" not in r["provider"]

    quota = lambda *a, **k: _FakeResp({}, status=429)  # noqa: E731
    _use_gemini(monkeypatch, quota)
    r = client.post("/ask", json={"text": "mera kisan wala paisa nahi aaya"}).json()
    assert "e-KYC" in r["text"] and r["provider"].startswith("backend-rag")


def test_gemini_unsure_answer_marks_low_confidence(monkeypatch):
    _use_gemini(monkeypatch, lambda *a, **k: _FakeResp({"candidates": [{"content": {"parts": [{"text": "Mujhe iski pakki jaankari nahi hai. 181 par phone karein."}]}}]}))
    r = client.post("/ask", json={"text": "pm kisan ka paisa kab aayega"}).json()
    assert r["confidence"] == "low"
