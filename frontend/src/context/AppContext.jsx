import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { load, save } from '../services/storage.js';
import schemesData from '../data/schemes.json';

const AppContext = createContext(null);

const DEFAULTS = {
  dark: typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches,
  highContrast: false,
  fontScale: 1,
  lite: false,
  waTheme: false,
  demoMode: false,
  langOverride: 'auto', // 'auto' | 'hi' | 'hl' | 'en'
  autoSpeak: true,
};

export function AppProvider({ children }) {
  const [settings, setSettings] = useState(() => ({ ...DEFAULTS, ...load('settings', {}) }));
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  const update = useCallback((patch) => setSettings((s) => ({ ...s, ...patch })), []);

  // Persist + apply theme classes on <html>.
  useEffect(() => {
    save('settings', settings);
    const root = document.documentElement;
    root.classList.toggle('dark', !!settings.dark);
    root.classList.toggle('hc', !!settings.highContrast);
    root.classList.toggle('lite', !!settings.lite);
    root.style.setProperty('--font-scale', String(settings.fontScale));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', settings.waTheme ? '#075E54' : settings.dark ? '#0c0a09' : '#FF9933');
  }, [settings]);

  // Online / offline awareness (core info keeps working offline).
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Cache verified scheme data locally so it is available offline even without the service worker.
  useEffect(() => { save('schemes-cache', { savedAt: Date.now(), data: schemesData }); }, []);

  const notify = useCallback((msg, kind = 'info', ms = 4000) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  const value = useMemo(() => ({ settings, update, online, notify, toasts }), [settings, update, online, notify, toasts]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
