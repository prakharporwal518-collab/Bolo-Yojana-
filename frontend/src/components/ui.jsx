/**
 * Small shared UI building blocks: bilingual labels, read-aloud button,
 * glossary tooltips, confidence / dialect / language badges, source chip, waveform.
 */
import { useEffect, useRef, useState } from 'react';
import { speak, stopSpeaking, onSpeakingChange } from '../services/adapters/tts.js';
import { segmentTerms } from '../services/nlp/glossary.js';
import { LANGUAGE_NAMES } from '../services/nlp/languageDetect.js';
import { formatDate } from '../services/format.js';

/** Hindi-first bilingual label: big Hindi, small English underneath. */
export function Bi({ hi, en, className = '', enClass = '' }) {
  return (
    <span className={className}>
      <span lang="hi">{hi}</span>
      {en && <span lang="en" className={`block text-[0.72em] font-normal opacity-70 ${enClass}`}>{en}</span>}
    </span>
  );
}

/** Pick the right field for a response language ('hi' | 'hl' | 'en'). */
export const pick = (obj, lang = 'hi') => obj?.[lang] ?? obj?.hi ?? '';

/** "Read aloud" button — present on every piece of text. */
export function SpeakButton({ text, lang = 'hi', label = true, className = '', size = 'md' }) {
  const [active, setActive] = useState(false);
  const mine = useRef(false);
  useEffect(() => onSpeakingChange((v) => { if (!v) { mine.current = false; setActive(false); } }), []);
  const onClick = async (e) => {
    e.stopPropagation();
    if (active) { stopSpeaking(); return; }
    mine.current = true;
    setActive(true);
    await speak(typeof text === 'function' ? text() : text, lang);
    setActive(false);
  };
  const sz = size === 'sm' ? 'min-h-[36px] px-3 py-1 text-sm' : 'min-h-[44px] px-4 py-2';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={active ? 'Stop reading / पढ़ना रोकें' : 'Read aloud / सुनें'}
      className={`inline-flex items-center gap-2 rounded-full font-semibold transition ${sz} ${active ? 'bg-saffron-500 text-white' : 'bg-saffron-100 text-saffron-700 hover:bg-saffron-400/30 dark:bg-saffron-700/30 dark:text-saffron-100'} ${className}`}
    >
      <span aria-hidden>{active ? '⏹️' : '🔊'}</span>
      {label && <span>{active ? 'रोकें' : 'सुनें'}</span>}
    </button>
  );
}

/** Text with protected domain terms highlighted; tap a term to see its explanation. */
export function GlossaryText({ text = '', lang = 'hi', className = '' }) {
  const [open, setOpen] = useState(null);
  const segs = segmentTerms(text);
  return (
    <span className={className}>
      {segs.map((s, i) =>
        s.term ? (
          <span key={i} className="relative inline">
            <button
              type="button"
              className="glossary-term"
              aria-expanded={open === i}
              aria-label={`${s.text}: ${pick(s.term.explain, lang === 'en' ? 'en' : lang)}`}
              onClick={(e) => { e.stopPropagation(); setOpen(open === i ? null : i); }}
            >
              {s.text}
            </button>
            {open === i && (
              <span role="tooltip" className="absolute bottom-full left-0 z-30 mb-2 block w-64 max-w-[80vw] animate-fadeup rounded-2xl bg-stone-900 p-3 text-left text-sm font-normal text-white shadow-lg">
                {pick(s.term.explain, lang === 'en' ? 'en' : lang)}
                <span className="mt-2 block">
                  <SpeakButton text={pick(s.term.explain, lang)} lang={lang} size="sm" />
                </span>
              </span>
            )}
          </span>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
    </span>
  );
}

const CONF = {
  high: { cls: 'bg-leaf-100 text-leaf-700 dark:bg-leaf-700/30 dark:text-leaf-100', icon: '🟢', hi: 'पक्की जानकारी', en: 'High confidence' },
  medium: { cls: 'bg-amber-100 text-amber-800 dark:bg-amber-700/30 dark:text-amber-100', icon: '🟡', hi: 'लगभग पक्की', en: 'Medium confidence' },
  low: { cls: 'bg-red-100 text-red-700 dark:bg-red-800/40 dark:text-red-100', icon: '🔴', hi: 'पक्की नहीं', en: 'Low confidence' },
};
export function ConfidenceBadge({ level = 'medium', score }) {
  const c = CONF[level] || CONF.medium;
  return (
    <span className={`chip ${c.cls}`} title={score != null ? `score ${score}` : undefined}>
      <span aria-hidden>{c.icon}</span> {c.hi} · {c.en}
    </span>
  );
}

export function DialectBadge({ dialect }) {
  if (!dialect?.dialect) return null;
  return (
    <span className="chip bg-purple-100 text-purple-800 dark:bg-purple-800/40 dark:text-purple-100" title={dialect.matches?.map((m) => `${m.from}→${m.to}`).join(', ')}>
      🗣️ बोली पहचानी: {dialect.dialectName?.hi} · Dialect detected: {dialect.dialectName?.en}
    </span>
  );
}

export function LangBadge({ lang }) {
  const n = LANGUAGE_NAMES[lang];
  if (!n) return null;
  return <span className="chip bg-sky-100 text-sky-800 dark:bg-sky-800/40 dark:text-sky-100">🌐 {n.hi} · {n.en}</span>;
}

export function SourceChip({ source }) {
  if (!source) return null;
  return (
    <a href={source.url} target="_blank" rel="noopener noreferrer" className="chip bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-200">
      📎 स्रोत / Source: {new URL(source.url).hostname}
      {source.lastVerified && <span className="opacity-70">· जाँचा / verified {formatDate(source.lastVerified, 'hi', true)}</span>}
    </a>
  );
}

export function PrivacyBadge({ compact = false }) {
  return (
    <span className="chip bg-leaf-50 text-leaf-700 ring-1 ring-leaf-500/30 dark:bg-leaf-700/20 dark:text-leaf-100">
      🔒 आपकी आवाज़ सेव नहीं होती{!compact && <span className="opacity-70"> · Your voice is not saved</span>}
    </span>
  );
}

/** Animated waveform bars (shown while listening / speaking). */
export function Waveform({ active = true, color = 'bg-saffron-500', bars = 7, className = '' }) {
  return (
    <span className={`inline-flex h-8 items-center gap-1 ${className}`} aria-hidden>
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className={`w-1.5 rounded-full ${color} ${active ? 'animate-wave' : ''}`}
          style={{ height: active ? '100%' : '25%', animationDelay: `${(i % 4) * 0.12}s`, transformOrigin: 'center' }}
        />
      ))}
    </span>
  );
}

export function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
      <div className="max-h-[92vh] w-full max-w-lg animate-fadeup overflow-y-auto rounded-t-3xl bg-white p-5 shadow-lg dark:bg-stone-900 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold">{title}</h2>
          <button className="btn-ghost min-h-[40px] px-3 py-1" onClick={onClose} aria-label="Close / बंद करें">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
