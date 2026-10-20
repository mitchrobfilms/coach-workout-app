// Weigh-in backdating (date + optional time, no future), edit date/weight, chronological recompute of chart/%/certificates,
// and certificate save/share in web + mocked Capacitor (Filesystem + Share) runtime.
import { nav } from './nav.mjs';
import { chromium, devices } from 'playwright-core';
const URL = process.argv[2] || 'http://localhost:8765/', OUT = process.argv[3] || '/workspace/shots/glp1life';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
async function session(native) {
  const ctx = await b.newContext({ ...devices['Pixel 5'], viewport: { width: 393, height: 851 }, locale: 'en-GB', acceptDownloads: true }); const p = await ctx.newPage();
  if (native) await p.addInitScript(() => { window.__nat = []; const rec = (n, r) => async a => { window.__nat.push([n, a]); return r(a); };
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { Filesystem: { requestPermissions: async () => ({ publicStorage: 'granted' }), writeFile: rec('write', a => ({ uri: `file:///storage/${a.directory}/${a.path}` })) }, Share: { share: rec('share', () => ({})) } } }; });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('reta-coach'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await p.reload();
if (await p.$('#authScreen:not([hidden])')) { await (async () => { if (await p.isVisible('#wCreate')) await p.click('#wCreate'); })(); await p.fill('#regName', 'Mitchell'); await p.fill('#regEmail', 'm@example.com'); await p.fill('#regSecret', '1234'); await p.click('#regBtn'); await p.waitForSelector('#onboard:not([hidden])', { timeout: 15000 }); await p.click('#obSkip'); }
  await p.waitForTimeout(600); return { p, ctx, errs };
}
const day = n => { const d = new Date(Date.now() - n * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
{ const { p, ctx, errs } = await session(false);
  await nav(p, 'progress'); await p.waitForTimeout(300);
  ok(await p.$eval('#weightDate', e => e.value === e.max && e.value.length === 10), 'date defaults to today, max = today');
  const add = async (kg, d, t = '') => { await p.fill('#weightInput', kg); await p.$eval('#weightDate', (e, v) => e.value = v, d); await p.fill('#weightTime', t); await p.click('#weightBtn'); await p.waitForTimeout(400); if (await p.isVisible('#celebClose')) await p.click('#celebClose'); };
  await add('80', day(-3)); ok(await p.$eval('#weightError', e => !e.hidden && /future/.test(e.textContent)), 'future date rejected');
  await add('96', day(0)); await add('100', day(60), '07:30'); await add('98', day(30));
  const w = await p.evaluate(() => { const k = Object.keys(localStorage).find(k => /\.weights$/.test(k)); return JSON.parse(localStorage[k]); });
  ok(w.length === 3, '3 weigh-ins stored (incl. backdated)'); ok(w.some(x => new Date(x.date).getHours() === 7 && new Date(x.date).getMinutes() === 30), 'optional time kept');
  const s = await p.$eval('#progSummary', e => e.innerText); ok(/Start\s*100\.0/.test(s) && /Now\s*96\.0/.test(s) && /4\.0%/.test(s), 'start/now/% from date order (100 → 96, 4.0%)');
  const li = await p.$$eval('#weightList li', l => l.map(x => x.innerText)); ok(/96\.0/.test(li[0]) && /100\.0/.test(li[2]), 'list newest first by date');
  const xs = await p.$$eval('#progChart svg circle', l => l.map(c => +c.getAttribute('cx'))); ok(xs.length < 2 || xs.every((x, i) => !i || x >= xs[i - 1]), 'chart points in date order');
  const certs = await p.evaluate(() => JSON.parse(localStorage[Object.keys(localStorage).find(k => /\.certificates$/.test(k))] || '[]'));
  const f = certs.find(c => c.id === 'first2lb'); ok(f && f.date.slice(0, 10) === new Date(Date.parse(day(30) + 'T09:00')).toISOString().slice(0, 10), `first 2 lb certificate dated the backdated weigh-in (${f?.date})`);
  ok(certs.find(c => c.id === 'kg4')?.date && Date.parse(certs.find(c => c.id === 'kg4').date) > Date.parse(f.date), '4 kg certificate dated today’s weigh-in');
  await p.click('#celebClose').catch(() => {});
  // edit an entry's date + weight
  await p.click('#weightList li:nth-child(2) [data-wedit]'); await p.fill('#weightList .wedit input[name=v]', '97.5'); await p.$eval('#weightList .wedit input[name=d]', (e, v) => e.value = v, day(45)); await p.click('#weightList .wedit button.primary'); await p.waitForTimeout(250);
  const li2 = await p.$$eval('#weightList li', l => l.map(x => x.innerText)); ok(/97\.5/.test(li2[1]), 'edited weight + date saved');
  await p.click('#weightList li:nth-child(1) [data-wedit]'); await p.$eval('#weightList .wedit input[name=d]', (e, v) => e.value = v, day(-2)); await p.click('#weightList .wedit button.primary'); await p.waitForTimeout(200);
  { const tt = await p.$eval('#toast', e => e.textContent); ok(/future/.test(tt), 'edit to future date rejected ' + tt); }
  await p.click('#weightList [data-wcancel]').catch(() => {});
  await p.$eval('#weightDate', e => e.scrollIntoView({ block: 'center' })); await p.$eval('#weightDate', (e, v) => e.value = v, day(14)); await p.fill('#weightTime', '08:15'); await p.fill('#weightInput', '97');
  await p.waitForTimeout(2600); await p.$eval('#weightForm', e => e.closest('.card').scrollIntoView({ block: 'start' })); await p.screenshot({ path: `${OUT}/weighin-date.png` });
  // web download path
  await p.$eval('#certList', e => e.scrollIntoView());
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('#certList [data-certdl]')]);
  ok(dl && /glp1life-certificate-.*\.png$/.test(dl.suggestedFilename()), `web: certificate downloaded (${dl?.suggestedFilename()})`);
  ok(await p.$eval('#toast', e => /downloaded/.test(e.textContent) && !!e.querySelector('.toastbtn')), 'web: toast with Share button');
  ok(!errs.length, 'no page errors ' + errs.join('|')); await ctx.close(); }
{ const { p, ctx, errs } = await session(true);
  await nav(p, 'progress'); await p.waitForTimeout(300);
  const add = async (kg, d) => { await p.fill('#weightInput', kg); await p.$eval('#weightDate', (e, v) => e.value = v, d); await p.click('#weightBtn'); await p.waitForTimeout(400); if (await p.isVisible('#celebClose')) await p.click('#celebClose'); };
  await add('100', day(20)); await add('97', day(0)); await p.click('#celebClose').catch(() => {});
  await p.$eval('#certList', e => e.scrollIntoView()); await p.click('#certList [data-certdl]'); await p.waitForTimeout(800);
  const nat = await p.evaluate(() => window.__nat);
  ok(nat.some(([n, a]) => n === 'write' && a.directory === 'EXTERNAL_STORAGE' && /^Download\/GLP1 Life\/glp1life-certificate-.*\.png$/.test(a.path) && a.data.length > 1000), 'native: PNG written to Download/GLP1 Life via Filesystem');
  ok(await p.$eval('#toast', e => /Saved to Downloads/.test(e.textContent) && !!e.querySelector('.toastbtn')), 'native: "Saved to Downloads" toast + Share button');
  await p.screenshot({ path: `${OUT}/cert-share.png` });
  await p.click('#toast .toastbtn'); await p.waitForTimeout(600);
  const sh = (await p.evaluate(() => window.__nat)).find(([n]) => n === 'share'); ok(sh && /^file:\/\/.*CACHE\/share\/.*\.png$/.test(sh[1].files[0]), 'native: Share sheet opened with the PNG file');
  ok(!errs.length, 'no page errors ' + errs.join('|')); await ctx.close(); }
await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL WEIGH-IN DATE + CERT SAVE TESTS PASSED'); process.exit(fail ? 1 : 0);
