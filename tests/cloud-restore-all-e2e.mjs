import { cleanupTestData, sql } from './cleanup.mjs';
for (const ev of ['uncaughtException', 'unhandledRejection']) process.on(ev, async e => { console.error(e); await cleanupTestData({ quiet: true }).catch(() => {}); process.exit(1); });
// Populate EVERY user data type -> auto-sync (no manual button) -> wipe ALL app storage (localStorage + IndexedDB + caches,
// i.e. uninstall/reinstall) -> log in -> everything restored. Throwaway Supabase user, always cleaned up.
import { chromium, devices } from 'playwright-core';
import { nav } from './nav.mjs';
const URL = (process.argv[2] || 'http://localhost:8765/') + '?cloudauth=1';
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log(c ? 'ok  ' : 'FAIL', m); };
const s = Date.now(), E = `glp1life.test.restore${s}@example.com`, PW = 'Test-' + s;
const DATA = {
  weights: [{ date: '2026-08-01T08:00:00.000Z', kg: 100 }, { date: '2026-10-20T08:00:00.000Z', kg: 96.5 }], // incl. backdated
  injections: [{ id: 'i1', at: '2026-10-18T09:00:00.000Z', site: 'abdomen-left', dose: 'as prescribed' }],
  injectSchedule: { every: 7, day: 6, time: '09:00' }, injNotified: { last: '2026-10-18' },
  daily: { '2026-10-20': { waterMl: 1500, water: 6, steps: 6543, stepsSrc: 'manual' } },
  weekChecks: { '2026-W43': { mindset: true } }, food: { '2026-10-20': { breakfast: 'porridge' } },
  sessions: [{ at: '2026-10-19T18:00:00.000Z', totals: { squat: 12 } }], classes: [{ id: 'c1', at: '2026-10-19T19:00:00.000Z', done: true }], classSeen: { c1: 1 },
  myPlan: { days: 5, focus: 'High protein' }, certificates: [{ id: 'first2lb', label: 'First 2 lb lost', startKg: 100, currentKg: 96.5, lostKg: 3.5, date: '2026-10-20T08:00:00.000Z', name: 'Sia' }], shop: { items: [{ t: 'Oats', done: true }] }, cookProgress: { 'chilli': { i: 3, at: '2026-10-20T10:00:00.000Z' } },
};
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
try {
  const ctx = await b.newContext({ ...devices['Pixel 7'] }), p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message)); p.on('console', m => /cloud|sync|error/i.test(m.text()) && console.log('CON', m.text().slice(0, 200)));
  await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(1200);
  await p.click('#wCreate'); await p.fill('#regName', 'Sia'); await p.fill('#regEmail', E); await p.fill('#regSecret', PW); await p.click('#regBtn'); await p.waitForLoadState('load'); await p.waitForTimeout(2500);
  if (await p.isVisible('#obSkip')) await p.click('#obSkip');
  // populate through the app's store (same path the UI uses) so the auto-sync hook fires
  await p.evaluate(D => { const k = Object.keys(localStorage).find(k => /^kova\.u\.[^.]+\.settings$/.test(k)), pre = k.slice(0, -8);
    for (const [n, v] of Object.entries(D)) localStorage.setItem(pre + n, JSON.stringify(v));
    const st = JSON.parse(localStorage[k]); Object.assign(st, { goalKg: 80, heightCm: 170, waterGoalMl: 2500, weightUnit: 'st', formCheck: false }); localStorage[k] = JSON.stringify(st); }, DATA);
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(1500);
  // a change through the UI: +500 ml (auto-sync, no Sync button)
  await nav(p, 'workout'); await p.click('#waterPlus'); await p.waitForTimeout(7000);
  console.log('KEYS', await p.evaluate(() => Object.keys(localStorage).filter(k => /cloud/.test(k)).join(' ')));
  await nav(p, 'settings'); const saved = await p.textContent('#cloudSaved'); ok(/Saved to cloud ✓ \d\d:\d\d/.test(saved), `settings shows "${saved}"`);
  ok(!(await p.isVisible('#backupBtn')) && !(await p.isVisible('#restoreBtn')), 'no manual backup/restore buttons');
  ok(await p.isVisible('#cloudExport') && /GDPR/.test(await p.textContent('#cloudExport')), 'GDPR data export kept');
  await p.waitForTimeout(6000); const snap = () => p.evaluate(() => { const k = Object.keys(localStorage).find(k => /^kova\.u\.[^.]+\.settings$/.test(k)); if (!k) return null; const pre = k.slice(0, -8), o = {}; for (const x of Object.keys(localStorage)) if (x.startsWith(pre) && !/^(cloud\.|backup)/.test(x.slice(pre.length))) try { o[x.slice(pre.length)] = JSON.parse(localStorage[x]); } catch {} return o; });
  const before = await snap(); const certsBefore = before.certificates || [];
  // uninstall/reinstall: wipe everything
  await p.evaluate(async () => { localStorage.clear(); sessionStorage.clear(); for (const d of (await indexedDB.databases?.()) || [{ name: 'reta-coach' }]) await new Promise(r => { const q = indexedDB.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = r; }); for (const k of await caches.keys()) await caches.delete(k); });
  await ctx.clearCookies(); await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(1500);
  ok(await p.isVisible('#wLogin'), 'wiped: back at welcome');
  await p.click('#wLogin'); await p.fill('#loginEmail', E); await p.fill('#loginSecret', PW); await p.click('#loginBtn'); await p.waitForTimeout(10000); if (await p.isVisible('#obSkip')) await p.click('#obSkip');
  const got = await snap();
  ok(!!got, 'logged in profile exists');
  const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v, same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
  ok(got.weights?.length === 2 && got.weights.some(w => w.date === '2026-08-01T08:00:00.000Z' && w.kg === 100), 'weights incl. backdated');
  ok(got.injections?.some(i => i.id === 'i1' && i.site === 'abdomen-left'), 'injections');
  ok(!!got.injectSchedule && same(got.injectSchedule, before.injectSchedule), 'injection reminders schedule');
  ok(got.daily?.['2026-10-20']?.steps === 6543, 'steps'); ok(Object.values(got.daily || {}).some(d => d.waterMl >= 1500), 'hydration (ml)');
  for (const k of ['weekChecks', 'food', 'sessions', 'classes', 'classSeen', 'myPlan', 'shop', 'cookProgress', 'daily']) ok(before[k] != null && same(got[k], before[k]), k);
  const missing = Object.keys(before).filter(k => !same(got[k], before[k]) && !['settings', 'certificates', 'backupNudgeAt'].includes(k)); ok(!missing.length, 'every stored key restored identically ' + missing.join(',')); for (const k of [...missing, 'settings']) console.log('DIFF', k, JSON.stringify(before[k]).slice(0, 300), '=>', JSON.stringify(got[k]).slice(0, 300));
  ok((got.certificates || []).length === certsBefore.length && certsBefore.length > 0, `certificates (${certsBefore.length})`);
  ok(got.settings?.goalKg === 80 && got.settings?.heightCm === 170 && got.settings?.weightUnit === 'st' && got.settings?.name === 'Sia', 'settings (name, goal, height, units)');
  ok(await p.evaluate(() => Object.keys(localStorage).some(k => /cloud\.session$/.test(k))), 'stays signed in (session stored)');
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(1500); ok(!(await p.isVisible('#wLogin')) && !(await p.isVisible('#authScreen')), 'still signed in after relaunch');
} finally { await b.close(); await cleanupTestData({ quiet: true }).catch(() => {}); }
console.log(fail ? `${fail} FAILED` : 'ALL CLOUD RESTORE-EVERYTHING TESTS PASSED'); process.exit(fail ? 1 : 0);
