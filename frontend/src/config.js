/**
 * Runtime configuration (from Vite env vars, see .env.example).
 * Everything defaults to fully-offline browser providers so the prototype
 * works with zero API keys.
 */
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

export const config = {
  /** FastAPI backend base URL, e.g. http://localhost:8000. Empty = frontend-only mode. */
  apiUrl: (env.VITE_API_URL || '').replace(/\/$/, ''),
  /** 'webspeech' | 'backend' (IndicWhisper / IndicConformer / Bhashini ASR) */
  sttProvider: env.VITE_STT_PROVIDER || 'webspeech',
  /** 'browser' | 'backend' (Bhashini / Indic-TTS) */
  ttsProvider: env.VITE_TTS_PROVIDER || 'browser',
  /** Optional self-hosted Tesseract.js assets (for fully offline OCR); default = jsDelivr CDN. */
  tesseract: {
    workerPath: env.VITE_TESSERACT_WORKER_PATH || undefined,
    corePath: env.VITE_TESSERACT_CORE_PATH || undefined,
    langPath: env.VITE_TESSERACT_LANG_PATH || undefined,
  },
  /** 'offline' (phrasebook) | 'backend' (IndicTrans2 / Bhashini / LLM) */
  translateProvider: env.VITE_TRANSLATE_PROVIDER || (env.VITE_API_URL ? 'backend' : 'offline'),
};
