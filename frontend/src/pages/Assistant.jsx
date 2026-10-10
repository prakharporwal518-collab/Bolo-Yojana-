/**
 * Main screen: voice-first chat assistant.
 *  - auto language + dialect detection, grounded RAG answers with confidence & sources
 *  - in-chat voice eligibility flow (one question at a time, hands-free)
 *  - Demo Mode: scripted "Sunita" walkthrough that never needs internet or keys
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { useVoice } from '../hooks/useVoice.js';
import MicButton from '../components/MicButton.jsx';
import HumanHelperModal from '../components/HumanHelperModal.jsx';
import { Bi, GlossaryText, SpeakButton, ConfidenceBadge, DialectBadge, LangBadge, SourceChip, Waveform, pick } from '../components/ui.jsx';
import { ask } from '../services/api.js';
import { answerQuestion, getScheme } from '../services/rag.js';
import { parseAnswer, evaluate } from '../services/eligibility.js';
import { detectLanguage } from '../services/nlp/languageDetect.js';
import { normalizeDialect } from '../services/nlp/dialect.js';
import { speak, stopSpeaking } from '../services/adapters/tts.js';
import { DEMO_STEPS, SUNITA } from '../data/demoScript.js';

let msgId = 0;
const nextId = () => ++msgId;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const respLang = (l) => (['hi', 'hl', 'en'].includes(l) ? l : 'hi');
/** What to speak: Hinglish is read from the Hindi text (sounds natural with a Hindi voice). */
const speechOf = (obj, lang) => pick(obj, lang === 'en' ? 'en' : 'hi');

const T = {
  flowStart: { hi: 'आइए, कुछ आसान सवालों से पक्का जाँच लेते हैं। आप बोलकर या बटन दबाकर जवाब दें।', hl: 'Aaiye, kuch aasaan sawalon se pakka jaanch lete hain. Aap bolkar ya button dabakar jawab dein.', en: "Let's confirm with a few simple questions. Answer by voice or tap a button." },
  retry: { hi: 'माफ़ कीजिए, समझ नहीं आया। कृपया फिर से बताइए।', hl: 'Maaf kijiye, samajh nahi aaya. Kripya phir se bataiye.', en: "Sorry, I didn't understand. Please answer again." },
  yes: { hi: 'हाँ', hl: 'Haan', en: 'Yes' },
  no: { hi: 'नहीं', hl: 'Nahi', en: 'No' },
  dk: { hi: 'पता नहीं', hl: 'Pata nahi', en: "Don't know" },
  eligible: { hi: '✅ आप पात्र हैं!', hl: '✅ Aap patra hain!', en: '✅ You are eligible!' },
  not_eligible: { hi: '❌ आप पात्र नहीं हैं', hl: '❌ Aap patra nahi hain', en: '❌ Not eligible' },
  need_info: { hi: '⚠️ और जानकारी चाहिए', hl: '⚠️ Aur jaankari chahiye', en: '⚠️ Need more information' },
  docs: { hi: 'ये कागज़ साथ ले जाएँ:', hl: 'Yeh kagaz saath le jaayein:', en: 'Carry these documents:' },
  stopped: { hi: 'ठीक है, जाँच रोक दी।', hl: 'Theek hai, jaanch rok di.', en: 'Okay, stopped the check.' },
  welcome: { hi: 'नमस्ते! 🙏 मैं बोलो योजना हूँ। माइक दबाकर अपनी भाषा में पूछिए — जैसे "मेरा किसान वाला पैसा नहीं आया, क्या करूँ?"', hl: 'Namaste! 🙏 Main Bolo Yojana hoon.', en: 'Namaste! I am Bolo Yojana.' },
};
const STOP_WORDS = /^(ruko|band karo|cancel|stop|रुको|बंद करो|रहने दो|rehne do)\b/i;

