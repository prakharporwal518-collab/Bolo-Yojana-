/**
 * Simplification (not just translation): rewrites complex "sarkari" language
 * into short, 5th-grade-level sentences.
 *
 * Prototype: a rule-based rewriter (word substitutions + sentence splitting).
 * Production: the backend /simplify endpoint uses an LLM constrained to keep
 * every fact, number and date unchanged; this module is the offline fallback.
 */

// Complex official Hindi → everyday Hindi.
const HI_RULES = [
  ['के अंतर्गत', 'में'], ['के अन्तर्गत', 'में'], ['अंतर्गत', 'में'], ['हेतु', 'के लिए'], ['एवं', 'और'], ['तथा', 'और'],
  ['आवेदक', 'अर्ज़ी देने वाला'], ['आवेदिका', 'अर्ज़ी देने वाली'], ['आवेदन पत्र', 'फ़ॉर्म'], ['आवेदन', 'अर्ज़ी'],
  ['लाभार्थी', 'फ़ायदा पाने वाला'], ['लाभार्थियों', 'फ़ायदा पाने वालों'], ['पात्रता', 'कौन ले सकता है'], ['पात्र', 'हक़दार'],
  ['अनिवार्य', 'ज़रूरी'], ['आवश्यक', 'ज़रूरी'], ['दिनांक', 'तारीख'], ['तिथि', 'तारीख'], ['अवधि', 'समय'],
  ['प्रस्तुत करें', 'जमा करें'], ['प्रस्तुत', 'जमा'], ['संलग्न करें', 'साथ में लगाएँ'], ['संलग्न', 'साथ में लगा'],
  ['सत्यापन', 'जाँच'], ['निरस्त', 'रद्द'], ['अस्वीकृत', 'नामंज़ूर'], ['स्वीकृत', 'मंज़ूर'], ['अधिसूचना', 'सूचना'],
  ['प्रदान की जाएगी', 'दी जाएगी'], ['प्रदान किया जाएगा', 'दिया जाएगा'], ['प्रदान', 'देना'], ['उपलब्ध', 'मौजूद'],
  ['सुनिश्चित करें', 'पक्का करें'], ['सूचित किया जाता है', 'बताया जाता है'], ['एतद् द्वारा', ''], ['एतद्द्वारा', ''],
  ['कार्यालय', 'दफ़्तर'], ['प्रपत्र', 'फ़ॉर्म'], ['दस्तावेज़', 'कागज़'], ['दस्तावेज', 'कागज़'], ['अभिलेख', 'रिकॉर्ड'],
  ['भुगतान', 'पैसे देना'], ['राशि', 'पैसा'], ['वार्षिक', 'साल की'], ['मासिक', 'महीने की'], ['आय', 'कमाई'],
  ['निवासी', 'रहने वाले'], ['शासकीय', 'सरकारी'], ['अशासकीय', 'प्राइवेट'], ['उक्त', 'यह'], ['अधोहस्ताक्षरकर्ता', 'साइन करने वाले अफ़सर'],
  ['समयावधि', 'समय'], ['अंतिम तिथि', 'आख़िरी तारीख'], ['अंतिम', 'आख़िरी'], ['विलंब', 'देरी'], ['उपस्थित होना', 'आना'],
  ['उपस्थित', 'हाज़िर'], ['अनुपालन', 'पालन'], ['कृपया', ''], ['अवगत', 'जानकारी में'],
];

// Whole-word matching (JS \b is ASCII-only, so use Unicode letter lookarounds).
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const HI_RULES_RE = HI_RULES.map(([from, to]) => [new RegExp(`(?<![\\p{L}\\p{M}])${esc(from)}(?![\\p{L}\\p{M}])`, 'gu'), to]);

// Bureaucratic English → plain English.
const EN_RULES = [
  [/\bherewith\b/gi, ''], [/\bhereby\b/gi, ''], [/\bin accordance with\b/gi, 'as per'], [/\bpursuant to\b/gi, 'under'],
  [/\bbeneficiar(y|ies)\b/gi, 'people who get the benefit'], [/\beligible\b/gi, 'allowed'], [/\bmandatory\b/gi, 'must'],
  [/\bsubmit\b/gi, 'give'], [/\bfurnish\b/gi, 'give'], [/\bapplicant\b/gi, 'person applying'], [/\bdomiciled\b/gi, 'living'],
  [/\bprior to\b/gi, 'before'], [/\bsubsequent(ly)?\b/gi, 'later'], [/\bcommence\b/gi, 'start'], [/\bterminate[d]?\b/gi, 'stopped'],
  [/\butili[sz]e\b/gi, 'use'], [/\bverification\b/gi, 'checking'], [/\bnotwithstanding\b/gi, 'even with'], [/\bsubject to\b/gi, 'only if'],
  [/\bper annum\b/gi, 'a year'], [/\bdisbursed?\b/gi, 'paid'], [/\bthe undersigned\b/gi, 'this office'],
];

/** Split long sentences into short ones (max ~14 words). */
function shortSentences(text, lang) {
  const sentences = text.split(/(?<=[.!?।])\s+/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const s of sentences) {
    const words = s.split(/\s+/);
    if (words.length <= 14) { out.push(s); continue; }
    // Break at commas / conjunctions.
    const pieces = s.split(lang === 'en' ? /,\s+|\s+(?:and|but|which|where)\s+/ : /,\s+|\s+(?:और|लेकिन|तथा|जिसमें|जो कि)\s+/);
    for (const p of pieces) {
      const t = p.trim().replace(/[,;]$/, '');
      if (!t) continue;
      const end = /[.!?।]$/.test(t) ? '' : lang === 'en' ? '.' : '।';
      out.push(t.charAt(0).toUpperCase() + t.slice(1) + end);
    }
  }
  return out;
}

/**
 * @param {string} text  official text
 * @param {'hi'|'en'} lang  script of the input
 * @returns {{ simple: string, sentences: string[], changes: number }}
 */
export function simplifyText(text = '', lang) {
  let t = String(text).replace(/\s+/g, ' ').trim();
  const isHi = lang ? lang !== 'en' : /[ऀ-ॿ]/.test(t);
  let changes = 0;
  if (isHi) {
    for (const [re, to] of HI_RULES_RE) {
      if (re.test(t)) { re.lastIndex = 0; t = t.replace(re, to); changes++; }
    }
    t = t.replace(/रु\.\s?/g, '₹').replace(/\/-/g, '');
  } else {
    for (const [re, to] of EN_RULES) {
      if (re.test(t)) { t = t.replace(re, to); changes++; }
    }
    t = t.replace(/Rs\.?\s?/g, '₹').replace(/\/-/g, '');
  }
  t = t.replace(/\s{2,}/g, ' ').replace(/\s+([,.।])/g, '$1');
  const sentences = shortSentences(t, isHi ? 'hi' : 'en');
  return { simple: sentences.join(' '), sentences, changes };
}
