/**
 * OCR adapter — Tesseract.js (Hindi + English) running fully in the browser.
 * Lazy-loaded so the ~2 MB engine is only downloaded when the scanner is used.
 * Optional: {API}/ocr (server-side Tesseract / Bhashini OCR).
 */
import { timeoutSignal } from '../net.js';
import { config } from '../../config.js';

let workerPromise = null;

async function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      // Drop unset paths so Tesseract.js uses its CDN defaults.
      const paths = Object.fromEntries(Object.entries(config.tesseract || {}).filter(([, v]) => v));
      return createWorker('hin+eng', 1, {
        ...paths,
        logger: (m) => {
          if (m.status && typeof m.progress === 'number') onProgress?.({ status: m.status, progress: m.progress });
        },
      });
    })().catch((e) => {
      workerPromise = null; // allow retry
      throw e;
    });
  }
  return workerPromise;
}

const withTimeout = (p, ms, code = 'timeout') =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error(code), { code })), ms))]);

/**
 * @param {File|Blob|string} image
 * @returns {Promise<{ text: string, confidence: number, provider: string }>}
 */
export async function recognize(image, { onProgress, timeoutMs = 90000 } = {}) {
  if (config.apiUrl) {
    try {
      const fd = new FormData();
      fd.append('file', image instanceof Blob ? image : await (await fetch(image)).blob(), 'scan.png');
      const res = await fetch(`${config.apiUrl}/ocr`, { method: 'POST', body: fd, signal: timeoutSignal(20000) });
      if (res.ok) {
        const j = await res.json();
        if (j.text?.trim()) return { text: j.text, confidence: j.confidence ?? 80, provider: j.provider || 'backend' };
      }
    } catch (e) {
      console.warn('[ocr] backend unavailable, using Tesseract.js', e);
    }
  }
  const worker = await withTimeout(getWorker(onProgress), 60000, 'ocr-load-failed');
  const { data } = await withTimeout(worker.recognize(image), timeoutMs);
  return { text: (data.text || '').trim(), confidence: Math.round(data.confidence || 0), provider: 'tesseract.js' };
}
