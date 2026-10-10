"""Local IndicTrans2 (AI4Bharat) adapter — optional, heavy (transformers + torch + IndicTransToolkit).

Models: ai4bharat/indictrans2-en-indic-dist-200M and ai4bharat/indictrans2-indic-en-dist-200M.
Loaded lazily on first use; raises ImportError if the libraries are not installed.
"""
from __future__ import annotations

from functools import lru_cache

FLORES = {"hi": "hin_Deva", "hl": "hin_Deva", "en": "eng_Latn", "mr": "mar_Deva", "bn": "ben_Beng", "ta": "tam_Taml", "te": "tel_Telu", "gu": "guj_Gujr"}


@lru_cache(maxsize=2)
def _load(direction: str):
    import torch  # noqa: F401
    from IndicTransToolkit import IndicProcessor  # type: ignore
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer  # type: ignore

    name = f"ai4bharat/indictrans2-{direction}-dist-200M"
    tok = AutoTokenizer.from_pretrained(name, trust_remote_code=True)
    model = AutoModelForSeq2SeqLM.from_pretrained(name, trust_remote_code=True)
    return tok, model, IndicProcessor(inference=True)


def translate(text: str, source: str, target: str) -> str:
    direction = "en-indic" if source == "en" else "indic-en"
    tok, model, ip = _load(direction)
    src, tgt = FLORES[source], FLORES[target]
    batch = ip.preprocess_batch([text], src_lang=src, tgt_lang=tgt)
    enc = tok(batch, padding="longest", truncation=True, return_tensors="pt")
    out = model.generate(**enc, max_length=256, num_beams=4)
    decoded = tok.batch_decode(out, skip_special_tokens=True)
    return ip.postprocess_batch(decoded, lang=tgt)[0]
