import { findWake, nextDelay } from '../voice.js';
let fail = 0; const t = (c, m) => { if (!c) fail++; console.log(c ? 'ok  ' : 'FAIL', m); };
for (const s of ['hey reta', 'Hey Reta, pause', 'hey rita pause', 'hey retta next', 'hey reeta resume', 'hey rhetta end', 'hey reda next', 'hey rida pause', 'hey ritter next', 'hey rater pause', 'hey greta next', 'hey beta pause', 'a reta pause', 'okay reta resume', 'heyreta start workout', 'reta pause', "hey reta what should I prep", 'um hey reta end'])
  t(findWake(s), `wake: "${s}" -> rest "${findWake(s)?.rest}"`);
for (const s of ['next up wall push-ups', 'pause', 'beta blockers', 'rita ora is great', 'greta was here', 'i read a book']) t(!findWake(s), `no wake: "${s}"`);
t(findWake('hey rita pause').rest === 'pause', 'rest extracted');
t(nextDelay(1) === 250 && nextDelay(10) === 5000, 'backoff');
process.exitCode = fail ? 1 : 0; console.log(fail ? `${fail} failed` : 'all voice tests passed');
