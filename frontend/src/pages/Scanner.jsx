/**
 * Photo-to-voice: photo of a notice/form/letter → OCR (Tesseract.js, Hindi+English)
 * → simplify → key facts in the user's language → translate → read aloud.
 */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { Bi, GlossaryText, SpeakButton, SourceChip, pick } from '../components/ui.jsx';
import { ocr, simplify, translate } from '../services/api.js';
import { detectLanguage } from '../services/nlp/languageDetect.js';
import { extractFacts, explainFacts } from '../services/nlp/extract.js';
import { speak, stopSpeaking } from '../services/adapters/tts.js';
import { SAMPLE_NOTICES } from '../data/sampleNotices.js';

const STAGES = [
  { id: 'ocr', icon: '🔍', hi: 'पढ़ रहे हैं', en: 'Reading (OCR)' },
  { id: 'simplify', icon: '✂️', hi: 'आसान बना रहे हैं', en: 'Simplifying' },
  { id: 'translate', icon: '🌐', hi: 'अनुवाद', en: 'Translating' },
  { id: 'speak', icon: '🔊', hi: 'सुना रहे हैं', en: 'Reading aloud' },
];

export default function Scanner() {
  const { settings, notify } = useApp();
  const lang = settings.langOverride === 'auto' ? 'hi' : settings.langOverride;
  const [img, setImg] = useState(null); // { url, file?, sample? }
  const [stage, setStage] = useState(null);
  const [progress, setProgress] = useState(0);
  const [out, setOut] = useState(null);
  const [view, setView] = useState('simple');
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const runRef = useRef(0);

  useEffect(() => () => { stopSpeaking(); if (img?.file) URL.revokeObjectURL(img.url); }, [img]);

  const process = async (image) => {
    const run = ++runRef.current;
    setOut(null);
    setProgress(0);
    try {
      // 1) OCR (Demo Mode uses the known text of the sample so the stage demo never depends on CDN downloads).
      setStage('ocr');
      let text = '';
      let provider = 'tesseract.js';
      let confidence = null;
      if (image.sample && settings.demoMode) {
        await new Promise((r) => setTimeout(r, 900));
        text = image.sample.groundTruth;
        provider = 'demo (pre-extracted text)';
      } else {
        try {
          const r = await ocr(image.file || image.url, { onProgress: (p) => run === runRef.current && setProgress(Math.round(p.progress * 100)) });
          text = r.text; provider = r.provider; confidence = r.confidence;
        } catch (e) {
          console.warn('OCR failed', e);
          if (image.sample) {
            text = image.sample.groundTruth;
            provider = 'fallback (pre-extracted text — OCR engine unavailable offline)';
          } else throw Object.assign(new Error('ocr'), { userMsg: '📴 OCR इंजन लोड नहीं हुआ (इंटरनेट चाहिए)। · OCR engine could not load — needs internet the first time.' });
        }
        if (image.sample && text.replace(/\s/g, '').length < 40) { text = image.sample.groundTruth; provider += ' + fallback'; }
      }
      if (run !== runRef.current) return;
      if (!text.trim()) throw Object.assign(new Error('empty'), { userMsg: '🤔 फ़ोटो में कोई अक्षर नहीं मिला। साफ़ और सीधी फ़ोटो लें। · No text found — try a clearer, straight photo.' });

      // 2) Simplify (in the notice's own language) + key facts
      setStage('simplify');
      const det = detectLanguage(text);
      const srcLang = det.lang === 'en' ? 'en' : 'hi';
      const simple = await simplify(text, srcLang);
      const facts = extractFacts(text);
      const explanation = explainFacts(facts, lang);

      // 3) Translate the simplified text to the other language
      setStage('translate');
      const target = srcLang === 'en' ? 'hi' : 'en';
      const tr = await translate(simple.simple, srcLang, target);
      if (run !== runRef.current) return;

      setOut({ text, provider, confidence, srcLang, simple, facts, explanation, translation: { ...tr, target } });
      setView('simple');

      // 4) Read aloud
      setStage('speak');
      if (settings.autoSpeak) await speak(explanation.join(' '), lang);
    } catch (e) {
      console.error(e);
      notify(e.userMsg || '⚠️ फ़ोटो पढ़ने में दिक्कत हुई · Could not process the image', 'warn', 6000);
    } finally {
      if (run === runRef.current) setStage(null);
    }
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { notify('कृपया फ़ोटो चुनें · Please choose an image', 'warn'); return; }
    if (file.size > 12 * 1024 * 1024) { notify('फ़ोटो बहुत बड़ी है (12MB से कम) · Image too large', 'warn'); return; }
    const im = { url: URL.createObjectURL(file), file };
    setImg(im);
    process(im);
  };
  const pickSample = (s) => { const im = { url: s.src, sample: s }; setImg(im); process(im); };

  return (
    <div className="space-y-4">
      <h1 className="h-title">📷 <Bi hi="कागज़ / सूचना पढ़वाएँ" en="Scan a notice — hear it in simple words" /></h1>

      <div className="grid gap-3 sm:grid-cols-2">
        <button className="card flex min-h-[120px] flex-col items-center justify-center gap-2 hover:ring-saffron-400" onClick={() => camRef.current?.click()}>
          <span className="text-5xl" aria-hidden>📸</span><Bi hi="फ़ोटो खींचें" en="Take a photo" className="font-bold" />
        </button>
        <button className="card flex min-h-[120px] flex-col items-center justify-center gap-2 hover:ring-saffron-400" onClick={() => fileRef.current?.click()}>
          <span className="text-5xl" aria-hidden>🖼️</span><Bi hi="गैलरी से चुनें" en="Upload from gallery" className="font-bold" />
        </button>
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} aria-label="Take photo" />
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} aria-label="Upload image" />
      </div>

      <div>
        <p className="mb-2 font-semibold">🧪 <Bi hi="नमूना सूचना आज़माएँ" en="Try a sample notice" /></p>
        <div className="grid grid-cols-2 gap-3">
          {SAMPLE_NOTICES.map((s) => (
            <button key={s.id} className="card overflow-hidden p-2 text-left hover:ring-saffron-400" onClick={() => pickSample(s)}>
              {!settings.lite && <img src={s.src} alt="" className="decor mb-2 h-28 w-full rounded-xl object-cover object-top" loading="lazy" />}
              <span className="text-sm font-semibold"><Bi hi={s.title.hi} en={s.title.en} /></span>
            </button>
          ))}
        </div>
      </div>

      {img && (
        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="card p-2">
            <img src={img.url} alt="Scanned notice / स्कैन की गई सूचना" className="w-full rounded-2xl" />
          </div>
          <div className="space-y-3">
            {/* Pipeline progress */}
            <ol className="card grid grid-cols-4 gap-2 p-3 text-center text-xs" aria-label="Processing steps">
              {STAGES.map((s, i) => {
                const idx = STAGES.findIndex((x) => x.id === stage);
                const doneStep = out ? i < 3 || (i === 3 && !stage) : stage && i < idx;
                const active = s.id === stage;
                return (
                  <li key={s.id} className={`rounded-xl p-2 ${active ? 'bg-saffron-100 font-bold dark:bg-saffron-700/30' : doneStep ? 'bg-leaf-50 dark:bg-leaf-700/20' : 'opacity-50'}`}>
                    <div className={`text-2xl ${active ? 'animate-pulse' : ''}`} aria-hidden>{doneStep ? '✅' : s.icon}</div>
                    {s.hi}<span className="block opacity-70">{s.en}</span>
                    {active && s.id === 'ocr' && progress > 0 && <span className="block">{progress}%</span>}
                  </li>
                );
              })}
            </ol>

            {out && (
              <>
                <section className="card space-y-3 bg-leaf-50 dark:bg-leaf-700/10">
                  <h2 className="text-lg font-bold">💡 <Bi hi="आसान भाषा में मतलब" en="What it means — in simple words" /></h2>
                  <ul className="space-y-2 text-lg">
                    {out.explanation.map((l) => <li key={l}><GlossaryText text={l} lang={lang} /></li>)}
                  </ul>
                  <div className="flex flex-wrap gap-2">
                    <SpeakButton text={out.explanation.join(' ')} lang={lang} />
                    {out.facts.scheme && <SourceChip source={{ url: out.facts.scheme.officialUrl, lastVerified: out.facts.scheme.lastVerified }} />}
                  </div>
                </section>

                <section className="card space-y-2">
                  <div role="tablist" className="inline-flex flex-wrap rounded-full bg-stone-100 p-1 text-sm dark:bg-stone-800">
                    {[['simple', '😊 आसान · Simple'], ['original', '📜 मूल · Original'], ['translation', `🌐 ${out.translation.target === 'en' ? 'English' : 'हिंदी'}`]].map(([k, label]) => (
                      <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`min-h-[40px] rounded-full px-3 font-semibold ${view === k ? 'bg-saffron-500 text-white' : ''}`}>{label}</button>
                    ))}
                  </div>
                  {view === 'simple' && (
                    <ul className="space-y-1">{out.simple.sentences.map((s, i) => <li key={i}>• <GlossaryText text={s} lang={out.srcLang} /></li>)}</ul>
                  )}
                  {view === 'original' && <pre className="whitespace-pre-wrap font-sans text-sm text-stone-700 dark:text-stone-300">{out.text}</pre>}
                  {view === 'translation' && (
                    <div>
                      <p><GlossaryText text={out.translation.text} lang={out.translation.target} /></p>
                      {out.translation.provider.startsWith('offline') && <p className="mt-2 text-xs text-amber-700">⚠️ ऑफ़लाइन अनुमानित अनुवाद · Approximate offline translation — connect IndicTrans2 / Bhashini via the backend for full quality.</p>}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <SpeakButton
                      size="sm"
                      text={view === 'translation' ? out.translation.text : view === 'original' ? out.text : out.simple.simple}
                      lang={view === 'translation' ? out.translation.target : out.srcLang}
                    />
                    <span className="chip bg-stone-100 text-stone-500 dark:bg-stone-800">⚙️ OCR: {out.provider}{out.confidence != null ? ` · ${out.confidence}%` : ''}</span>
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      )}
      <p className="text-xs text-stone-500">🔒 फ़ोटो आपके फ़ोन में ही पढ़ी जाती है, कहीं अपलोड नहीं होती (बैकएंड न हो तो)। · OCR runs in your browser; the photo is not uploaded unless a backend is configured.</p>
    </div>
  );
}
