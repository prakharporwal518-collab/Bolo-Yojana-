/**
 * Draws the application summary on a <canvas>. We render with the browser's text
 * engine (correct Devanagari shaping — jsPDF's built-in fonts cannot shape Hindi)
 * and then embed the canvas image into the PDF.
 */
import { formatDate } from './format.js';

const W = 1240; // A4 @ 150 dpi
const H = 1754;
const FONT = '"Noto Sans Devanagari", "Mukta", system-ui, sans-serif';

function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildSummaryCanvas({ scheme, fields, values, checked, lang = 'hi' }) {
  try { await document.fonts?.load(`32px ${FONT}`, 'अ'); } catch { /* use fallback font */ }
  const L = (o) => o?.[lang] ?? o?.hi ?? '';
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  // Tricolour header band
  ctx.fillStyle = '#FF9933'; ctx.fillRect(0, 0, W, 16);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 16, W, 8);
  ctx.fillStyle = '#138808'; ctx.fillRect(0, 24, W, 16);

  let y = 110;
  ctx.fillStyle = '#C2410C';
  ctx.font = `bold 54px ${FONT}`;
  ctx.fillText('बोलो योजना', 80, y);
  ctx.fillStyle = '#57534e';
  ctx.font = `28px ${FONT}`;
  ctx.fillText(lang === 'en' ? 'Application summary (not an official form)' : 'आवेदन सारांश (यह सरकारी फ़ॉर्म नहीं है)', 80, (y += 48));
  ctx.fillText(`${lang === 'en' ? 'Date' : 'तारीख'}: ${formatDate(new Date(), lang)}  ·  ${formatDate(new Date(), lang, true)}`, 80, (y += 42));

  y += 50;
  ctx.fillStyle = scheme.color;
  ctx.fillRect(80, y - 40, W - 160, 70);
  ctx.fillStyle = '#fff';
  ctx.font = `bold 38px ${FONT}`;
  ctx.fillText(L(scheme.name), 100, y + 8);

  // Fields table
  y += 90;
  ctx.font = `30px ${FONT}`;
  for (const f of fields) {
    ctx.fillStyle = '#78716c';
    ctx.fillText(L(f.label), 80, y);
    ctx.fillStyle = '#1c1917';
    ctx.font = `bold 32px ${FONT}`;
    ctx.fillText(values[f.id] || '—', 520, y);
    ctx.font = `30px ${FONT}`;
    ctx.strokeStyle = '#e7e5e4';
    ctx.beginPath(); ctx.moveTo(80, y + 18); ctx.lineTo(W - 80, y + 18); ctx.stroke();
    y += 62;
  }

  // Document checklist
  y += 30;
  ctx.fillStyle = '#138808';
  ctx.font = `bold 36px ${FONT}`;
  ctx.fillText(lang === 'en' ? 'Documents to carry' : 'साथ ले जाने वाले कागज़', 80, y);
  y += 55;
  ctx.font = `30px ${FONT}`;
  for (const d of scheme.documents) {
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 3;
    ctx.strokeRect(80, y - 28, 34, 34);
    if (checked[d.id]) {
      ctx.beginPath(); ctx.moveTo(86, y - 10); ctx.lineTo(96, y); ctx.lineTo(110, y - 24); ctx.stroke();
    }
    ctx.lineWidth = 1;
    ctx.fillStyle = '#1c1917';
    ctx.fillText(L(d.name), 135, y);
    y += 54;
  }

  // Next steps
  y += 25;
  ctx.fillStyle = '#C2410C';
  ctx.font = `bold 36px ${FONT}`;
  ctx.fillText(lang === 'en' ? 'Next steps' : 'आगे क्या करें', 80, y);
  y += 50;
  ctx.font = `28px ${FONT}`;
  ctx.fillStyle = '#1c1917';
  (scheme.steps[lang] || scheme.steps.hi).forEach((st, i) => {
    for (const [j, line] of wrap(ctx, `${i + 1}. ${st}`, W - 180).entries()) {
      if (y > H - 170) return;
      ctx.fillText(line, j ? 115 : 80, y);
      y += 40;
    }
    y += 6;
  });

  // Footer
  ctx.fillStyle = '#f5f5f4';
  ctx.fillRect(0, H - 130, W, 130);
  ctx.fillStyle = '#44403c';
  ctx.font = `26px ${FONT}`;
  ctx.fillText(`📞 ${L(scheme.helpline.label)}: ${scheme.helpline.number}   ·   ${scheme.officialUrl}`, 80, H - 80);
  ctx.font = `22px ${FONT}`;
  ctx.fillText(lang === 'en' ? 'Generated on-device by Bolo Yojana. No data was uploaded.' : 'बोलो योजना द्वारा फ़ोन पर बनाया गया। कोई जानकारी अपलोड नहीं हुई।', 80, H - 42);
  return c;
}
