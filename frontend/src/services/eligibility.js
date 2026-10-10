/**
 * Rule engine for the eligibility checker. Rules live in schemes.json so the
 * frontend and the FastAPI backend evaluate exactly the same logic.
 *
 * Results: 'eligible' | 'not_eligible' | 'need_info'
 */
import { parseAmount, parseNumber, normalizeDigits } from './format.js';
import { normalizeDialect } from './nlp/dialect.js';

const YES = ['haan', 'han', 'ha', 'haa', 'haanji', 'ji', 'jee', 'yes', 'yeah', 'yep', 'sahi', 'bilkul', 'hai', 'हाँ', 'हां', 'हा', 'जी', 'हाँजी', 'बिलकुल', 'बिल्कुल', 'सही', 'है', 'हओ', 'हव', 'hao', 'hav', 'ho gaya', 'हो गया', 'ho chuka', 'हो चुका'];
const NO = ['nahi', 'nahin', 'nai', 'na', 'no', 'nope', 'नहीं', 'नही', 'ना', 'न', 'नी', 'कोनी', 'नईं', 'koni', 'nain', 'bilkul nahi', 'koi nahi', 'कोई नहीं'];
const UNKNOWN = ['pata nahi', 'pata nahin', 'malum nahi', 'maloom nahi', "don't know", 'dont know', 'not sure', 'पता नहीं', 'मालूम नहीं', 'नहीं पता', 'nahi pata', 'pakka nahi', 'पक्का नहीं'];

const has = (text, list) => list.some((w) => new RegExp(`(?<![\\p{L}\\p{M}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{M}])`, 'iu').test(text));

/**
 * Turn a spoken/typed reply into a structured answer for a question.
 * @returns {{ value: any, ok: boolean }}  value 'unknown' when the user doesn't know.
 */
export function parseAnswer(question, raw) {
  const text = normalizeDialect(normalizeDigits(String(raw || '')).trim()).normalized.toLowerCase();
  if (!text) return { ok: false, value: null };
  if (has(text, UNKNOWN)) return { ok: true, value: 'unknown' };

  switch (question.type) {
    case 'yesno': {
      const no = has(text, NO);
      const yes = has(text, YES);
      if (no && !(yes && /^(haan|हाँ|हां|ji|जी)/.test(text))) return { ok: true, value: 'no' };
      if (yes) return { ok: true, value: 'yes' };
      return { ok: false, value: null };
    }
    case 'number': {
      const n = parseNumber(text);
      return n == null || n < 0 || n > 120 ? { ok: false, value: null } : { ok: true, value: n };
    }
    case 'amount': {
      const n = parseAmount(text);
      return n == null ? { ok: false, value: null } : { ok: true, value: n };
    }
    case 'choice': {
      // Exact value (from a tapped button) or keyword match.
      const direct = question.options.find((o) => o.value === raw);
      if (direct) return { ok: true, value: direct.value };
      let best = null;
      let bestLen = 0;
      for (const o of question.options) {
        for (const m of o.match || []) {
          if (has(text, [m.toLowerCase()]) && m.length > bestLen) { best = o; bestLen = m.length; }
        }
      }
      return best ? { ok: true, value: best.value } : { ok: false, value: null };
    }
    default:
      return { ok: true, value: raw };
  }
}

function test(cond, answers) {
  const v = answers[cond.q];
  if (v === undefined || v === null || v === 'unknown') return false;
  switch (cond.op) {
    case '==': return v === cond.value;
    case '!=': return v !== cond.value;
    case '<': return Number(v) < cond.value;
    case '<=': return Number(v) <= cond.value;
    case '>': return Number(v) > cond.value;
    case '>=': return Number(v) >= cond.value;
    case 'in': return cond.value.includes(v);
    default: return false;
  }
}

/**
 * Evaluate answers so far.
 * @returns {{ done: boolean, result?: string, reasons: object[], notes: object[], nextQuestion?: object }}
 *   done=true early when a hard "not eligible" / "eligible_final" rule fires (saves the user time).
 */
export function evaluate(scheme, answers) {
  const reasons = [];
  const failReasons = [];
  const notes = [];
  let positive = false;

  for (const rule of scheme.rules) {
    if (!test(rule.if, answers)) continue;
    if (rule.then === 'eligible_final') {
      return { done: true, result: 'eligible', reasons: [rule.reason], notes };
    }
    if (rule.then === 'not_eligible') failReasons.push(rule.reason);
    else if (rule.then === 'eligible') { positive = true; reasons.push(rule.reason); }
    else if (rule.then === 'note') notes.push(rule.reason);
  }

  if (failReasons.length) return { done: true, result: 'not_eligible', reasons: failReasons, notes };

  const nextQuestion = scheme.questions.find((q) => !(q.id in answers));
  if (nextQuestion) return { done: false, reasons, notes, nextQuestion };

  const unknownRequired = scheme.questions.filter((q) => q.required !== false && answers[q.id] === 'unknown');
  if (unknownRequired.length) {
    return {
      done: true,
      result: 'need_info',
      reasons: [{ hi: 'कुछ सवालों का जवाब पक्का नहीं है। हेल्पलाइन या CSC से जाँच करवाएँ।', hl: 'Kuch sawalon ka jawab pakka nahi hai. Helpline ya CSC se jaanch karwayein.', en: 'Some answers are uncertain. Please verify with the helpline or a CSC.' }],
      unknown: unknownRequired.map((q) => q.id),
      notes,
    };
  }
  if (positive) return { done: true, result: 'eligible', reasons, notes };
  return { done: true, result: scheme.default.result, reasons: [scheme.default.reason], notes };
}
