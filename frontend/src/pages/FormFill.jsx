/**
 * Guided form filling: the assistant asks each field by voice ("आपका नाम क्या है?"),
 * fills it from speech, lets the user correct it, then generates a downloadable
 * summary PDF with the document checklist. Data never leaves the browser.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { useVoice } from '../hooks/useVoice.js';
import MicButton from '../components/MicButton.jsx';
import { Bi, SpeakButton, GlossaryText, pick } from '../components/ui.jsx';
import { getScheme } from '../services/rag.js';
import { speak, stopSpeaking } from '../services/adapters/tts.js';
import { parseNumber, normalizeDigits, formatDate } from '../services/format.js';
import { buildSummaryCanvas } from '../services/pdfSummary.js';

/** Clean a spoken answer: "मेरा नाम सुनीता है" → "सुनीता", "nau aath ..." → digits for phone. */
export function cleanValue(field, raw) {
  let t = normalizeDigits(String(raw || '')).trim();
  if (field.type === 'number') { const n = parseNumber(t); return n == null ? '' : String(n); }
  if (field.type === 'phone') return t.replace(/\D/g, '').slice(-10);
  t = t
    .replace(/^(mera|meri|mere|my|hamara|मेरा|मेरी|मेरे|हमारा|म्हारो)\s+(\S+\s+)?(naam|name|नाम|gaon|गाँव|गांव|zila|ज़िला|जिला|village|district)\s+(hai|is|है|छे)?\s*/i, '')
    .replace(/^(main|मैं|हूँ)\s+/i, '')
    .replace(/\s+(hai|है|हूँ|hoon|छे)[.।!]?$/i, '')
    .replace(/[.।!]+$/, '');
  return t.trim();
}

export default function FormFill() {
  const { schemeId } = useParams();
  const scheme = getScheme(schemeId);
  if (!scheme) return <p className="card">योजना नहीं मिली · Scheme not found. <Link className="underline" to="/schemes">योजनाएँ देखें</Link></p>;
  return <Filler key={scheme.id} scheme={scheme} />;
}

