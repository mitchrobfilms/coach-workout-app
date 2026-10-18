// Every line Reta can say during a class must have a recording in the class trainer's voice (or chain from recorded
// number + phrase clips). Prints the coverage and fails on any gap.
import assert from 'node:assert/strict'; import fs from 'node:fs';
import { buildLibrary } from '../classes.js'; import { LINES } from '../voicelines.js';
import { classTimeline, voiceIndex, resolveLine, countLine, punchesLine, heldLine, soFarLine, summaryLines, numberParts, nextLine } from '../classvoice.js';
const R = p => new URL('../' + p, import.meta.url);
const lib = buildLibrary(JSON.parse(fs.readFileSync(R('library.json'))));
const man = JSON.parse(fs.readFileSync(R('media/voice/voice-manifest.json')));
const ix = voiceIndex(man);
for (const e of Object.values(man.lines)) assert.ok(fs.existsSync(R(e.file)), 'file exists ' + e.file);
// numbers
assert.deepEqual(numberParts(7), ['num.7']); assert.deepEqual(numberParts(342), ['num.ha3', 'num.42']); assert.deepEqual(numberParts(300), ['num.h3']);
assert.deepEqual(numberParts(1205), ['num.k1', 'num.ha2', 'num.5']); assert.deepEqual(numberParts(2000), ['num.k2']); assert.equal(numberParts(-1), null);
assert.equal(countLine(12).id, 'count.12'); assert.equal(countLine(61).parts.join(), 'num.61');
const live = [ // camera-driven / voice-command lines (texts exactly as app.js / classes.js say them)
  'Guard up! Hands back to your cheeks.', 'Great rhythm! You\'re right on the beat.', 'Keep moving. Small steps are perfect.', 'Listen for the kick drum and step with it.',
  'Find a still point to look at. Breathe.', 'Slower and more controlled.', 'Lift a little higher, squeeze your glutes.', 'A little bigger range, still slow.',
  ...Object.entries(LINES).filter(([k]) => /^(pose|plank)\./.test(k)).map(([, v]) => v),
  'Paused. Say resume when you\'re ready.', 'And we\'re back.', 'Skipping ahead.', 'Let\'s finish this one first.', 'We\'re already going!', 'That\'s the end of the class.',
  'Sorry, I didn\'t catch that. Try pause, next, resume, or what\'s next.', 'Music off.', 'Let\'s log food after the workout.', 'Let\'s plan your prep after the workout.',
  'Let\'s look at the shopping list after the workout.', 'Weigh-in saved. Remember, it\'s the trend over weeks that matters.', 'Sure. What do you weigh today? You can say kilos, pounds, or stone.',
  'Got it, weigh-in saved.', 'Sorry, I didn\'t catch a number. You can type it on the Progress tab.',
  ...Array.from({ length: 10 }, (_, k) => [`Music up, ${(k + 1) * 10} percent.`, `Music down, ${(k + 1) * 10} percent.`]).flat(),
].map(text => ({ text }));
for (let n = 1; n <= 120; n++) live.push(countLine(n));
for (let n = 25; n <= 2000; n += 25) live.push(punchesLine(n));
for (let n = 20; n <= 300; n += 20) live.push(heldLine(n));
for (const [m, k] of [[0, 3], [57, 120], [348, 251], [1234, 410]]) for (const nm of ['punches', 'on-beat moves', 'seconds held', 'reps']) live.push(soFarLine(m, nm, k));
let total = 0, ok = 0; const gaps = [];
const check = (l, t, where) => { total++; if (resolveLine(ix, l, t)) ok++; else gaps.push(`${where} [${t}] ${l.text}`); };
for (const c of lib) {
  for (const l of classTimeline(c)) check(l, c.lead, c.id);
  for (const l of [...summaryLines(c, true, true), ...summaryLines(c, false, false)]) check(l, c.lead, c.id + ' end');
  for (const s of c.steps.filter(s => s.kind !== 'trans' && s.kind !== 'water')) check({ ...nextLine(c, s), kind: 'high' }, c.lead, c.id + ' what\'s next');
  for (const l of live) check(l, c.lead, c.id + ' live');
}
for (const t of ['m', 'f']) for (const l of live) check(l, t, 'generic');
const pct = (100 * ok / total).toFixed(2);
console.log(`in-class voice coverage: ${ok}/${total} lines recorded (${pct}%)`);
if (gaps.length) console.log([...new Set(gaps)].slice(0, 40).join('\n'));
assert.equal(gaps.length, 0, 'every in-class line has a recording');
// recorded line text must match LINES so ID lookups work
for (const [id, text] of Object.entries(LINES)) for (const t of ['m', 'f']) { const e = ix.byId.get(`${t}|${id}`); if (e) assert.equal(e.text, text, `manifest text for ${t}/${id}`); }
console.log('voice coverage tests passed');
