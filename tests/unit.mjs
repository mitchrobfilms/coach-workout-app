import { RepCounter, KneeLiftCounter, CoachEngine } from '/workspace/coach-app/logic.js';
import { analyseDay, streak, dayKey } from '/workspace/coach-app/food.js';
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
// squat: 170 -> 90 -> 170 twice, with jitter around thresholds
const seq = (pts, step = 2) => { const out = []; for (let i = 1; i < pts.length; i++) { const [a, b] = [pts[i - 1], pts[i]]; const n = Math.abs(b - a) / step; for (let k = 0; k <= n; k++) out.push(a + (b - a) * k / n + (k % 2 ? 1.5 : -1.5)); } return out; };
let rc = new RepCounter({ mode: 'dip', top: 160, bottom: 100, shallowBand: [100, 120] }); let t = 0, evs = [];
for (const v of seq([170, 90, 170, 90, 170])) { const e = rc.update(v, t += 33); if (e) evs.push(e); }
assert(rc.reps === 2, `squat 2 reps counted (got ${rc.reps})`);
rc = new RepCounter({ mode: 'dip', top: 160, bottom: 100, shallowBand: [100, 120] }); evs = [];
for (const v of seq([170, 110, 170])) { const e = rc.update(v, t += 33); if (e) evs.push(e); }
assert(rc.reps === 0 && evs[0]?.type === 'shallow', 'shallow squat flagged, not counted');
rc = new RepCounter({ mode: 'rise', top: 165, bottom: 140, shallowBand: [148, 165] });
for (const v of seq([130, 172, 130, 172, 130, 155, 130])) { const e = rc.update(v, t += 33); if (e) evs.push(e); }
assert(rc.reps === 2 && evs.some(e => e.type === 'shallow'), `bridge 2 reps + shallow flag (got ${rc.reps})`);
// jitter at bottom shouldn't double count
rc = new RepCounter({ mode: 'dip', top: 150, bottom: 110 });
for (const v of [160, 140, 120, 105, 112, 104, 115, 106, 130, 152, 148, 153, 151]) rc.update(v, t += 100);
assert(rc.reps === 1, 'push-up jitter counted once');
const kl = new KneeLiftCounter(); const P = (ky, side) => { const lm = []; for (let i = 0; i < 33; i++) lm[i] = { x: .5, y: .5, visibility: .9 }; lm[11].y = lm[12].y = .3; lm[23].y = lm[24].y = .55; lm[25].y = lm[26].y = .75; lm[side].y = ky; return lm; };
for (const [ky, s] of [[.75, 25], [.5, 25], [.75, 25], [.5, 26], [.75, 26], [.52, 25]]) kl.update(P(ky, s), t += 400);
assert(kl.reps === 3, `knee lifts per side (got ${kl.reps})`);
// coach throttling and rotation
let clock = 0; const said = []; const c = new CoachEngine({ say: x => said.push(x), now: () => clock });
c.line('greet', { force: true }); assert(/Mitchell/.test(said[0]) && /Kova/.test(said[0]), 'greets Mitchell as Kova');
c.line('slow'); clock += 1000; c.line('idle'); assert(said.length === 1, 'throttle blocks within 4s');
const s1 = c.pick('slow'), s2 = c.pick('slow'); assert(s1 !== s2, 'phrases rotate');
clock += 5000; const r = c.onFrame({ move: 'squat', result: { ready: true, events: [{ type: 'rep', reps: 5, ms: 1500 }], flags: [] }, timeLeft: 20, counted: true }); assert(/five/i.test(r), 'milestone at 5');
clock += 5000; assert(/10 seconds|finish strong|keep going|you can do it/i.test(c.onFrame({ move: 'squat', result: { ready: true, events: [] }, timeLeft: 9.5, counted: true })), '10 seconds line');
clock += 5000; c.startWork(); clock += 9000; assert(/got this|keep/i.test(c.onFrame({ move: 'squat', result: { ready: true, events: [] }, timeLeft: 25, counted: true }) || ''), 'inactivity nudge');
clock += 5000; assert(/slow|time|tempo/i.test(c.onFrame({ move: 'pushup', result: { ready: true, events: [{ type: 'rep', reps: 3, ms: 600 }] }, timeLeft: 20, counted: true }) || ''), 'fast tempo -> slow');
console.log(c.summary({ squat: 12, pushup: 10 }, { totals: { squat: 8, pushup: 10 } }, { squat: 'sit-to-stand squats' }));
// food
const d = analyseDay({ breakfast: '', lunch: 'mcdonalds large fries and burger', dinner: 'chicken, rice and broccoli', snacks: 'chocolate', drinks: 'coke and water' }, { glp1: true });
console.log('food score', d.score, d.headline);
console.log(JSON.stringify(Object.fromEntries(Object.entries(d.meals).map(([k, v]) => [k, v.flags.map(f => f.k)]))));
assert(d.meals.breakfast.flags[0].k === 'skip' && /GLP-1/.test(d.meals.breakfast.flags[0].msg), 'skipped meal + GLP-1 note');
assert(d.meals.dinner.ok, 'balanced dinner OK');
assert(d.meals.lunch.flags.some(f => f.k === 'fried') && d.meals.lunch.swaps.length >= 2, 'takeaway flagged with swaps');
assert(analyseDay({ drinks: 'diet coke' }).meals.drinks.flags.length === 0, 'diet coke not flagged');
assert(analyseDay({ breakfast: 'dal and chapati with spinach' }).meals.breakfast.found.protein.length > 0, 'veggie protein recognised');
const h = {}; const day = new Date(); for (let i = 0; i < 3; i++) { const x = new Date(day); x.setDate(x.getDate() - i); h[dayKey(x)] = {}; }
assert(streak(h) === 3, 'streak 3');
const all = JSON.stringify(await import('/workspace/coach-app/food.js')) + (await import('fs')).readFileSync('/workspace/coach-app/app.js', 'utf8') + (await import('fs')).readFileSync('/workspace/coach-app/index.html', 'utf8');
assert(!/dumbbell|resistance band|yoga mat|buy a/i.test(all), 'no equipment-to-buy mentions');
