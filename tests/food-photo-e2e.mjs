// Browser end-to-end: Food Photo Diary against the LIVE backend (real Gemini analysis), mobile + desktop, with screenshots.
//   node tests/food-photo-e2e.mjs [baseURL]     default: local server on :8813 (with ?cloudauth=1 so a real cloud test account is used)
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdirSync } from 'node:fs';
import { cleanupTestData } from './cleanup.mjs';
const O = '/workspace/shots/glp1life/food-photo' + (process.argv[2] ? '-live' : ''); mkdirSync('/workspace/shots/glp1life', { recursive: true });
let srv = null, BASE = process.argv[2];
if (!BASE) { srv = spawn('python3', ['-m', 'http.server', '8813', '--bind', '127.0.0.1'], { stdio: 'ignore', cwd: new URL('..', import.meta.url).pathname }); BASE = 'http://localhost:8813/'; await new Promise(r => setTimeout(r, 800)); }
const URL0 = BASE + (BASE.includes('?') ? '&' : '?') + 'cloudauth=1';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL0); await p.waitForTimeout(1500);
  await p.click('#wCreate').catch(() => {});
  await p.fill('#regName', 'Sam'); await p.fill('#regEmail', `glp1life.test.fdui${Date.now()}@example.com`); await p.fill('#regSecret', 'Test-pass-' + Date.now()); await p.click('#regBtn');
  await p.waitForLoadState('load'); await p.waitForTimeout(2500);
  for (const id of ['obSkip']) await p.click('#' + id).catch(() => {}); await p.waitForTimeout(500);
  await p.evaluate(() => document.querySelectorAll('.overlay:not([hidden])').forEach(e => { if (e.id !== 'fdSheet') e.hidden = true; }));
  ok(await p.isVisible('#foodTodayCard'), 'Home shows Today\'s food tile'); await p.screenshot({ path: O + '-1-home-empty.png' });
  // coming-soon state (function says not ready)
  await p.route('**/functions/v1/food-photo', r => r.request().method() === 'GET' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ready":false,"limit":20,"remaining":20}' }) : r.continue());
  await p.click('#foodTodayCard'); await p.waitForTimeout(1500);
  ok(await p.isVisible('.fdsoon') && await p.locator('.fdsoon button').isDisabled(), 'coming-soon state when backend not ready'); await p.screenshot({ path: O + '-0-coming-soon.png' });
  await p.unroute('**/functions/v1/food-photo');
  await p.evaluate(() => document.querySelector('#dock [data-tab=workout]').click()); await p.waitForTimeout(400);
  await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (/fd/.test(k)) localStorage.removeItem(k); }); await p.reload(); await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelectorAll('.overlay:not([hidden])').forEach(e => e.hidden = true));
  await p.click('#foodTodayCard'); await p.waitForSelector('#fdUpload', { state: 'attached', timeout: 30000 }).catch(async e => { await p.screenshot({ path: O + '-debug.png' }); console.log('DEBUG', await p.evaluate(() => [document.querySelector('section.tab.active')?.id, document.getElementById('photoDiaryRoot')?.innerText.slice(0, 300), document.querySelector('.overlay:not([hidden])')?.id].join(' | '))); throw e; });
  ok(/20 of 20 meal checks/.test(await p.textContent('#fdLeft')), 'shows 20 of 20 checks left'); await p.screenshot({ path: O + '-2-diary-empty.png' });
  // non-food photo
  await p.setInputFiles('#fdUpload', 'tests/fixtures/food-notfood.jpg'); await p.click('#fdGo'); await p.waitForSelector('#fdSheet h3:has-text("couldn")', { timeout: 40000 });
  ok(true, 'non-food photo gets a kind message'); await p.screenshot({ path: O + '-3-not-food.png' }); await p.click('[data-fdclose]');
  // real meal photo -> editor
  const t0 = Date.now(); await p.setInputFiles('#fdUpload', 'tests/fixtures/food-full.jpg'); await p.waitForSelector('#fdGo'); await p.click('#fdGo');
  await p.waitForSelector('.fdwait .fdprev', { timeout: 15000 }); await p.screenshot({ path: O + '-4-checking.png' });
  await p.waitForSelector('#fdSave', { timeout: 60000 }); console.log('  analysis took', Date.now() - t0, 'ms');
  const items = await p.$$eval('.fditem .fdname', l => l.map(i => i.value)); console.log('  items:', items.join(', '));
  ok(items.length >= 3 && items.some(n => /egg/i.test(n)) && items.some(n => /bean|sausage|bacon/i.test(n)), 'Full English: items detected');
  ok(await p.isVisible('.pill.est') && /estimate/i.test(await p.textContent('#fdTot')), 'labelled as estimate');
  ok(!/\bbad\b|unhealthy|junk/i.test(await p.textContent('#fdSheet')), 'no judgemental words'); await p.screenshot({ path: O + '-5-result.png' });
  await p.locator('#fdSheet .sheet').evaluate(e => e.scrollTop = e.scrollHeight); await p.screenshot({ path: O + '-5b-result-bottom.png' });
  // edit: rename first item, change grams, portion 3/4
  const before = await p.textContent('#fdTot');
  await p.fill('.fditem:first-child .fdname', 'Baked beans (edited)'); await p.locator('.fditem:first-child .fdname').dispatchEvent('change');
  const g = p.locator('.fditem:first-child [data-f=grams]'); const g0 = +(await g.inputValue()); await g.fill(String(g0 * 2)); await g.dispatchEvent('change'); await p.waitForTimeout(200);
  ok(await p.textContent('#fdTot') !== before, 'editing grams rescales totals');
  await p.click('[data-fdpor="0.75"]'); await p.waitForTimeout(200);
  const tot = await p.textContent('#fdTot'); const kcal = +tot.match(/≈([\d,]+) kcal/)[1].replace(',', '');
  await p.click('#fdSave'); await p.waitForSelector('.fdrow', { timeout: 15000 }); await p.waitForTimeout(1500);
  ok(await p.locator('.fdrow img').count() === 1, 'saved meal shows photo thumbnail');
  ok((await p.textContent('.fdtot')).includes(kcal.toLocaleString('en-GB')), 'day totals updated (' + kcal + ' kcal)'); ok(/19 of 20/.test(await p.textContent('#fdLeft')), 'non-food not counted, 19 left');
  await p.screenshot({ path: O + '-6-diary-saved.png' });
  // reopen + edit persisted
  await p.click('.fdrow'); await p.waitForSelector('#fdSave'); ok((await p.inputValue('.fditem:first-child .fdname')) === 'Baked beans (edited)', 'edit persisted'); await p.click('#fdCancel');
  // Home tile
  await p.evaluate(() => document.querySelector('#dock [data-tab=workout]').click()); await p.waitForTimeout(800);
  ok((await p.textContent('#foodTodayCard')).includes(kcal.toLocaleString('en-GB') + ' kcal'), 'Home tile shows today\'s kcal + protein'); await p.evaluate(() => document.getElementById('foodTodayCard').scrollIntoView({ block: 'center' })); await p.screenshot({ path: O + '-7-home-tile.png' });
  // desktop
  const d = await b.newContext({ viewport: { width: 1280, height: 900 }, storageState: await ctx.storageState() }); const dp = await d.newPage(); await dp.goto(URL0); await dp.waitForTimeout(2500);
  await dp.evaluate(() => document.querySelectorAll('.overlay:not([hidden])').forEach(e => e.hidden = true)); await dp.click('#foodTodayCard'); await dp.waitForSelector('.fdrow', { timeout: 15000 }); await dp.waitForTimeout(1200);
  await dp.screenshot({ path: O + '-8-desktop.png' }); await dp.click('.fdrow'); await dp.waitForSelector('#fdSave'); await dp.waitForTimeout(800); await dp.screenshot({ path: O + '-9-desktop-edit.png' });
  // delete meal (removes photo)
  dp.on('dialog', x => x.accept()); await dp.click('#fdDel'); await dp.waitForTimeout(2500); ok(await dp.locator('.fdrow').count() === 0, 'meal deleted');
  ok(!errs.length, 'no page errors ' + errs.join(' | '));
} catch (e) { fails++; console.error('ERROR', e); }
finally { await b.close(); srv?.kill(); await cleanupTestData({ quiet: true }); }
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