function Filler({ scheme }) {
  const { settings, notify } = useApp();
  const voice = useVoice();
  const lang = settings.langOverride === 'auto' ? 'hi' : settings.langOverride;
  const sp = lang === 'en' ? 'en' : 'hi';
  const fields = scheme.form;
  const [values, setValues] = useState({});
  const [step, setStep] = useState(0);
  const [checked, setChecked] = useState({});
  const [busyPdf, setBusyPdf] = useState(false);
  const handsFree = useRef(false);
  const done = step >= fields.length;
  const field = fields[step];

  const askField = useCallback((f) => { if (settings.autoSpeak && f) return speak(pick(f.ask, sp), lang); }, [settings.autoSpeak, sp, lang]);
  useEffect(() => { askField(fields[0]); return () => stopSpeaking(); }, [fields, askField]);

  const goNext = useCallback(async (from = step) => {
    const n = from + 1;
    setStep(n);
    if (n < fields.length) await askField(fields[n]);
    else if (settings.autoSpeak) speak(sp === 'en' ? 'All done! Please check your details and download the summary.' : 'बहुत बढ़िया! सब भर गया। एक बार जाँच लें और सारांश डाउनलोड करें।', lang);
  }, [step, fields, askField, settings.autoSpeak, sp, lang]);

  const onMic = async () => {
    if (voice.listening) { voice.stop(); handsFree.current = false; return; }
    handsFree.current = true;
    let i = step;
    while (handsFree.current && i < fields.length) {
      const t = await voice.start(lang === 'en' ? 'en-IN' : 'hi-IN');
      if (!t) break;
      const v = cleanValue(fields[i], t);
      if (!v) { notify('🤔 फिर से बोलिए · Please say that again', 'warn'); continue; }
      setValues((x) => ({ ...x, [fields[i].id]: v }));
      await goNext(i);
      i++;
    }
    handsFree.current = false;
  };

  const downloadPdf = async () => {
    setBusyPdf(true);
    try {
      const canvas = await buildSummaryCanvas({ scheme, fields, values, checked, lang: lang === 'en' ? 'en' : 'hi' });
      try {
        const { jsPDF } = await import('jspdf');
        const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 595.28, 841.89);
        pdf.save(`bolo-yojana-${scheme.id}-summary.pdf`);
      } catch (e) {
        // Fallback: PNG download if the PDF library could not load (e.g. offline before caching).
        console.warn('PDF failed, falling back to PNG', e);
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `bolo-yojana-${scheme.id}-summary.png`;
        a.click();
      }
      notify('✅ सारांश डाउनलोड हो गया · Summary downloaded', 'ok');
    } catch (e) {
      console.error(e);
      notify('⚠️ डाउनलोड नहीं हुआ, फिर से कोशिश करें · Download failed, please retry', 'warn');
    } finally {
      setBusyPdf(false);
    }
  };

  const shareText = `${pick(scheme.name, 'hi')} — ${fields.map((f) => `${pick(f.label, 'hi')}: ${values[f.id] || '-'}`).join(', ')}. कागज़: ${scheme.documents.map((d) => d.name.hi).join(', ')}`;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-5xl" aria-hidden>{scheme.icon}</span>
        <div>
          <h1 className="text-2xl font-bold">📝 <Bi hi="फ़ॉर्म भरने में मदद" en="Guided form filling" /></h1>
          <p className="text-sm text-stone-500">{pick(scheme.name, lang)} · आसान फ़ॉर्म (सारांश) · Simplified form</p>
        </div>
      </div>
      <p className="rounded-2xl bg-leaf-50 p-3 text-sm text-leaf-700 dark:bg-leaf-700/20 dark:text-leaf-100">🔒 आपकी जानकारी सिर्फ़ इस फ़ोन में रहती है, कहीं भेजी नहीं जाती। · Your details stay on this phone only.</p>

      {/* Field list with current field highlighted */}
      <ol className="card space-y-3">
        {fields.map((f, i) => (
          <li key={f.id} className={`rounded-2xl p-3 transition ${i === step ? 'bg-saffron-50 ring-2 ring-saffron-400 dark:bg-saffron-700/20' : ''}`}>
            <label htmlFor={`f-${f.id}`} className="mb-1 flex items-center justify-between gap-2 font-semibold">
              <span>{i < step && values[f.id] ? '✅' : `${i + 1}.`} {pick(f.label, lang)}</span>
              {i === step && <SpeakButton text={pick(f.ask, sp)} lang={lang} size="sm" />}
            </label>
            <input
              id={`f-${f.id}`}
              className="input"
              value={values[f.id] || ''}
              inputMode={f.type === 'phone' || f.type === 'number' ? 'numeric' : 'text'}
              placeholder={pick(f.ask, lang)}
              onFocus={() => setStep(i)}
              onChange={(e) => setValues((x) => ({ ...x, [f.id]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); goNext(i); } }}
            />
          </li>
        ))}
      </ol>

      {!done && (
        <div className="card flex flex-col items-center gap-3 text-center">
          <p className="text-xl font-bold">{pick(field.ask, lang)}</p>
          <MicButton listening={voice.listening} onClick={onMic} label={voice.interim || undefined} />
          <button className="btn-ghost" onClick={() => goNext()}>⏭️ आगे · Next</button>
        </div>
      )}

      {done && (
        <section className="card space-y-4">
          <h2 className="text-xl font-bold">📄 <Bi hi="कागज़ों की चेकलिस्ट" en="Document checklist — tick what you have" /></h2>
          <ul className="space-y-2">
            {scheme.documents.map((d) => (
              <li key={d.id}>
                <label className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-2xl bg-stone-50 px-3 dark:bg-stone-800">
                  <input type="checkbox" className="h-6 w-6 accent-leaf-500" checked={!!checked[d.id]} onChange={(e) => setChecked((c) => ({ ...c, [d.id]: e.target.checked }))} />
                  <span className="text-3xl" aria-hidden>{d.icon}</span>
                  <GlossaryText text={pick(d.name, lang)} lang={lang} />
                </label>
              </li>
            ))}
          </ul>
          <p className="text-sm text-stone-500">📅 {formatDate(new Date(), lang === 'en' ? 'en' : 'hi')} · यह सरकारी फ़ॉर्म नहीं है — CSC / ग्राम पंचायत में दिखाने के लिए सारांश है।</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={downloadPdf} disabled={busyPdf}>{busyPdf ? '⏳' : '⬇️'} <Bi hi="PDF सारांश डाउनलोड करें" en="Download summary PDF" /></button>
            <a className="btn bg-wa-green text-white" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer">💬 WhatsApp पर भेजें</a>
            <SpeakButton text={`${fields.map((f) => `${pick(f.label, sp)}: ${values[f.id] || (sp === 'en' ? 'not filled' : 'खाली')}`).join('. ')}`} lang={lang} />
          </div>
        </section>
      )}
    </div>
  );
}
