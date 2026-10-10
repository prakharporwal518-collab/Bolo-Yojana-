import { useEffect, useState } from 'react';
import { Modal, Bi, SpeakButton } from './ui.jsx';

/**
 * Human fallback (mock). Shown on low-confidence answers.
 * Production: route to a volunteer "Sahayak" pool / state helpline via IVR or WhatsApp.
 */
export default function HumanHelperModal({ open, onClose, helpline = '181', question = '' }) {
  const [stage, setStage] = useState('choose');
  useEffect(() => { if (open) setStage('choose'); }, [open]);
  useEffect(() => {
    if (stage !== 'connecting') return;
    const t = setTimeout(() => setStage('connected'), 2200);
    return () => clearTimeout(t);
  }, [stage]);

  const msg = 'आपकी बात एक सहायक दीदी तक पहुँचा दी गई है। वे 10 मिनट में आपको फ़ोन करेंगी।';
  return (
    <Modal open={open} onClose={onClose} title={<Bi hi="🙋 इंसान से बात करें" en="Talk to a human helper" />}>
      {stage === 'choose' && (
        <div className="space-y-3">
          <p className="text-stone-600 dark:text-stone-300">मुझे इसकी पक्की जानकारी नहीं है, इसलिए किसी इंसान से बात करना बेहतर होगा। · I'm not sure, so a human can help better.</p>
          <a href={`tel:${helpline}`} className="btn-green w-full text-lg">📞 हेल्पलाइन {helpline} पर फ़ोन करें</a>
          <button className="btn-primary w-full text-lg" onClick={() => setStage('connecting')}>🧑‍🤝‍🧑 सहायक दीदी से कॉल-बैक · Volunteer call-back</button>
          <p className="text-xs text-stone-500">प्रोटोटाइप: कॉल-बैक नकली (mock) है। · Prototype: the call-back is simulated.</p>
        </div>
      )}
      {stage === 'connecting' && (
        <div className="py-8 text-center">
          <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-saffron-200 border-t-saffron-500" />
          <p className="mt-4 font-semibold">सहायक से जोड़ रहे हैं… · Connecting to a volunteer…</p>
        </div>
      )}
      {stage === 'connected' && (
        <div className="space-y-3 text-center">
          <div className="text-6xl">✅</div>
          <p className="text-lg font-semibold">{msg}</p>
          <p className="text-sm text-stone-500">Your question was shared with volunteer “Rekha Didi, Vidisha”. Expected call-back: ~10 min. Ticket #BY-{String(Date.now()).slice(-5)}</p>
          {question && <p className="rounded-xl bg-stone-100 p-2 text-sm dark:bg-stone-800">“{question}”</p>}
          <SpeakButton text={msg} />
        </div>
      )}
    </Modal>
  );
}
