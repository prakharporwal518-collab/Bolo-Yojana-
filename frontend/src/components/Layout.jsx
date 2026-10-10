import { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import SettingsPanel from './SettingsPanel.jsx';
import { PrivacyBadge } from './ui.jsx';

export const NAV = [
  { to: '/', icon: '🏠', hi: 'होम', en: 'Home', end: true },
  { to: '/assistant', icon: '🎙️', hi: 'पूछें', en: 'Ask' },
  { to: '/schemes', icon: '📚', hi: 'योजनाएँ', en: 'Schemes' },
  { to: '/eligibility', icon: '✅', hi: 'पात्रता', en: 'Eligibility' },
  { to: '/scanner', icon: '📷', hi: 'स्कैन', en: 'Scan' },
  { to: '/conversation', icon: '🤝', hi: 'बातचीत', en: 'Live Talk' },
  { to: '/impact', icon: '📊', hi: 'भरोसा', en: 'Trust' },
];

export default function Layout({ children }) {
  const { settings, update, online, toasts } = useApp();
  const [open, setOpen] = useState(false);
  const wa = settings.waTheme;

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-xl focus:bg-white focus:p-3">
        मुख्य सामग्री पर जाएँ · Skip to content
      </a>

      <header className={`sticky top-0 z-40 ${wa ? 'bg-wa-dark text-white' : 'bg-white/90 backdrop-blur dark:bg-stone-950/90'} shadow-sm`}>
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2">
          <Link to="/" className="flex items-center gap-2" aria-label="बोलो योजना होम / Bolo Yojana home">
            <img src="/icons/icon.svg" alt="" className="h-10 w-10 rounded-xl" width="40" height="40" />
            <span className="leading-tight">
              <span className="block text-lg font-bold">बोलो योजना</span>
              <span className={`block text-[11px] ${wa ? 'text-white/80' : 'text-stone-500'}`}>हर योजना, आपकी भाषा में</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {!online && <span className="chip bg-amber-100 text-amber-800" title="Offline – core info still works">📴 ऑफ़लाइन</span>}
            {settings.lite && <span className="chip hidden bg-sky-100 text-sky-800 sm:inline-flex">🪶 Lite</span>}
            <button
              onClick={() => update({ demoMode: !settings.demoMode })}
              className={`chip min-h-[36px] ${settings.demoMode ? 'bg-purple-600 text-white' : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200'}`}
              aria-pressed={settings.demoMode}
              title="Scripted demo that works without internet or API keys"
            >
              🎬 डेमो {settings.demoMode ? 'ON' : 'OFF'}
            </button>
            <button onClick={() => setOpen(true)} className="grid h-11 w-11 place-items-center rounded-full bg-stone-100 text-xl dark:bg-stone-800" aria-label="सेटिंग्स / Settings">
              ⚙️
            </button>
          </div>
        </div>
        {/* Desktop nav */}
        <nav className="mx-auto hidden max-w-5xl gap-1 px-4 pb-2 md:flex" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `rounded-full px-3 py-1.5 text-sm font-semibold ${isActive ? (wa ? 'bg-white/20' : 'bg-saffron-100 text-saffron-700 dark:bg-saffron-700/30 dark:text-saffron-100') : 'opacity-80 hover:opacity-100'}`}>
              <span aria-hidden>{n.icon}</span> {n.hi} <span className="opacity-60">· {n.en}</span>
            </NavLink>
          ))}
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-4 md:pb-10">
        {children}
      </main>

      <footer className="mx-auto mb-24 flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-stone-500 md:mb-0">
        <PrivacyBadge />
        <span>प्रोटोटाइप · Prototype — आधिकारिक जानकारी हमेशा सरकारी वेबसाइट से जाँचें · Always verify on official portals.</span>
      </footer>

      {/* Mobile bottom nav: big icons so non-readers can navigate */}
      <nav className={`safe-bottom fixed inset-x-0 bottom-0 z-40 border-t ${wa ? 'border-wa-dark bg-wa-dark text-white' : 'border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950'} md:hidden`} aria-label="Bottom navigation">
        <div className="flex overflow-x-auto">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `flex min-w-[64px] flex-1 flex-col items-center px-1 py-2 text-[11px] font-semibold ${isActive ? (wa ? 'text-wa-green' : 'text-saffron-600') : 'opacity-70'}`}>
              <span className="text-2xl" aria-hidden>{n.icon}</span>
              {n.hi}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Toasts */}
      <div className="pointer-events-none fixed inset-x-0 top-20 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`pointer-events-auto max-w-md animate-fadeup rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg ${t.kind === 'warn' ? 'bg-amber-500 text-white' : t.kind === 'ok' ? 'bg-leaf-500 text-white' : 'bg-stone-900 text-white'}`}>
            {t.msg}
          </div>
        ))}
      </div>

      <SettingsPanel open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
