// What the class coach says, and when. Pure (no DOM): the app's class engine and tools/render-class.mjs both use it, so the
// full-length Drive videos carry exactly the lines and timing of the in-app class. Each line: { text, id?, alts?, parts?, kind, talk? }.
// parts = phrase-clip ids chained in order (numbers + a phrase), used when there is no single recording of the whole sentence.
import { introText, slug } from './voicelines.js';
export const plainName = c => c.name.replace(' (Zumba-style)', '').replace('(Zumba-style)', '');

/** Clip ids for a spoken number (0-9999): num.0-100, num.h<N> "N hundred", num.ha<N> "N hundred and", num.k<N> "N thousand". */
export function numberParts(n) {
  n = Math.round(Number(n)); if (!Number.isFinite(n) || n < 0 || n > 9999) return null;
  const out = [];
  if (n >= 1000) { out.push(`num.k${Math.floor(n / 1000)}`); n %= 1000; if (!n) return out; }
  if (n > 100) { const h = Math.floor(n / 100), r = n % 100; if (!r) { out.push(`num.h${h}`); return out; } out.push(`num.ha${h}`); n = r; }
  out.push(`num.${n}`); return out;
}
/** A rep count: energetic count clips up to 60, plain number clips above that. */
export const countLine = n => (n <= 60 ? { text: String(n), id: `count.${n}`, kind: 'count' } : { text: String(n), parts: numberParts(n), kind: 'count' });
export const punchesLine = n => ({ text: `${n} punches! Strong work.`, parts: [...(numberParts(n) || []), 'sfx.punches_strong'] });
export const heldLine = n => ({ text: `${n} seconds held. Lovely.`, parts: [...(numberParts(n) || []), 'sfx.held_lovely'] });
const SOFAR = { punches: 'punches', 'on-beat moves': 'onbeat', 'seconds held': 'held', reps: 'reps' };
export const soFarLine = (metric, name, kcal) => ({ text: `${metric} ${name} so far. That's about ${kcal} calories.`, kind: 'high',
  parts: SOFAR[name] ? [...(numberParts(metric) || []), `sfx.sofar.${SOFAR[name]}`, 'sfx.about', ...(numberParts(kcal) || []), 'sfx.calories'] : null });

export const welcomeLine = c => ({ text: `Welcome to ${plainName(c)}! ${Math.round(c.total / 60)} minutes, beginner friendly. Let's start with a ${Math.round(c.sections.warm / 60)} minute warm-up.`, id: `class.${c.id}.welcome`, alts: [`${c.id}.intro`], kind: 'high', talk: true });
export const nextLine = (c, n) => ({ text: `Next up: ${n.name}.`, id: `class.${c.id}.${slug(n.name)}.next_short` });
/** Lines spoken when step i starts (after the welcome, step 0 says nothing). */
export function stepStartLines(c, i) {
  const s = c.steps[i], prev = c.steps[i - 1], nxt = c.steps[i + 1];
  if (!s || (s.kind === 'warm' && i === 0)) return [];
  if (s.kind === 'trans' || s.kind === 'water') {
    const out = [s.kind === 'water' ? { text: 'Water break. Grab a sip.', alts: [`${c.id}.water`, 'water.1'], kind: 'high' } : { text: 'Nice work.', alts: ['transition.2', 'rest.2'], kind: 'high' }];
    if (nxt) out.push(nxt.kind === 'cool' && s.kind !== 'cool' ? { text: 'Next up: the cool-down.', id: `class.${c.id}.${slug(nxt.name)}.next_short` } : nextLine(c, nxt));
    return out;
  }
  const intro = { text: introText(s), id: `class.${c.id}.${slug(s.name)}.intro` };
  if (s.kind === 'cool' && prev?.kind !== 'cool') return [{ text: 'Cool-down time.', alts: [`${c.id}.cool`, 'cooldown.start'], kind: 'high', talk: true }, { ...intro, talk: true }];
  return [{ ...intro, kind: 'high' }];
}
export const halfwayLine = s => ({ text: s.track === 'hold' ? 'Halfway. Keep breathing.' : 'Halfway there!' });
export const tenLine = s => ({ text: s.track === 'punch' ? '10 seconds, empty the tank!' : s.track === 'hold' ? '10 more seconds, breathe.' : '10 seconds left!', kind: 'high' });
export const countInLine = c => (c.eightCount ? { text: 'Five, six, seven, eight!', kind: 'high' } : { text: 'In three, two, one…', kind: 'high' });
export const layerLine = (s, L) => ({ text: `Layer it up: ${s.counts[L]}`, id: `layer.${slug(s.counts[L])}`, kind: 'high' });
export const cueLine = t => ({ text: t, id: `cue.${slug(t)}` });
/** End of class: the lead's recorded outro when the class was finished, then "more than last time" when it was. */
export function summaryLines(c, completed, improved) {
  const out = [completed ? { text: 'Class complete! Brilliant work. Your stats are on the screen. Remember to drink some water.', alts: [`${c.id}.outro`], preferAlts: true, kind: 'high' }
    : { text: 'Nice effort today. Your stats are on the screen. Remember to drink some water.', kind: 'high' }];
  if (improved) out.push({ text: 'And that\'s more than last time. Brilliant!' });
  return out;
}
export const CUE_EVERY = 14, CUE_GAP = 4, LAYER_EVERY = 16, COUNT_IN_AT = 4.5;

