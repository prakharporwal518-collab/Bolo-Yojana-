"""Rule engine — identical semantics to frontend/src/services/eligibility.js (rules live in schemes.json)."""
from __future__ import annotations

from typing import Any

UNSURE = {"hi": "कुछ सवालों का जवाब पक्का नहीं है। हेल्पलाइन या CSC से जाँच करवाएँ।", "hl": "Kuch sawalon ka jawab pakka nahi hai. Helpline ya CSC se jaanch karwayein.", "en": "Some answers are uncertain. Please verify with the helpline or a CSC."}


def _test(cond: dict, answers: dict[str, Any]) -> bool:
    v = answers.get(cond["q"])
    if v is None or v == "unknown":
        return False
    op, target = cond["op"], cond["value"]
    try:
        if op == "==":
            return v == target
        if op == "!=":
            return v != target
        if op == "in":
            return v in target
        n = float(v)
        return {"<": n < target, "<=": n <= target, ">": n > target, ">=": n >= target}.get(op, False)
    except (TypeError, ValueError):
        return False


def evaluate(scheme: dict, answers: dict[str, Any]) -> dict:
    reasons, fails, notes, positive = [], [], [], False
    for rule in scheme["rules"]:
        if not _test(rule["if"], answers):
            continue
        then = rule["then"]
        if then == "eligible_final":
            return {"done": True, "result": "eligible", "reasons": [rule["reason"]], "notes": notes}
        if then == "not_eligible":
            fails.append(rule["reason"])
        elif then == "eligible":
            positive = True
            reasons.append(rule["reason"])
        elif then == "note":
            notes.append(rule["reason"])
    if fails:
        return {"done": True, "result": "not_eligible", "reasons": fails, "notes": notes}
    nxt = next((q for q in scheme["questions"] if q["id"] not in answers), None)
    if nxt:
        return {"done": False, "reasons": reasons, "notes": notes, "nextQuestion": nxt}
    unknown = [q["id"] for q in scheme["questions"] if q.get("required", True) and answers.get(q["id"]) == "unknown"]
    if unknown:
        return {"done": True, "result": "need_info", "reasons": [UNSURE], "unknown": unknown, "notes": notes}
    if positive:
        return {"done": True, "result": "eligible", "reasons": reasons, "notes": notes}
    return {"done": True, "result": scheme["default"]["result"], "reasons": [scheme["default"]["reason"]], "notes": notes}
