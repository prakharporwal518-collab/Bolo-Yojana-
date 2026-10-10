/**
 * RAG over verified scheme data (frontend fallback retriever).
 *
 * Pipeline:  dialect normalisation → language detection → retrieve (scheme +
 * topic + FAQ keyword scoring) → grounded answer composed ONLY from schemes.json
 * → confidence score + source chips.
 *
 * If nothing relevant is retrieved we never guess: we say
 * "Mujhe iski pakki jaankari nahi hai" and point to the helpline / a human helper.
 *
 * The backend (/ask) does the same with a vector index (FAISS/Chroma) + an LLM
 * whose system prompt restricts it to the retrieved chunks.
 */
import data from '../data/schemes.json' with { type: 'json' };
import intents from '../data/intents.json' with { type: 'json' };
import { detectLanguage, RESPONSE_LANGS } from './nlp/languageDetect.js';
import { normalizeDialect } from './nlp/dialect.js';

export const SCHEMES = data.schemes;
export const getScheme = (id) => SCHEMES.find((s) => s.id === id) || null;

// Intent keywords live in data/intents.json (shared with the Python backend).
const TOPICS = intents.topics;
const GREETINGS = intents.greetings;
// Known schemes that are NOT in our verified data → never guess, refer to helpline.
const OUT_OF_SCOPE = intents.outOfScope;