/** The scripted (camera-independent) speech of a whole class, timed like the app's classTick. Pose-driven feedback
 *  (form tips, rep counts, "guard up") needs a live camera, so it isn't in here. Returns [{ at, ...line, src }]. */
export function classTimeline(c) {
  const out = [], push = (at, l, src) => out.push({ at: Math.round(at * 100) / 100, ...l, src });
  push(0, welcomeLine(c), 'welcome');
  let lastSay = -1e9;
  c.steps.forEach((s, i) => {
    for (const l of stepStartLines(c, i)) push(s.at, l, 'step');
    const ev = []; // [elapsed, kind, payload]
    if (s.kind === 'main' && s.dur >= 60) ev.push([s.dur / 2, 'half']);
    if (s.kind === 'main') ev.push([s.dur - 10, 'ten']);
    if ((s.kind === 'trans' || s.kind === 'water') && c.steps[i + 1]) ev.push([s.dur - COUNT_IN_AT, 'countin']);
    if (s.cues?.length) for (let k = 1, at = CUE_EVERY; at < s.dur; k++, at += CUE_EVERY + 0.1) ev.push([at, 'cue', k - 1]);
    if (s.counts?.length > 1) for (let L = 1; L < s.counts.length && LAYER_EVERY * L < s.dur; L++) ev.push([LAYER_EVERY * L + 0.1, 'layer', L]);
    ev.sort((a, b) => a[0] - b[0]);
    for (const [e, k, p] of ev) {
      const at = s.at + e;
      if (k === 'half') { lastSay = at; push(at, halfwayLine(s), 'coach'); }
      else if (k === 'ten') push(at, tenLine(s), 'say');
      else if (k === 'countin') push(at, countInLine(c), 'say');
      else if (k === 'layer') { lastSay = at; push(at, layerLine(s, p), 'coach'); }
      else if (k === 'cue') { if (at - lastSay < CUE_GAP) continue; lastSay = at; push(at, { ...cueLine(s.cues[p % s.cues.length]), kind: 'coach' }, 'coach'); }
    }
  });
  push(c.total, summaryLines(c, true, false)[0], 'end');
  return out;
}

/* ---- recorded-line lookup (same rules as say() in app.js), for tools and tests ---- */
export const vnorm = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function voiceIndex(doc) {
  const byId = new Map(), byText = new Map();
  const list = Array.isArray(doc) ? doc : Array.isArray(doc?.lines) ? doc.lines : Object.values(doc?.lines || {});
  for (const e of list) { if (!e?.id) continue; const ts = e.trainer ? [e.trainer] : ['m', 'f']; for (const t of ts) { byId.set(`${t}|${e.id}`, e); if (e.text) byText.set(`${t}|${vnorm(e.text)}`, e); } }
  return { byId, byText };
}
/** -> array of manifest entries to play in order, or null (= phone voice). */
export function resolveLine(ix, l, t) {
  const find = () => { const b = l.id && ix.byId.get(`${t}|${l.id}`); if (b && (!b.text || vnorm(b.text) === vnorm(l.text))) return b; return ix.byText.get(`${t}|${vnorm(l.text)}`) || null; };
  const alt = () => { for (const x of l.alts || []) { const r = ix.byId.get(`${t}|${x}`) || ix.byText.get(`${t}|${vnorm(x)}`); if (r) return r; } return null; };
  let line = l;
  if (!l.id && !l.parts && l.kind === 'count' && /^\d+$/.test(l.text)) line = { ...l, ...countLine(+l.text) };
  const one = l.preferAlts ? alt() || find() : find() || alt();
  if (one) return [one];
  if (line.id && line.id !== l.id) { const b = ix.byId.get(`${t}|${line.id}`); if (b) return [b]; }
  if (line.parts?.length) { const r = line.parts.map(p => ix.byId.get(`${t}|${p}`)); if (r.every(Boolean)) return r; }
  return null;
}
