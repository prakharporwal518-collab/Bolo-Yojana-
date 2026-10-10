/**
 * Automatic language detection (no manual selection needed).
 *
 * Returns one of:
 *   'hi'       – Hindi in Devanagari
 *   'hl'       – Hinglish / code-mixed Hindi typed in Roman script ("mera paisa nahi aaya")
 *   'en'       – English
 *   'bn' | 'ta' | 'te' | 'gu' | 'pa' | 'kn' | 'ml' | 'or' – other Indian scripts
 *
 * Prototype approach: Unicode-script ratios + lexical markers. Production: swap
 * for an IndicLID / Bhashini language-ID model via the same function signature.
 */

const SCRIPTS = [
  { code: 'hi', re: /[ऀ-ॿ]/g },
  { code: 'bn', re: /[ঀ-৿]/g },
  { code: 'pa', re: /[਀-੿]/g },
  { code: 'gu', re: /[઀-૿]/g },
  { code: 'or', re: /[଀-୿]/g },
  { code: 'ta', re: /[஀-௿]/g },
  { code: 'te', re: /[ఀ-౿]/g },
  { code: 'kn', re: /[ಀ-೿]/g },
  { code: 'ml', re: /[ഀ-ൿ]/g },
];

// Frequent Roman-script Hindi words (incl. dialect forms) that signal Hinglish.
const HINGLISH_MARKERS = new Set(
  ('mera meri mere mujhe mujhko hum hamara hamari aap aapka aapki tum tera kya kyu kyun kaise kaisa kab kahan kaha kitna kitni kitne ' +
    'nahi nahin nai na haan han ji hai hain tha thi the ho hoga hogi raha rahi rahe karu karun karo karna karein kar ' +
    'paisa paise wala wali wale aaya aayi aaye mila mili milega milegi chahiye batao bataiye bolo sakta sakti ' +
    'kisan kisaan yojana sarkar sarkari zameen jameen gaon ghar parivar bhai behen behna bahna didi kaun kis ko ka ki ke se mein me par ' +
    'ilaj ilaaj aspatal bimari kagaz kagzat dastavez umar saal mahina mahine kamai aamdani ' +
    'mharo mhari tharo koni hamao bilat ghano aur bhi toh to abhi agar lekin').split(' ')
);

const ENGLISH_MARKERS = new Set(
  ('the is are was were am what which who how when where why do does did can could should would will my your our their ' +
    'i you he she it we they this that these those please help scheme eligible eligibility documents apply application ' +
    'money received not get of for to in on with and or about status hospital farmer card').split(' ')
);

export const LANGUAGE_NAMES = {
  hi: { hi: 'हिंदी', en: 'Hindi' },
  hl: { hi: 'हिंग्लिश', en: 'Hinglish' },
  en: { hi: 'अंग्रेज़ी', en: 'English' },
  bn: { hi: 'बांग्ला', en: 'Bengali' },
  pa: { hi: 'पंजाबी', en: 'Punjabi' },
  gu: { hi: 'गुजराती', en: 'Gujarati' },
  or: { hi: 'ओड़िया', en: 'Odia' },
  ta: { hi: 'तमिल', en: 'Tamil' },
  te: { hi: 'तेलुगु', en: 'Telugu' },
  kn: { hi: 'कन्नड़', en: 'Kannada' },
  ml: { hi: 'मलयालम', en: 'Malayalam' },
};

/** Languages we can answer in directly; others are answered in Hindi (Bhashini adapter would translate). */
export const RESPONSE_LANGS = ['hi', 'hl', 'en'];

/**
 * @param {string} text
 * @returns {{ lang: string, confidence: number, scores: object }}
 */
export function detectLanguage(text = '') {
  const clean = String(text).trim();
  if (!clean) return { lang: 'hi', confidence: 0, scores: {} };

  const letters = clean.replace(/[\s\d\p{P}\p{S}]/gu, '').length || 1;
  const scriptCounts = {};
  for (const { code, re } of SCRIPTS) scriptCounts[code] = (clean.match(re) || []).length;
  const latin = (clean.match(/[A-Za-z]/g) || []).length;

  // 1) Non-Latin Indian script dominates → that language.
  const [topScript, topCount] = Object.entries(scriptCounts).sort((a, b) => b[1] - a[1])[0];
  if (topCount / letters > 0.4) {
    return { lang: topScript, confidence: Math.min(1, topCount / letters + 0.1), scores: { ...scriptCounts, latin } };
  }

  // 2) Latin script → Hinglish vs English using lexical markers.
  const words = clean.toLowerCase().match(/[a-z]+/g) || [];
  let hl = 0;
  let en = 0;
  for (const w of words) {
    if (HINGLISH_MARKERS.has(w)) hl++;
    if (ENGLISH_MARKERS.has(w)) en++;
  }
  const total = words.length || 1;
  if (hl === 0 && en === 0) {
    return { lang: latin > 0 ? 'en' : 'hi', confidence: 0.4, scores: { hl, en } };
  }
  const lang = hl >= en * 0.8 ? 'hl' : 'en';
  const confidence = Math.min(1, 0.5 + Math.abs(hl - en) / total);
  return { lang, confidence: Math.round(confidence * 100) / 100, scores: { hl, en } };
}
