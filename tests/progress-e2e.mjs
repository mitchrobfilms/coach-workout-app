// Android Chrome (360 px) browser test: bigger UI, weight progress, edit/delete, backup/restore + IDB auto-restore, GLP-1 builder, offers.
import { chromium, devices } from 'playwright-core';
const URL = process.argv[2] || 'http://localhost:8765/', OUT = process.argv[3] || '/workspace/shots';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const ctx = await b.newContext({ ...devices['Pixel 5'], viewport: { width: 360, height: 780 }, locale: 'en-GB', acceptDownloads: true }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(URL); await p.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('reta-coach'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await p.reload();
if (await p.$('#authScreen:not([hidden])')) { await p.fill('#regName', 'Mitchell'); await p.fill('#regEmail', 'm@example.com'); await p.fill('#regSecret', '1234'); await p.click('#regBtn'); await p.waitForSelector('#onboard:not([hidden])', { timeout: 15000 }); await p.click('#obSkip'); }
// seed 8 weeks of weigh-ins
await p.evaluate(() => { const k = Object.keys(localStorage).find(k => k.endsWith('settings')); const pre = k.slice(0, -'settings'.length); const w = []; const t0 = Date.now() - 56 * 864e5; let kg = 102.4; for (let i = 0; i <= 8; i++) { w.push({ date: new Date(t0 + i * 7 * 864e5).toISOString(), kg: Math.round(kg * 10) / 10 }); kg -= 0.6 + (i % 3) * .3; } localStorage.setItem(pre + 'weights', JSON.stringify(w)); const s = JSON.parse(localStorage.getItem(k)); s.goalKg = 85; s.heightCm = 180; s.weightUnit = 'kg'; localStorage.setItem(k, JSON.stringify(s)); });
await p.reload(); await p.waitForTimeout(800);
const overflow = async () => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 ? [...document.querySelectorAll('main *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1 && e.offsetParent).slice(0, 5).map(e => e.tagName + '.' + e.className + '#' + e.id) : null);
// sizes
const navH = await p.$eval('.tabs button', e => e.getBoundingClientRect().height); ok(navH >= 48, `nav buttons ${Math.round(navH)} px tall (≥48)`);
const fs = await p.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize)); ok(fs >= 18, `base font ${fs}px`);
ok(await p.$eval('#homeProgress', e => /Lost/.test(e.innerText) && !!e.querySelector('svg')), 'home progress card with chart');
let o = await overflow(); ok(!o, `no horizontal overflow on home ${o ? JSON.stringify(o) : ''}`);
await p.screenshot({ path: `${OUT}/home.png`, fullPage: false });
await p.click('.tabs button[data-tab=progress]'); await p.waitForTimeout(300);
const txt = await p.$eval('#progSummary', e => e.innerText);
ok(/Total lost/.test(txt) && /% lost/.test(txt) && /Last 7 days/.test(txt) && /Last 30 days/.test(txt) && /BMI/.test(txt) && /Goal 85/.test(txt), 'progress stats: lost, %, 7/30-day trend, BMI, goal');
ok(await p.$$eval('#milestoneList li.done', l => l.length) >= 2, 'milestones reached shown');
o = await overflow(); ok(!o, `no overflow on progress ${o ? JSON.stringify(o) : ''}`);
const small = await p.$$eval('#tab-progress button', l => l.filter(x => x.offsetParent && x.getBoundingClientRect().height < 47.5).map(x => x.textContent));
ok(!small.length, `all progress buttons ≥48 px ${small.join(',')}`);
await p.screenshot({ path: `${OUT}/progress.png`, fullPage: true });
// edit + delete
const n0 = await p.$$eval('#weightList li', l => l.length);
await p.click('#weightList [data-wedit]'); await p.fill('#weightList .wedit input[name=v]', '91.2'); await p.click('#weightList .wedit button.primary'); await p.waitForTimeout(200);
ok((await p.$eval('#weightList li', e => e.innerText)).includes('91.2'), 'edit weigh-in');
p.once('dialog', d => d.accept()); await p.click('#weightList [data-wdel]'); await p.waitForTimeout(200);
ok(await p.$$eval('#weightList li', l => l.length) === n0 - 1, 'delete weigh-in');
// backup download
const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('#backupBtn')]);
ok(!!dl, 'backup file downloaded'); const bpath = dl ? await dl.path() : null;
// IDB auto-restore after localStorage is cleared (but account kept)
await p.waitForTimeout(500);
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (/weights$/.test(k)) localStorage.removeItem(k); });
await p.reload(); await p.waitForTimeout(800); await p.click('.tabs button[data-tab=progress]');
ok(await p.$$eval('#weightList li', l => l.length) === n0 - 1, 'weigh-ins auto-restored from IndexedDB after localStorage wipe');
// restore from file
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (/weights$/.test(k)) localStorage.removeItem(k); });
await p.evaluate(async () => { await new Promise(r => { const q = indexedDB.deleteDatabase('reta-coach'); q.onsuccess = q.onerror = q.onblocked = r; }); });
await p.reload(); await p.waitForTimeout(600); await p.click('.tabs button[data-tab=progress]');
ok(await p.$$eval('#weightList li:not(.muted)', l => l.length) === 0, 'data gone after full wipe');
if (bpath) { p.once('dialog', d => d.accept()); await p.setInputFiles('#restoreFile', bpath); await p.waitForTimeout(1800); await p.click('.tabs button[data-tab=progress]'); ok(await p.$$eval('#weightList li', l => l.length) === n0 - 1, 'restore from backup file'); }
// GLP-1 builder
await p.click('.tabs button[data-tab=prep]'); await p.waitForTimeout(800);
await p.click('#glpStore [data-gstore=aldi]'); await p.selectOption('#glpMeals', '4'); await p.click('#glpBuild'); await p.waitForTimeout(300);
const plan = await p.evaluate(() => window.__kova.glp.plan);
ok(plan && plan.plan.every(x => x.protein >= x.target - 3), `builder hits protein target (${plan?.plan.map(x => x.protein).join(', ')})`);
ok(plan && plan.total > 0 && Object.keys(plan.shop).length, `shopping list with total £${plan?.total}`);
o = await overflow(); ok(!o, `no overflow on prep ${o ? JSON.stringify(o) : ''}`);
await p.$eval('#glpCard', e => e.scrollIntoView()); await p.screenshot({ path: `${OUT}/meal-builder.png`, fullPage: false });
await p.$eval('#glpPlan h3', e => e.scrollIntoView()); await p.screenshot({ path: `${OUT}/meal-builder-shopping.png`, fullPage: false });
// offers
const offers = await p.$$eval('#offerList .offer', l => l.length); ok(offers > 0, `offers listed (${offers})`);
ok(/Asda/.test(await p.textContent('#offerStatus')), 'offer status explains each store');
await p.waitForTimeout(2600); await p.$eval('#offersCard', e => e.scrollIntoView()); await p.screenshot({ path: `${OUT}/offers.png`, fullPage: false });
await p.click('#offerStore [data-ostore=asda]'); ok(/blocks automated/.test(await p.textContent('#offerList')), 'Asda fallback explained');
await p.click('#offerStore [data-ostore=all]'); await p.click('#offerList [data-useoffer]'); await p.waitForTimeout(300);
ok(errs.length === 0, `no page errors ${errs.join(' | ')}`);
await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL PROGRESS/MEAL/OFFERS E2E PASSED'); process.exitCode = fail ? 1 : 0;
