"""Language detection, dialect normalisation, glossary protection and rule-based simplification.

Python port of frontend/src/services/nlp/* — both read the same JSON data, so behaviour matches.
Note: Python's \\w does not match Devanagari vowel signs (matras), so we use an explicit letter class.
"""
from __future__ import annotations

import re

from .data import dialect_glossary, domain_glossary

LETTERS = "A-Za-zÀ-ɏऀ-෿‌‍"
WORD_RE = re.compile(f"([{LETTERS}]+)|([^{LETTERS}]+)")


def has_phrase(text: str, phrase: str) -> bool:
    """Case-insensitive whole-word phrase match that works for Devanagari and Latin."""
    return re.search(f"(?<![{LETTERS}]){re.escape(phrase)}(?![{LETTERS}])", text, re.IGNORECASE) is not None


# ---------------------------------------------------------------- language detection
SCRIPTS = {
    "hi": "ऀ-ॿ", "bn": "ঀ-৿", "pa": "਀-੿", "gu": "઀-૿",
    "or": "଀-୿", "ta": "஀-௿", "te": "ఀ-౿", "kn": "ಀ-೿", "ml": "ഀ-ൿ",
}
HINGLISH = set(
    "mera meri mere mujhe mujhko hum hamara hamari aap aapka aapki tum tera kya kyu kyun kaise kaisa kab kahan kaha kitna kitni kitne "
    "nahi nahin nai na haan han ji hai hain tha thi the ho hoga hogi raha rahi rahe karu karun karo karna karein kar paisa paise wala "
    "wali wale aaya aayi aaye mila mili milega milegi chahiye batao bataiye bolo sakta sakti kisan kisaan yojana sarkar sarkari zameen "
    "jameen gaon ghar parivar bhai behen behna bahna didi kaun kis ko ka ki ke se mein me par ilaj ilaaj aspatal bimari kagaz kagzat "
    "dastavez umar saal mahina mahine kamai aamdani mharo mhari tharo koni hamao bilat ghano aur bhi toh to abhi agar lekin".split()
)
ENGLISH = set(
    "the is are was were am what which who how when where why do does did can could should would will my your our their i you he she "
    "it we they this that these those please help scheme eligible eligibility documents apply application money received not get of "
    "for to in on with and or about status hospital farmer card".split()
)


def detect_language(text: str) -> dict:
    clean = (text or "").strip()
    if not clean:
        return {"lang": "hi", "confidence": 0.0}
    letters = len(re.sub(r"[\s\d\W_]", "", clean)) or 1
    counts = {code: len(re.findall(f"[{rng}]", clean)) for code, rng in SCRIPTS.items()}
    top, top_n = max(counts.items(), key=lambda kv: kv[1])
    if top_n / max(letters, top_n) > 0.4:
        return {"lang": top, "confidence": round(min(1.0, top_n / max(letters, top_n) + 0.1), 2)}
    words = re.findall(r"[a-z]+", clean.lower())
    hl = sum(w in HINGLISH for w in words)
    en = sum(w in ENGLISH for w in words)
    if hl == 0 and en == 0:
        return {"lang": "en" if words else "hi", "confidence": 0.4}
    lang = "hl" if hl >= en * 0.8 else "en"
    return {"lang": lang, "confidence": round(min(1.0, 0.5 + abs(hl - en) / max(1, len(words))), 2)}


# ---------------------------------------------------------------- dialect normalisation
def _dialect_index() -> dict[str, dict]:
    idx: dict[str, dict] = {}
    for e in dialect_glossary()["entries"]:
        idx[e["term"]] = {**e, "script": "deva"}
        for r in e.get("roman", []):
            idx[r.lower()] = {**e, "script": "latin"}
    return idx


def normalize_dialect(text: str) -> dict:
    idx = _dialect_index()
    parts = [[bool(m.group(1)), m.group(0)] for m in WORD_RE.finditer(text or "")]
    scores: dict[str, float] = {}
    candidates = []
    pos = 0
    for i, (is_word, val) in enumerate(parts):
        if not is_word:
            if re.search(r"[.!?।]", val):
                pos = 0
            continue
        e = idx.get(val.lower()) or idx.get(val)
        if e and not (e.get("context") == "start" and pos != 0):
            candidates.append((i, e))
            if not e.get("weak"):
                for d in e["dialects"]:
                    scores[d] = scores.get(d, 0) + 1 / len(e["dialects"])
        pos += 1
    matches = []
    if any(not e.get("weak") for _, e in candidates):
        for i, e in candidates:
            rep = e["stdRoman"] if e["script"] == "latin" else e["std"]
            matches.append({"from": parts[i][1], "to": rep, "dialects": e["dialects"]})
            parts[i][1] = rep
    dialect = max(scores, key=scores.get) if scores else None
    meta = dialect_glossary()["_meta"]["dialects"]
    return {
        "normalized": "".join(p[1] for p in parts),
        "dialect": dialect,
        "dialectName": meta.get(dialect) if dialect else None,
        "matches": matches,
        "score": round(scores.get(dialect, 0), 2) if dialect else 0,
    }


