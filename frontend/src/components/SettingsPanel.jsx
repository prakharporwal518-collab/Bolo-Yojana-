import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { Modal, Bi } from './ui.jsx';
import { config } from '../config.js';
import { backendHealth } from '../services/api.js';
import { ttsSupported, hasVoiceFor } from '../services/adapters/tts.js';
import { sttSupported } from '../services/adapters/stt.js';

function Toggle({ checked, onChange, icon, hi, en }) {
  return (
    <label className="flex min-h-[56px] cursor-pointer items-center justify-between gap-3 rounded-2xl bg-stone-50 px-4 py-2 dark:bg-stone-800">
      <span className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden>{icon}</span>
        <Bi hi={hi} en={en} className="font-semibold" />
      </span>
      <input type="checkbox" className="h-6 w-6 accent-saffron-500" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export default function SettingsPanel({ open, onClose }) {
  const { settings, update } = useApp();
  const [backend, setBackend] = useState(null);
  const [installEvt, setInstallEvt] = useState(null);

  useEffect(() => {
    if (open) backendHealth().then(setBackend);
  }, [open]);

  // Capture the PWA install prompt (Android Chrome).
  useEffect(() => {
    const h = (e) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  return (
    <Modal open={open} onClose={onClose} title={<Bi hi="⚙️ सेटिंग्स" en="Settings & Accessibility" />}>
      <div className="space-y-3">
        <label className="block rounded-2xl bg-stone-50 px-4 py-3 dark:bg-stone-800">
          <Bi hi="🌐 जवाब की भाषा" en="Response language (auto-detected by default)" className="font-semibold" />
          <select className="input mt-2" value={settings.langOverride} onChange={(e) => update({ langOverride: e.target.value })}>
            <option value="auto">🤖 अपने-आप पहचानें · Auto-detect</option>
            <option value="hi">हिंदी · Hindi</option>
            <option value="hl">Hinglish (Roman Hindi)</option>
            <option value="en">English</option>
          </select>
        </label>

        <div className="rounded-2xl bg-stone-50 px-4 py-3 dark:bg-stone-800">
          <Bi hi="🔠 अक्षर का आकार" en="Font size" className="font-semibold" />
          <div className="mt-2 flex items-center gap-2">
            {[0.9, 1, 1.15, 1.3, 1.5].map((s) => (
              <button key={s} onClick={() => update({ fontScale: s })} className={`btn min-h-[44px] flex-1 px-0 ${settings.fontScale === s ? 'bg-saffron-500 text-white' : 'bg-white dark:bg-stone-900'}`} aria-label={`Font size ${s}`}>
                <span style={{ fontSize: `${s}rem` }}>अ</span>
              </button>
            ))}
          </div>
        </div>

        <Toggle checked={settings.autoSpeak} onChange={(v) => update({ autoSpeak: v })} icon="🔊" hi="जवाब अपने-आप सुनाएँ" en="Auto-play every answer as speech" />
        <Toggle checked={settings.dark} onChange={(v) => update({ dark: v })} icon="🌙" hi="डार्क मोड" en="Dark mode" />
        <Toggle checked={settings.highContrast} onChange={(v) => update({ highContrast: v })} icon="🌗" hi="हाई कॉन्ट्रास्ट" en="High-contrast mode" />
        <Toggle checked={settings.lite} onChange={(v) => update({ lite: v })} icon="🪶" hi="लाइट मोड (कम इंटरनेट)" en="Lite mode — no animations/images, saves data" />
        <Toggle checked={settings.waTheme} onChange={(v) => update({ waTheme: v })} icon="💬" hi="व्हाट्सऐप जैसा रूप" en="WhatsApp-style green theme" />
        <Toggle checked={settings.demoMode} onChange={(v) => update({ demoMode: v })} icon="🎬" hi="डेमो मोड (बिना इंटरनेट)" en="Demo mode — scripted, works offline" />

        {installEvt && (
          <button className="btn-green w-full" onClick={async () => { installEvt.prompt(); await installEvt.userChoice; setInstallEvt(null); }}>
            📲 फ़ोन में ऐप जोड़ें · Install app
          </button>
        )}

        <div className="rounded-2xl border border-dashed border-stone-300 p-3 text-xs text-stone-600 dark:border-stone-700 dark:text-stone-300">
          <p className="mb-1 font-bold">🔧 System status</p>
          <ul className="space-y-0.5">
            <li>Backend API: {config.apiUrl ? (backend?.ok ? `✅ ${config.apiUrl}` : `⚠️ unreachable — using in-browser fallback`) : '— not configured (frontend-only mode)'}</li>
            <li>Speech-to-text ({config.sttProvider}): {sttSupported() ? '✅ available' : '⚠️ not supported in this browser (type instead)'}</li>
            <li>Text-to-speech ({config.ttsProvider}): {ttsSupported() ? (hasVoiceFor('hi-IN') ? '✅ Hindi voice found' : '⚠️ no Hindi voice on device — default voice used') : '⚠️ not supported'}</li>
            <li>Translation: {config.translateProvider}</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}
