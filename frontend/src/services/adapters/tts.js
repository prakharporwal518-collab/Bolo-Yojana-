/**
 * Text-to-Speech adapter.
 *
 *   provider 'browser'  → Web SpeechSynthesis (default, free, works offline on most Android phones)
 *   provider 'backend'  → POST {API}/tts  (Bhashini / AI4Bharat Indic-TTS behind FastAPI) returns base64 audio
 *
 * Every call resolves (never rejects) so a missing voice can never break the UI or the stage demo.
 */
import { timeoutSignal } from '../net.js';
import { config } from '../../config.js';

const listeners = new Set();
let speaking = false;
let currentAudio = null;
let runId = 0;

const setSpeaking = (v) => { speaking = v; listeners.forEach((fn) => fn(v)); };
export const onSpeakingChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const isSpeaking = () => speaking;

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Make text pleasant to hear: drop emoji / list markers, read ₹ naturally. */
export function speechFriendly(text = '', lang = 'hi') {
  return String(text)
    .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
    .replace(/₹\s?([\d,]+)/g, (_, n) => (lang === 'en' ? `${n} rupees` : `${n} रुपये`))
    .replace(/^\s*\d+\.\s*/gm, '')
    .replace(/•/g, '')
    .replace(/\n+/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

let voicesCache = [];
function loadVoices() {
  if (!ttsSupported()) return [];
  const v = window.speechSynthesis.getVoices();
  if (v.length) voicesCache = v;
  return voicesCache;
}
if (ttsSupported()) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

/** Best voice for a BCP-47 tag, e.g. 'hi-IN' → Google हिन्दी / Lekha / etc. */
export function pickVoice(bcp47 = 'hi-IN') {
  const voices = loadVoices();
  const base = bcp47.split('-')[0];
  return (
    voices.find((v) => v.lang === bcp47 && /google|natural|neural/i.test(v.name)) ||
    voices.find((v) => v.lang === bcp47) ||
    voices.find((v) => v.lang?.replace('_', '-').startsWith(base)) ||
    null
  );
}

export const hasVoiceFor = (bcp47) => !!pickVoice(bcp47);

/** Split into short chunks — Chrome cuts off utterances longer than ~15 s. */
function chunk(text, max = 180) {
  const parts = text.split(/(?<=[.!?।])\s+/);
  const out = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + ' ' + p).length > max && cur) { out.push(cur); cur = p; } else cur = cur ? `${cur} ${p}` : p;
  }
  if (cur) out.push(cur);
  return out;
}

function speakBrowser(text, bcp47, rate, myRun) {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const pieces = chunk(text);
    const voice = pickVoice(bcp47);
    let i = 0;
    const next = () => {
      if (myRun !== runId || i >= pieces.length) return resolve(true);
      const u = new SpeechSynthesisUtterance(pieces[i++]);
      u.lang = bcp47;
      if (voice) u.voice = voice;
      u.rate = rate;
      // Safety net: some browsers never fire onend → estimate duration and move on.
      const guard = setTimeout(next, Math.max(4000, u.text.length * 110));
      u.onend = () => { clearTimeout(guard); next(); };
      u.onerror = () => { clearTimeout(guard); next(); };
      synth.speak(u);
    };
    next();
  });
}

async function speakBackend(text, lang) {
  const res = await fetch(`${config.apiUrl}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, lang }),
    signal: timeoutSignal(8000),
  });
  if (!res.ok) throw new Error(`tts ${res.status}`);
  const { audio_base64: b64, mime = 'audio/wav' } = await res.json();
  if (!b64) throw new Error('no audio');
  return new Promise((resolve) => {
    currentAudio = new Audio(`data:${mime};base64,${b64}`);
    currentAudio.onended = () => resolve(true);
    currentAudio.onerror = () => resolve(false);
    currentAudio.play().catch(() => resolve(false));
  });
}

/**
 * Speak text. lang: 'hi' | 'hl' | 'en' (Hinglish is read by the Hindi voice).
 * @returns Promise<boolean> true if something was spoken.
 */
export async function speak(text, lang = 'hi', { rate } = {}) {
  stopSpeaking();
  const myRun = ++runId;
  const bcp47 = lang === 'en' ? 'en-IN' : 'hi-IN';
  const clean = speechFriendly(text, lang);
  if (!clean) return false;
  setSpeaking(true);
  try {
    if (config.ttsProvider === 'backend' && config.apiUrl) {
      try { return await speakBackend(clean, lang); } catch (e) { console.warn('[tts] backend failed, using browser voice', e); }
    }
    if (!ttsSupported()) return false;
    return await speakBrowser(clean, bcp47, rate ?? (lang === 'en' ? 1 : 0.92), myRun);
  } catch (e) {
    console.warn('[tts] failed', e);
    return false;
  } finally {
    if (myRun === runId) setSpeaking(false);
  }
}

export function stopSpeaking() {
  runId++;
  try { if (ttsSupported()) window.speechSynthesis.cancel(); } catch { /* ignore */ }
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  setSpeaking(false);
}
