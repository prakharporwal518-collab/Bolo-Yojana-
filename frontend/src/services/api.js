/**
 * Service layer facade. Every feature calls these functions — never the backend
 * directly. If VITE_API_URL is set and reachable we use the FastAPI backend
 * (FAISS/Chroma RAG + LLM + Bhashini/AI4Bharat adapters); otherwise — or on ANY
 * error/timeout — we transparently fall back to the in-browser implementation.
 * This is what keeps the demo from ever breaking on stage.
 */
import { timeoutSignal } from './net.js';
import { config } from '../config.js';
import { answerQuestion } from './rag.js';
import { detectLanguage as detectLocal } from './nlp/languageDetect.js';
import { simplifyText } from './nlp/simplify.js';
import { evaluate } from './eligibility.js';
import { getScheme } from './rag.js';
import { recordQuery } from './storage.js';

export { translate } from './adapters/translate.js';
export { recognize as ocr } from './adapters/ocr.js';
export { speak as tts, stopSpeaking } from './adapters/tts.js';

const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;

async function post(path, body, timeoutMs = 9000) {
  const res = await fetch(`${config.apiUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: timeoutSignal(timeoutMs),
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

const useBackend = () => !!config.apiUrl && online();

/** /ask — grounded answer with confidence + sources. */
export async function ask(text, { langOverride = 'auto', contextSchemeId = null } = {}) {
  const t0 = performance.now();
  const local = answerQuestion(text, { langOverride, contextSchemeId });
  let result = { ...local, provider: 'browser-rag' };
  if (useBackend()) {
    try {
      const j = await post('/ask', { text, lang_override: langOverride, context_scheme_id: contextSchemeId });
      // Backend answer wins for text/confidence; keep local UI extras (documents, suggestions) as fallback.
      result = { ...local, ...j, provider: j.provider || 'backend' };
    } catch (e) {
      console.warn('[api] /ask failed – using in-browser RAG', e);
    }
  }
  result.latencyMs = Math.round(performance.now() - t0);
  recordQuery(result.latencyMs, result.lang, result.dialect?.dialect);
  return result;
}

export async function detectLanguage(text) {
  if (useBackend()) {
    try { return await post('/detect-language', { text }, 4000); } catch { /* fall through */ }
  }
  return detectLocal(text);
}

export async function simplify(text, lang) {
  if (useBackend()) {
    try {
      const j = await post('/simplify', { text, lang }, 15000);
      if (j.simple) return { ...j, sentences: j.sentences || j.simple.split(/(?<=[.!?।])\s+/) };
    } catch { /* fall through */ }
  }
  return { ...simplifyText(text, lang), provider: 'rule-based' };
}

export async function checkEligibility(schemeId, answers) {
  if (useBackend()) {
    try { return await post('/eligibility', { scheme_id: schemeId, answers }, 4000); } catch { /* fall through */ }
  }
  return evaluate(getScheme(schemeId), answers);
}

/** Quick health probe for the status chip. */
export async function backendHealth() {
  if (!config.apiUrl) return { ok: false, reason: 'not-configured' };
  try {
    const r = await fetch(`${config.apiUrl}/health`, { signal: timeoutSignal(2500) });
    return r.ok ? { ok: true, ...(await r.json()) } : { ok: false, reason: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}
