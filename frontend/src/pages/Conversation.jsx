/**
 * Live two-way conversation: citizen (Hindi / Malwi) ⇄ official (English).
 * Each side speaks; the other side sees AND hears the translation instantly.
 * "Face-to-face" mode flips the official's half so two people across a desk can both read.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useVoice } from '../hooks/useVoice.js';
import MicButton from '../components/MicButton.jsx';
import { Bi, DialectBadge, GlossaryText, SpeakButton, Waveform } from '../components/ui.jsx';
import { translate } from '../services/api.js';
import { normalizeDialect } from '../services/nlp/dialect.js';
import { speak, stopSpeaking, onSpeakingChange } from '../services/adapters/tts.js';

const SIDES = {
  citizen: { lang: 'hi', bcp: 'hi-IN', name: 'नागरिक', en: 'Citizen', who: '👩🏽‍🌾 सुनीता', speaks: 'हिंदी / मालवी', color: 'saffron', other: 'official' },
  official: { lang: 'en', bcp: 'en-IN', name: 'अधिकारी', en: 'Official', who: '🧑🏽‍💼 Block Officer', speaks: 'English', color: 'chakra', other: 'citizen' },
};

const SCRIPT = [
  ['official', 'Hello, how can I help you?'],
  ['citizen', 'नमस्ते साहब। म्हारो नाम सुनीता है। म्हारो पइसो दो महीने से नी आयो।'],
  ['official', 'What is your Samagra ID?'],
  ['citizen', 'मेरी समग्र आईडी यह है।'],
  ['official', 'Your Samagra e-KYC is pending. Please complete e-KYC at the CSC.'],
  ['citizen', 'कौन से कागज़ लाने हैं?'],
  ['official', 'Bring Aadhaar, Samagra ID and bank passbook. After that, the money will come from next month.'],
  ['citizen', 'धन्यवाद साहब।'],
];

let id = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function Conversation() {
  const { settings, notify } = useApp();
  const voice = useVoice();
  const [turns, setTurns] = useState([]); // { id, from, original, translated, dialect, provider }
  const [active, setActive] = useState(null); // side currently listening
  const [speakingSide, setSpeakingSide] = useState(null);
  const [faceToFace, setFaceToFace] = useState(false);
  const [demoRunning, setDemoRunning] = useState(false);
  const [drafts, setDrafts] = useState({ citizen: '', official: '' });
  const cancelRef = useRef(false);

  useEffect(() => onSpeakingChange((v) => { if (!v) setSpeakingSide(null); }), []);
  useEffect(() => () => { cancelRef.current = true; stopSpeaking(); }, []);

  const handle = useCallback(async (from, text) => {
    const t = String(text || '').trim();
    if (!t) return;
    const src = SIDES[from];
    const dst = SIDES[src.other];
    const dialect = from === 'citizen' ? normalizeDialect(t) : null;
    const tr = await translate(t, src.lang, dst.lang);
    setTurns((x) => [...x, { id: ++id, from, original: t, translated: tr.text, dialect, provider: tr.provider }]);
    // The OTHER person hears the translation in their language.
    setSpeakingSide(src.other);
    await speak(tr.text, dst.lang);
  }, []);

  const onMic = async (side) => {
    if (voice.listening) { voice.stop(); return; }
    setActive(side);
    const t = await voice.start(SIDES[side].bcp);
    setActive(null);
    if (t) await handle(side, t);
  };

  const runDemo = async () => {
    cancelRef.current = false;
    setDemoRunning(true);
    setTurns([]);
    try {
      for (const [side, line] of SCRIPT) {
        if (cancelRef.current) break;
        setActive(side);
        await sleep(1300); // "speaking" waveform
        setActive(null);
        if (cancelRef.current) break;
        await handle(side, line);
        await sleep(settings.autoSpeak ? 400 : 1800);
      }
    } catch (e) {
      console.error(e);
      notify('⚠️ डेमो रुक गया · Demo stopped', 'warn');
    } finally {
      setActive(null);
      setDemoRunning(false);
    }
  };
  const stopDemo = () => { cancelRef.current = true; stopSpeaking(); };

  const panel = (side) => {
    const s = SIDES[side];
    const isListening = active === side;
    const isHearing = speakingSide === side;
    const flip = faceToFace && side === 'official';
    const accent = side === 'citizen' ? 'from-saffron-500 to-saffron-600' : 'from-chakra-500 to-chakra-600';
    return (
      <section className={`card flex min-h-[420px] flex-col gap-3 ${flip ? 'rotate-180' : ''}`} aria-label={`${s.en} side`}>
        <header className={`flex items-center gap-3 rounded-2xl bg-gradient-to-r ${accent} p-3 text-white`}>
          <span className="text-3xl" aria-hidden>{s.who.split(' ')[0]}</span>
          <div className="mr-auto leading-tight">
            <p className="font-bold">{s.who.split(' ').slice(1).join(' ')} · {s.name}</p>
            <p className="text-xs opacity-90">बोलते हैं · speaks: {s.speaks}</p>
          </div>
          {(isListening || isHearing) && <Waveform color="bg-white" />}
        </header>
        <p className="text-center text-xs font-semibold text-stone-500" aria-live="polite">
          {isListening ? (voice.interim || (side === 'citizen' ? '🎤 बोलिए…' : '🎤 Speak now…')) : isHearing ? (side === 'citizen' ? '🔊 अनुवाद सुन रहे हैं…' : '🔊 Hearing translation…') : ' '}
        </p>

        <ol className="flex flex-1 flex-col gap-2 overflow-y-auto" style={{ maxHeight: 360 }}>
          {turns.map((t) => {
            const mine = t.from === side;
            const text = mine ? t.original : t.translated;
            const lang = s.lang;
            return (
              <li key={t.id} className={`max-w-[90%] animate-fadeup rounded-2xl px-3 py-2 ${mine ? 'self-end bg-stone-100 dark:bg-stone-800' : side === 'citizen' ? 'self-start bg-saffron-50 ring-1 ring-saffron-200 dark:bg-saffron-700/20' : 'self-start bg-sky-50 ring-1 ring-sky-200 dark:bg-sky-900/30'}`}>
                <span className="block text-[11px] font-semibold opacity-60">{mine ? (side === 'citizen' ? 'आपने कहा' : 'You said') : (side === 'citizen' ? `${SIDES.official.name} ने कहा (अनुवाद)` : 'Citizen said (translated)')}</span>
                <GlossaryText text={text} lang={lang} />
                {!mine && <span className="mt-1 block text-[11px] opacity-50">“{t.original}”</span>}
                {mine && t.dialect?.dialect && <span className="mt-1 block"><DialectBadge dialect={t.dialect} /></span>}
                <span className="mt-1 flex items-center gap-2">
                  <SpeakButton text={text} lang={lang} size="sm" label={false} />
                  {!mine && <span className="text-[10px] opacity-50">{t.provider}</span>}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="flex items-center gap-2 border-t border-stone-200 pt-3 dark:border-stone-800">
          <MicButton size="md" listening={isListening && voice.listening} onClick={() => onMic(side)} disabled={demoRunning || (voice.listening && !isListening)} label={false} />
          <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); handle(side, drafts[side]); setDrafts((d) => ({ ...d, [side]: '' })); }}>
            <input className="input" value={drafts[side]} onChange={(e) => setDrafts((d) => ({ ...d, [side]: e.target.value }))} placeholder={side === 'citizen' ? 'लिखें / बोलें…' : 'Type / speak…'} aria-label={`${s.en} message`} disabled={demoRunning} />
            <button className="btn-ghost px-3" disabled={!drafts[side].trim() || demoRunning} aria-label="Send">➤</button>
          </form>
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="h-title mr-auto">🤝 <Bi hi="लाइव बातचीत — अफ़सर से अपनी भाषा में" en="Live two-way translation: citizen ⇄ official" /></h1>
        <button className={`btn-ghost ${faceToFace ? 'ring-2 ring-saffron-500' : ''}`} onClick={() => setFaceToFace((v) => !v)} aria-pressed={faceToFace}>🔄 <Bi hi="आमने-सामने" en="Face-to-face" /></button>
        {!demoRunning ? (
          <button className="btn bg-purple-600 text-white" onClick={runDemo}>🎬 <Bi hi="डेमो बातचीत" en="Play demo" /></button>
        ) : (
          <button className="btn bg-red-500 text-white" onClick={stopDemo}>⏹️ रोकें · Stop</button>
        )}
      </div>
      <p className="text-sm text-stone-500">
        बाएँ: नागरिक हिंदी/मालवी में बोलें · दाएँ: अधिकारी अंग्रेज़ी में। हर बात तुरंत अनुवाद होकर दूसरी तरफ़ सुनाई देती है। · Left speaks Hindi/Malwi, right speaks English; each hears the other translated in real time.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {panel('citizen')}
        {panel('official')}
      </div>
      <p className="text-xs text-stone-500">⚙️ अनुवाद: ऑफ़लाइन फ्रेज़बुक (प्रोटोटाइप) — बैकएंड से IndicTrans2 / Bhashini जोड़ें। · Translation: offline phrasebook in this prototype; plug IndicTrans2 / Bhashini through the backend adapter for open-domain speech.</p>
    </div>
  );
}
