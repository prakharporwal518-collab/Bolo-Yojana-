import { Link, useNavigate } from 'react-router-dom';
import { Bi, SpeakButton, PrivacyBadge } from '../components/ui.jsx';
import MicButton from '../components/MicButton.jsx';
import { SCHEMES } from '../services/rag.js';
import { useApp } from '../context/AppContext.jsx';

const INTRO =
  'नमस्ते! बोलो योजना में आपका स्वागत है। आप अपनी भाषा में बोलिए — हिंदी, मालवी, बुंदेली या अंग्रेज़ी। हम आपको सरकारी योजना, पात्रता और ज़रूरी कागज़ आसान भाषा में बताएँगे।';

const STEPS = [
  { icon: '🗣️', hi: 'बोलिए', en: 'Speak', dhi: 'अपनी भाषा या बोली में सवाल पूछिए', den: 'Ask in your own language or dialect' },
  { icon: '💡', hi: 'समझिए', en: 'Understand', dhi: 'आसान भाषा में, आवाज़ में जवाब', den: 'Simple answers, read aloud, from official sources' },
  { icon: '📝', hi: 'आवेदन कीजिए', en: 'Apply', dhi: 'पात्रता जाँचें, कागज़ों की सूची, फ़ॉर्म भरने में मदद', den: 'Check eligibility, get a document checklist & form help' },
];

const FEATURES = [
  { to: '/assistant', icon: '🎙️', hi: 'सवाल पूछें', en: 'Voice assistant' },
  { to: '/eligibility', icon: '✅', hi: 'पात्रता जाँचें', en: 'Eligibility check' },
  { to: '/scanner', icon: '📷', hi: 'कागज़ पढ़वाएँ', en: 'Read a notice' },
  { to: '/conversation', icon: '🤝', hi: 'अफ़सर से बात', en: 'Live translation' },
  { to: '/schemes', icon: '📚', hi: 'योजनाएँ', en: 'Scheme explorer' },
  { to: '/whatsapp', icon: '💬', hi: 'व्हाट्सऐप पर', en: 'On WhatsApp' },
];

const STATS = [
  { v: '3', hi: 'योजनाएँ, गहराई से', en: 'schemes, in depth' },
  { v: '3 + 3', hi: 'भाषाएँ + बोलियाँ', en: 'languages + dialects' },
  { v: '< 3 सेकंड', hi: 'जवाब का समय', en: 'avg. answer time' },
  { v: '₹0.04', hi: 'प्रति सवाल लागत*', en: 'cost per query*' },
];

