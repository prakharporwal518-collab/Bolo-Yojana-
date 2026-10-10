/**
 * Translation adapter.
 *
 *   'offline' → phrasebook + dictionary translator for Hindi ⇄ English (works with no internet;
 *               tuned for the citizen ⇄ official conversations used in the demo).
 *   'backend' → POST {API}/translate → IndicTrans2 (AI4Bharat) / Bhashini NMT / LLM.
 *
 * Domain terms (Aadhaar, e-KYC, Samagra ID, Patwari…) are protected with placeholders
 * so they are never mistranslated.
 */
import { timeoutSignal } from '../net.js';
import { config } from '../../config.js';
import { protectTerms } from '../nlp/glossary.js';
import { normalizeDialect } from '../nlp/dialect.js';

// Whole-sentence phrasebook (Hindi ⇄ English). Keys are compared after punctuation stripping.
const PHRASES = [
  ['नमस्ते साहब', 'Hello sir'],
  ['नमस्ते', 'Hello'],
  ['नमस्ते, मैं आपकी क्या मदद कर सकता हूँ?', 'Hello, how can I help you?'],
  ['मैं आपकी क्या मदद कर सकता हूँ?', 'How can I help you?'],
  ['मेरा नाम सुनीता है', 'My name is Sunita'],
  ['मैं विदिशा के पास के गाँव में रहती हूँ', 'I live in a village near Vidisha'],
  ['मुझे लाड़ली बहना योजना का पैसा नहीं मिल रहा है', 'I am not receiving the Ladli Behna Yojana money'],
  ['मेरा पैसा दो महीने से नहीं आया', 'My money has not come for two months'],
  ['मेरा पैसा नहीं आया', 'My money has not come'],
  ['आपकी समग्र आईडी क्या है?', 'What is your Samagra ID?'],
  ['What is your Samagra ID?', 'आपकी समग्र आईडी क्या है?'],
  ['Please tell me your Samagra ID', 'कृपया अपनी समग्र आईडी बताइए'],
  ['मेरी समग्र आईडी यह है', 'This is my Samagra ID'],
  ['Your e-KYC is pending', 'आपका e-KYC बाकी है'],
  ['Your Samagra e-KYC is pending', 'आपकी समग्र का e-KYC बाकी है'],
  ['Please complete e-KYC at the CSC', 'कृपया CSC जाकर e-KYC पूरा करवाइए'],
  ['Your bank account is not linked with Aadhaar', 'आपका बैंक खाता आधार से जुड़ा नहीं है'],
  ['Please enable DBT in your bank', 'कृपया अपने बैंक में DBT चालू करवाइए'],
  ['After that, the money will come from next month', 'उसके बाद अगले महीने से पैसा आ जाएगा'],
  ['The money will come from next month', 'अगले महीने से पैसा आ जाएगा'],
  ['ई-केवाईसी कहाँ होगा?', 'Where will the e-KYC be done?'],
  ['e-KYC कहाँ होगा?', 'Where will the e-KYC be done?'],
  ['At the CSC or the Gram Panchayat office', 'CSC या ग्राम पंचायत के दफ़्तर में'],
  ['कौन से कागज़ लाने हैं?', 'Which documents should I bring?'],
  ['Bring Aadhaar, Samagra ID and bank passbook', 'आधार, समग्र आईडी और बैंक पासबुक लेकर आइए'],
  ['कितने दिन लगेंगे?', 'How many days will it take?'],
  ['It will take about 7 days', 'लगभग 7 दिन लगेंगे'],
  ['धन्यवाद साहब', 'Thank you sir'],
  ['धन्यवाद', 'Thank you'],
  ['ठीक है', 'Okay'],
  ['Thank you', 'धन्यवाद'],
  ['You are welcome', 'कोई बात नहीं'],
  ['What is your name?', 'आपका नाम क्या है?'],
  ['Which village are you from?', 'आप किस गाँव से हैं?'],
  ['How can I help you?', 'मैं आपकी क्या मदद कर सकता हूँ?'],
  ['Hello, how can I help you?', 'नमस्ते, मैं आपकी क्या मदद कर सकता हूँ?'],
  ['Please wait', 'कृपया रुकिए'],
  ['Please show your Aadhaar card', 'कृपया अपना आधार कार्ड दिखाइए'],
  ['Your application is approved', 'आपका आवेदन मंज़ूर हो गया है'],
  ['Your application is pending', 'आपका आवेदन अभी रुका हुआ है'],
  ['Your name is in the list', 'आपका नाम सूची में है'],
];