const includesPhrase = (hay, phrase) => {
  // Word-ish boundary match that works for Devanagari + Latin.
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{M}])${esc}(?![\\p{L}\\p{M}])`, 'iu').test(hay);
};
const countHits = (hay, list) => list.reduce((n, k) => n + (includesPhrase(hay, k) ? 1 : 0), 0);

const L = (obj, lang) => obj?.[lang] ?? obj?.hi ?? '';

const UI = {
  unsure: {
    hi: 'माफ़ कीजिए, मुझे इसकी पक्की जानकारी नहीं है। मैं अंदाज़ा नहीं लगाऊँगा। कृपया हेल्पलाइन पर फ़ोन करें या किसी सहायक से बात करें।',
    hl: 'Maaf kijiye, mujhe iski pakki jaankari nahi hai. Main andaaza nahi lagaunga. Kripya helpline par phone karein ya kisi sahayak se baat karein.',
    en: "Sorry, I don't have verified information about this, and I won't guess. Please call the helpline or talk to a human helper.",
  },
  outOfScope: {
    hi: 'इस योजना की पक्की जानकारी अभी मेरे पास नहीं है। अभी मैं पीएम-किसान, आयुष्मान भारत और लाड़ली बहना के बारे में बता सकता हूँ। बाकी के लिए 181 (सीएम हेल्पलाइन) या नज़दीकी CSC से पूछें।',
    hl: 'Is yojana ki pakki jaankari abhi mere paas nahi hai. Abhi main PM-Kisan, Ayushman Bharat aur Ladli Behna ke baare mein bata sakta hoon. Baaki ke liye 181 (CM Helpline) ya nazdeeki CSC se poochhein.',
    en: "I don't have verified information on this scheme yet. Right now I can help with PM-Kisan, Ayushman Bharat and Ladli Behna. For others, call 181 (CM Helpline) or visit your nearest CSC.",
  },
  greet: {
    hi: 'नमस्ते! मैं बोलो योजना हूँ। आप मुझसे पीएम-किसान, आयुष्मान भारत या लाड़ली बहना योजना के बारे में अपनी भाषा में पूछ सकते हैं।',
    hl: 'Namaste! Main Bolo Yojana hoon. Aap mujhse PM-Kisan, Ayushman Bharat ya Ladli Behna Yojana ke baare mein apni bhasha mein pooch sakte hain.',
    en: 'Namaste! I am Bolo Yojana. Ask me about PM-Kisan, Ayushman Bharat or Ladli Behna Yojana in your own language.',
  },
  whichScheme: {
    hi: 'आप किस योजना के बारे में पूछ रहे हैं? पीएम-किसान 🌾, आयुष्मान भारत 🏥 या लाड़ली बहना 👩?',
    hl: 'Aap kis yojana ke baare mein pooch rahe hain? PM-Kisan 🌾, Ayushman Bharat 🏥 ya Ladli Behna 👩?',
    en: 'Which scheme are you asking about? PM-Kisan 🌾, Ayushman Bharat 🏥 or Ladli Behna 👩?',
  },
  docsIntro: { hi: 'ये कागज़ साथ रखें:', hl: 'Yeh kagaz saath rakhein:', en: 'Keep these documents ready:' },
  stepsIntro: { hi: 'आवेदन ऐसे करें:', hl: 'Aavedan aise karein:', en: 'How to apply:' },
  eligYes: { hi: 'कौन ले सकता है:', hl: 'Kaun le sakta hai:', en: 'Who can get it:' },
  eligNo: { hi: 'किसे नहीं मिलेगा:', hl: 'Kise nahi milega:', en: 'Who cannot get it:' },
  helpline: { hi: 'हेल्पलाइन', hl: 'Helpline', en: 'Helpline' },
  more: {
    hi: 'आप पूछ सकते हैं: कौन ले सकता है? कौन से कागज़ चाहिए? आवेदन कैसे करें?',
    hl: 'Aap pooch sakte hain: kaun le sakta hai? Kaun se kagaz chahiye? Aavedan kaise karein?',
    en: 'You can ask: Who is eligible? Which documents? How to apply?',
  },
};

function suggestionsFor(scheme, lang) {
  if (!scheme) {
    return SCHEMES.map((s) => ({ label: `${s.icon} ${L(s.name, lang)}`, query: L(s.name, lang) }));
  }
  const lab = {
    elig: { hi: '✅ पात्रता जाँचें', hl: '✅ Patrata jaanchein', en: '✅ Check eligibility' },
    docs: { hi: '📄 कागज़', hl: '📄 Kagaz', en: '📄 Documents' },
    apply: { hi: '📝 आवेदन कैसे', hl: '📝 Aavedan kaise', en: '📝 How to apply' },
  };
  return [
    { label: L(lab.elig, lang), action: 'eligibility', schemeId: scheme.id },
    { label: L(lab.docs, lang), query: lang === 'en' ? `${scheme.name.en} documents` : `${L(scheme.name, lang)} ${lang === 'hi' ? 'के कागज़' : 'ke kagaz'}` },
    { label: L(lab.apply, lang), query: lang === 'en' ? `how to apply ${scheme.name.en}` : `${L(scheme.name, lang)} ${lang === 'hi' ? 'आवेदन कैसे करें' : 'aavedan kaise karein'}` },
  ];
}

/** Retrieve the best scheme / topic / FAQ for a (normalized) query. */
export function retrieve(query, contextSchemeId = null) {
  const q = String(query).toLowerCase();
  const schemeScores = SCHEMES.map((s) => {
    const names = [s.name.en, s.name.hi, s.name.hl].map((n) => n.toLowerCase().split(' (')[0]);
    return { scheme: s, score: countHits(q, s.keywords) + names.reduce((n, nm) => n + (q.includes(nm) ? 2 : 0), 0) };
  }).sort((a, b) => b.score - a.score);

  let scheme = schemeScores[0].score > 0 ? schemeScores[0].scheme : null;
  let usedContext = false;
  if (!scheme && contextSchemeId) { scheme = getScheme(contextSchemeId); usedContext = !!scheme; }

  const topicScores = Object.entries(TOPICS).map(([topic, kws]) => ({ topic, score: countHits(q, kws) })).sort((a, b) => b.score - a.score);
  const topic = topicScores[0].score > 0 ? topicScores[0].topic : null;

  // FAQ: search inside the detected scheme (or all schemes if none detected).
  let faq = null;
  let faqScore = 0;
  for (const s of scheme ? [scheme] : SCHEMES) {
    for (const f of s.faqs || []) {
      const sc = countHits(q, f.keywords);
      if (sc > faqScore) { faq = { ...f, scheme: s }; faqScore = sc; }
    }
  }
  if (faq && !scheme && faqScore < 2) faq = null; // too weak without a scheme anchor

  return {
    scheme: scheme || faq?.scheme || null,
    usedContext,
    topic,
    faq,
    schemeScore: schemeScores[0].score,
    topicScore: topicScores[0]?.score || 0,
    faqScore,
    outOfScope: !scheme && countHits(q, OUT_OF_SCOPE) > 0,
    greeting: countHits(q, GREETINGS) > 0 && q.split(/\s+/).length <= 4,
  };
}

function compose(r, lang) {
  const s = r.scheme;
  const name = L(s.name, lang);
  const lines = [];
  let documents = null;
  let steps = null;
  if (r.faq && (r.faqScore >= 1) && (!r.topic || r.faq.topic === r.topic || r.faqScore >= r.topicScore)) {
    lines.push(L(r.faq.a, lang));
  } else {
    switch (r.topic) {
      case 'documents':
        lines.push(`${name} — ${L(UI.docsIntro, lang)}`);
        documents = s.documents;
        s.documents.forEach((d, i) => lines.push(`${i + 1}. ${d.icon} ${L(d.name, lang)}`));
        break;
      case 'apply':
        lines.push(`${name} — ${L(UI.stepsIntro, lang)}`);
        steps = L(s.steps, lang);
        steps.forEach((st, i) => lines.push(`${i + 1}. ${st}`));
        break;
      case 'eligibility':
        lines.push(`${name} — ${L(UI.eligYes, lang)}`);
        L(s.eligibility.yes, lang).forEach((x) => lines.push(`✅ ${x}`));
        lines.push(L(UI.eligNo, lang));
        L(s.eligibility.no, lang).forEach((x) => lines.push(`❌ ${x}`));
        break;
      case 'benefit':
        lines.push(L(s.benefit.text, lang));
        break;
      case 'helpline':
        lines.push(`${L(s.helpline.label, lang)}: 📞 ${s.helpline.number}${s.helpline.alt ? ` / ${s.helpline.alt}` : ''}`);
        break;
      case 'status':
        lines.push(L(s.benefit.text, lang));
        lines.push(`${L(UI.helpline, lang)}: 📞 ${s.helpline.number}`);
        break;
      default:
        lines.push(L(s.simple, lang));
        lines.push(L(s.benefit.text, lang));
        lines.push(L(UI.more, lang));
    }
  }
  return { text: lines.join('\n'), documents, steps };
}

/**
 * Answer a user question using only verified data.
 * @param {string} rawText    what the user said / typed
 * @param {object} opts       { langOverride, contextSchemeId }
 */
export function answerQuestion(rawText, { langOverride = 'auto', contextSchemeId = null } = {}) {
  const dialect = normalizeDialect(rawText);
  const detected = detectLanguage(rawText);
  let lang = langOverride && langOverride !== 'auto' ? langOverride : detected.lang;
  if (!RESPONSE_LANGS.includes(lang)) lang = 'hi'; // other Indian languages → Hindi (Bhashini adapter translates in production)

  const r = retrieve(dialect.normalized, contextSchemeId);
  const base = { lang, detected, dialect, normalized: dialect.normalized, retrieval: { ...r, scheme: r.scheme?.id || null, faq: r.faq?.id || null } };

  if (r.greeting && !r.scheme) {
    return { ...base, text: L(UI.greet, lang), confidence: 'high', score: 0.95, sources: [], suggestions: suggestionsFor(null, lang) };
  }
  if (r.outOfScope) {
    return { ...base, text: L(UI.outOfScope, lang), confidence: 'low', score: 0.2, sources: [], suggestions: suggestionsFor(null, lang), helpline: '181' };
  }
  if (!r.scheme) {
    if (r.topic) {
      return { ...base, text: L(UI.whichScheme, lang), confidence: 'medium', score: 0.5, sources: [], suggestions: suggestionsFor(null, lang) };
    }
    return { ...base, text: L(UI.unsure, lang), confidence: 'low', score: 0.15, sources: [], suggestions: suggestionsFor(null, lang), helpline: '181' };
  }

  const { text, documents, steps } = compose(r, lang);
  // Confidence: strong when both "what" (scheme) and "which part" (topic/FAQ) were retrieved.
  let score = 0.45;
  if (r.schemeScore > 0) score += 0.25;
  else if (r.usedContext) score += 0.15;
  if (r.faqScore > 0 || r.topic) score += 0.25;
  score = Math.min(0.97, score + Math.min(0.05, (r.schemeScore + r.faqScore) * 0.01));
  const confidence = score >= 0.8 ? 'high' : score >= 0.55 ? 'medium' : 'low';

  return {
    ...base,
    text,
    documents,
    steps,
    schemeId: r.scheme.id,
    topic: r.faq?.topic || r.topic || 'about',
    confidence,
    score: Math.round(score * 100) / 100,
    sources: [{ title: r.scheme.sourceName, url: r.scheme.officialUrl, lastVerified: r.scheme.lastVerified }],
    suggestions: suggestionsFor(r.scheme, lang),
    helpline: r.scheme.helpline.number,
  };
}
