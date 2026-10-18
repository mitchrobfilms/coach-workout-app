import { buildLibrary, buildClass, isNewClass, TOTAL, kcal, classKcal, recommend, PunchCounter, RhythmMeter, matchPose, HoldTracker, makePilates } from '../classes.js';
import fs from 'node:fs';
const LIB = JSON.parse(fs.readFileSync(new URL('../library.json', import.meta.url), 'utf8'));
const CLASSES = buildLibrary(LIB);
import { patternEvents } from '../music.js';
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log(c ? 'ok  ' : 'FAIL', m); };
const sum = a => a.reduce((t, s) => t + s.dur, 0);

// ---- scripts: EXACTLY 30:00 each ----
ok(CLASSES.map(c => c.id).join() === 'boxing,dance,latin,yoga,pilates', 'five classes');
for (const c of CLASSES) {
  ok(sum(c.steps) === 1800 && c.total === 1800 && TOTAL === 1800, `${c.id}: script sums to exactly 1800s (30:00), got ${sum(c.steps)}`);
  ok(sum(c.steps.filter(s => s.kind === 'warm')) === 300, `${c.id}: warm-up 300s`);
  ok(sum(c.steps.filter(s => s.kind === 'cool')) === 300, `${c.id}: cool-down 300s`);
  ok(sum(c.steps.filter(s => ['main', 'trans', 'water'].includes(s.kind))) === 1200, `${c.id}: main 1200s incl. transitions/water`);
  ok(c.steps.filter(s => s.kind === 'main').every(s => s.dur >= 45 && s.dur <= 90), `${c.id}: blocks 45–90s`);
  ok(c.steps.filter(s => s.kind === 'trans' || s.kind === 'water').every(s => s.dur === 15) && c.steps.some(s => s.kind === 'water'), `${c.id}: 15s transitions + water breaks`);
  ok(c.steps.every(s => s.name && s.how && s.met > 0), `${c.id}: every step has name/how/MET`);
}
const lead = Object.fromEntries(CLASSES.map(c => [c.id, c.lead]));
ok(lead.boxing === 'm' && lead.pilates === 'm' && lead.dance === 'f' && lead.yoga === 'f' && lead.latin === 'f', 'lead trainers: m boxing/pilates, f dance/yoga/latin');
ok(CLASSES.find(c => c.id === 'latin').name === 'Latin Dance Cardio (Zumba-style)', 'Latin label');
ok(CLASSES.every(c => !c.problems.length), 'library entries have no problems: ' + CLASSES.flatMap(c => c.problems).join('; '));
ok(LIB.classes.every(e => e.id && e.title && e.category && e.trainer && e.duration === 1800 && e.intensity && e.poster && 'drive_file_id' in e && e.added && e.script), 'library.json entries have id/title/category/trainer/duration/intensity/poster/drive_file_id/added/script');
ok(LIB.classes.every(e => /^[\w-]{25,}$/.test(e.drive_file_id)) && new Set(LIB.classes.map(e => e.drive_file_id)).size === LIB.classes.length, 'every class has its own Google Drive file id');
const extra = buildClass({ id: 'test', title: 'Test', trainer: 'f', music: { style: 'dance', bpm: 120 }, track: 'rhythm', script: { warm: [{ name: 'A', dur: 60 }], main: [{ name: 'B', dur: 60 }], cool: [{ name: 'C', dur: 60 }] } });
ok(extra.total === 195 && extra.steps.length === 4 && extra.eightCount && extra.primary === 'rhythm', 'a new class builds from data alone (no code change)');
ok(buildClass({ id: 'bad', script: { main: [{ name: 'x' }] } }).problems.length > 0, 'bad entries report problems instead of throwing');
ok(isNewClass({ id: 'a', added: new Date().toISOString() }, ['a']) && isNewClass({ id: 'b', added: '2020-01-01' }, []) && !isNewClass({ id: 'c', added: '2020-01-01' }, ['c']), 'New badge: added within 14 days or not yet seen');
ok(CLASSES.find(c => c.id === 'dance').steps.filter(s => s.kind === 'main').every(s => s.counts?.length), 'dance blocks have 8-count layers');
ok(new Set(CLASSES.find(c => c.id === 'latin').steps.filter(s => s.kind === 'main').map(s => s.bpm)).size >= 4 && CLASSES.find(c => c.id === 'latin').steps.every(s => s.bpm >= 96 && s.bpm <= 130), 'Latin bpm varies by section, 100–130');
ok(CLASSES.find(c => c.id === 'boxing').bpm === 120 && CLASSES.find(c => c.id === 'dance').bpm === 124, 'boxing 120, dance 124 bpm');
ok(['chair', 'warrior2', 'tree'].every(p => CLASSES.find(c => c.id === 'yoga').steps.some(s => s.pose === p)), 'yoga has chair, warrior II, tree holds');
ok(['bridge', 'legLift', 'clam', 'birddog'].every(r => CLASSES.find(c => c.id === 'pilates').steps.some(s => s.rep === r)) && CLASSES.find(c => c.id === 'pilates').steps.some(s => s.track === 'plank'), 'pilates: bridges, leg lifts, clams, bird dog + plank');
ok(!JSON.stringify(CLASSES).match(/dumbbell|kettlebell|resistance band|jump(ing)? jack|burpee/i), 'no equipment / no high-impact moves');

