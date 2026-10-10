// Run with: npm test   (Node's built-in test runner, no extra deps)
import test from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion, getScheme } from '../src/services/rag.js';
import { detectLanguage } from '../src/services/nlp/languageDetect.js';
import { normalizeDialect } from '../src/services/nlp/dialect.js';
import { parseAmount, formatINR, amountInWords } from '../src/services/format.js';
import { parseAnswer, evaluate } from '../src/services/eligibility.js';
import { simplifyText } from '../src/services/nlp/simplify.js';
import { segmentTerms, protectTerms } from '../src/services/nlp/glossary.js';

test('language detection', () => {
  assert.equal(detectLanguage('mera kisan wala paisa nahi aaya, kya karu?').lang, 'hl');
  assert.equal(detectLanguage('मेरा पैसा नहीं आया').lang, 'hi');
  assert.equal(detectLanguage('What documents do I need for Ayushman card?').lang, 'en');
  assert.equal(detectLanguage('আমার টাকা আসেনি').lang, 'bn');
});

test('dialect normalisation (Malwi)', () => {
  const r = normalizeDialect('म्हारो नाम सुनीता है। लाड़ली बहना को पइसो कसे मिलेगो?');
  assert.equal(r.dialect, 'malwi');
  assert.match(r.normalized, /मेरा नाम/);
  assert.match(r.normalized, /पैसा कैसे मिलेगा/);
  assert.equal(normalizeDialect('मेरा नाम सुनीता है').dialect, null);
});

test('Hinglish PM-Kisan question → grounded high-confidence answer', () => {
  const a = answerQuestion('mera kisan wala paisa nahi aaya, kya karu?');
  assert.equal(a.lang, 'hl');
  assert.equal(a.schemeId, 'pm-kisan');
  assert.equal(a.confidence, 'high');
  assert.match(a.text, /e-KYC/);
  assert.equal(a.sources[0].url, 'https://pmkisan.gov.in/');
});

test('unknown question → no guessing', () => {
  const a = answerQuestion('mangal grah par mausam kaisa hai');
  assert.equal(a.confidence, 'low');
  assert.match(a.text, /pakki jaankari nahi/);
  assert.equal(answerQuestion('ujjwala gas connection kaise milega').confidence, 'low');
});

test('context follow-up uses previous scheme', () => {
  const a = answerQuestion('kaun se kagaz chahiye?', { contextSchemeId: 'pmjay' });
  assert.equal(a.schemeId, 'pmjay');
  assert.ok(a.documents.length >= 3);
});

test('Indian amounts', () => {
  assert.equal(parseAmount('डेढ़ लाख'), 150000);
  assert.equal(parseAmount('dhai lakh'), 250000);
  assert.equal(parseAmount('1,20,000'), 120000);
  assert.equal(parseAmount('50 hazaar'), 50000);
  assert.equal(parseAmount('paune do lakh'), 175000);
  assert.equal(formatINR(150000), '₹1,50,000');
  assert.equal(amountInWords(150000, 'hi'), 'डेढ़ लाख');
});

test('eligibility – Sunita (Ladli Behna) is eligible', () => {
  const s = getScheme('ladli-behna');
  const say = { gender: 'mahila hoon', state: 'haan', age: '34 saal', marital: 'हओ, शादीशुदा', income: 'डेढ़ लाख', taxpayer: 'नी', govtjob: 'nahi', land: 'nahi', car: 'koni' };
  const answers = {};
  for (const q of s.questions) {
    const p = parseAnswer(q, say[q.id]);
    assert.ok(p.ok, `parse failed for ${q.id}`);
    answers[q.id] = p.value;
  }
  assert.equal(evaluate(s, answers).result, 'eligible');
  assert.equal(evaluate(s, { ...answers, income: 300000 }).result, 'not_eligible');
});

test('eligibility – Ayushman 70+ short-circuits', () => {
  const r = evaluate(getScheme('pmjay'), { age: 72 });
  assert.equal(r.done, true);
  assert.equal(r.result, 'eligible');
  assert.equal(evaluate(getScheme('pmjay'), { age: 40, govtjob: 'no', taxpayer: 'no', ration: 'none', listed: 'unknown' }).result, 'need_info');
});

test('simplify + glossary', () => {
  const s = simplifyText('आवेदक द्वारा समस्त दस्तावेज़ अंतिम तिथि से पूर्व प्रस्तुत करना अनिवार्य है।');
  assert.match(s.simple, /ज़रूरी/);
  assert.ok(!/आयुष्मान/.test(simplifyText('आयुष्मान कार्ड').simple) === false);
  assert.ok(segmentTerms('e-KYC aur Aadhaar se Gram Panchayat').filter((x) => x.term).length === 3);
  const p = protectTerms('Patwari se Khasra lo');
  assert.equal(p.restore(p.masked), 'Patwari se Khasra lo');
});

import { extractFacts, explainFacts } from '../src/services/nlp/extract.js';
import { SAMPLE_NOTICES } from '../src/data/sampleNotices.js';

test('notice key facts', () => {
  const f1 = extractFacts(SAMPLE_NOTICES[0].groundTruth);
  assert.equal(f1.scheme.id, 'pm-kisan');
  assert.equal(f1.deadline, '31/10/2026');
  assert.equal(f1.helpline, '155261');
  assert.ok(f1.consequence);
  const f2 = extractFacts(SAMPLE_NOTICES[1].groundTruth);
  assert.equal(f2.scheme.id, 'pmjay');
  assert.equal(f2.eventDate, '15/10/2026');
  assert.deepEqual(f2.documents.map((d) => d.en), ['Aadhaar card', 'Samagra ID', 'Ration card']);
  assert.ok(explainFacts(f2, 'hi').join(' ').includes('पंचायत भवन'));
});

import { offlineTranslate } from '../src/services/adapters/translate.js';
test('offline translation with dialect + protected terms', () => {
  assert.equal(offlineTranslate('नमस्ते साहब। म्हारो नाम सुनीता है। म्हारो पइसो दो महीने से नी आयो।', 'hi', 'en'), 'Hello sir. My name is Sunita. My money has not come for two months.');
  assert.equal(offlineTranslate('What is your Samagra ID?', 'en', 'hi'), 'आपकी समग्र आईडी क्या है?');
  assert.match(offlineTranslate('Your Aadhaar is linked', 'en', 'hi'), /Aadhaar/);
});
