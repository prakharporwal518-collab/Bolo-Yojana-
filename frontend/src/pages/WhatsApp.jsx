/**
 * Mock "Continue on WhatsApp" flow — shows the planned WhatsApp Business bot.
 * The phone mock is interactive: messages typed here are answered by the same RAG engine.
 */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bi, SpeakButton } from '../components/ui.jsx';
import { answerQuestion } from '../services/rag.js';

const now = () => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

const SEED = [
  { me: false, text: 'नमस्ते 🙏 मैं बोलो योजना हूँ। अपना सवाल लिखें या 🎤 वॉइस नोट भेजें।\n1️⃣ पीएम-किसान 🌾\n2️⃣ आयुष्मान भारत 🏥\n3️⃣ लाड़ली बहना 👩' },
  { me: true, voice: '0:06', text: '🎤 "mera kisan wala paisa nahi aaya"' },
];

export default function WhatsApp() {
  const [params] = useSearchParams();
  const [msgs, setMsgs] = useState(() => SEED.map((m) => ({ ...m, t: now() })));
  const [draft, setDraft] = useState('');
  const endRef = useRef(null);

  const send = (text) => {
    const q = text.trim();
    if (!q) return;
    const a = answerQuestion(q);
    setMsgs((m) => [...m, { me: true, text: q, t: now() }, { me: false, text: `${a.text}${a.sources?.[0] ? `\n\n📎 ${a.sources[0].url}` : ''}${a.confidence === 'low' ? '\n\n🙋 किसी सहायक से बात करने के लिए "HELP" लिखें' : ''}`, t: now() }]);
  };

  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return; // StrictMode runs effects twice in dev
    seeded.current = true;
    // Seed reply to the voice note, then the question carried over from the assistant (if any).
    const a = answerQuestion('mera kisan wala paisa nahi aaya');
    setMsgs((m) => [...m, { me: false, text: a.text, t: now() }]);
    const q = params.get('q');
    if (q) send(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-4">
        <h1 className="h-title">💬 <Bi hi="व्हाट्सऐप पर बोलो योजना" en="Continue on WhatsApp (planned)" /></h1>
        <p className="text-stone-600 dark:text-stone-300">गाँव में सबके पास व्हाट्सऐप है — नया ऐप सीखने की ज़रूरत नहीं। वॉइस नोट भेजें, जवाब आवाज़ में पाएँ। · Everyone already uses WhatsApp — no new app to learn.</p>
        <ol className="space-y-3">
          {[
            ['📲', 'नंबर सेव करें या QR स्कैन करें', 'Save the number / scan the QR'],
            ['👋', '"नमस्ते" भेजें', 'Send "Namaste"'],
            ['🎤', 'वॉइस नोट में सवाल पूछें — अपनी बोली में', 'Ask in a voice note, in your dialect'],
            ['🔊', 'आवाज़ + लिखित जवाब, सरकारी लिंक के साथ', 'Get a voice + text answer with the official link'],
          ].map(([i, hi, en], n) => (
            <li key={hi} className="card flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-wa-green font-bold text-white">{n + 1}</span>
              <span className="text-3xl" aria-hidden>{i}</span>
              <Bi hi={hi} en={en} className="font-semibold" />
            </li>
          ))}
        </ol>
        <div className="card flex items-center gap-4">
          <div className="grid h-28 w-28 shrink-0 grid-cols-7 gap-0.5 rounded-xl bg-white p-2 ring-1 ring-stone-200" aria-label="Mock QR code">
            {Array.from({ length: 49 }).map((_, i) => <span key={i} className={((i * 7 + (i % 5) * 3) % 3 === 0 || [0, 1, 7, 8, 5, 6, 12, 13, 35, 36, 42, 43].includes(i)) ? 'bg-stone-900' : 'bg-white'} />)}
          </div>
          <div>
            <p className="font-bold">+91 9XXXX XXXXX</p>
            <p className="text-sm text-stone-500">डेमो के लिए नकली नंबर / QR · Mock number & QR — WhatsApp Business API integration is on the roadmap.</p>
            <SpeakButton className="mt-2" text="बोलो योजना व्हाट्सऐप पर भी आ रहा है। बस नमस्ते भेजिए और वॉइस नोट में सवाल पूछिए।" size="sm" />
          </div>
        </div>
      </section>

      {/* Phone mock */}
      <section aria-label="WhatsApp chat preview" className="mx-auto w-full max-w-sm overflow-hidden rounded-[2.5rem] border-[10px] border-stone-900 bg-stone-900 shadow-2xl">
        <div className="flex items-center gap-3 bg-wa-dark px-4 py-3 text-white">
          <span aria-hidden>←</span>
          <img src="/icons/icon.svg" alt="" className="h-9 w-9 rounded-full" />
          <div className="leading-tight">
            <p className="font-semibold">बोलो योजना ✅</p>
            <p className="text-xs opacity-80">online · आपकी भाषा में</p>
          </div>
        </div>
        <div className="wa-chat h-[480px] space-y-2 overflow-y-auto p-3">
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.me ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] whitespace-pre-line rounded-lg px-3 py-1.5 text-[13px] text-stone-900 shadow ${m.me ? 'bg-wa-bubble' : 'bg-white'}`}>
                {m.voice && <span className="mb-1 flex items-center gap-2 text-stone-600">▶️ <span className="h-1 w-24 rounded bg-stone-400" /> {m.voice}</span>}
                {m.text}
                <span className="ml-2 float-right mt-1 text-[10px] text-stone-500">{m.t}{m.me && ' ✓✓'}</span>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <form className="flex items-center gap-2 bg-[#f0f0f0] p-2" onSubmit={(e) => { e.preventDefault(); send(draft); setDraft(''); }}>
          <input className="min-h-[40px] flex-1 rounded-full bg-white px-4 text-sm text-stone-900 outline-none" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="संदेश लिखें · Message" aria-label="WhatsApp message" />
          <button className="grid h-10 w-10 place-items-center rounded-full bg-wa-dark text-white" aria-label="Send">{draft ? '➤' : '🎤'}</button>
        </form>
      </section>
    </div>
  );
}