# ---------------------------------------------------------------- domain glossary protection
def protect_terms(text: str) -> tuple[str, list[str]]:
    """Replace protected terms (Aadhaar, e-KYC, Samagra ID…) by placeholders before MT."""
    variants = sorted({v for t in domain_glossary() for v in t["variants"]}, key=len, reverse=True)
    pattern = re.compile(f"(?<![{LETTERS}-])(" + "|".join(map(re.escape, variants)) + f")(?![{LETTERS}])")
    kept: list[str] = []

    def sub(m: re.Match) -> str:
        kept.append(m.group(0))
        return f"[[{len(kept) - 1}]]"

    return pattern.sub(sub, text), kept


def restore_terms(text: str, kept: list[str]) -> str:
    return re.sub(r"\[\[\s*(\d+)\s*\]\]", lambda m: kept[int(m.group(1))] if int(m.group(1)) < len(kept) else "", text)


# ---------------------------------------------------------------- rule-based simplification
HI_RULES = [
    ("के अंतर्गत", "में"), ("अंतर्गत", "में"), ("हेतु", "के लिए"), ("एवं", "और"), ("तथा", "और"), ("आवेदक", "अर्ज़ी देने वाला"),
    ("आवेदन पत्र", "फ़ॉर्म"), ("आवेदन", "अर्ज़ी"), ("लाभार्थियों", "फ़ायदा पाने वालों"), ("लाभार्थी", "फ़ायदा पाने वाला"),
    ("पात्रता", "कौन ले सकता है"), ("अनिवार्य", "ज़रूरी"), ("आवश्यक", "ज़रूरी"), ("दिनांक", "तारीख"), ("तिथि", "तारीख"),
    ("प्रस्तुत करें", "जमा करें"), ("सत्यापन", "जाँच"), ("निरस्त", "रद्द"), ("अधिसूचना", "सूचना"), ("प्रदान", "देना"),
    ("सुनिश्चित करें", "पक्का करें"), ("सूचित किया जाता है", "बताया जाता है"), ("कार्यालय", "दफ़्तर"), ("दस्तावेज़", "कागज़"),
    ("भुगतान", "पैसे देना"), ("राशि", "पैसा"), ("शासकीय", "सरकारी"), ("उपस्थित होकर", "जाकर"), ("लंबित", "बाकी"),
    ("निकटतम", "सबसे पास के"), ("समस्त", "सभी"), ("कृषकों", "किसानों"), ("पश्चात", "बाद"), ("अथवा", "या"), ("आगामी", "अगली"),
]
EN_RULES = [
    (r"\bherewith\b", ""), (r"\bhereby\b", ""), (r"\bin accordance with\b", "as per"), (r"\bbeneficiar(y|ies)\b", "people who get the benefit"),
    (r"\bmandatory\b", "must"), (r"\bfurnish\b", "bring"), (r"\bsubmit\b", "give"), (r"\bapplicant\b", "person applying"),
    (r"\bprior to\b", "before"), (r"\bsubject to\b", "only if"), (r"\bper annum\b", "a year"), (r"\bshall be organised\b", "will be held"),
    (r"\birrespective of\b", "whatever their"), (r"\bare required to\b", "must"),
]


def simplify(text: str, lang: str | None = None) -> dict:
    t = re.sub(r"\s+", " ", text or "").strip()
    is_hi = (lang != "en") if lang else bool(re.search(r"[ऀ-ॿ]", t))
    changes = 0
    if is_hi:
        for a, b in HI_RULES:
            new = re.sub(f"(?<![{LETTERS}]){re.escape(a)}(?![{LETTERS}])", b, t)
            changes += new != t
            t = new
    else:
        for a, b in EN_RULES:
            new = re.sub(a, b, t, flags=re.IGNORECASE)
            changes += new != t
            t = new
    t = re.sub(r"\s{2,}", " ", t)
    sentences = [s.strip() for s in re.split(r"(?<=[.!?।])\s+", t) if s.strip()]
    return {"simple": " ".join(sentences), "sentences": sentences, "changes": changes, "provider": "rule-based"}
