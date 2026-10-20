import { cleanupTestData } from './cleanup.mjs';
for (const ev of ['uncaughtException', 'unhandledRejection']) process.on(ev, async e => { console.error(e); await cleanupTestData({ quiet: true }).catch(() => {}); process.exit(1); });
// Admin page + trainers section with throwaway users (cleaned up). Needs SUPABASE_ACCESS_TOKEN (Management API) to grant admin.
import { chromium, devices } from 'playwright-core';
import { nav } from './nav.mjs';
import { SB_URL, SB_KEY } from '../cloud.js';
const URL = process.argv[2] || 'http://localhost:8765/', OUT = process.argv[3] || '', REF = 'paxukvgdavcolzkvcapo';
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log(c ? 'ok  ' : 'FAIL', m); };
const sql = async q => (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: 'POST', headers: { authorization: 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ query: q }) })).json();
const s = Date.now(), AD = `glp1life.test.admin${s}@example.com`, US = `glp1life.test.user${s}@example.com`, PW = 'Test-' + s;
const signup = async e => (await fetch(SB_URL + '/auth/v1/signup', { method: 'POST', headers: { apikey: SB_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email: e, password: PW }) })).json();
const ad = await signup(AD), us = await signup(US); ok(ad.access_token && us.access_token, 'throwaway users');
await sql(`insert into public.admins(user_id) values ('${ad.user.id}')`);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
try {
  // non-admin: DB refuses writes even with a valid login
  const w = await fetch(SB_URL + '/rest/v1/trainers', { method: 'POST', headers: { apikey: SB_KEY, authorization: 'Bearer ' + us.access_token, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Hack', whatsapp: '447700900000' }) });
  ok(w.status >= 400, `non-admin insert rejected by RLS (${w.status})`);
  const an = await fetch(SB_URL + '/rest/v1/trainers', { method: 'POST', headers: { apikey: SB_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Hack', whatsapp: '447700900000' }) }); ok(an.status >= 400, `anon insert rejected (${an.status})`);
  // app empty state first
  const ctx = await b.newContext({ ...devices['Pixel 7'] }), p = await ctx.newPage(); p.on('dialog', d => d.accept());
  await p.goto(URL + '?t=' + s, { waitUntil: 'networkidle' }); await (async () => { if (await p.isVisible('#wCreate')) await p.click('#wCreate'); })(); await p.fill('#regName', 'Tess'); await p.fill('#regEmail', 't@example.com'); await p.fill('#regSecret', '4321'); await p.click('#regBtn'); await p.waitForTimeout(1200); if (await p.isVisible('#obSkip')) await p.click('#obSkip');
  const before = (await (await fetch(SB_URL + '/rest/v1/trainers?select=id', { headers: { apikey: SB_KEY } })).json()).length;
  await nav(p, 'trainers'); await p.waitForTimeout(1200); if (!before) { ok(await p.isVisible('.trempty'), 'friendly empty state (no fake trainers)'); if (OUT) await p.screenshot({ path: `${OUT}/trainers-empty.png` }); }
  // admin page: non-admin denied
  const a = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); a.on('dialog', d => d.accept()); a.on('pageerror', e => console.log('ADMIN ERR', e.message));
  await a.goto(URL + 'admin/?t=' + s, { waitUntil: 'networkidle' }); await a.fill('#le', US); await a.fill('#lp', PW); await a.click('#lf button'); await a.waitForTimeout(1500);
  ok(await a.isVisible('#denied') && await a.isHidden('#app'), 'admin page: non-admin sees "Not an admin"');
  await a.click('#out'); await a.waitForTimeout(800); await a.fill('#le', AD); await a.fill('#lp', PW); await a.click('#lf button'); await a.waitForSelector('#app:not([hidden])', { timeout: 10000 });
  await a.waitForSelector('#list li'); await a.waitForTimeout(500); ok(await a.isVisible('#editor'), 'admin page: admin signed in');
  await a.fill('#name', 'Test Trainer ' + s); await a.fill('#spec', 'Strength, Beginners'); await a.fill('#glp', 'Gentle progressive plans that protect muscle while appetite is low.'); await a.fill('#area', 'Leeds');
  await a.fill('#wa', '12'); ok(/Not a valid/.test(await a.textContent('#wahint')), 'WhatsApp validation flags bad number');
  await a.fill('#wa', '07700 900123'); ok(/wa\.me\/447700900123/.test(await a.textContent('#wahint')), 'UK number normalised to 447700900123');
  await a.setInputFiles('#photo', '/workspace/coach-app/icon-192.png'); await a.waitForTimeout(300);
  console.log('PREVIEW', (await a.textContent('#preview')).slice(0,120)); ok(/Test Trainer/.test(await a.textContent('#preview')) && await a.$('#preview .wa'), 'live card preview');
  if (OUT) await a.screenshot({ path: `${OUT}/admin-trainer-form.png` });
  await a.click('#save'); await a.waitForTimeout(2500);
  const row = (await (await fetch(SB_URL + `/rest/v1/trainers?select=id,name,photo_url,specialties,glp1_support,area,whatsapp,virtual_pt,active,sort,status,business,bio&name=eq.${encodeURIComponent('Test Trainer ' + s)}`, { headers: { apikey: SB_KEY } })).json())[0];
  ok(row && row.whatsapp === '447700900123' && /storage\/v1\/object\/public\/trainers\//.test(row.photo_url || ''), 'trainer saved with photo in Storage');
  if (OUT) await a.screenshot({ path: `${OUT}/admin-trainers-list.png` });
  // app shows it
  await nav(p, 'workout'); await nav(p, 'trainers'); await p.waitForTimeout(1500);
  ok(/Test Trainer/.test(await p.textContent('#trainerList')) && /Virtual PT available/.test(await p.textContent('#trainerList')), 'app shows trainer card with badge');
  const href = await p.getAttribute('#trainerList .wabtn', 'href'); ok(/^https:\/\/wa\.me\/447700900123\?text=Hi%20Test%2C%20I%20found%20you%20on%20GLP1%20Life/.test(href), 'WhatsApp link prefilled');
  if (OUT) { await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path: `${OUT}/trainers-section.png` }); }
  // hide toggle -> disappears in app
  await a.click('#list [data-vis="' + (await a.$$eval('#list li', l => l.length) - 1) + '"]'); await a.waitForTimeout(1500);
  const vis = await (await fetch(SB_URL + `/rest/v1/trainers?select=id&id=eq.${row?.id}`, { headers: { apikey: SB_KEY } })).json(); ok(vis.length === 0, 'hidden trainer not visible to public');
  // delete via admin
  await a.click('#list [data-edit="' + (await a.$$eval('#list li', l => l.length) - 1) + '"]'); await a.click('#del'); await a.waitForTimeout(1500);
  const left = await sql(`select count(*)::int n from public.trainers where id = '${row?.id}'`); ok(left[0]?.n === 0, 'admin delete removed trainer');
  if (row?.photo_url) await fetch(row.photo_url.replace('/object/public/', '/object/'), { method: 'DELETE', headers: { apikey: SB_KEY, authorization: 'Bearer ' + ad.access_token } });
} finally {
  await cleanupTestData({ quiet: true }).catch(() => {});
  await b.close();
  await sql(`delete from auth.users where email in ('${AD}','${US}')`);
  const n = await sql(`select count(*)::int n from auth.users where email like 'glp1life.test.%'`); console.log('test users left:', n[0]?.n);
}
console.log(fail ? `${fail} FAILED` : 'ALL ADMIN TESTS PASSED'); process.exit(fail ? 1 : 0);
