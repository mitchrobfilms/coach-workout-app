// Welcome -> Create account (Supabase sign-up) -> data syncs; fresh phone -> Log in restores; forgot password request. Throwaway user, cleaned up.
import { chromium, devices } from 'playwright-core';
import { nav } from './nav.mjs';
const URL = (process.argv[2] || 'http://localhost:8765/') + '?cloudauth=1', REF = 'paxukvgdavcolzkvcapo';
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log(c ? 'ok  ' : 'FAIL', m); };
const sql = async q => (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: 'POST', headers: { authorization: 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ query: q }) })).json();
const s = Date.now(), E = `glp1life.test.signup${s}@example.com`, PW = 'Test-' + s;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
try {
  const p = await (await b.newContext({ ...devices['Pixel 7'] })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(1200);
  ok(await p.isVisible('#wCreate') && await p.isVisible('#wLogin'), 'welcome offers Create account + Log in');
  await p.click('#wCreate'); await p.fill('#regName', 'Sia'); await p.fill('#regEmail', E); await p.fill('#regSecret', '4321'); await p.click('#regBtn'); await p.waitForTimeout(800);
  ok(/8 characters/.test(await p.textContent('#regError')), 'cloud sign-up needs 8+ char password');
  await p.fill('#regSecret', PW); await p.click('#regBtn'); await p.waitForLoadState('load'); await p.waitForTimeout(2500);
  if (await p.isVisible('#obSkip')) await p.click('#obSkip');
  console.log('REGERR', await p.textContent('#regError').catch(() => '-')); ok((await sql(`select count(*)::int n from auth.users where email='${E}'`))[0]?.n === 1, 'Supabase account created');
  ok(await p.evaluate(() => Object.keys(localStorage).some(k => /^kova\.u\..+cloud\.session$/.test(k))), 'cloud session attached to the new profile');
  if (await p.isVisible('#obSkip')) await p.click('#obSkip');
  await p.evaluate(() => { const k = Object.keys(localStorage).find(k => /^kova\.u\.[^.]+\.settings$/.test(k)).replace(/settings$/, 'weights'); localStorage.setItem(k, JSON.stringify([{ date: '2026-10-20T08:00:00Z', kg: 91.2 }])); });
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(1500); await nav(p, 'settings'); await p.click('#cloudSync'); await p.waitForTimeout(4000);
  ok((await sql(`select count(*)::int n from public.weights w join auth.users u on u.id=w.user_id where u.email='${E}'`))[0]?.n >= 1, 'weigh-in synced to cloud');
  // fresh phone: log in
  const q = await (await b.newContext({ ...devices['Pixel 7'] })).newPage(); q.on('pageerror', e => errs.push(e.message));
  await q.goto(URL, { waitUntil: 'load' }); await q.waitForTimeout(1000); await q.click('#wLogin');
  let rec = null; await q.route('**/auth/v1/recover**', r => { rec = r.request().postDataJSON(); r.fulfill({ status: 200, body: '{}' }); });
  await q.fill('#loginEmail', E); await q.click('#forgotBtn'); await q.waitForTimeout(600); ok(rec?.email === E, 'Forgot password -> Supabase reset email');
  await q.fill('#loginSecret', 'wrong-password'); await q.click('#loginBtn'); await q.waitForTimeout(2500); console.log('WRONG', await q.textContent('#loginError')); ok(/wrong|invalid/i.test(await q.textContent('#loginError')), 'wrong password rejected');
  await q.fill('#loginSecret', PW); await q.click('#loginBtn'); await q.waitForTimeout(9000); if (await q.isVisible('#obSkip')) await q.click('#obSkip');
  const w = await q.evaluate(() => { const k = Object.keys(localStorage).find(k => /^kova\.u\.[^.]+\.weights$/.test(k)); return k ? JSON.parse(localStorage[k]) : []; });
  const cw = await sql(`select w.id, w.deleted from public.weights w join auth.users u on u.id=w.user_id where u.email='${E}'`); console.log('CLOUDW', JSON.stringify(cw), 'LOCALW', JSON.stringify(w), await q.evaluate(() => Object.keys(localStorage).filter(k => /weights|tomb/.test(k)).map(k => k + '=' + localStorage[k]).join(' | ')));
  ok(w.some(x => Math.abs(x.kg - 91.2) < .01), 'fresh phone log in restores cloud data');
  ok(!errs.length, 'no page errors ' + errs.join(' | '));
} finally { await b.close(); await sql(`delete from auth.users where email='${E}'`); }
console.log(fail ? `${fail} FAILED` : 'ALL AUTH CLOUD TESTS PASSED'); process.exit(fail ? 1 : 0);
