// Weight-loss certificates. Loss is always measured from the STARTING weight; awards are kept forever (never revoked on a blip).
import { KG_PER_LB, KG_PER_ST } from './weight.js';
import { stLb } from './progress.js';
const kgTxt = kg => `${(Math.round(kg * 10) / 10).toFixed(1)} kg`;
export function milestonesFor(startKg, currentKg, goalKg = null) {
  const lost = startKg - currentKg, out = [], eps = 1e-9;
  if (lost >= 2 * KG_PER_LB - eps) out.push({ id: 'first2lb', label: 'First 2 lb lost', need: 2 * KG_PER_LB });
  for (let k = 1; k <= Math.floor(lost + eps); k++) out.push({ id: `kg${k}`, label: `Lost ${k} kg (${stLb(k).text})`, need: k });
  for (let s = 1; s * KG_PER_ST <= lost + eps; s++) out.push({ id: `st${s}`, label: `Lost ${s} stone (${kgTxt(s * KG_PER_ST)})`, need: s * KG_PER_ST });
  for (let p = 5; startKg * p / 100 <= lost + eps; p += 5) out.push({ id: `pct${p}`, label: `Lost ${p}% of starting weight`, need: startKg * p / 100 });
  if (goalKg && goalKg < startKg && currentKg <= goalKg + eps) out.push({ id: 'goal', label: 'Goal weight reached!', need: startKg - goalKg });
  return out.sort((a, b) => a.need - b.need);
}
export function newAwards(certs, startKg, currentKg, goalKg, { name = '', date = new Date().toISOString() } = {}) {
  const have = new Set((certs || []).map(c => c.id));
  return milestonesFor(startKg, currentKg, goalKg).filter(m => !have.has(m.id)).map(m => ({ id: m.id, label: m.label, startKg, currentKg, lostKg: Math.round((startKg - currentKg) * 10) / 10, date, name }));
}
// Walk weigh-ins in date order and award each milestone on the date it was first reached (certificate date = weigh-in date).
// Existing awards are kept (never revoked); start = earliest weigh-in.
export function awardsFromHistory(certs, sortedEntries, goalKg, { name = '' } = {}) {
  const w = sortedEntries || []; if (w.length < 2) return [];
  const all = [...(certs || [])], fresh = [], start = w[0].kg;
  for (const e of w.slice(1)) { const n = newAwards(all, start, e.kg, goalKg, { name, date: e.date }); all.push(...n); fresh.push(...n); }
  return fresh;
}
// Re-date existing certificates after weigh-ins are added/edited/backdated: each one takes the date (and figures) of the
// first weigh-in that reaches it. Certificates no longer reached are kept unchanged (never revoked). Returns new array.
export function redateCerts(certs, sortedEntries, goalKg) {
  const ref = new Map(awardsFromHistory([], sortedEntries, goalKg).map(a => [a.id, a]));
  return (certs || []).map(c => { const r = ref.get(c.id); return r ? { ...c, date: r.date, startKg: r.startKg, currentKg: r.currentKg, lostKg: r.lostKg } : c; });
}
// Latest weigh-in by date (not by insertion order).
export const latestEntry = sorted => sorted?.length ? sorted[sorted.length - 1] : null;
const LINES = ['Every rep and every meal added up to this.', 'Consistency beats perfection. Keep going!', 'You showed up for yourself. Be proud.', 'Small steps, big change. On to the next one!'];
export const encouragement = id => LINES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % LINES.length];
// Draw onto a canvas-like 2D context (browser). Pure drawing; no network except the avatar image passed in.
export function drawCertificate(ctx, c, { avatar = null, W = 1080, H = 1350 } = {}) {
  const teal = '#16d4c0', bg = '#0b1116';
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#0e8f84'); g.addColorStop(1, teal); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 26); ctx.fillRect(0, H - 26, W, 26);
  ctx.strokeStyle = teal; ctx.lineWidth = 6; ctx.strokeRect(50, 70, W - 100, H - 140);
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '700 54px system-ui, sans-serif'; ctx.fillText('GLP1', W / 2 - 70, 170); ctx.fillStyle = teal; ctx.fillText('Life', W / 2 + 80, 170);
  ctx.fillStyle = '#9fb0bd'; ctx.font = '600 34px system-ui, sans-serif'; ctx.fillText('CERTIFICATE OF ACHIEVEMENT', W / 2, 240);
  if (avatar) { ctx.save(); ctx.beginPath(); ctx.arc(W / 2, 400, 110, 0, Math.PI * 2); ctx.closePath(); ctx.clip(); ctx.drawImage(avatar, W / 2 - 110, 290, 220, 220); ctx.restore(); ctx.beginPath(); ctx.arc(W / 2, 400, 112, 0, Math.PI * 2); ctx.strokeStyle = teal; ctx.lineWidth = 8; ctx.stroke(); }
  ctx.fillStyle = '#9fb0bd'; ctx.font = '400 36px system-ui, sans-serif'; ctx.fillText('This certifies that', W / 2, 590);
  ctx.fillStyle = '#fff'; ctx.font = '800 76px system-ui, sans-serif'; ctx.fillText(c.name || 'You', W / 2, 680, W - 160);
  ctx.fillStyle = teal; ctx.font = '800 64px system-ui, sans-serif'; ctx.fillText(c.label, W / 2, 800, W - 140);
  ctx.fillStyle = '#fff'; ctx.font = '600 44px system-ui, sans-serif'; ctx.fillText(`${c.startKg.toFixed(1)} kg  →  ${c.currentKg.toFixed(1)} kg`, W / 2, 890);
  ctx.fillStyle = '#9fb0bd'; ctx.font = '400 34px system-ui, sans-serif'; ctx.fillText(`(${stLb(c.startKg).text} → ${stLb(c.currentKg).text})`, W / 2, 945);
  ctx.fillStyle = '#e8eef2'; ctx.font = 'italic 400 40px system-ui, sans-serif'; ctx.fillText(encouragement(c.id), W / 2, 1060, W - 160);
  ctx.fillStyle = '#9fb0bd'; ctx.font = '500 34px system-ui, sans-serif'; ctx.fillText(new Date(c.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), W / 2, 1160);
  ctx.fillStyle = teal; ctx.font = '700 30px system-ui, sans-serif'; ctx.fillText('— GLP1 Life', W / 2, 1220);
}
