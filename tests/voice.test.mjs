import { findWake, nextDelay } from '../voice.js';
let fail = 0; const t = (c, m) => { if (!c) fail++; console.log(c ? 'ok  ' : 'FAIL', m); };
for (const s of ['hey kova', 'Hey Kova, pause', 'hey cover pause', 'hey nova next', "hey coba what's next", 'okay cova resume', 'heykova start workout', 'kova pause', 'hey Kovah how many reps', 'hey coffer next', 'um hey kova end'])
  t(findWake(s), `wake: "${s}" -> rest "${findWake(s)?.rest}"`);
for (const s of ['next up wall push-ups', 'pause', 'i love my cover band', 'super nova']) t(!findWake(s), `no wake: "${s}"`);
t(findWake('hey cover pause').rest === 'pause', 'rest extracted');
t(nextDelay(1) === 250 && nextDelay(10) === 5000, 'backoff');
process.exitCode = fail ? 1 : 0; console.log(fail ? `${fail} failed` : 'all voice tests passed');
