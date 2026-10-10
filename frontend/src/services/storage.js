/** Safe localStorage wrapper (private mode / blocked storage must never crash the app). */
export function load(key, fallback) {
  try {
    const v = localStorage.getItem(`by:${key}`);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
export function save(key, value) {
  try {
    localStorage.setItem(`by:${key}`, JSON.stringify(value));
  } catch {
    /* storage full or blocked – ignore */
  }
}

/** On-device usage counters shown on the Impact page (no personal data, no audio). */
export function recordQuery(ms, lang, dialect) {
  const m = load('metrics', { queries: 0, totalMs: 0, langs: {}, dialects: {} });
  m.queries += 1;
  m.totalMs += ms;
  m.langs[lang] = (m.langs[lang] || 0) + 1;
  if (dialect) m.dialects[dialect] = (m.dialects[dialect] || 0) + 1;
  save('metrics', m);
}
export const getLocalMetrics = () => load('metrics', { queries: 0, totalMs: 0, langs: {}, dialects: {} });
