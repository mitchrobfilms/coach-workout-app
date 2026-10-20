// Weight-loss progress maths (pure; unit-tested). Entries: [{ date: ISO, kg }].
import { KG_PER_LB, KG_PER_ST } from './weight.js';
const DAY = 864e5;
export const sortEntries = w => (w || []).filter(e => e && isFinite(e.kg) && !isNaN(Date.parse(e.date))).slice().sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
export function stLb(kg) { const lb = Math.abs(kg) / KG_PER_LB; let st = Math.floor(lb / 14), r = Math.round(lb - st * 14); if (r === 14) { st++; r = 0; } return { st, lb: r, text: st ? `${st}st ${r}lb` : `${r}lb` }; }
// Change over the last `days`: latest minus the entry nearest to (latest - days), only if we have data spanning ≥ 60% of the window.
export function trend(entries, days, now) {
  const w = sortEntries(entries); if (w.length < 2) return null;
  const last = w[w.length - 1], t1 = now ?? Date.parse(last.date), target = t1 - days * DAY;
  const past = w.filter(e => Date.parse(e.date) <= t1 - 0.6 * days * DAY && e !== last);
  if (!past.length) return null;
  const ref = past.reduce((best, e) => Math.abs(Date.parse(e.date) - target) < Math.abs(Date.parse(best.date) - target) ? e : best);
  return Math.round((last.kg - ref.kg) * 10) / 10;
}
export function bmi(kg, heightCm) { if (!heightCm || heightCm < 100 || heightCm > 250) return null; const m = heightCm / 100; return Math.round(kg / (m * m) * 10) / 10; }
export function bmiBand(b) { return b == null ? '' : b < 18.5 ? 'below the healthy range' : b < 25 ? 'healthy range' : b < 30 ? 'overweight range' : 'obese range'; }
export function milestones(startKg, currentKg) {
  const lost = startKg - currentKg, out = [];
  for (const p of [5, 10, 15, 20, 25]) out.push({ id: `p${p}`, label: `${p}% of starting weight`, need: startKg * p / 100, done: lost >= startKg * p / 100 - 1e-9 });
  const maxKg = Math.max(5, Math.ceil(Math.max(lost, 0) / 5) * 5 + 5);
  for (let k = 5; k <= maxKg; k += 5) out.push({ id: `kg${k}`, label: `${k} kg lost`, need: k, done: lost >= k - 1e-9 });
  const maxSt = Math.max(1, Math.floor(Math.max(lost, 0) / KG_PER_ST) + 1);
  for (let s = 1; s <= maxSt; s++) out.push({ id: `st${s}`, label: `${s} stone lost`, need: s * KG_PER_ST, done: lost >= s * KG_PER_ST - 1e-9 });
  return out.sort((a, b) => a.need - b.need);
}
export function summary(entries, { goalKg = null, heightCm = null, now = null } = {}) {
  const w = sortEntries(entries); if (!w.length) return null;
  const start = w[0].kg, cur = w[w.length - 1].kg, lost = Math.round((start - cur) * 10) / 10;
  const pct = Math.round((start - cur) / start * 1000) / 10;
  let goal = null;
  if (goalKg && goalKg < start) { const total = start - goalKg; goal = { kg: goalKg, toGo: Math.round(Math.max(0, cur - goalKg) * 10) / 10, pct: Math.max(0, Math.min(100, Math.round((start - cur) / total * 100))) }; }
  const ms = milestones(start, cur);
  return { start, current: cur, lost, lostStLb: stLb(lost), pct, entries: w.length, firstDate: w[0].date, lastDate: w[w.length - 1].date,
    trend7: trend(w, 7, now), trend30: trend(w, 30, now), bmi: bmi(cur, heightCm), goal, milestones: ms, nextMilestone: ms.find(m => !m.done) || null, reached: ms.filter(m => m.done) };
}
// Inline SVG line chart (no libraries). Returns an SVG string.
export function chartSVG(entries, { width = 340, height = 180, goalKg = null, unit = 'kg' } = {}) {
  const w = sortEntries(entries); if (w.length < 1) return '';
  const conv = kg => unit === 'lb' ? kg / KG_PER_LB : unit === 'st' ? kg / KG_PER_ST : kg;
  const xs = w.map(e => Date.parse(e.date)), ys = w.map(e => conv(e.kg)); if (goalKg) ys.push(conv(goalKg));
  let x0 = Math.min(...xs), x1 = Math.max(...xs); if (x1 === x0) { x0 -= DAY; x1 += DAY; }
  let y0 = Math.min(...ys), y1 = Math.max(...ys); const pad = Math.max((y1 - y0) * .12, unit === 'st' ? .1 : 1); y0 -= pad; y1 += pad;
  const L = 40, R = 10, T = 10, B = 24, X = t => L + (t - x0) / (x1 - x0) * (width - L - R), Y = v => T + (y1 - v) / (y1 - y0) * (height - T - B);
  const pts = w.map(e => `${X(Date.parse(e.date)).toFixed(1)},${Y(conv(e.kg)).toFixed(1)}`);
  const ticks = [0, .5, 1].map(f => y0 + (y1 - y0) * f);
  const dt = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `<svg class="wchart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Weight chart, ${w.length} weigh-ins"><g class="grid">${ticks.map(v => `<line x1="${L}" x2="${width - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="${L - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${v.toFixed(unit === 'st' ? 1 : 0)}</text>`).join('')}</g>`
    + (goalKg ? `<line class="goal" x1="${L}" x2="${width - R}" y1="${Y(conv(goalKg)).toFixed(1)}" y2="${Y(conv(goalKg)).toFixed(1)}"/><text class="goaltxt" x="${width - R}" y="${(Y(conv(goalKg)) - 5).toFixed(1)}" text-anchor="end">Goal</text>` : '')
    + `<polyline class="line" points="${pts.join(' ')}"/>${w.length <= 60 ? pts.map(p => `<circle class="dot" cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="3.5"/>`).join('') : ''}`
    + `<text class="ax" x="${L}" y="${height - 6}">${dt(x0)}</text><text class="ax" x="${width - R}" y="${height - 6}" text-anchor="end">${dt(x1)}</text></svg>`;
}
