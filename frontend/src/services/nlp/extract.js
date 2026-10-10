/**
 * Key-fact extraction from a government notice (works on OCR text in Hindi or English):
 * deadline / event dates, times, helpline numbers, documents to carry, where to go,
 * what action is required, consequences, and which scheme it concerns.
 * The result is turned into a short, simple explanation in the user's language.
 */
import { normalizeDigits } from '../format.js';
import { retrieve } from '../rag.js';

const has = (t, re) => re.test(t);
const DOCS = [
  { re: /aadhaa?r|आधार/i, hi: 'आधार कार्ड', hl: 'Aadhaar card', en: 'Aadhaar card', icon: '🪪' },
  { re: /samagra|समग्र/i, hi: 'समग्र आईडी', hl: 'Samagra ID', en: 'Samagra ID', icon: '🆔' },
  { re: /ration|राशन/i, hi: 'राशन कार्ड', hl: 'Ration card', en: 'Ration card', icon: '🍚' },
  { re: /passbook|पासबुक|bank account|बैंक खात/i, hi: 'बैंक पासबुक', hl: 'Bank passbook', en: 'Bank passbook', icon: '🏦' },
  { re: /khasra|खसरा|khatauni|खतौनी|land record|भू-?अभिलेख/i, hi: 'ज़मीन के कागज़ (खसरा)', hl: 'Zameen ke kagaz (Khasra)', en: 'Land records (Khasra)', icon: '📜' },
  { re: /photo|फ़ोटो|फोटो/i, hi: 'फ़ोटो', hl: 'Photo', en: 'Photo', icon: '📷' },
];
const PLACES = [
  { re: /\bCSC\b|जन सेवा केंद्र|common service/i, hi: 'नज़दीकी CSC (जन सेवा केंद्र)', hl: 'nazdeeki CSC', en: 'the nearest CSC' },
  { re: /panchayat bhawan|पंचायत भवन/i, hi: 'पंचायत भवन', hl: 'Panchayat Bhawan', en: 'the Panchayat Bhawan' },
  { re: /gram panchayat|ग्राम पंचायत/i, hi: 'ग्राम पंचायत दफ़्तर', hl: 'Gram Panchayat office', en: 'the Gram Panchayat office' },
  { re: /tehsil|तहसील/i, hi: 'तहसील दफ़्तर', hl: 'Tehsil office', en: 'the Tehsil office' },
  { re: /anganwadi|आंगनवाड़ी/i, hi: 'आंगनवाड़ी केंद्र', hl: 'Anganwadi kendra', en: 'the Anganwadi centre' },
];
const ACTIONS = [
  { re: /e-?kyc|ई-?केवाईसी/i, hi: 'e-KYC करवाना है', hl: 'e-KYC karwana hai', en: 'complete e-KYC' },
  { re: /land seeding|भूमि सीडिंग/i, hi: 'ज़मीन की सीडिंग करवानी है', hl: 'land seeding karwani hai', en: 'complete land seeding' },
  { re: /camp|शिविर|कैंप/i, hi: 'कैंप में जाना है', hl: 'camp mein jaana hai', en: 'attend the camp' },
  { re: /vay vandana|वय वंदना/i, hi: '70+ बुज़ुर्गों का वय वंदना कार्ड भी बनेगा', hl: '70+ buzurgon ka Vay Vandana card bhi banega', en: 'seniors 70+ can get the Vay Vandana card' },
];
const CONSEQUENCE = /रोका जा सकता|रोक दी|निरस्त|withheld|stopped|cancel|reject/i;

