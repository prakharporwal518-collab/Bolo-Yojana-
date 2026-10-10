/** AbortSignal with a timeout — falls back for older Android WebViews without AbortSignal.timeout. */
export function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) return AbortSignal.timeout(ms);
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}