export default function Landing() {
  const nav = useNavigate();
  const { update } = useApp();
  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-saffron-100 via-white to-leaf-50 p-6 text-center shadow-sm ring-1 ring-saffron-200 dark:from-saffron-700/20 dark:via-stone-900 dark:to-leaf-700/20 dark:ring-stone-800 sm:p-10">
        <div className="decor pointer-events-none absolute -right-10 -top-10 text-[10rem] opacity-10" aria-hidden>🪔</div>
        <h1 className="text-4xl font-bold text-saffron-700 dark:text-saffron-400 sm:text-6xl">बोलो योजना</h1>
        <p className="mt-2 text-xl font-semibold sm:text-2xl">हर योजना, आपकी भाषा में</p>
        <p className="text-stone-600 dark:text-stone-300">Every government scheme, in your language — by voice.</p>
        <div className="mt-6 flex flex-col items-center gap-4">
          <MicButton size="xl" listening={false} onClick={() => nav('/assistant?listen=1')} label={<Bi hi="बोलना शुरू करें" en="Start Talking" className="text-base" />} />
          <div className="flex flex-wrap justify-center gap-2">
            <SpeakButton text={INTRO} />
            <button className="btn-ghost" onClick={() => { update({ demoMode: true }); nav('/assistant?demo=1'); }}>
              🎬 <Bi hi="सुनीता का डेमो देखें" en="Watch Sunita's demo" />
            </button>
          </div>
          <PrivacyBadge />
        </div>
      </section>

      {/* Problem */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="h-title">😟 <Bi hi="समस्या" en="The problem" /></h2>
          <ul className="mt-3 space-y-2 text-stone-700 dark:text-stone-300">
            <li>📄 योजनाओं की जानकारी कठिन सरकारी भाषा और ज़्यादातर अंग्रेज़ी में होती है। <span className="text-sm opacity-70">Scheme info is in complex, mostly English, official language.</span></li>
            <li>🗣️ गाँव के लोग मालवी, बुंदेली, निमाड़ी जैसी बोलियाँ बोलते हैं। <span className="text-sm opacity-70">Rural citizens speak dialects that apps don't understand.</span></li>
            <li>📶 सस्ते फ़ोन, धीमा इंटरनेट, कम पढ़ाई — ऐप काम नहीं आते। <span className="text-sm opacity-70">Low-end phones, slow internet and low literacy block access.</span></li>
            <li>💸 बिचौलिये पैसे लेकर फ़ॉर्म भरते हैं, गलत जानकारी देते हैं। <span className="text-sm opacity-70">Middlemen charge fees and misinform.</span></li>
          </ul>
          <p className="mt-3 text-xs text-stone-500">India has 22 scheduled languages and 19,500+ mother tongues/dialects; ~10% of people speak English (Census 2011).</p>
        </div>
        <div className="card">
          <h2 className="h-title">💡 <Bi hi="हमारा हल" en="Our solution" /></h2>
          <ul className="mt-3 space-y-2 text-stone-700 dark:text-stone-300">
            <li>🎙️ आवाज़ से चलने वाला, बोली समझने वाला सहायक · Voice-first, dialect-aware</li>
            <li>📎 सिर्फ़ सरकारी स्रोत से जवाब, हर जवाब के साथ लिंक · Answers only from official sources</li>
            <li>🟢🟡🔴 भरोसे का स्तर; पक्का न हो तो इंसान से जोड़ना · Confidence + human fallback</li>
            <li>🪶 बिना इंटरनेट भी मुख्य जानकारी · Works offline, installable app</li>
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section>
        <h2 className="h-title mb-4 text-center">⚙️ <Bi hi="कैसे काम करता है" en="How it works" /></h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.en} className="card text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-saffron-100 text-4xl dark:bg-saffron-700/30" aria-hidden>{s.icon}</div>
              <p className="mt-2 text-sm font-bold text-saffron-600">{i + 1}</p>
              <h3 className="text-xl font-bold"><Bi hi={s.hi} en={s.en} /></h3>
              <p className="mt-1 text-stone-600 dark:text-stone-300"><Bi hi={s.dhi} en={s.den} /></p>
              <SpeakButton text={`${s.hi}। ${s.dhi}`} size="sm" className="mt-2" />
            </li>
          ))}
        </ol>
        <p className="mt-2 text-center text-xl font-bold text-stone-400" aria-hidden>🗣️ → 💡 → 📝</p>
      </section>

      {/* Features */}
      <section>
        <h2 className="h-title mb-4 text-center">🧰 <Bi hi="क्या-क्या कर सकते हैं" en="What you can do" /></h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <Link key={f.to} to={f.to} className="card flex flex-col items-center gap-2 text-center transition hover:-translate-y-0.5 hover:ring-saffron-400">
              <span className="text-5xl" aria-hidden>{f.icon}</span>
              <Bi hi={f.hi} en={f.en} className="font-semibold" />
            </Link>
          ))}
        </div>
      </section>

      {/* Schemes */}
      <section>
        <h2 className="h-title mb-4 text-center">📚 <Bi hi="अभी ये योजनाएँ" en="Schemes covered (in depth)" /></h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {SCHEMES.map((s) => (
            <Link key={s.id} to={`/schemes#${s.id}`} className="card flex items-center gap-3" style={{ borderLeft: `6px solid ${s.color}` }}>
              <span className="text-4xl" aria-hidden>{s.icon}</span>
              <span>
                <span className="block font-bold">{s.name.hi}</span>
                <span className="block text-sm text-stone-500">{s.tagline.hi}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Impact */}
      <section className="card">
        <h2 className="h-title mb-4 text-center">📈 <Bi hi="असर" en="Impact (prototype)" /></h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.en} className="rounded-2xl bg-saffron-50 p-4 text-center dark:bg-stone-800">
              <div className="text-2xl font-bold text-saffron-700 dark:text-saffron-400">{s.v}</div>
              <Bi hi={s.hi} en={s.en} className="text-sm" />
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-stone-500">*Estimated with in-browser speech + cached RAG; see the Trust page for the full breakdown.</p>
        <div className="mt-4 text-center">
          <Link to="/impact" className="btn-ghost">📊 <Bi hi="पूरा डैशबोर्ड" en="Full dashboard & architecture" /></Link>
        </div>
      </section>
    </div>
  );
}
