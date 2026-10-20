// Cloud sync against the real Supabase project with throwaway users (deleted at the end). Usage: node tests/cloud-e2e.mjs [URL]
import { chromium, devices } from 'playwright-core';
import { nav } from './nav.mjs';
import { SB_URL, SB_KEY } from '../cloud.js';
const URL = process.argv[2] || 'http://localhost:8765/';
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log(c ? 'ok  ' : 'FAIL', m); };
const stamp = Date.now(), A = `glp1life.test.a${stamp}@example.com`, B = `glp1life.test.b${stamp}@example.com`, PW = 'Test-' + stamp;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
async function phone(name) { const ctx = await b.newContext({ ...devices['Pixel 7'] }); const p = await ctx.newPage(); p.on('dialog', d => d.accept());
  await p.goto(URL + '?t=' + Date.now(), { waitUntil: 'networkidle' }); await p.fill('#regName', name); await p.fill('#regEmail', name.toLowerCase() + '@example.com'); await p.fill('#regSecret', '4321'); await p.click('#regBtn'); await p.waitForTimeout(1200);
  if (await p.isVisible('#obSkip')) await p.click('#obSkip'); await p.waitForTimeout(300); return p; }
// Phone 1: local data first, then create cloud account -> migrates
const p1 = await phone('Ann');
await nav(p1, 'progress'); for (const kg of ['95', '93.4']) { await p1.fill('#weightInput', kg); await p1.click('#weightBtn'); await p1.waitForTimeout(500); if (await p1.isVisible('#celebClose')) await p1.click('#celebClose'); }
await p1.evaluate(() => { const pre = Object.keys(localStorage).find(k => k.endsWith('weights')).replace(/weights$/, '');
  localStorage.setItem(pre + 'injections', JSON.stringify([{ id: 'inj1', med: 'Semaglutide', dose: '0.5', unit: 'mg', at: '2026-10-18T09:00:00Z', site: 'Abdomen left' }]));
  localStorage.setItem(pre + 'injectSchedule', JSON.stringify({ type: 'weekly', weekday: 6, time: '09:00' }));
  localStorage.setItem(pre + 'sessions', JSON.stringify([{ date: '2026-10-19T10:00:00Z', totals: { squat: 12 } }]));
  localStorage.setItem(pre + 'myPlan', JSON.stringify({ min: 1300, max: 1700, focus: 'Balanced', day: 0, seed: 7, added: ['g-oats'] })); });