export default function Assistant() {
  const { settings, update, notify } = useApp();
  const voice = useVoice();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [messages, setMessages] = useState(() => [{ id: nextId(), role: 'bot', kind: 'text', text: T.welcome.hi, lang: 'hi', meta: {} }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [helper, setHelper] = useState({ open: false, helpline: '181', question: '' });
  const [demo, setDemo] = useState({ running: false, step: 0 });
  const flowRef = useRef(null); // { schemeId, answers, current, lang }
  const contextRef = useRef(null); // last scheme id (for follow-up questions)
  const voiceModeRef = useRef(false); // hands-free: re-open the mic after each spoken question
  const demoRef = useRef({ cancelled: false, skip: null });
  const endRef = useRef(null);
  const wa = settings.waTheme;

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: settings.lite ? 'auto' : 'smooth', block: 'end' }); }, [messages, voice.interim, settings.lite]);

  const push = useCallback((m) => setMessages((ms) => [...ms, { id: nextId(), ...m }]), []);

  /** Speak (if enabled). In demo mode the wait can be skipped with "Next". */
  const say = useCallback(async (text, lang) => {
    if (!settings.autoSpeak) return;
    const skip = new Promise((r) => { demoRef.current.skip = r; });
    await Promise.race([speak(text, lang), skip]);
  }, [settings.autoSpeak]);

  const askFlowQuestion = useCallback(async (scheme, q, lang) => {
    push({ role: 'bot', kind: 'question', text: pick(q.ask, lang), lang, meta: { question: q, schemeId: scheme.id } });
    await say(speechOf(q.ask, lang), lang);
  }, [push, say]);

  const startFlow = useCallback(async (schemeId, lang) => {
    const scheme = getScheme(schemeId);
    if (!scheme) return;
    flowRef.current = { schemeId, answers: {}, current: scheme.questions[0], lang };
    push({ role: 'bot', kind: 'text', text: `${scheme.icon} ${pick(scheme.name, lang)} — ${pick(T.flowStart, lang)}`, lang, meta: {} });
    await say(speechOf(T.flowStart, lang), lang);
    await askFlowQuestion(scheme, scheme.questions[0], lang);
  }, [push, say, askFlowQuestion]);

  const finishFlow = useCallback(async (scheme, ev, lang) => {
    flowRef.current = null;
    const reasons = [...ev.reasons, ...(ev.notes || [])].map((r) => pick(r, lang));
    const docs = scheme.documents.map((d) => `${d.icon} ${pick(d.name, lang)}`);
    const text = [pick(T[ev.result], lang), ...reasons, ev.result !== 'not_eligible' ? pick(T.docs, lang) : '', ...(ev.result !== 'not_eligible' ? docs : [])].filter(Boolean).join('\n');
    push({ role: 'bot', kind: 'result', text, lang, meta: { result: ev.result, reasons, schemeId: scheme.id, documents: scheme.documents, sources: [{ title: scheme.sourceName, url: scheme.officialUrl, lastVerified: scheme.lastVerified }] } });
    const spoken = [speechOf(T[ev.result], lang), ...[...ev.reasons, ...(ev.notes || [])].map((r) => speechOf(r, lang)), ev.result !== 'not_eligible' ? `${speechOf(T.docs, lang)} ${scheme.documents.map((d) => speechOf(d.name, lang)).join(', ')}` : ''].join('. ');
    await say(spoken, lang);
  }, [push, say]);

  /** Core handler for anything the user says or types. Returns true if the bot expects another answer. */
  const handleUser = useCallback(async (raw, { viaVoice = false } = {}) => {
    const text = String(raw || '').trim();
    if (!text) return false;
    stopSpeaking();
    const det = detectLanguage(text);
    const dia = normalizeDialect(text);
    push({ role: 'user', kind: 'text', text, lang: det.lang, meta: { viaVoice, dialect: dia } });
    setBusy(true);
    try {
      const flow = flowRef.current;
      if (flow) {
        const scheme = getScheme(flow.schemeId);
        const lang = settings.langOverride !== 'auto' ? settings.langOverride : flow.lang;
        if (STOP_WORDS.test(text)) {
          flowRef.current = null;
          push({ role: 'bot', kind: 'text', text: pick(T.stopped, lang), lang, meta: {} });
          await say(speechOf(T.stopped, lang), lang);
          return false;
        }
        const parsed = parseAnswer(flow.current, text);
        if (!parsed.ok) {
          push({ role: 'bot', kind: 'text', text: pick(T.retry, lang), lang, meta: {} });
          await say(speechOf(T.retry, lang), lang);
          await askFlowQuestion(scheme, flow.current, lang);
          return true;
        }
        flow.answers[flow.current.id] = parsed.value;
        const ev = evaluate(scheme, flow.answers);
        if (ev.done) { await finishFlow(scheme, ev, lang); return false; }
        flow.current = ev.nextQuestion;
        await askFlowQuestion(scheme, ev.nextQuestion, lang);
        return true;
      }

      const res = await ask(text, { langOverride: settings.langOverride, contextSchemeId: contextRef.current });
      if (res.schemeId) contextRef.current = res.schemeId;
      const lang = respLang(res.lang);
      push({ role: 'bot', kind: 'answer', text: res.text, lang, meta: res });
      // Hinglish answers are spoken from the Hindi version for natural pronunciation.
      const spoken = lang === 'hl' ? answerQuestion(text, { langOverride: 'hi', contextSchemeId: res.schemeId }).text : res.text;
      await say(spoken, lang);
      if (res.topic === 'eligibility' && res.schemeId && res.confidence !== 'low') {
        await startFlow(res.schemeId, lang);
        return true;
      }
      return false;
    } catch (e) {
      console.error(e);
      notify('⚠️ कुछ गड़बड़ हुई, फिर से कोशिश करें · Something went wrong, please retry', 'warn');
      return false;
    } finally {
      setBusy(false);
    }
  }, [push, say, settings.langOverride, askFlowQuestion, finishFlow, startFlow, notify]);

  /** Mic → transcript → handle. Keeps listening hands-free while the eligibility flow runs. */
  const onMic = useCallback(async () => {
    if (voice.listening) { voice.stop(); return; }
    voiceModeRef.current = true;
    let lang = settings.langOverride === 'en' ? 'en-IN' : 'hi-IN';
    for (let turns = 0; turns < 15 && voiceModeRef.current; turns++) {
      const transcript = await voice.start(lang);
      if (!transcript) { voiceModeRef.current = false; break; }
      const expectMore = await handleUser(transcript, { viaVoice: true });
      if (!expectMore) break;
      lang = flowRef.current?.lang === 'en' ? 'en-IN' : 'hi-IN';
    }
    voiceModeRef.current = false;
  }, [voice, handleUser, settings.langOverride]);

  // ---------------- Demo Mode ----------------
  const runDemo = useCallback(async () => {
    if (demo.running) return;
    demoRef.current.cancelled = false;
    flowRef.current = null;
    contextRef.current = null;
    setMessages([{ id: nextId(), role: 'bot', kind: 'text', text: `🎬 डेमो: ${SUNITA.avatar} ${SUNITA.name}, ${SUNITA.place} · Demo: Sunita from a village near Vidisha`, lang: 'hi', meta: {} }]);
    setDemo({ running: true, step: 0 });
    for (let i = 0; i < DEMO_STEPS.length; i++) {
      if (demoRef.current.cancelled) break;
      setDemo({ running: true, step: i + 1, typing: true });
      // Simulated "speaking" with waveform, then the line goes through the real pipeline.
      await Promise.race([sleep(1400), new Promise((r) => { demoRef.current.skip = r; })]);
      if (demoRef.current.cancelled) break;
      setDemo({ running: true, step: i + 1, typing: false });
      await handleUser(DEMO_STEPS[i].say, { viaVoice: true });
      // Pause between lines (longer when nothing is spoken, so the audience can read).
      await Promise.race([sleep(settings.autoSpeak ? 700 : 2200), new Promise((r) => { demoRef.current.skip = r; })]);
    }
    setDemo({ running: false, step: 0 });
  }, [demo.running, handleUser, settings.autoSpeak]);

  const stopDemo = () => { demoRef.current.cancelled = true; demoRef.current.skip?.(); stopSpeaking(); setDemo({ running: false, step: 0 }); };
  const skipDemo = () => { stopSpeaking(); demoRef.current.skip?.(); };

  // Deep links: ?demo=1 starts the demo, ?listen=1 opens the mic, ?q= asks a question.
  const deepLinkDone = useRef(false);
  useEffect(() => {
    const p = Object.fromEntries(params.entries());
    if (deepLinkDone.current || !Object.keys(p).length) return;
    deepLinkDone.current = true;
    setParams({}, { replace: true });
    if (p.demo) runDemo();
    else if (p.check) startFlow(p.check, 'hi');
    else if (p.q) handleUser(p.q);
    else if (p.listen) onMic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cancel demo / mic on unmount. (Re-arming on mount keeps React StrictMode's dev double-mount from killing a deep-linked demo.)
  useEffect(() => {
    demoRef.current.cancelled = false;
    return () => { demoRef.current.cancelled = true; voiceModeRef.current = false; stopSpeaking(); };
  }, []);

  const submit = (e) => { e.preventDefault(); const t = input; setInput(''); voiceModeRef.current = false; handleUser(t); };
  const lastUserQ = [...messages].reverse().find((m) => m.role === 'user')?.text || '';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="h-title mr-auto">🎙️ <Bi hi="सहायक से पूछें" en="Ask the assistant" /></h1>
        <select aria-label="Response language / जवाब की भाषा" className="input w-auto min-h-[44px] py-1" value={settings.langOverride} onChange={(e) => update({ langOverride: e.target.value })}>
          <option value="auto">🤖 Auto</option>
          <option value="hi">हिंदी</option>
          <option value="hl">Hinglish</option>
          <option value="en">English</option>
        </select>
        <Link to={`/whatsapp${lastUserQ ? `?q=${encodeURIComponent(lastUserQ)}` : ''}`} className="btn min-h-[44px] bg-wa-green px-3 text-white">💬 <span className="hidden sm:inline">WhatsApp पर जारी रखें</span><span className="sm:hidden">WhatsApp</span></Link>
      </div>

      {settings.demoMode && (
        <div className="card flex flex-wrap items-center gap-3 bg-purple-50 ring-purple-200 dark:bg-purple-900/20">
          <span className="text-4xl" aria-hidden>{SUNITA.avatar}</span>
          <div className="mr-auto">
            <p className="font-bold">🎬 डेमो मोड: सुनीता, विदिशा · Demo mode</p>
            <p className="text-sm text-stone-600 dark:text-stone-300">बिना इंटरनेट / API key के — असली पाइपलाइन, तय सवाल · Offline, real pipeline, scripted input {demo.running && `· step ${demo.step}/${DEMO_STEPS.length}`}</p>
          </div>
          {!demo.running ? (
            <button className="btn bg-purple-600 text-white" onClick={runDemo}>▶️ डेमो चलाएँ · Play</button>
          ) : (
            <>
              <button className="btn-ghost" onClick={skipDemo}>⏭️ आगे · Next</button>
              <button className="btn bg-red-500 text-white" onClick={stopDemo}>⏹️ रोकें · Stop</button>
            </>
          )}
        </div>
      )}

      {/* Chat */}
      <section aria-label="Conversation" aria-live="polite" className={`min-h-[50vh] space-y-3 rounded-3xl p-3 sm:p-4 ${wa ? 'wa-chat' : 'bg-stone-100/70 dark:bg-stone-900/60'}`}>
        {messages.map((m) => (
          <Message key={m.id} m={m} wa={wa} onSuggestion={(s) => {
            if (s.action === 'eligibility') startFlow(s.schemeId, m.lang);
            else if (s.query) handleUser(s.query);
          }} onAnswer={(v) => handleUser(v)} onHelper={(h) => setHelper({ open: true, helpline: h || '181', question: lastUserQ })} onNav={nav} />
        ))}
        {(demo.typing || voice.listening) && (
          <div className="flex justify-end">
            <div className={`flex items-center gap-2 rounded-2xl px-4 py-2 ${wa ? 'bg-wa-bubble text-stone-900' : 'bg-saffron-500 text-white'}`}>
              <Waveform color={wa ? 'bg-wa-dark' : 'bg-white'} />
              <span className="text-sm">{voice.interim || (demo.typing ? `${SUNITA.name} बोल रही हैं…` : 'सुन रहा हूँ…')}</span>
            </div>
          </div>
        )}
        {busy && !demo.typing && (
          <div className="flex items-center gap-2 text-sm text-stone-500"><Waveform active color="bg-stone-400" bars={4} /> सोच रहा हूँ… · Thinking…</div>
        )}
        <div ref={endRef} />
      </section>

      {/* Input bar: mic first, text optional */}
      <div className={`sticky bottom-20 z-30 rounded-3xl p-3 shadow-lg md:bottom-3 ${wa ? 'bg-wa-dark' : 'bg-white dark:bg-stone-900'}`}>
        <div className="flex items-center gap-3">
          <MicButton size="lg" listening={voice.listening} onClick={onMic} disabled={demo.running} label={false} />
          <form onSubmit={submit} className="flex flex-1 items-center gap-2">
            <label htmlFor="ask" className="sr-only">लिखकर पूछें / Type your question</label>
            <input id="ask" className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="बोलिए या लिखिए… e.g. mera kisan wala paisa nahi aaya" disabled={demo.running} autoComplete="off" />
            <button className="btn-primary px-4" disabled={!input.trim() || demo.running} aria-label="भेजें / Send">➤</button>
          </form>
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {['mera kisan wala paisa nahi aaya, kya karu?', 'आयुष्मान कार्ड के लिए कौन से कागज़ चाहिए?', 'लाड़ली बहना म्हने मिलेगो कि नी?', 'Who is eligible for PM-JAY?'].map((q) => (
            <button key={q} className={`chip min-h-[36px] shrink-0 whitespace-nowrap ${wa ? 'bg-white/15 text-white' : 'bg-saffron-50 text-saffron-700 dark:bg-stone-800 dark:text-saffron-200'}`} onClick={() => handleUser(q)} disabled={demo.running || busy}>
              {q}
            </button>
          ))}
        </div>
      </div>

      <HumanHelperModal open={helper.open} helpline={helper.helpline} question={helper.question} onClose={() => setHelper((h) => ({ ...h, open: false }))} />
    </div>
  );
}

function Message({ m, wa, onSuggestion, onAnswer, onHelper, onNav }) {
  const isUser = m.role === 'user';
  const meta = m.meta || {};
  const bubble = isUser
    ? wa ? 'bg-wa-bubble text-stone-900' : 'bg-saffron-500 text-white'
    : wa ? 'bg-white text-stone-900 dark:bg-stone-800 dark:text-stone-100' : 'bg-white text-stone-900 dark:bg-stone-800 dark:text-stone-100';
  const scheme = meta.schemeId ? getScheme(meta.schemeId) : null;
  const q = meta.question;
  const L = m.lang === 'en' ? 'en' : m.lang === 'hl' ? 'hl' : 'hi';

  return (
    <div className={`flex animate-fadeup ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[92%] rounded-3xl px-4 py-3 shadow-sm sm:max-w-[80%] ${bubble} ${isUser ? 'rounded-br-md' : 'rounded-bl-md'}`}>
        {isUser && meta.viaVoice && <span className="mb-1 block text-xs opacity-80">🎤 आवाज़ से · via voice</span>}
        {!isUser && meta.dialect?.matches?.length > 0 && (
          <p className="mb-2 rounded-xl bg-purple-50 px-2 py-1 text-xs text-purple-800 dark:bg-purple-900/40 dark:text-purple-100">🗣️ समझा (मानक हिंदी): “{meta.normalized}”</p>
        )}
        {m.kind === 'result' && (
          <div className={`mb-2 rounded-2xl p-3 text-center text-2xl font-bold ${meta.result === 'eligible' ? 'bg-leaf-100 text-leaf-700' : meta.result === 'not_eligible' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
            {meta.result === 'eligible' ? '✅' : meta.result === 'not_eligible' ? '❌' : '⚠️'} {scheme && pick(scheme.name, L)}
          </div>
        )}
        <p className="whitespace-pre-line text-[1.05rem] leading-relaxed">
          {q && <span className="mr-1 text-2xl" aria-hidden>{q.icon}</span>}
          <GlossaryText text={m.text} lang={L} />
        </p>

        {m.kind === 'result' && meta.result !== 'not_eligible' && meta.documents && (
          <ul className="mt-3 grid grid-cols-2 gap-2" aria-label="Documents to carry">
            {meta.documents.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-2xl bg-stone-50 p-2 text-sm dark:bg-stone-700/50">
                <span className="text-3xl" aria-hidden>{d.icon}</span><GlossaryText text={pick(d.name, L)} lang={L} />
              </li>
            ))}
          </ul>
        )}

        {/* Quick replies for eligibility questions */}
        {q && (
          <div className="mt-3 flex flex-wrap gap-2">
            {q.type === 'yesno' && (
              <>
                <button className="btn-green min-h-[44px] px-4" onClick={() => onAnswer(pick(T.yes, L))}>👍 {pick(T.yes, L)}</button>
                <button className="btn min-h-[44px] bg-red-500 px-4 text-white" onClick={() => onAnswer(pick(T.no, L))}>👎 {pick(T.no, L)}</button>
              </>
            )}
            {q.type === 'choice' && q.options.map((o) => (
              <button key={o.value} className="btn-ghost min-h-[44px] px-4" onClick={() => onAnswer(pick(o.label, L))}>{o.icon} {pick(o.label, L)}</button>
            ))}
            <button className="btn-ghost min-h-[44px] px-4" onClick={() => onAnswer(pick(T.dk, L))}>🤷 {pick(T.dk, L)}</button>
          </div>
        )}

        {!isUser && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SpeakButton text={m.text} lang={m.lang} size="sm" />
            {m.kind === 'answer' && <LangBadge lang={meta.detected?.lang} />}
            {m.kind === 'answer' && <DialectBadge dialect={meta.dialect} />}
            {m.kind === 'answer' && <ConfidenceBadge level={meta.confidence} score={meta.score} />}
            {meta.sources?.map((s) => <SourceChip key={s.url} source={s} />)}
            {meta.provider && <span className="chip bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-300" title="Which engine answered">⚙️ {meta.provider}{meta.latencyMs != null ? ` · ${meta.latencyMs} ms` : ''}</span>}
          </div>
        )}

        {meta.confidence === 'low' && (
          <button className="btn-primary mt-3 w-full" onClick={() => onHelper(meta.helpline)}>🙋 इंसान से बात करें · Talk to a human helper</button>
        )}

        {m.kind === 'answer' && scheme && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer font-semibold text-saffron-700 dark:text-saffron-300">📜 मूल सरकारी भाषा देखें · Original vs Simple</summary>
            <p className="mt-1 rounded-xl bg-stone-100 p-2 text-stone-600 dark:bg-stone-700 dark:text-stone-200">{pick(scheme.original, L === 'en' ? 'en' : 'hi')}</p>
          </details>
        )}

        {m.kind === 'result' && meta.result !== 'not_eligible' && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => onNav(`/apply/${meta.schemeId}`)}>📝 फ़ॉर्म भरने में मदद · Fill form</button>
            <button className="btn bg-wa-green text-white" onClick={() => onNav('/whatsapp')}>💬 WhatsApp पर भेजें</button>
          </div>
        )}

        {meta.suggestions?.length > 0 && m.kind === 'answer' && (
          <div className="mt-3 flex flex-wrap gap-2">
            {meta.suggestions.map((s) => (
              <button key={s.label} className="chip min-h-[36px] bg-saffron-50 text-saffron-700 ring-1 ring-saffron-200 dark:bg-stone-700 dark:text-saffron-200" onClick={() => onSuggestion(s)}>{s.label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
