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
