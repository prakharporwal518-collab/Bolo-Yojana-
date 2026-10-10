import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { SCHEMES } from '../services/rag.js';
import { Bi, GlossaryText, SpeakButton, SourceChip, pick } from '../components/ui.jsx';
import { formatINR, amountInWords } from '../services/format.js';

const LANGS = [['hi', 'हिंदी'], ['hl', 'Hinglish'], ['en', 'English']];

export default function Schemes() {
  const { settings } = useApp();
  const [lang, setLang] = useState(settings.langOverride === 'auto' ? 'hi' : settings.langOverride);
  const { hash } = useLocation();
  useEffect(() => {
    const id = hash?.replace('#', '');
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [hash]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="h-title mr-auto">📚 <Bi hi="योजनाएँ — आसान भाषा में" en="Scheme explorer — in simple language" /></h1>
        <div role="radiogroup" aria-label="Language" className="flex rounded-full bg-stone-100 p-1 dark:bg-stone-800">
          {LANGS.map(([k, label]) => (
            <button key={k} role="radio" aria-checked={lang === k} onClick={() => setLang(k)} className={`min-h-[40px] rounded-full px-3 text-sm font-semibold ${lang === k ? 'bg-saffron-500 text-white' : ''}`}>{label}</button>
          ))}
        </div>
      </div>
      <p className="text-sm text-stone-500">हर जानकारी सरकारी वेबसाइट से — "जाँचा" तारीख के साथ। · Every fact comes from the official portal, with its last-verified date.</p>
      {SCHEMES.map((s) => <SchemeCard key={s.id} s={s} lang={lang} />)}
    </div>
  );
}

function SchemeCard({ s, lang }) {
  const [mode, setMode] = useState('simple'); // 'simple' | 'original'
  const L = (o) => pick(o, lang);
  const per = s.benefit.period === 'month' ? { hi: 'हर महीने', hl: 'har mahine', en: 'per month' } : { hi: 'हर साल', hl: 'har saal', en: 'per year' };
  const fullText = [L(s.name), L(s.simple), L(s.benefit.text)].join('. ');

  return (
    <article id={s.id} className="card scroll-mt-28 space-y-4" style={{ borderTop: `6px solid ${s.color}` }}>
      <header className="flex flex-wrap items-start gap-3">
        <span className="text-5xl" aria-hidden>{s.icon}</span>
        <div className="mr-auto">
          <h2 className="text-2xl font-bold">{L(s.name)}</h2>
          <p className="text-stone-600 dark:text-stone-300">{L(s.tagline)}</p>
        </div>
        <div className="rounded-2xl bg-leaf-50 px-4 py-2 text-center dark:bg-leaf-700/20">
          <div className="text-2xl font-bold text-leaf-700 dark:text-leaf-100">{formatINR(s.benefit.amount)}</div>
          <div className="text-xs">{L(per)}{s.benefit.amount >= 1e5 ? ` · ${amountInWords(s.benefit.amount, lang)}` : ''}</div>
        </div>
      </header>

      {/* Original vs Simple toggle — shows the simplification layer */}
      <div>
        <div role="tablist" aria-label="Original vs Simple" className="mb-2 inline-flex rounded-full bg-stone-100 p-1 text-sm dark:bg-stone-800">
          <button role="tab" aria-selected={mode === 'simple'} onClick={() => setMode('simple')} className={`min-h-[40px] rounded-full px-4 font-semibold ${mode === 'simple' ? 'bg-leaf-500 text-white' : ''}`}>😊 आसान · Simple</button>
          <button role="tab" aria-selected={mode === 'original'} onClick={() => setMode('original')} className={`min-h-[40px] rounded-full px-4 font-semibold ${mode === 'original' ? 'bg-stone-700 text-white' : ''}`}>📜 मूल सरकारी · Original</button>
        </div>
        {mode === 'simple' ? (
          <p className="rounded-2xl bg-leaf-50 p-4 text-lg leading-relaxed dark:bg-leaf-700/10"><GlossaryText text={L(s.simple)} lang={lang} /></p>
        ) : (
          <p className="rounded-2xl bg-stone-100 p-4 text-sm leading-relaxed text-stone-700 dark:bg-stone-800 dark:text-stone-300">{pick(s.original, lang === 'en' ? 'en' : 'hi')}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <SpeakButton text={fullText} lang={lang} />
          <SourceChip source={{ url: s.officialUrl, lastVerified: s.lastVerified }} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section>
          <h3 className="mb-2 font-bold">✅ <Bi hi="कौन ले सकता है" en="Who can get it" /></h3>
          <ul className="space-y-1">{L(s.eligibility.yes).map((x) => <li key={x}>✅ <GlossaryText text={x} lang={lang} /></li>)}</ul>
          <h3 className="mb-2 mt-3 font-bold">❌ <Bi hi="किसे नहीं मिलेगा" en="Who is excluded" /></h3>
          <ul className="space-y-1">{L(s.eligibility.no).map((x) => <li key={x}>❌ <GlossaryText text={x} lang={lang} /></li>)}</ul>
        </section>
        <section>
          <h3 className="mb-2 font-bold">📄 <Bi hi="ज़रूरी कागज़" en="Documents needed" /></h3>
          <ul className="grid grid-cols-2 gap-2">
            {s.documents.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-2xl bg-stone-50 p-2 text-sm dark:bg-stone-800">
                <span className="text-3xl" aria-hidden>{d.icon}</span><GlossaryText text={L(d.name)} lang={lang} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section>
        <h3 className="mb-2 font-bold">📝 <Bi hi="आवेदन कैसे करें" en="How to apply" /></h3>
        <ol className="space-y-2">
          {L(s.steps).map((st, i) => (
            <li key={st} className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-saffron-500 font-bold text-white">{i + 1}</span>
              <GlossaryText text={st} lang={lang} />
            </li>
          ))}
        </ol>
        <div className="mt-2"><SpeakButton text={L(s.steps).join('. ')} lang={lang} size="sm" /></div>
      </section>

      <footer className="flex flex-wrap gap-2 border-t border-stone-200 pt-4 dark:border-stone-800">
        <Link to={`/eligibility/${s.id}`} className="btn-green">✅ <Bi hi="पात्रता जाँचें" en="Check eligibility" /></Link>
        <Link to={`/assistant?q=${encodeURIComponent(L(s.name))}`} className="btn-ghost">🎙️ <Bi hi="सवाल पूछें" en="Ask a question" /></Link>
        <a href={`tel:${s.helpline.number}`} className="btn-ghost">📞 {L(s.helpline.label)}: {s.helpline.number}</a>
      </footer>
    </article>
  );
}
