/**
 * Impact & Trust: metrics dashboard (mock pilot numbers + live on-device counters),
 * charts, cost per query, architecture / scalability story, privacy, sources, accessibility.
 */
import { useState } from 'react';
import { Bi, SpeakButton, PrivacyBadge } from '../components/ui.jsx';
import { SCHEMES } from '../services/rag.js';
import { getLocalMetrics } from '../services/storage.js';
import { formatDate } from '../services/format.js';
import { LANGUAGE_NAMES } from '../services/nlp/languageDetect.js';

// Illustrative pilot projections (clearly labelled as mock in the UI).
const WEEKLY = [
  { w: 'W1', v: 420 }, { w: 'W2', v: 690 }, { w: 'W3', v: 980 }, { w: 'W4', v: 1310 },
  { w: 'W5', v: 1720 }, { w: 'W6', v: 2050 }, { w: 'W7', v: 2410 }, { w: 'W8', v: 2900 },
];
const BY_LANG = [
  { k: 'हिंदी · Hindi', v: 5120 }, { k: 'Hinglish', v: 3010 }, { k: 'मालवी · Malwi', v: 1980 },
  { k: 'बुंदेली · Bundeli', v: 1290 }, { k: 'English', v: 690 }, { k: 'निमाड़ी · Nimadi', v: 390 },
];
const KPIS = [
  { icon: '💬', v: '12,480', hi: 'सवालों के जवाब', en: 'Queries answered' },
  { icon: '🙋', v: '3,215', hi: 'लोगों की मदद', en: 'Citizens helped' },
  { icon: '🗣️', v: '3 + 3', hi: 'भाषाएँ + बोलियाँ', en: 'Languages + dialects' },
  { icon: '⏱️', v: '2.8 सेकंड', hi: 'औसत जवाब समय', en: 'Avg. time to answer' },
  { icon: '💸', v: '₹0.04', hi: 'प्रति सवाल लागत', en: 'Cost per query' },
  { icon: '🎯', v: '94%', hi: 'स्रोत-सहित जवाब', en: 'Answers with source' },
];
const COST = [
  ['Speech-to-text', 'Browser Web Speech (Bhashini ASR in prod)', 0],
  ['Language ID + dialect layer', 'On-device rules + glossary JSON', 0],
  ['RAG retrieval', 'Cached FAISS index / in-browser keywords', 0.01],
  ['LLM answer / simplify (only when needed)', '~400 tokens, small model, cached prompts', 0.03],
  ['Text-to-speech', 'Browser SpeechSynthesis (Bhashini TTS in prod)', 0],
];

