/**
 * Speech-to-Text adapter.
 *
 *   provider 'webspeech' → browser Web Speech API (hi-IN / en-IN). Free; Chrome sends audio to
 *                          its own speech service, nothing is stored by Bolo Yojana.
 *   provider 'backend'   → records audio with MediaRecorder and POSTs to {API}/stt where
 *                          IndicWhisper / IndicConformer / Bhashini ASR can run.
 *
 * listen() resolves with { transcript } or rejects with an Error whose .code is one of:
 *   'unsupported' | 'not-allowed' | 'no-speech' | 'network' | 'aborted' | 'audio-capture'
 */
import { config } from '../../config.js';

const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const sttSupported = () => !!SR || (config.sttProvider === 'backend' && typeof MediaRecorder !== 'undefined');

export const STT_ERRORS = {
  unsupported: { hi: 'इस ब्राउज़र में आवाज़ पहचान नहीं है। Chrome इस्तेमाल करें या लिखकर पूछें।', en: 'Voice input is not supported in this browser. Use Chrome or type instead.' },
  'not-allowed': { hi: 'माइक की अनुमति नहीं मिली। ब्राउज़र सेटिंग में माइक चालू करें।', en: 'Microphone permission denied. Enable it in browser settings.' },
  'no-speech': { hi: 'कुछ सुनाई नहीं दिया। फिर से बोलिए।', en: "Didn't hear anything. Please try again." },
  network: { hi: 'आवाज़ पहचान के लिए इंटरनेट चाहिए। लिखकर पूछें या डेमो मोड चलाएँ।', en: 'Voice recognition needs internet. Type instead or use Demo Mode.' },
  'audio-capture': { hi: 'माइक नहीं मिला।', en: 'No microphone found.' },
  aborted: { hi: 'रुक गया।', en: 'Stopped.' },
};

const err = (code) => Object.assign(new Error(code), { code });
let active = null;

function listenWebSpeech({ lang = 'hi-IN', onInterim, maxMs = 12000 }) {
  return new Promise((resolve, reject) => {
    if (!SR) return reject(err('unsupported'));
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = '';
    let settled = false;
    const done = (fn) => { if (!settled) { settled = true; clearTimeout(timer); active = null; fn(); } };
    const timer = setTimeout(() => { try { rec.stop(); } catch { /* ignore */ } }, maxMs);

    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      onInterim?.((finalText + ' ' + interim).trim());
    };
    rec.onerror = (e) => done(() => reject(err(e.error === 'service-not-allowed' ? 'not-allowed' : e.error || 'aborted')));
    rec.onend = () => done(() => (finalText.trim() ? resolve({ transcript: finalText.trim() }) : reject(err('no-speech'))));
    active = { stop: () => { try { rec.stop(); } catch { /* ignore */ } }, abort: () => { try { rec.abort(); } catch { /* ignore */ } } };
    try { rec.start(); } catch { done(() => reject(err('aborted'))); }
  });
}

async function listenBackend({ lang = 'hi-IN', maxMs = 8000 }) {
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { throw err('not-allowed'); }
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));
  rec.start();
  active = { stop: () => rec.state !== 'inactive' && rec.stop(), abort: () => rec.state !== 'inactive' && rec.stop() };
  setTimeout(() => active?.stop(), maxMs);
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  active = null;
  const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
  const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
  const res = await fetch(`${config.apiUrl}/stt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio_base64: b64, mime: blob.type, lang }),
  }).catch(() => { throw err('network'); });
  if (!res.ok) throw err('network');
  const { transcript } = await res.json();
  if (!transcript) throw err('no-speech');
  return { transcript };
}

/** Listen once. Audio is never stored (privacy-first). */
export function listen(opts = {}) {
  stopListening();
  if (config.sttProvider === 'backend' && config.apiUrl) return listenBackend(opts).catch((e) => (SR ? listenWebSpeech(opts) : Promise.reject(e)));
  return listenWebSpeech(opts);
}

/** Finish listening and keep what was heard. */
export const stopListening = () => active?.stop();
/** Cancel without a result. */
export const abortListening = () => active?.abort();
