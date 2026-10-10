/**
 * Domain glossary: terms like Aadhaar, e-KYC, Patwari, Samagra ID must never be
 * mistranslated. Used for (a) protecting terms during translation and
 * (b) splitting UI text into segments so terms get a tap-to-explain tooltip.
 */
import data from '../../data/domainGlossary.json' with { type: 'json' };

export const TERMS = data.terms;

// Longest variants first so "Gram Panchayat" wins over "Panchayat", "e-KYC" over "KYC".
const VARIANTS = TERMS.flatMap((t) => t.variants.map((v) => ({ v, term: t }))).sort((a, b) => b.v.length - a.v.length);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Boundaries that work for both Latin and Devanagari (JS \b is ASCII-only).
const TERM_RE = new RegExp(`(?<![\\p{L}\\p{M}-])(${VARIANTS.map((x) => escape(x.v)).join('|')})(?![\\p{L}\\p{M}])`, 'gu');

const lookup = new Map(VARIANTS.map((x) => [x.v.toLowerCase(), x.term]));

/** Split text into [{text, term?}] segments for rendering tooltips. */
export function segmentTerms(text = '') {
  const out = [];
  let last = 0;
  for (const m of String(text).matchAll(TERM_RE)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], term: lookup.get(m[0].toLowerCase()) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Replace protected terms with placeholder tokens before machine translation. */
export function protectTerms(text = '') {
  const kept = [];
  const masked = String(text).replace(TERM_RE, (m) => {
    kept.push(m);
    return `⟦${kept.length - 1}⟧`;
  });
  return { masked, restore: (out) => String(out).replace(/⟦(\d+)⟧/g, (_, i) => kept[Number(i)] ?? '') };
}
