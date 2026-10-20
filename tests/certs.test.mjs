import { milestonesFor, newAwards, drawCertificate, encouragement } from '../certs.js';
import { makeBackup, parseBackup, restoreInto } from '../backup.js';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const ids = (s, c, g) => milestonesFor(s, c, g).map(m => m.id);
ok(ids(100, 99.5).length === 0, 'nothing below 2 lb');
ok(ids(100, 99.0).join() === 'first2lb,kg1', 'first 2 lb + 1 kg');
ok(ids(100, 93.6).includes('st1') && ids(100, 93.6).includes('kg6') && !ids(100, 93.6).includes('kg7') && ids(100, 93.6).includes('pct5'), '1 stone, every kg, 5%');
ok(milestonesFor(100, 93.6).find(m => m.id === 'st1').label === 'Lost 1 stone (6.4 kg)', 'stone label with kg');
ok(ids(100, 89).includes('pct10') && !ids(100, 89).includes('pct15'), '10% at 10 kg of 100');
ok(ids(100, 85, 85).includes('goal') && !ids(100, 86, 85).includes('goal'), 'goal reached');
let certs = newAwards([], 100, 98.8, null, { name: 'Mitchell' }); ok(certs.map(c => c.id).join() === 'first2lb,kg1', 'first awards');
// fluctuation: up then down again -> no duplicates, nothing revoked
ok(newAwards(certs, 100, 99.6, null).length === 0, 'weight up: nothing new, nothing removed');
ok(newAwards(certs, 100, 98.9, null).length === 0, 'back down: kg1 not re-awarded');
const more = newAwards(certs, 100, 97.9, null); ok(more.map(c => c.id).join() === 'kg2' && more[0].lostKg === 2.1, 'next kg awarded once, loss from start');
// drawing (mock 2D context)
const calls = []; const ctx = new Proxy({}, { get: (t, k) => k in t ? t[k] : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...a) => calls.push([k, ...a]), set: (t, k, v) => (t[k] = v, true) });
drawCertificate(ctx, { ...more[0], name: 'Mitchell' }); const text = calls.filter(c => c[0] === 'fillText').map(c => c[1]).join(' | ');
ok(/Mitchell/.test(text) && /Lost 2 kg/.test(text) && /100\.0 kg  →  97\.9 kg/.test(text) && /GLP1 Life/.test(text) && !/Reta/.test(text) && text.includes(encouragement('kg2')), 'certificate has name, milestone, start→current, branding, encouragement');
const dst = {}; restoreInto(k => dst[k] ?? null, (k, v) => { dst[k] = v; }, parseBackup(makeBackup(k => k === 'certificates' ? certs : null)).backup);
ok(dst.certificates?.length === 2, 'certificates in backup/restore');
console.log(fail ? `${fail} FAILED` : 'ALL CERTIFICATE TESTS PASSED'); process.exitCode = fail ? 1 : 0;

// --- backdated history: certificate date = weigh-in date, chronological ---
import { awardsFromHistory } from '../certs.js';
import { sortEntries } from '../progress.js';
{
  const raw = [{ date: '2026-03-01T09:00:00Z', kg: 100 }, { date: '2026-01-01T09:00:00Z', kg: 104 }, { date: '2026-02-01T09:00:00Z', kg: 102 }];
  const w = sortEntries(raw), got = awardsFromHistory([], w, null, { name: 'M' });
  const first = got.find(c => c.id === 'first2lb'), k4 = got.find(c => c.id === 'kg4');
  if (!first || first.date !== '2026-02-01T09:00:00Z' || first.startKg !== 104) throw new Error('first2lb should be dated Feb (backdated weigh-in)');
  if (!k4 || k4.date !== '2026-03-01T09:00:00Z') throw new Error('kg4 should be dated Mar');
  if (awardsFromHistory(got, w, null).length) throw new Error('no duplicate awards');
  if (awardsFromHistory([], w.slice(0, 1), null).length) throw new Error('needs 2 weigh-ins');
  console.log('ok awardsFromHistory backdated');
}
import { redateCerts } from '../certs.js';
{ const w = sortEntries([{ date: '2026-01-01T09:00:00Z', kg: 104 }, { date: '2026-10-20T09:00:00Z', kg: 100 }]);
  const c = awardsFromHistory([], w, null); const w2 = sortEntries([...w, { date: '2026-05-01T09:00:00Z', kg: 101 }]);
  const r = redateCerts(c, w2, null); if (r.find(x => x.id === 'first2lb').date !== '2026-05-01T09:00:00Z' || r.find(x => x.id === 'kg4').date !== '2026-10-20T09:00:00Z' || r.length !== c.length) throw new Error('redate');
  if (redateCerts(c, sortEntries([w[0], { date: '2026-02-01T09:00:00Z', kg: 103.5 }]), null).length !== c.length) throw new Error('never revoke');
  console.log('ok redateCerts after backfill'); }
