// Trainer programme: registration -> admin approve -> client code w/ explicit consent -> trainer dashboard (RLS) -> commission. Throwaway users, cleaned up.
import { chromium, devices } from 'playwright-core';
import { nav } from './nav.mjs';
import { SB_URL, SB_KEY } from '../cloud.js';
const URL = process.argv[2] || 'http://localhost:8765/', OUT = process.argv[3] || '', REF = 'paxukvgdavcolzkvcapo';
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log(c ? 'ok  ' : 'FAIL', m); };
const sql = async q => (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: 'POST', headers: { authorization: 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ query: q }) })).json();
const s = Date.now(), AD = `glp1life.test.tadmin${s}@example.com`, TR = `glp1life.test.trainer${s}@example.com`, CL = `glp1life.test.client${s}@example.com`, OT = `glp1life.test.other${s}@example.com`, PW = 'Test-' + s;
const signup = async e => (await fetch(SB_URL + '/auth/v1/signup', { method: 'POST', headers: { apikey: SB_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email: e, password: PW }) })).json();
const rest = (tok, path, o = {}) => fetch(SB_URL + path, { ...o, headers: { apikey: SB_KEY, authorization: 'Bearer ' + tok, 'content-type': 'application/json', ...(o.headers || {}) } });
const rpc = async (tok, f, b = {}) => { const r = await rest(tok, '/rest/v1/rpc/' + f, { method: 'POST', body: JSON.stringify(b) }); return { status: r.status, j: await r.json().catch(() => null) }; };
const ad = await signup(AD), cl = await signup(CL), ot = await signup(OT); ok(ad.access_token && cl.access_token && ot.access_token, 'throwaway users');
await sql(`insert into public.admins(user_id) values ('${ad.user.id}')`);
// client has health data in the cloud
await rest(cl.access_token, '/rest/v1/weights', { method: 'POST', body: JSON.stringify([{ id: '2026-10-01', data: { date: '2026-10-01T08:00:00Z', kg: 95 } }, { id: '2026-10-15', data: { date: '2026-10-15T08:00:00Z', kg: 92.4 } }]) });
await rest(cl.access_token, '/rest/v1/injections', { method: 'POST', body: JSON.stringify([{ id: 'i1', data: { id: 'i1', med: 'Semaglutide', dose: '0.5', unit: 'mg', at: '2026-10-18T09:00:00Z', site: 'Abdomen left' } }]) });
await rest(cl.access_token, '/rest/v1/check_ins', { method: 'POST', body: JSON.stringify([{ id: 'sessions', data: { v: [{ date: '2026-10-19T10:00:00Z', totals: { squat: 12 } }] } }]) });
await rest(cl.access_token, '/rest/v1/profiles', { method: 'POST', body: JSON.stringify([{ name: 'Casey Client', data: {} }]) });
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
let tid;
try {
  // 1. registration (phone size)
  const t = await (await b.newContext({ ...devices['Pixel 7'] })).newPage(); t.on('pageerror', e => console.log('TRAINER ERR', e.message));
  await t.goto(URL + 'trainer/?t=' + s, { waitUntil: 'networkidle' });
  await t.fill('#rname', 'Sam Test ' + s); await t.fill('#rbiz', 'Sam PT'); await t.fill('#remail', TR); await t.fill('#rpw', PW); await t.fill('#rwa', '07700 900456');
  await t.fill('#rspec', 'Strength, Beginners'); await t.fill('#rbio', 'Level 3 PT, 8 years helping beginners build strength.'); await t.setInputFiles('#rphoto', '/workspace/coach-app/icon-192.png');
  await t.click('#rgo'); ok(/agree/.test(await t.textContent('#rerr')), 'terms must be agreed');
  if (OUT) await t.screenshot({ path: `${OUT}/trainer-register.png`, fullPage: true });
  await t.check('#rterms'); await t.click('#rgo'); await t.waitForSelector('#pending:not([hidden])', { timeout: 15000 }); ok(true, 'registration -> pending');
  const tr = (await sql(`select id, status, active, user_id from public.trainers where email = '${TR}'`))[0]; tid = tr?.id; ok(tr?.status === 'pending' && !tr.active, 'pending trainer row, not public');
  const pub = await (await fetch(SB_URL + `/rest/v1/trainers?select=id&id=eq.${tid}`, { headers: { apikey: SB_KEY } })).json(); ok(pub.length === 0, 'pending trainer hidden from public');
  const leak = await fetch(SB_URL + '/rest/v1/trainers?select=email', { headers: { apikey: SB_KEY } }); ok(leak.status >= 400, 'trainer emails not readable publicly');
  // 2. admin approves
  const a = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); a.on('dialog', d => d.accept()); a.on('pageerror', e => console.log('ADMIN ERR', e.message));
  await a.goto(URL + 'admin/?t=' + s, { waitUntil: 'networkidle' }); await a.fill('#le', AD); await a.fill('#lp', PW); await a.click('#lf button'); await a.waitForSelector('#app:not([hidden])');
  await a.click(`[data-appr="${tid}"]`); await a.waitForTimeout(2000);
  const code = (await sql(`select client_code from public.trainers where id = '${tid}'`))[0]?.client_code; ok(/^[A-Z]{3}PT-[A-Z0-9]{4}$/.test(code || ''), `client code issued (${code})`);
  // 3. client redeems in app: consent required
  const p = await (await b.newContext({ ...devices['Pixel 7'] })).newPage(); p.on('pageerror', e => console.log('APP ERR', e.message));
  await p.goto(URL + '?t=' + s, { waitUntil: 'networkidle' }); await (async () => { if (await p.isVisible('#wCreate')) await p.click('#wCreate'); })(); await p.fill('#regName', 'Casey'); await p.fill('#regEmail', 'casey@example.com'); await p.fill('#regSecret', '4321'); await p.click('#regBtn'); await p.waitForTimeout(1200); if (await p.isVisible('#obSkip')) await p.click('#obSkip'); await p.waitForTimeout(300);
  const nocon = await rpc(cl.access_token, 'redeem_promo', { p_code: code }); ok(nocon.j?.needs_consent && !(await sql(`select 1 from public.promo_redemptions where user_id='${cl.user.id}'`)).length, 'server refuses trainer code without consent');
  await nav(p, 'settings'); await p.fill('#cloudEmail', CL); await p.fill('#cloudPass', PW); await p.click('#cloudIn'); await p.waitForFunction(() => Object.keys(localStorage).some(k => k.endsWith('cloud.session')), null, { timeout: 15000 }); await p.waitForTimeout(2500);
  await p.waitForTimeout(4000);
  await nav(p, 'member'); await p.fill('#promoCode', code.toLowerCase()); await p.$eval('#promoForm', f => f.requestSubmit());
  await p.waitForSelector('#consentModal:not([hidden])'); ok(/Sam Test.*will see your weight, progress, workouts, meal plans and injection log/.test(await p.textContent('#consentTxt')), 'consent screen names trainer + data');
  if (OUT) await p.screenshot({ path: `${OUT}/client-consent.png` });
  await p.click('#consentYes'); await p.waitForTimeout(2500);
  ok(/Included by Sam Test/.test(await p.textContent('#promoStatus')) && /£0/.test(await p.textContent('.plan2 .price')), 'membership shows Included by trainer, £0');
  if (OUT) { await p.evaluate(() => document.getElementById('promoCard').scrollIntoView()); await p.screenshot({ path: `${OUT}/client-redeemed.png` }); }
  const again = await rpc(ot.access_token, 'redeem_promo', { p_code: code, p_consent: true }); const twice = await rpc(cl.access_token, 'redeem_promo', { p_code: code, p_consent: true });
  ok(twice.status >= 400 && /already/.test(twice.j?.message), 'one code per user'); ok(again.status === 200, 'second client can join');
  const direct = await rest(ot.access_token, '/rest/v1/promo_redemptions', { method: 'POST', body: JSON.stringify({ user_id: ot.user.id, code_id: '00000000-0000-0000-0000-000000000000' }) }); ok(direct.status >= 400, 'clients cannot write redemptions directly');
  // 4. trainer dashboard
  await t.goto(URL + 'trainer/?t=' + s + 'b', { waitUntil: 'networkidle' }); await t.waitForSelector('#dash:not([hidden])', { timeout: 10000 });
  ok((await t.textContent('#mycode')) === code && (await t.waitForSelector('#clients li:has-text("Casey")', { timeout: 8000 }).then(() => true, () => false)), 'trainer dashboard: code + clients');
  await t.click('#clients li:has-text("Casey") [data-b="yearly"]'); await t.waitForTimeout(1500);
  ok((await sql(`select billing from public.promo_redemptions where user_id='${cl.user.id}'`))[0]?.billing === 'yearly', 'trainer sets per-client billing (yearly)');
  await t.click('#clients li:has-text("Casey") [data-view]'); await t.waitForSelector('#cdetail svg.graph', { timeout: 10000 });
  ok(/Semaglutide/.test(await t.textContent('#cdetail')) && /1 sessions/.test(await t.textContent('#cdetail')), 'trainer sees graph, workouts, injection log');
  if (OUT) await t.screenshot({ path: `${OUT}/trainer-dashboard.png`, fullPage: true });
  // RLS: trainer cannot read client tables directly; other trainers/users can't use client_progress
  const tses = JSON.parse(await t.evaluate(() => sessionStorage.getItem('glp1trainer')));
  const dw = await (await rest(tses.access_token, `/rest/v1/weights?user_id=eq.${cl.user.id}`)).json(); ok(Array.isArray(dw) && dw.length === 0, 'trainer cannot read weights table directly');
  const oc = await rpc(ot.access_token, 'client_progress', { c: cl.user.id }); ok(oc.status >= 400, 'non-trainer cannot read client progress');
  // 5. client switches off injections in Settings
  await nav(p, 'settings'); await p.waitForSelector('#shareSetCard:not([hidden])'); await p.uncheck('#shareSetCard [data-share="injections"]'); await p.waitForTimeout(1500);
  if (OUT) { await p.evaluate(() => document.getElementById('shareSetCard').scrollIntoView()); await p.screenshot({ path: `${OUT}/client-share-settings.png` }); }
  const pr = await rpc(tses.access_token, 'client_progress', { c: cl.user.id }); ok(pr.j?.injections === null && Array.isArray(pr.j?.weights), 'switching off injections hides them from trainer');
  // 6. commission
  await a.click('[data-v="comm"]'); await a.waitForSelector('#cbody tr'); const row = await a.textContent(`#cbody tr:has-text("Sam Test ${s}")`);
  ok(/£22\.00/.test(row), 'commission: 1 monthly (£2) + 1 yearly started this month (£20) = £22');
  const [dl] = await Promise.all([a.waitForEvent('download'), a.click('#csv')]); ok(/commission-\d{4}-\d\d\.csv/.test(dl.suggestedFilename()), 'CSV export');
  if (OUT) await a.screenshot({ path: `${OUT}/admin-commission.png` });
  await a.click(`[data-paid="${tid}"]`); await a.waitForTimeout(1500); ok(/Paid/.test(await a.textContent(`#cbody tr:has-text("Sam Test ${s}")`)), 'mark invoice paid');
  await a.click('[data-v="promos"]'); await a.waitForSelector('#plist li'); if (OUT) await a.screenshot({ path: `${OUT}/admin-promos.png` });
} finally {
  await b.close();
  for (const o of await sql(`select name from storage.objects where bucket_id='trainers' and name like 'pending/%icon-192.png'`).catch(() => [])) await fetch(`${SB_URL}/storage/v1/object/trainers/${o.name}`, { method: 'DELETE', headers: { apikey: SB_KEY, authorization: 'Bearer ' + ad.access_token } });
  await sql(`delete from public.promo_codes where trainer_id='${tid}'; delete from public.trainers where id='${tid}'; delete from auth.users where email in ('${AD}','${TR}','${CL}','${OT}')`);
  const n = await sql(`select count(*)::int n from auth.users where email like '%${s}@example.com'`); console.log('test users left:', n[0]?.n);
}
console.log(fail ? `${fail} FAILED` : 'ALL TRAINER TESTS PASSED'); process.exit(fail ? 1 : 0);