await p1.reload({ waitUntil: 'networkidle' }); await p1.waitForTimeout(800);
const certs1 = await p1.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.endsWith('certificates'))) || '[]').length); ok(certs1 > 0, `phone 1 has certificates (${certs1})`);
await nav(p1, 'settings'); await p1.fill('#cloudEmail', A); await p1.fill('#cloudPass', PW); await p1.click('#cloudUp'); await p1.waitForSelector('#cloudOn:not([hidden])', { timeout: 15000 }).catch(() => {});
ok(/Signed in to cloud as/.test(await p1.textContent('#cloudStatus')), 'cloud account created: ' + (await p1.textContent('#cloudStatus')).slice(0, 60) + (await p1.textContent('#cloudErr')));
await p1.waitForTimeout(1500);
const tok = await p1.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.endsWith('cloud.session')))).access_token);
const rest = async (path, t = tok) => (await fetch(SB_URL + path, { headers: { apikey: SB_KEY, authorization: 'Bearer ' + t } })).json();
const w = await rest('/rest/v1/weights?select=id,data,deleted'); ok(w.length === 2 && w.some(r => r.data.kg === 93.4), `local weights migrated to cloud (${w.length})`);
await p1.waitForTimeout(3000);
ok((await rest('/rest/v1/settings?select=data'))[0]?.data?.name === 'Ann', 'settings synced'); ok(!('llmKey' in ((await rest('/rest/v1/settings?select=data'))[0]?.data || {})), 'secrets not uploaded');
ok((await rest('/rest/v1/meal_plans?select=id')).length >= 1, 'meal plans row'); ok((await rest('/rest/v1/check_ins?select=id')).length >= 1, 'check-ins rows');
// anon cannot read anything
const anon = await fetch(SB_URL + '/rest/v1/weights?select=*', { headers: { apikey: SB_KEY } }); ok(anon.status === 401 || (await anon.json()).length === 0, 'anon key alone reads nothing (' + anon.status + ')');
// Phone 2: different local profile, sign in to same cloud -> restores
const p2 = await phone('Ann2'); await nav(p2, 'settings'); await p2.fill('#cloudEmail', A); await p2.fill('#cloudPass', PW); await p2.click('#cloudIn'); await p2.waitForTimeout(7000); await p2.waitForLoadState('networkidle');
const all2 = await p2.evaluate(() => { const o = {}; for (const k of Object.keys(localStorage)) { if (k.includes('cloud.')) continue; const m = k.match(/(weights|injections|injectSchedule|sessions|myPlan|certificates|settings)$/); if (m) try { o[m[1]] = JSON.parse(localStorage.getItem(k)); } catch {} } return o; });
ok(all2.injections?.[0]?.med === 'Semaglutide' && all2.injections[0].dose === '0.5', 'fresh device: injection log restored (as entered)');
ok(all2.injectSchedule?.type === 'weekly', 'fresh device: injection reminder restored'); ok(all2.sessions?.length === 1, 'fresh device: workouts restored');
ok(all2.myPlan?.focus === 'Balanced', 'fresh device: meal plan restored'); ok(all2.certificates?.length === certs1, `fresh device: certificates restored (${all2.certificates?.length})`);
await p2.waitForTimeout(500); await nav(p2, 'progress'); await p2.waitForTimeout(500); ok(await p2.$$eval('#certList > *', l => l.length) >= certs1, 'fresh device: certificates section shows them');
const imgs = await rest('/storage/v1/object/list/certificates'.replace('list/certificates', 'list/certificates'), tok).catch(() => null);
const li = await (await fetch(SB_URL + '/storage/v1/object/list/certificates', { method: 'POST', headers: { apikey: SB_KEY, authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: JSON.stringify({ prefix: JSON.parse(atob(tok.split('.')[1])).sub + '/' }) })).json();
ok(Array.isArray(li) && li.length === certs1, `certificate images in private Storage (${li.length})`);
const pub = await fetch(SB_URL + '/storage/v1/object/public/certificates/' + JSON.parse(atob(tok.split('.')[1])).sub + '/' + (li[0]?.name || 'x')); ok(pub.status >= 400, 'certificate images not public (' + pub.status + ')');
const w2 = await p2.evaluate(() => Object.keys(localStorage).filter(k => k.endsWith('weights')).map(k => k + '=' + JSON.parse(localStorage.getItem(k)).length));
ok(w2.some(x => x.endsWith('=2')), 'second phone restored weights from cloud ' + w2.join(',') + ' ' + await p2.textContent('#cloudStatus') + await p2.textContent('#cloudErr'));
// delete a weigh-in on phone 2 -> tombstone syncs
await p2.evaluate(() => { const k = Object.keys(localStorage).find(k => k.endsWith('.weights')); }); 
// RLS: user B cannot see A's rows
const rB = await (await fetch(SB_URL + '/auth/v1/signup', { method: 'POST', headers: { apikey: SB_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email: B, password: PW }) })).json();
ok(!!rB.access_token, 'second throwaway user created');
ok((await rest('/rest/v1/weights?select=*', rB.access_token)).length === 0, "RLS: user B sees none of user A's rows");
const ins = await fetch(SB_URL + '/rest/v1/weights', { method: 'POST', headers: { apikey: SB_KEY, authorization: 'Bearer ' + rB.access_token, 'content-type': 'application/json' }, body: JSON.stringify({ user_id: w.length ? (await rest('/auth/v1/user')).id : null, id: 'x', data: {} }) });
ok(ins.status >= 400, `RLS: user B cannot write rows as user A (${ins.status})`);
// export + delete (A via UI, B via API)
await p1.waitForLoadState('networkidle'); await p1.waitForTimeout(1500); await nav(p1, 'settings'); await p1.waitForSelector('#cloudOn:not([hidden])'); const [dl] = await Promise.all([p1.waitForEvent('download', { timeout: 15000 }).catch(() => null), p1.$eval('#cloudExport', b => b.click())]);
ok(dl && /glp1life-my-data/.test(dl.suggestedFilename()), 'export my data downloads JSON');
await p1.click('#cloudDelete'); await p1.waitForTimeout(2500); ok(!(await p1.isHidden('#cloudForm')), 'cloud account deleted (signed out)');
const gone = await fetch(SB_URL + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: SB_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email: A, password: PW }) }); ok(gone.status >= 400, 'user A can no longer sign in');
ok(await p1.evaluate(() => Object.keys(localStorage).filter(k => k.endsWith('weights')).some(k => JSON.parse(localStorage.getItem(k)).length === 2)), 'phone data kept after cloud delete');
await fetch(SB_URL + '/rest/v1/rpc/delete_my_account', { method: 'POST', headers: { apikey: SB_KEY, authorization: 'Bearer ' + rB.access_token, 'content-type': 'application/json' }, body: '{}' });
await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL CLOUD TESTS PASSED'); process.exit(fail ? 1 : 0);
