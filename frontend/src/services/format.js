/**
 * Cultural localisation helpers: Indian number system (lakh / crore),
 * ₹ formatting, Indian dates, and parsing spoken amounts like "डेढ़ लाख".
 */

const DEVANAGARI_DIGITS = '०१२३४५६७८९';

/** Convert Devanagari digits (१२३) to ASCII digits (123). */
export function normalizeDigits(text = '') {
  return String(text).replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
}

/** ₹6,000 / ₹1,50,000 — Indian digit grouping. */
export function formatINR(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '₹—';
  return '₹' + num.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

const FRACTION_WORDS = {
  hi: { 1.5: 'डेढ़', 2.5: 'ढाई', 1.25: 'सवा', 1.75: 'पौने दो' },
  hl: { 1.5: 'dedh', 2.5: 'dhai', 1.25: 'sava', 1.75: 'paune do' },
};
const SMALL_HI = ['', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ', 'दस'];
const SMALL_HL = ['', 'ek', 'do', 'teen', 'char', 'paanch', 'chhah', 'saat', 'aath', 'nau', 'das'];

/**
 * Speak-friendly amount: 150000 → "डेढ़ लाख" (hi) / "dedh lakh" (hl) / "1.5 lakh" (en).
 * Falls back to ₹ formatting for amounts below one lakh.
 */
export function amountInWords(n, lang = 'hi') {
  const num = Number(n);
  if (!Number.isFinite(num)) return '';
  const unit = num >= 1e7 ? 1e7 : num >= 1e5 ? 1e5 : 0;
  if (!unit) return formatINR(num);
  const value = Math.round((num / unit) * 100) / 100;
  const unitWord = { hi: unit === 1e7 ? 'करोड़' : 'लाख', hl: unit === 1e7 ? 'crore' : 'lakh', en: unit === 1e7 ? 'crore' : 'lakh' }[lang] || 'lakh';
  if (lang !== 'en') {
    const frac = FRACTION_WORDS[lang]?.[value];
    if (frac) return `${frac} ${unitWord}`;
    const small = (lang === 'hi' ? SMALL_HI : SMALL_HL)[value];
    if (Number.isInteger(value) && small) return `${small} ${unitWord}`;
  }
  return `${value.toLocaleString('en-IN')} ${unitWord}`;
}

/** Indian date: "10 अक्टूबर 2026" (hi) or "10 October 2026" (en) or 10/10/2026 (short). */
export function formatDate(date, lang = 'hi', short = false) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  if (short) {
    const p = (x) => String(x).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  }
  try {
    return d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return formatDate(d, lang, true);
  }
}

// Spoken Hindi number words → value (covers the ranges users typically say: ages, counts).
const NUMBER_WORDS = {
  ek: 1, एक: 1, do: 2, दो: 2, teen: 3, तीन: 3, char: 4, chaar: 4, चार: 4, paanch: 5, panch: 5, पाँच: 5, पांच: 5,
  chhah: 6, chhe: 6, छह: 6, छः: 6, saat: 7, सात: 7, aath: 8, आठ: 8, nau: 9, नौ: 9, das: 10, दस: 10,
  gyarah: 11, ग्यारह: 11, barah: 12, बारह: 12, terah: 13, तेरह: 13, chaudah: 14, चौदह: 14, pandrah: 15, पंद्रह: 15,
  solah: 16, सोलह: 16, satrah: 17, सत्रह: 17, atharah: 18, अठारह: 18, unnees: 19, उन्नीस: 19, bees: 20, बीस: 20,
  ikkees: 21, इक्कीस: 21, baees: 22, बाईस: 22, teis: 23, तेईस: 23, chaubees: 24, चौबीस: 24, pachchees: 25, पच्चीस: 25,
  chhabbees: 26, छब्बीस: 26, sattaees: 27, सत्ताईस: 27, atthaees: 28, अट्ठाईस: 28, untees: 29, उनतीस: 29, tees: 30, तीस: 30,
  ikattees: 31, इकतीस: 31, battees: 32, बत्तीस: 32, taintees: 33, तैंतीस: 33, chauntees: 34, चौंतीस: 34, paintees: 35, पैंतीस: 35,
  chhattees: 36, छत्तीस: 36, saintees: 37, सैंतीस: 37, adtees: 38, अड़तीस: 38, untalis: 39, उनतालीस: 39, chalis: 40, chaalis: 40, चालीस: 40,
  paintalis: 45, पैंतालीस: 45, pachas: 50, pachaas: 50, पचास: 50, pachpan: 55, पचपन: 55, saath: 60, साठ: 60, painsath: 65, पैंसठ: 65,
  sattar: 70, सत्तर: 70, pachattar: 75, पचहत्तर: 75, assi: 80, अस्सी: 80, nabbe: 90, नब्बे: 90, sau: 100, सौ: 100,
};
const MULTIPLIERS = { lakh: 1e5, lac: 1e5, लाख: 1e5, crore: 1e7, करोड़: 1e7, hazaar: 1e3, hazar: 1e3, thousand: 1e3, हज़ार: 1e3, हजार: 1e3 };
const FRACTIONS = { dedh: 1.5, डेढ़: 1.5, डेढ: 1.5, dhai: 2.5, dhaai: 2.5, ढाई: 2.5, sava: 1.25, सवा: 1.25, adha: 0.5, आधा: 0.5 };

/**
 * Parse a spoken / typed amount into a number.
 *   "1,20,000" → 120000, "डेढ़ लाख" → 150000, "do lakh" → 200000, "50 hazaar" → 50000
 * Returns null when nothing numeric is found.
 */
export function parseAmount(input) {
  if (input == null) return null;
  const text = normalizeDigits(String(input)).toLowerCase().replace(/₹|rs\.?|rupaye|rupees|रुपये|रुपए/g, ' ');
  const tokens = text.replace(/,(?=\d)/g, '').split(/[\s\-–]+/).filter(Boolean);
  let base = null;
  let total = 0;
  let found = false;
  let paune = false;
  for (const raw of tokens) {
    const t = raw.replace(/[^\p{L}\p{M}\d.]/gu, '');
    if (!t) continue;
    if (t === 'paune' || t === 'पौने') { paune = true; continue; }
    if (/^\d+(\.\d+)?$/.test(t)) { base = parseFloat(t); found = true; continue; }
    if (t in FRACTIONS) { base = FRACTIONS[t]; found = true; continue; }
    if (t in NUMBER_WORDS) { base = NUMBER_WORDS[t]; found = true; continue; }
    if (t in MULTIPLIERS) {
      let b = base ?? 1;
      if (paune) { b -= 0.25; paune = false; }
      total += b * MULTIPLIERS[t];
      base = null;
      found = true;
    }
  }
  if (!found) return null;
  if (base != null) total += base;
  return Math.round(total);
}

/** Parse a plain number (age, count). "34", "चौंतीस", "34 saal" → 34 */
export function parseNumber(input) {
  if (input == null) return null;
  const text = normalizeDigits(String(input));
  const m = text.match(/\d+(\.\d+)?/);
  if (m) return parseFloat(m[0]);
  const v = parseAmount(text);
  return v == null ? null : v;
}
