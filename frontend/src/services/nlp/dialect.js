/**
 * Dialect normalisation layer.
 * Maps Malwi / Bundeli / Nimadi words to standard Hindi BEFORE intent detection,
 * and reports which dialect was detected (shown as a badge in the UI).
 *
 * Data-driven: all knowledge lives in data/dialectGlossary.json, so adding a
 * dialect = adding glossary entries (no code change).
 */
import glossary from '../../data/dialectGlossary.json' with { type: 'json' };

const byTerm = new Map();
for (const e of glossary.entries) {
  byTerm.set(e.term, { ...e, script: 'deva' });
  for (const r of e.roman || []) byTerm.set(r.toLowerCase(), { ...e, script: 'latin' });
}

export const DIALECTS = glossary._meta.dialects;

// Split on whitespace while keeping punctuation attached separately.
const TOKEN_RE = /([\p{L}\p{M}]+)|([^\p{L}\p{M}]+)/gu;

/**
 * @param {string} text
 * @returns {{ normalized: string, dialect: string|null, dialectName: object|null, matches: Array<{from:string,to:string,dialects:string[]}>, score: number }}
 */
export function normalizeDialect(text = '') {
  const src = String(text);
  const parts = [...src.matchAll(TOKEN_RE)].map((m) => ({ word: !!m[1], value: m[0] }));
  const scores = {};
  const candidates = [];
  let wordIndexInSentence = 0;

  parts.forEach((p, idx) => {
    if (!p.word) {
      if (/[.!?।]/.test(p.value)) wordIndexInSentence = 0;
      return;
    }
    const key = p.value.toLowerCase();
    const entry = byTerm.get(key) || byTerm.get(p.value);
    if (entry && !(entry.context === 'start' && wordIndexInSentence !== 0)) {
      candidates.push({ idx, entry });
      if (!entry.weak) for (const d of entry.dialects) scores[d] = (scores[d] || 0) + 1 / entry.dialects.length;
    }
    wordIndexInSentence++;
  });

  const strong = candidates.filter((c) => !c.entry.weak).length;
  const matches = [];
  if (strong > 0) {
    for (const { idx, entry } of candidates) {
      const replacement = entry.script === 'latin' ? entry.stdRoman : entry.std;
      matches.push({ from: parts[idx].value, to: replacement, dialects: entry.dialects });
      parts[idx] = { ...parts[idx], value: replacement };
    }
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const dialect = ranked.length ? ranked[0][0] : null;
  return {
    normalized: parts.map((p) => p.value).join(''),
    dialect,
    dialectName: dialect ? DIALECTS[dialect] : null,
    matches,
    score: ranked.length ? Math.round(ranked[0][1] * 100) / 100 : 0,
  };
}
