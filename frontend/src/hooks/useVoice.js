import { useCallback, useEffect, useRef, useState } from 'react';
import { listen, stopListening, abortListening, sttSupported, STT_ERRORS } from '../services/adapters/stt.js';
import { stopSpeaking } from '../services/adapters/tts.js';
import { useApp } from '../context/AppContext.jsx';

/**
 * Voice input hook with friendly, bilingual error handling.
 *   const { listening, interim, start, stop } = useVoice();
 *   const text = await start('hi-IN');   // null on failure (error already shown as a toast)
 */
export function useVoice() {
  const { notify } = useApp();
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; abortListening(); }, []);

  const start = useCallback(async (lang = 'hi-IN') => {
    if (!sttSupported()) {
      notify(`🎤 ${STT_ERRORS.unsupported.hi} · ${STT_ERRORS.unsupported.en}`, 'warn', 6000);
      return null;
    }
    stopSpeaking(); // don't let the app hear itself
    setInterim('');
    setListening(true);
    try {
      const { transcript } = await listen({ lang, onInterim: (t) => mounted.current && setInterim(t) });
      return transcript;
    } catch (e) {
      const m = STT_ERRORS[e.code] || STT_ERRORS['no-speech'];
      if (e.code !== 'aborted') notify(`🎤 ${m.hi} · ${m.en}`, 'warn', 5000);
      return null;
    } finally {
      if (mounted.current) { setListening(false); setInterim(''); }
    }
  }, [notify]);

  return { listening, interim, start, stop: stopListening, supported: sttSupported() };
}