// ---- calories / recommend / music ----
ok(Math.abs(kcal(5.5, 80, 60) - 7.7) < 0.01, 'kcal = MET × 3.5 × kg / 200 per minute');
ok(classKcal(CLASSES[0], 90) > classKcal(CLASSES[3], 90), 'boxing burns more than yoga (approx.)');
const r1 = recommend(CLASSES, { lowEnergy: true, glp1: true, history: [{ cls: 'yoga', date: new Date().toISOString() }] });
ok(r1.cls.id === 'pilates' && /GLP-1/.test(r1.why), 'low energy + GLP-1 -> gentle class not done recently: ' + r1.cls.id);
ok(recommend(CLASSES, { history: [] }).cls, 'recommend works with no history');
ok(patternEvents('boxing', 0, 4).filter(e => e.type === 'kick').length === 4 && patternEvents('ambient', 0, 8).some(e => e.type === 'pad') && patternEvents('latin', 0, 8).some(e => e.type === 'clave'), 'music patterns: kick 4/4, pads, clave');

// ---- synthetic poses ----
const P = o => { const a = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1 })); for (const [k, v] of Object.entries(o)) a[k] = { z: 0, visibility: 1, ...v }; return a; };
const base = { 11: { x: .58, y: .3 }, 12: { x: .42, y: .3 }, 23: { x: .55, y: .55 }, 24: { x: .45, y: .55 }, 25: { x: .55, y: .72 }, 26: { x: .45, y: .72 }, 27: { x: .55, y: .9 }, 28: { x: .45, y: .9 } };
const guardArms = { 13: { x: .6, y: .42 }, 15: { x: .56, y: .3, z: -.1 }, 14: { x: .4, y: .42 }, 16: { x: .44, y: .3, z: -.1 } };
// punches
{
  const pc = new PunchCounter(); let t = 0;
  const frame = (arms) => { const lm = P({ ...base, ...arms }); pc.frame(lm, lm, t); t += 33; };
  for (let rep = 0; rep < 6; rep++) {
    for (let i = 0; i < 8; i++) frame(guardArms);
    const side = rep % 2 ? 'R' : 'L';
    const ext = side === 'L' ? { 13: { x: .58, y: .3, z: -.2 }, 15: { x: .58, y: .3, z: -.45 } } : { 14: { x: .42, y: .3, z: -.2 }, 16: { x: .42, y: .3, z: -.45 } };
    for (let i = 0; i < 5; i++) frame({ ...guardArms, ...ext });
  }
  for (let i = 0; i < 8; i++) frame(guardArms);
  ok(pc.left === 3 && pc.right === 3, `punches counted per side: L ${pc.left} R ${pc.right}`);
  let flagged = false; for (let i = 0; i < 50; i++) { const lm = P({ ...base, 13: { x: .6, y: .45 }, 15: { x: .6, y: .58 }, 14: { x: .4, y: .45 }, 16: { x: .4, y: .58 } }); if (pc.frame(lm, lm, t).flags.includes('guard')) flagged = true; t += 33; }
  ok(flagged && pc.guardOk < 0.9, 'hands dropped -> "guard" flag, guard score falls');
}
// rhythm
for (const [label, shift, wantHi] of [['on-beat', 0, true], ['off-beat', 0.5, false]]) {
  const rm = new RhythmMeter(), Pd = 500; let x = .5, r;
  const beat = { period: Pd, phase: t => ((t / Pd) % 1 + 1) % 1, count: t => Math.floor(t / Pd) % 8 + 1 };
  const sig = z => 1 / (1 + Math.exp(-z));
  for (let t = 0; t < 16000; t += 33) {
    let dx = 0; for (let k = 0; k < 40; k++) { const bc = (k + shift) * Pd; const dir = (Math.floor(k) % 8) < 4 ? -1 : 1; dx += dir * 0.04 * sig((t - bc) / 40); }
    x = .5 + dx; const o = {}; for (const [k, v] of Object.entries(base)) o[k] = { x: v.x + (x - .5), y: v.y }; Object.assign(o, { 13: { x: .6 + x - .5, y: .45 }, 15: { x: .62 + x - .5, y: .55 }, 14: { x: .4 + x - .5, y: .45 }, 16: { x: .38 + x - .5, y: .55 } });
    r = rm.frame(P(o), t, beat, 'RRRRLLLL');
  }
  ok(wantHi ? r.rhythm > 0.6 : r.rhythm < 0.3, `${label} rhythm ${r.rhythm.toFixed(2)} (score ${r.score})`);
  if (wantHi) ok(rm.dirScore > 0.7, `direction match R/L: ${rm.dirScore.toFixed(2)}`);
}
// yoga pose matching
const W2 = P({ ...base, 23: { x: .55, y: .55 }, 25: { x: .65, y: .7 }, 27: { x: .75, y: .85 }, 24: { x: .45, y: .55 }, 26: { x: .33, y: .62 }, 28: { x: .3, y: .85 }, 15: { x: .85, y: .3 }, 16: { x: .15, y: .3 }, 13: { x: .7, y: .3 }, 14: { x: .3, y: .3 } });
ok(matchPose('warrior2', W2, W2).ok, 'warrior II matched');
const W2bad = P({ ...base, 27: { x: .75, y: .9 }, 28: { x: .25, y: .9 }, 25: { x: .65, y: .72 }, 26: { x: .35, y: .72 } });
ok(!matchPose('warrior2', W2bad, W2bad).ok && /knee/.test(matchPose('warrior2', W2bad, W2bad).tip), 'warrior II straight legs -> bend front knee tip');
const chairW = P({ ...base, 23: { x: .55, y: .6, z: .15 }, 24: { x: .45, y: .6, z: .15 }, 25: { x: .55, y: .75, z: -.05 }, 26: { x: .45, y: .75, z: -.05 }, 27: { x: .55, y: .92 }, 28: { x: .45, y: .92 } });
const stand = P(base);
ok(matchPose('chair', chairW, chairW).ok, 'chair pose matched');
ok(matchPose('chair', stand, stand).tip === 'Sink a bit lower into the chair pose', 'standing tall -> "Sink a bit lower into the chair pose"');
const tree = P({ ...base, 28: { x: .5, y: .78 }, 26: { x: .4, y: .7 } });
ok(matchPose('tree', tree, tree).ok && !matchPose('tree', stand, stand).ok, 'tree pose: lifted foot matched, two feet down not');
{
  const h = new HoldTracker('chair'); for (let t = 0; t <= 3000; t += 33) h.frame(chairW, chairW, t);
  ok(h.held > 2.5 && h.held < 3.2, `hold timer counts while in pose: ${h.held.toFixed(1)}s`);
  const h2 = new HoldTracker('chair'); for (let t = 0; t <= 3000; t += 33) h2.frame(stand, stand, t);
  ok(h2.held === 0, 'hold timer does not count out of pose');
  const h3 = new HoldTracker('chair'); for (let t = 0, k = 0; t <= 3000; t += 33, k++) { const j = k % 2 ? .04 : -.04; const lm = P(Object.fromEntries(Object.entries({ ...base, 23: { x: .55, y: .6, z: .15 }, 24: { x: .45, y: .6, z: .15 }, 25: { x: .55, y: .75, z: -.05 }, 26: { x: .45, y: .75, z: -.05 }, 27: { x: .55, y: .92 }, 28: { x: .45, y: .92 } }).map(([i, v]) => [i, { ...v, x: v.x + j }]))); h3.frame(lm, lm, t); }
  ok(h3.held < 0.5, 'hold timer does not count while wobbling: ' + h3.held.toFixed(1));
}
// pilates
{
  const a = makePilates('legLift'); let t = 0;
  for (let rep = 0; rep < 4; rep++) for (let i = 0; i <= 60; i++) { const th = 40 * Math.sin(Math.PI * i / 60) * Math.PI / 180; const lm = P({ 23: { x: .5, y: .5 }, 24: { x: .5, y: .5 }, 28: { x: .9, y: .5 }, 27: { x: .5 + .4 * Math.cos(th), y: .5 - .4 * Math.sin(th) } }); a.frame(lm, lm, t); t += 33; }
  ok(a.rc.reps === 4, 'side-lying leg lifts counted: ' + a.rc.reps);
  const pl = makePilates('plank'); for (let t2 = 0; t2 <= 2000; t2 += 33) { const lm = P({ 11: { x: .2, y: .5 }, 23: { x: .5, y: .52 }, 25: { x: .75, y: .55 } }); pl.frame(lm, lm, t2); }
  ok(pl.hold.held > 1.8, 'plank hold counts in a straight line: ' + pl.hold.held.toFixed(1));
  const sag = makePilates('plank'); let r; for (let t2 = 0; t2 <= 2000; t2 += 33) { const lm = P({ 11: { x: .2, y: .5 }, 23: { x: .5, y: .7 }, 25: { x: .75, y: .55 } }); r = sag.frame(lm, lm, t2); }
  ok(sag.hold.held === 0 && /straight line/.test(r.tip), 'sagging plank not counted, tip given');
  const br = makePilates('bridge'); ok(br.rc && typeof br.frame === 'function', 'bridge analyser available');
}
process.exitCode = fail ? 1 : 0; console.log(fail ? `${fail} FAILED` : 'all class tests passed');
