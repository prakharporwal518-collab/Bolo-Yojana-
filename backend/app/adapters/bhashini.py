"""Bhashini (ULCA) adapter — ASR, NMT (translation) and TTS for 22 Indian languages.

Flow (per Bhashini ULCA pipeline docs — verify field names against the current docs):
  1. POST getModelsPipeline with userID + ulcaApiKey → returns the inference endpoint, its auth header
     and the serviceId for the requested task/language.
  2. POST the inference endpoint with that header + the task payload.
Config responses are cached per (task, languages).
"""
from __future__ import annotations

from functools import lru_cache

import httpx

from .. import config

CONFIG_URL = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline"
TIMEOUT = 20.0


class BhashiniError(RuntimeError):
    pass


def available() -> bool:
    return bool(config.BHASHINI_USER_ID and config.BHASHINI_API_KEY)


def _lang(code: str) -> str:
    return {"hl": "hi"}.get(code, code)


@lru_cache(maxsize=64)
def _pipeline(task: str, src: str, tgt: str | None) -> tuple[str, str, str, str]:
    if not available():
        raise BhashiniError("Bhashini credentials not configured")
    language = {"sourceLanguage": src, **({"targetLanguage": tgt} if tgt else {})}
    body = {
        "pipelineTasks": [{"taskType": task, "config": {"language": language}}],
        "pipelineRequestConfig": {"pipelineId": config.BHASHINI_PIPELINE_ID},
    }
    headers = {"userID": config.BHASHINI_USER_ID, "ulcaApiKey": config.BHASHINI_API_KEY}
    r = httpx.post(CONFIG_URL, json=body, headers=headers, timeout=TIMEOUT)
    r.raise_for_status()
    j = r.json()
    endpoint = j["pipelineInferenceAPIEndPoint"]
    service_id = j["pipelineResponseConfig"][0]["config"][0]["serviceId"]
    return endpoint["callbackUrl"], endpoint["inferenceApiKey"]["name"], endpoint["inferenceApiKey"]["value"], service_id


def _infer(task: str, src: str, tgt: str | None, input_data: dict, extra_config: dict | None = None) -> dict:
    url, key_name, key_value, service_id = _pipeline(task, src, tgt)
    language = {"sourceLanguage": src, **({"targetLanguage": tgt} if tgt else {})}
    body = {
        "pipelineTasks": [{"taskType": task, "config": {"language": language, "serviceId": service_id, **(extra_config or {})}}],
        "inputData": input_data,
    }
    r = httpx.post(url, json=body, headers={key_name: key_value}, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()["pipelineResponse"][0]


def translate(text: str, source: str, target: str) -> str:
    out = _infer("translation", _lang(source), _lang(target), {"input": [{"source": text}]})
    return out["output"][0]["target"]


def asr(audio_b64: str, lang: str = "hi", audio_format: str = "wav") -> str:
    out = _infer("asr", _lang(lang), None, {"audio": [{"audioContent": audio_b64}]}, {"audioFormat": audio_format, "samplingRate": 16000})
    return out["output"][0]["source"]


def tts(text: str, lang: str = "hi", gender: str = "female") -> str:
    out = _infer("tts", _lang(lang), None, {"input": [{"source": text}]}, {"gender": gender})
    return out["audio"][0]["audioContent"]  # base64 WAV