export function extractFacts(rawText = '') {
  const text = normalizeDigits(rawText).replace(/\s+/g, ' ');
  const dates = [...text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g)].map((m) => ({ str: m[0], idx: m.index, d: new Date(+m[3], +m[2] - 1, +m[1]) }));
  // Deadline = date followed by "तक" / preceded by "by/before/until"; else the latest date that isn't the issue date.
  const deadline = dates.find((x) => /^\s*तक/.test(text.slice(x.idx + x.str.length, x.idx + x.str.length + 6)) || /(by|before|until|last date)\s*$/i.test(text.slice(Math.max(0, x.idx - 14), x.idx)));
  const onDate = dates.find((x) => /\bon\s*$/i.test(text.slice(Math.max(0, x.idx - 5), x.idx)) || /^\s*को/.test(text.slice(x.idx + x.str.length, x.idx + x.str.length + 4)));
  const times = [...text.matchAll(/\b\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?/g)].map((m) => m[0]);
  const helpline = (text.match(/(?:helpline|हेल्पलाइन)\s*[:：-]?\s*([\d-]{3,})/i) || [])[1] || null;
  const r = retrieve(text);
  return {
    scheme: r.scheme,
    deadline: deadline?.str || null,
    eventDate: onDate?.str || null,
    times,
    helpline,
    documents: DOCS.filter((d) => has(text, d.re)),
    places: PLACES.filter((p) => has(text, p.re)),
    actions: ACTIONS.filter((a) => has(text, a.re)),
    consequence: CONSEQUENCE.test(text),
  };
}

/** Build a short, simple explanation (5th-grade level) in 'hi' | 'hl' | 'en'. */
export function explainFacts(f, lang = 'hi') {
  const P = (o) => o[lang] ?? o.hi;
  const lines = [];
  const name = f.scheme ? P(f.scheme.name) : null;
  lines.push(P({ hi: name ? `यह सूचना "${name}" के बारे में है।` : 'यह एक सरकारी सूचना है।', hl: name ? `Yeh soochna "${name}" ke baare mein hai.` : 'Yeh ek sarkari soochna hai.', en: name ? `This notice is about "${name}".` : 'This is a government notice.' }));
  if (f.actions.length) lines.push(P({ hi: 'आपको क्या करना है: ', hl: 'Aapko kya karna hai: ', en: 'What you must do: ' }) + f.actions.map(P).join(', ') + (lang === 'en' ? '.' : '।'));
  if (f.deadline) lines.push(P({ hi: `⏰ आख़िरी तारीख: ${f.deadline} — इससे पहले करवा लें।`, hl: `⏰ Aakhri tarikh: ${f.deadline} — isse pehle karwa lein.`, en: `⏰ Last date: ${f.deadline} — finish before this.` }));
  if (f.eventDate) lines.push(P({ hi: `📅 तारीख: ${f.eventDate}${f.times.length ? `, समय ${f.times.join(' से ')}` : ''}`, hl: `📅 Tarikh: ${f.eventDate}${f.times.length ? `, samay ${f.times.join(' se ')}` : ''}`, en: `📅 Date: ${f.eventDate}${f.times.length ? `, time ${f.times.join(' to ')}` : ''}` }));
  if (f.places.length) lines.push(P({ hi: '📍 कहाँ जाएँ: ', hl: '📍 Kahan jaayein: ', en: '📍 Where to go: ' }) + f.places.map(P).join(P({ hi: ' या ', hl: ' ya ', en: ' or ' })));
  if (f.documents.length) lines.push(P({ hi: '🎒 साथ ले जाएँ: ', hl: '🎒 Saath le jaayein: ', en: '🎒 Carry: ' }) + f.documents.map(P).join(', '));
  if (f.consequence) lines.push(P({ hi: '⚠️ ध्यान दें: समय पर नहीं किया तो पैसा (किस्त) रुक सकता है।', hl: '⚠️ Dhyan dein: samay par nahi kiya toh paisa (kist) ruk sakta hai.', en: '⚠️ Note: if not done on time, your payment may be stopped.' }));
  if (f.helpline) lines.push(P({ hi: `📞 मदद के लिए: ${f.helpline}`, hl: `📞 Madad ke liye: ${f.helpline}`, en: `📞 Help: ${f.helpline}` }));
  return lines;
}