/** Single-series vertical bar chart: one hue, direct labels on max/last, hover tooltip, table view. */
function BarChart({ data, label }) {
  const [hover, setHover] = useState(null);
  const W = 640, H = 240, P = { l: 44, r: 12, t: 24, b: 28 };
  const max = Math.ceil(Math.max(...data.map((d) => d.v)) / 500) * 500;
  const bw = (W - P.l - P.r) / data.length;
  const y = (v) => P.t + (H - P.t - P.b) * (1 - v / max);
  const ticks = [0, max / 2, max];
  return (
    <figure>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="stroke-stone-200 dark:stroke-stone-700" strokeWidth="1" />
              <text x={P.l - 6} y={y(t) + 4} textAnchor="end" className="fill-stone-500 text-[11px]">{t.toLocaleString('en-IN')}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = P.l + i * bw + 2;
            const top = y(d.v);
            const h = H - P.b - top;
            const showLabel = i === data.length - 1 || hover === i;
            return (
              <g key={d.w} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${d.w}: ${d.v}`}>
                <rect x={P.l + i * bw} y={P.t} width={bw} height={H - P.t - P.b} fill="transparent" />
                {/* 4px rounded data-end, square at baseline */}
                <path d={`M${x},${H - P.b} V${top + 4} Q${x},${top} ${x + 4},${top} H${x + bw - 8} Q${x + bw - 4},${top} ${x + bw - 4},${top + 4} V${H - P.b} Z`} className={`fill-saffron-700 dark:fill-saffron-400 ${hover === i ? 'opacity-100' : hover != null ? 'opacity-60' : ''}`} />
                {showLabel && <text x={x + (bw - 4) / 2} y={top - 6} textAnchor="middle" className="fill-stone-800 text-[12px] font-semibold dark:fill-stone-100">{d.v.toLocaleString('en-IN')}</text>}
                <text x={x + (bw - 4) / 2} y={H - 10} textAnchor="middle" className="fill-stone-500 text-[11px]">{d.w}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <details className="mt-1 text-sm">
        <summary className="cursor-pointer text-stone-500">📋 टेबल देखें · View as table</summary>
        <table className="mt-2 w-full text-left"><tbody>{data.map((d) => <tr key={d.w} className="border-b border-stone-100 dark:border-stone-800"><td className="py-1">{d.w}</td><td className="text-right">{d.v.toLocaleString('en-IN')}</td></tr>)}</tbody></table>
      </details>
    </figure>
  );
}

/** Horizontal bars (magnitude by language) — one hue, every bar direct-labelled. */
function HBars({ data }) {
  const max = Math.max(...data.map((d) => d.v));
  return (
    <ul className="space-y-2" aria-label="Queries by language and dialect">
      {data.map((d) => (
        <li key={d.k} className="grid grid-cols-[8.5rem_1fr_3.5rem] items-center gap-2 text-sm" title={`${d.k}: ${d.v.toLocaleString('en-IN')}`}>
          <span className="truncate">{d.k}</span>
          <span className="h-4 rounded-r bg-stone-100 dark:bg-stone-800"><span className="block h-4 rounded-r bg-leaf-600 dark:bg-leaf-100/80" style={{ width: `${(d.v / max) * 100}%` }} /></span>
          <span className="text-right font-semibold tabular-nums">{d.v.toLocaleString('en-IN')}</span>
        </li>
      ))}
    </ul>
  );
}

const ARCH = [
  { icon: '🎤📷⌨️', t: 'Input: voice · photo · text', d: 'Mic (Web Speech → IndicWhisper / IndicConformer / Bhashini ASR) · Camera (Tesseract.js hin+eng) · Keyboard' },
  { icon: '🌐', t: 'Language ID', d: 'Script + lexical detector (→ IndicLID). Hindi / Hinglish / English / 8 Indian scripts' },
  { icon: '🗣️', t: 'Dialect normaliser', d: 'Malwi · Bundeli · Nimadi → standard Hindi using dialectGlossary.json' },
  { icon: '🔎', t: 'RAG over verified data', d: 'schemes.json → FAISS / ChromaDB (backend) or keyword index (browser). Official URL + last-verified date on every chunk' },
  { icon: '🧠', t: 'Restricted LLM + simplifier', d: 'Answers ONLY from retrieved chunks; 5th-grade rewrite; "Mujhe pakki jaankari nahi hai" when unsure' },
  { icon: '🎯', t: 'Confidence + human fallback', d: 'High / Medium / Low → Low shows "Talk to a human helper" (volunteer / helpline)' },
  { icon: '🔁', t: 'Translation adapter', d: 'IndicTrans2 / Bhashini NMT; domain glossary terms (Aadhaar, e-KYC, Samagra ID…) are protected' },
  { icon: '🔊', t: 'Speech output', d: 'Browser SpeechSynthesis → Bhashini / AI4Bharat Indic-TTS' },
];

export default function Impact() {
  const local = getLocalMetrics();
  const avg = local.queries ? Math.round(local.totalMs / local.queries) : null;
  const privacy = 'हम आपकी आवाज़ रिकॉर्ड या सेव नहीं करते। प्रोटोटाइप में सारी प्रोसेसिंग आपके फ़ोन के ब्राउज़र में होती है। कोई नाम, आधार नंबर या फ़ोटो हमारे सर्वर पर नहीं जाती।';

  return (
    <div className="space-y-6">
      <h1 className="h-title">📊 <Bi hi="असर और भरोसा" en="Impact & Trust" /></h1>

      {/* KPI tiles */}
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold">📈 <Bi hi="पायलट के आँकड़े" en="Pilot metrics" /></h2>
          <span className="chip bg-amber-100 text-amber-800">⚠️ अनुमानित (mock) · Illustrative pilot projection</span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {KPIS.map((k) => (
            <div key={k.en} className="card p-4">
              <div className="text-2xl" aria-hidden>{k.icon}</div>
              <div className="text-2xl font-bold">{k.v}</div>
              <Bi hi={k.hi} en={k.en} className="text-sm text-stone-600 dark:text-stone-300" />
            </div>
          ))}
        </div>
        <p className="mt-2 rounded-2xl bg-leaf-50 p-3 text-sm dark:bg-leaf-700/20">
          📱 <b>इस फ़ोन पर (असली) · Live on this device:</b> {local.queries} सवाल · queries
          {avg != null && <> · औसत {avg} ms · avg</>}
          {Object.keys(local.langs).length > 0 && <> · {Object.entries(local.langs).map(([l, n]) => `${LANGUAGE_NAMES[l]?.en || l}: ${n}`).join(', ')}</>}
          {Object.keys(local.dialects).length > 0 && <> · dialects: {Object.entries(local.dialects).map(([d, n]) => `${d}: ${n}`).join(', ')}</>}
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h3 className="font-bold">💬 <Bi hi="हर हफ़्ते सवाल" en="Queries answered per week (mock pilot)" /></h3>
          <BarChart data={WEEKLY} label="Weekly queries answered, rising from 420 in week 1 to 2,900 in week 8" />
        </div>
        <div className="card">
          <h3 className="mb-3 font-bold">🗣️ <Bi hi="भाषा / बोली के हिसाब से" en="Queries by language / dialect (mock pilot)" /></h3>
          <HBars data={BY_LANG} />
          <p className="mt-3 text-xs text-stone-500">~29% of queries arrive in a dialect — the reason the normalisation layer exists.</p>
        </div>
      </section>

      {/* Cost */}
      <section className="card">
        <h2 className="text-xl font-bold">💸 <Bi hi="प्रति सवाल लागत" en="Cost per query (estimate)" /></h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead><tr className="text-stone-500"><th className="py-1">Stage</th><th>How</th><th className="text-right">₹</th></tr></thead>
          <tbody>
            {COST.map(([a, b, c]) => <tr key={a} className="border-t border-stone-100 dark:border-stone-800"><td className="py-2 pr-2 font-semibold">{a}</td><td className="pr-2 text-stone-600 dark:text-stone-300">{b}</td><td className="text-right tabular-nums">{c.toFixed(2)}</td></tr>)}
            <tr className="border-t-2 border-stone-300 font-bold"><td className="py-2">Total</td><td /><td className="text-right">₹{COST.reduce((s, x) => s + x[2], 0).toFixed(2)}</td></tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-stone-500">Compare: a trip to the block office costs a rural citizen ~₹150–300 in travel + a lost day's wage.</p>
      </section>

      {/* Architecture */}
      <section className="card">
        <h2 className="text-xl font-bold">🏗️ <Bi hi="यह कैसे बना है" en="Architecture" /></h2>
        <ol className="mt-4 grid gap-2 md:grid-cols-2">
          {ARCH.map((a, i) => (
            <li key={a.t} className="relative flex gap-3 rounded-2xl border border-stone-200 p-3 dark:border-stone-700">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-saffron-100 text-sm font-bold text-saffron-700 dark:bg-saffron-700/30 dark:text-saffron-100">{i + 1}</span>
              <span>
                <span className="block font-bold"><span aria-hidden>{a.icon}</span> {a.t}</span>
                <span className="block text-sm text-stone-600 dark:text-stone-300">{a.d}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-center text-sm text-stone-500">Each numbered stage is a swappable adapter. If the backend is down, every stage falls back to its in-browser version.</p>

        <div className="mt-5 rounded-2xl bg-stone-900 p-4 text-sm text-stone-100">
          <p className="mb-2 font-bold text-saffron-400">➕ नई भाषा जोड़ना = adapter + glossary JSON (कोई कोड दोबारा नहीं) · Adding a language needs no code rewrite</p>
          <pre className="overflow-x-auto whitespace-pre text-xs leading-relaxed">{`// 1. data/dialectGlossary.json — add entries
{ "term": "म्हारो", "std": "मेरा", "dialects": ["malwi"] }

// 2. data/schemes.json — add a text key ("mr" for Marathi)
"simple": { "hi": "...", "en": "...", "mr": "..." }

// 3. config / .env — point the adapters at a model
VITE_STT_PROVIDER=backend   # IndicConformer / Bhashini ASR (mr-IN)
BHASHINI_USER_ID=...  TRANSLATE_PROVIDER=indictrans2`}</pre>
        </div>
      </section>

      {/* Privacy */}
      <section className="card space-y-2">
        <h2 className="text-xl font-bold">🔒 <Bi hi="निजता नीति" en="Privacy policy" /></h2>
        <PrivacyBadge />
        <ul className="list-inside list-disc space-y-1 text-stone-700 dark:text-stone-300">
          <li>{privacy}</li>
          <li>No voice recordings are stored. Speech recognition uses the browser's engine; audio is never saved by Bolo Yojana.</li>
          <li>Form details stay in memory on your phone; the PDF is generated on-device.</li>
          <li>Only anonymous counters (number of questions, language) are kept in your browser's local storage — you can clear them anytime.</li>
          <li>With a backend, only the question text is sent (no audio, no identity), and it is not logged by default.</li>
        </ul>
        <SpeakButton text={privacy} />
      </section>

      {/* Sources */}
      <section className="card">
        <h2 className="text-xl font-bold">📎 <Bi hi="स्रोत — हर जानकारी कहाँ से" en="Sources & last verified" /></h2>
        <ul className="mt-3 space-y-2">
          {SCHEMES.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-stone-50 p-3 dark:bg-stone-800">
              <span className="text-2xl" aria-hidden>{s.icon}</span>
              <span className="mr-auto font-semibold">{s.name.hi}<span className="block text-xs font-normal text-stone-500">{s.sourceName}</span></span>
              <a href={s.officialUrl} target="_blank" rel="noopener noreferrer" className="chip bg-white text-sky-700 underline dark:bg-stone-900">{s.officialUrl}</a>
              <span className="chip bg-leaf-50 text-leaf-700">✔ जाँचा · Verified {formatDate(s.lastVerified, 'hi')}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-stone-500">If an answer is not in this verified data, the assistant says “Mujhe iski pakki jaankari nahi hai” and offers the helpline — it never guesses.</p>
      </section>

      {/* Accessibility */}
      <section className="card">
        <h2 className="text-xl font-bold">♿ <Bi hi="सबके लिए" en="Accessibility" /></h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ul className="space-y-1 text-stone-700 dark:text-stone-300">
            <li>🔊 हर टेक्स्ट पर "सुनें" बटन · Read-aloud on every text</li>
            <li>🌗 हाई-कॉन्ट्रास्ट मोड · High-contrast mode (⚙️)</li>
            <li>🔠 अक्षर का आकार बदलें · Adjustable font size (⚙️)</li>
            <li>🏷️ स्क्रीन-रीडर लेबल · Screen-reader labels & live regions</li>
            <li>👆 48px+ बड़े बटन · Large touch targets, icon-first navigation</li>
          </ul>
          <div className="grid place-items-center rounded-2xl border-2 border-dashed border-purple-300 p-4 text-center">
            <div className="text-5xl" aria-hidden>🧏🏽‍♀️</div>
            <p className="font-bold">सांकेतिक भाषा अवतार · Sign-language avatar</p>
            <p className="text-sm text-stone-500">Roadmap: Indian Sign Language (ISL) avatar output for deaf users, via ISLRTC vocabulary.</p>
            <span className="chip mt-2 bg-purple-100 text-purple-800">🛣️ Roadmap</span>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="text-xl font-bold">🛣️ <Bi hi="आगे की योजना" en="Roadmap" /></h2>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-stone-700 dark:text-stone-300">
          <li>WhatsApp bot (Business API) + IVR missed-call line for feature phones</li>
          <li>Bhashini ASR/TTS + IndicTrans2 in production; 10 more dialects (Chhattisgarhi, Bagheli, Bhili…)</li>
          <li>50+ central & MP schemes with an automated weekly source-verification job</li>
          <li>Volunteer "Sahayak" network for human fallback, with Gram Panchayat partners</li>
        </ol>
      </section>
    </div>
  );
}
