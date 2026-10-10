/**
 * Guided eligibility checker: one simple question at a time, by voice or big buttons,
 * then a clear ✅ / ❌ / ⚠️ result with reasons and the document checklist.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { useVoice } from '../hooks/useVoice.js';
import MicButton from '../components/MicButton.jsx';
import { Bi, GlossaryText, SpeakButton, SourceChip, pick } from '../components/ui.jsx';
import { SCHEMES, getScheme } from '../services/rag.js';
import { parseAnswer } from '../services/eligibility.js';
import { checkEligibility } from '../services/api.js';
import { speak, stopSpeaking } from '../services/adapters/tts.js';
import { formatINR, amountInWords } from '../services/format.js';
import { save } from '../services/storage.js';

const RESULT = {
  eligible: { icon: '✅', cls: 'bg-leaf-100 text-leaf-700 dark:bg-leaf-700/30 dark:text-leaf-100', hi: 'आप पात्र हैं!', hl: 'Aap patra hain!', en: 'You are eligible!' },
  not_eligible: { icon: '❌', cls: 'bg-red-100 text-red-700 dark:bg-red-800/40 dark:text-red-100', hi: 'आप पात्र नहीं हैं', hl: 'Aap patra nahi hain', en: 'Not eligible' },
  need_info: { icon: '⚠️', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-700/30 dark:text-amber-100', hi: 'और जानकारी चाहिए', hl: 'Aur jaankari chahiye', en: 'Need more information' },
};

export default function Eligibility() {
  const { schemeId } = useParams();
  const scheme = schemeId ? getScheme(schemeId) : null;
  if (!scheme) return <SchemePicker />;
  return <Checker key={scheme.id} scheme={scheme} />;
}

function SchemePicker() {
  return (
    <div className="space-y-4">
      <h1 className="h-title">✅ <Bi hi="पात्रता जाँचें — कौन सी योजना?" en="Eligibility checker — pick a scheme" /></h1>
      <div className="grid gap-3 sm:grid-cols-3">
        {SCHEMES.map((s) => (
          <Link key={s.id} to={`/eligibility/${s.id}`} className="card flex flex-col items-center gap-2 text-center hover:ring-saffron-400" style={{ borderTop: `6px solid ${s.color}` }}>
            <span className="text-6xl" aria-hidden>{s.icon}</span>
            <span className="text-lg font-bold">{s.name.hi}</span>
            <span className="text-sm text-stone-500">{s.tagline.hi}</span>
            <span className="text-xs text-stone-400">{s.questions.length} सवाल · questions</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Checker({ scheme }) {
  const { settings, notify } = useApp();
  const voice = useVoice();
  const nav = useNavigate();
  const lang = settings.langOverride === 'auto' ? 'hi' : settings.langOverride;
  const sp = lang === 'en' ? 'en' : 'hi'; // spoken variant
  const [answers, setAnswers] = useState({});
  const [current, setCurrent] = useState(scheme.questions[0]);
  const [result, setResult] = useState(null);
  const [typed, setTyped] = useState('');
  const handsFree = useRef(false);

  const index = scheme.questions.findIndex((q) => q.id === current?.id);
  const progress = result ? 100 : Math.round((index / scheme.questions.length) * 100);

  const announce = useCallback((q) => { if (settings.autoSpeak && q) return speak(pick(q.ask, sp), lang); }, [settings.autoSpeak, sp, lang]);

  useEffect(() => { announce(scheme.questions[0]); return () => stopSpeaking(); }, [scheme, announce]);

  const submit = useCallback(async (raw) => {
    if (!current) return false;
    const parsed = parseAnswer(current, raw);
    if (!parsed.ok) {
      notify('🤔 समझ नहीं आया, फिर से बताइए या बटन दबाइए · Not understood — try again or tap a button', 'warn');
      return true;
    }
    const next = { ...answers, [current.id]: parsed.value };
    setAnswers(next);
    setTyped('');
    const ev = await checkEligibility(scheme.id, next);
    if (ev.done) {
      setResult(ev);
      setCurrent(null);
      save(`elig:${scheme.id}`, { result: ev.result, at: Date.now() });
      if (settings.autoSpeak) {
        const r = RESULT[ev.result];
        const docs = ev.result !== 'not_eligible' ? `. ${sp === 'en' ? 'Documents' : 'ज़रूरी कागज़'}: ${scheme.documents.map((d) => pick(d.name, sp)).join(', ')}` : '';
        speak(`${pick(r, sp)}. ${[...ev.reasons, ...(ev.notes || [])].map((x) => pick(x, sp)).join('. ')}${docs}`, lang);
      }
      return false;
    }
    setCurrent(ev.nextQuestion);
    await announce(ev.nextQuestion);
    return true;
  }, [current, answers, scheme, notify, settings.autoSpeak, sp, lang, announce]);

  // Hands-free: keep listening question after question.
  const onMic = async () => {
    if (voice.listening) { voice.stop(); handsFree.current = false; return; }
    handsFree.current = true;
    while (handsFree.current) {
      const t = await voice.start(lang === 'en' ? 'en-IN' : 'hi-IN');
      if (!t) break;
      const more = await submit(t);
      if (!more) break;
    }
    handsFree.current = false;
  };

  const restart = () => { stopSpeaking(); setAnswers({}); setResult(null); setCurrent(scheme.questions[0]); announce(scheme.questions[0]); };
  const back = () => {
    if (index <= 0) return;
    const prev = scheme.questions[index - 1];
    const a = { ...answers }; delete a[prev.id];
    setAnswers(a); setCurrent(prev); announce(prev);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-5xl" aria-hidden>{scheme.icon}</span>
        <div>
          <h1 className="text-2xl font-bold">{pick(scheme.name, lang)}</h1>
          <p className="text-sm text-stone-500">पात्रता जाँच · Eligibility check</p>
        </div>
      </div>

      <div className="h-3 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-gradient-to-r from-saffron-500 to-leaf-500 transition-all" style={{ width: `${progress}%` }} />
      </div>

      {current && (
        <section className="card space-y-5 text-center" aria-live="polite">
          <p className="text-sm font-semibold text-stone-500">सवाल {index + 1} / {scheme.questions.length}</p>
          <div className="text-6xl" aria-hidden>{current.icon}</div>
          <h2 className="text-2xl font-bold leading-snug"><GlossaryText text={pick(current.ask, lang)} lang={lang} /></h2>
          <SpeakButton text={pick(current.ask, sp)} lang={lang} />

          <div className="flex flex-wrap justify-center gap-3">
            {current.type === 'yesno' && (
              <>
                <button className="btn-green min-w-[120px] text-xl" onClick={() => submit('haan')}>👍 हाँ · Yes</button>
                <button className="btn min-w-[120px] bg-red-500 text-xl text-white" onClick={() => submit('nahi')}>👎 नहीं · No</button>
              </>
            )}
            {current.type === 'choice' && current.options.map((o) => (
              <button key={o.value} className="btn-ghost min-w-[140px] text-lg" onClick={() => submit(o.value)}>{o.icon} {pick(o.label, lang)}</button>
            ))}
            {(current.type === 'number' || current.type === 'amount') && (
              <form className="flex w-full max-w-sm gap-2" onSubmit={(e) => { e.preventDefault(); submit(typed); }}>
                <input className="input text-center text-xl" inputMode={current.type === 'number' ? 'numeric' : 'text'} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={current.type === 'amount' ? 'जैसे 1,50,000 या डेढ़ लाख' : 'जैसे 34'} aria-label={pick(current.ask, lang)} />
                <button className="btn-primary" disabled={!typed.trim()}>➤</button>
              </form>
            )}
            {current.type === 'amount' && (
              <div className="flex flex-wrap justify-center gap-2">
                {[50000, 100000, 150000, 250000, 300000].map((v) => (
                  <button key={v} className="chip min-h-[40px] bg-saffron-50 text-saffron-700 dark:bg-stone-800 dark:text-saffron-200" onClick={() => submit(String(v))}>{formatINR(v)} · {amountInWords(v, lang === 'en' ? 'en' : 'hi')}</button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col items-center gap-2 border-t border-stone-200 pt-4 dark:border-stone-800">
            <MicButton listening={voice.listening} onClick={onMic} label={voice.interim || undefined} />
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={back} disabled={index <= 0}>⬅️ पीछे · Back</button>
              <button className="btn-ghost" onClick={() => submit('pata nahi')}>🤷 पता नहीं · Don't know</button>
            </div>
          </div>
        </section>
      )}

      {result && (
        <section className="card space-y-4" aria-live="polite">
          <div className={`rounded-3xl p-5 text-center ${RESULT[result.result].cls}`}>
            <div className="text-6xl">{RESULT[result.result].icon}</div>
            <h2 className="mt-2 text-3xl font-bold">{pick(RESULT[result.result], lang)}</h2>
          </div>
          <ul className="space-y-2">
            {[...result.reasons, ...(result.notes || [])].map((r, i) => (
              <li key={i} className="rounded-2xl bg-stone-50 p-3 dark:bg-stone-800"><GlossaryText text={pick(r, lang)} lang={lang} /></li>
            ))}
          </ul>
          {result.result !== 'not_eligible' && (
            <>
              <h3 className="text-lg font-bold">📄 <Bi hi="ये कागज़ साथ ले जाएँ" en="Documents to carry" /></h3>
              <ul className="grid grid-cols-2 gap-2">
                {scheme.documents.map((d) => (
                  <li key={d.id} className="flex flex-col items-center gap-1 rounded-2xl bg-saffron-50 p-3 text-center dark:bg-stone-800">
                    <span className="text-4xl" aria-hidden>{d.icon}</span>
                    <GlossaryText text={pick(d.name, lang)} lang={lang} className="text-sm font-semibold" />
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <SpeakButton text={`${pick(RESULT[result.result], sp)}. ${result.reasons.map((r) => pick(r, sp)).join('. ')}`} lang={lang} />
            <SourceChip source={{ url: scheme.officialUrl, lastVerified: scheme.lastVerified }} />
          </div>
          <div className="flex flex-wrap gap-2 border-t border-stone-200 pt-4 dark:border-stone-800">
            {result.result !== 'not_eligible' && <button className="btn-primary" onClick={() => nav(`/apply/${scheme.id}`)}>📝 <Bi hi="फ़ॉर्म भरने में मदद" en="Guided form filling" /></button>}
            <button className="btn-ghost" onClick={restart}>🔄 फिर से · Restart</button>
            <a className="btn-ghost" href={`tel:${scheme.helpline.number}`}>📞 {scheme.helpline.number}</a>
            <Link className="btn-ghost" to="/eligibility">📚 दूसरी योजना · Other scheme</Link>
          </div>
        </section>
      )}
    </div>
  );
}