// Word-level fallback dictionary (Hindi → English). Reverse map built automatically.
const WORDS = {
  मेरा: 'my', मेरी: 'my', मेरे: 'my', मुझे: 'me', मैं: 'I', आप: 'you', आपका: 'your', आपकी: 'your', आपके: 'your', हम: 'we', हमारा: 'our',
  पैसा: 'money', पैसे: 'money', नहीं: 'not', हाँ: 'yes', है: 'is', हैं: 'are', था: 'was', क्या: 'what', कब: 'when', कहाँ: 'where', कैसे: 'how',
  कौन: 'who', कितना: 'how much', कितने: 'how many', आया: 'came', आएगा: 'will come', मिला: 'received', मिलेगा: 'will get', योजना: 'scheme',
  किसान: 'farmer', ज़मीन: 'land', जमीन: 'land', बैंक: 'bank', खाता: 'account', गाँव: 'village', महीने: 'months', महीना: 'month', साल: 'year',
  दो: 'two', तीन: 'three', नाम: 'name', कागज़: 'documents', कागज: 'documents', अस्पताल: 'hospital', इलाज: 'treatment', कार्ड: 'card',
  फ़ॉर्म: 'form', फॉर्म: 'form', मदद: 'help', करो: 'do', करें: 'do', करना: 'to do', चाहिए: 'need', बताइए: 'please tell', दिन: 'days',
  अगले: 'next', से: 'from', में: 'in', को: 'to', का: 'of', की: 'of', के: 'of', और: 'and', या: 'or', पति: 'husband', बहन: 'sister',
  बच्चे: 'children', परिवार: 'family', उम्र: 'age', सरकारी: 'government', नौकरी: 'job', कमाई: 'income', पास: 'near', रहती: 'live', रहता: 'live',
  हूँ: 'am', गया: 'went', रहा: '-ing', रही: '-ing', अभी: 'now', बाद: 'after', पहले: 'before', दफ़्तर: 'office', जाना: 'go', आना: 'come',
  लाड़ली: 'Ladli', बहना: 'Behna', बंद: 'stopped', किस्त: 'instalment', सूची: 'list', मंज़ूर: 'approved', रुका: 'stuck', जल्दी: 'soon',
};
const EN_WORDS = Object.fromEntries(Object.entries(WORDS).filter(([, en]) => !en.startsWith('-')).map(([hi, en]) => [en.toLowerCase(), hi]));
Object.assign(EN_WORDS, { the: '', a: '', an: '', please: 'कृपया', is: 'है', are: 'हैं', will: '', be: '', has: '', have: '', come: 'आएगा', pending: 'बाकी', complete: 'पूरा', linked: 'जुड़ा', bring: 'लाइए', application: 'आवेदन', status: 'स्थिति', check: 'जाँच', tomorrow: 'कल', today: 'आज', go: 'जाइए', yes: 'हाँ', no: 'नहीं', okay: 'ठीक है', sir: 'साहब', madam: 'मैडम' });

const strip = (s) => s.toLowerCase().replace(/[\s,.!?।"'“”]+/g, ' ').trim();
const phraseIndex = new Map();
for (const [a, b] of PHRASES) {
  const aIsHi = /[ऀ-ॿ]/.test(a);
  phraseIndex.set(`${aIsHi ? 'hi' : 'en'}:${strip(a)}`, b);
}

function offlineTranslate(text, source, target) {
  if (source === target) return text;
  const src = source === 'hl' ? 'hi' : source;
  // Normalise dialect first (Malwi → Hindi) so the phrasebook can match.
  const norm = src === 'hi' ? normalizeDialect(text).normalized : text;
  const exact = phraseIndex.get(`${src}:${strip(norm)}`);
  if (exact) return exact;

  // Sentence-by-sentence: phrasebook, else word-by-word with protected glossary terms.
  return norm
    .split(/(?<=[.!?।])\s+/)
    .map((sentence) => {
      const hit = phraseIndex.get(`${src}:${strip(sentence)}`);
      if (hit) return /[.!?।]$/.test(hit) ? hit : `${hit}${target === 'en' ? '.' : '।'}`;
      const { masked, restore } = protectTerms(sentence);
      const dict = src === 'hi' ? WORDS : EN_WORDS;
      const out = masked
        .split(/(\s+)/)
        .map((tok) => {
          const core = tok.replace(/[,.!?।]/g, '');
          const key = src === 'en' ? core.toLowerCase() : core;
          return key in dict ? tok.replace(core, dict[key]) : tok;
        })
        .join('')
        .replace(/\s{2,}/g, ' ')
        .trim();
      return restore(out);
    })
    .join(' ');
}

/**
 * @param {string} text
 * @param {'hi'|'hl'|'en'} source
 * @param {'hi'|'en'} target
 * @returns {Promise<{ text: string, provider: string }>}
 */
export async function translate(text, source, target) {
  if (!text?.trim()) return { text: '', provider: 'none' };
  if (config.translateProvider === 'backend' && config.apiUrl) {
    try {
      const res = await fetch(`${config.apiUrl}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, source, target }),
        signal: timeoutSignal(6000),
      });
      if (res.ok) {
        const j = await res.json();
        if (j.text) return { text: j.text, provider: j.provider || 'backend' };
      }
    } catch (e) {
      console.warn('[translate] backend failed, using offline phrasebook', e);
    }
  }
  return { text: offlineTranslate(text, source, target), provider: 'offline-phrasebook' };
}

export { offlineTranslate };
