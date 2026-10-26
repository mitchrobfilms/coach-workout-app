// Browser end-to-end: typed meal descriptions (text-only and photo + text), manual protein corrections, re-check.
// Real backend + Gemini. Screenshots -> /workspace/shots/glp1life/food-text-*.png
//   node tests/food-text-e2e.mjs [baseURL]     default: local server on :8814
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdirSync } from 'node:fs';
import { cleanupTestData } from './cleanup.mjs';
const O = '/workspace/shots/glp1life/food-text' + (process.argv[2] ? '-live' : ''); mkdirSync('/workspace/shots/glp1life', { recursive: true });
let srv = null, BASE = process.argv[2];
if (!BASE) { srv = spawn('python3', ['-m', 'http.server', '8814', '--bind', '127.0.0.1'], { stdio: 'ignore', cwd: new URL('..', import.meta.url).pathname }); BASE = 'http://localhost:8814/'; await new Promise(r => setTimeout(r, 800)); }
const URL0 = BASE + (BASE.includes('?') ? '&' : '?') + 'cloudauth=1';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const totP = async p => +(await p.textContent('#fdTot')).match(/([\d.,]+) g protein/)[1].replace(',', '');
const dayP = async p => +(await p.textContent('.fdtot .p b')).replace(/[^\d.]/g, '');
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL0); await p.waitForTimeout(1500);
  await p.click('#wCreate').catch(() => {});
  await p.fill('#regName', 'Sam'); await p.fill('#regEmail', `glp1life.test.fdtext${Date.now()}@example.com`); await p.fill('#regSecret', 'Test-pass-' + Date.now()); await p.click('#regBtn');
  await p.waitForLoadState('load'); await p.waitForTimeout(2500); await p.click('#obSkip').catch(() => {}); await p.waitForTimeout(500);
  await p.evaluate(() => document.querySelectorAll('.overlay:not([hidden])').forEach(e => { if (e.id !== 'fdSheet') e.hidden = true; }));
  await p.reload(); await p.waitForTimeout(2500); await p.evaluate(() => document.querySelectorAll('.overlay:not([hidden])').forEach(e => e.hidden = true));
  console.log('  caches:', await p.evaluate(async () => (await caches.keys()).join(',')));
  await p.click('#foodTodayCard'); await p.waitForSelector('#fdType', { timeout: 30000 }).catch(async e => { await p.screenshot({ path: O + '-debug.png' }); console.log('DEBUG', await p.evaluate(() => [document.querySelector('section.tab.active')?.id, document.getElementById('photoDiaryRoot')?.innerText.slice(0, 300), document.querySelector('.overlay:not([hidden])')?.id].join(' | '))); throw e; });
  ok(/20 of 20 meal checks/.test(await p.textContent('#fdLeft')), '20 of 20 meal checks left'); await p.screenshot({ path: O + '-1-diary.png' });
  // 1. text only
  await p.click('#fdType'); await p.waitForSelector('#fdNote'); await p.fill('#fdNote', 'chicken breast 150g, white rice 150g, broccoli 80g'); await p.screenshot({ path: O + '-2-type.png' });
  let t0 = Date.now(); await p.click('#fdGo'); await p.waitForSelector('#fdSave', { timeout: 60000 }); console.log('  text analysis', Date.now() - t0, 'ms');
  const names = await p.$$eval('.fditem .fdname', l => l.map(i => i.value)); console.log('  items:', names.join(', '));
  ok(names.some(n => /chicken/i.test(n)) && names.some(n => /rice/i.test(n)) && names.some(n => /broccoli/i.test(n)), 'text-only: chicken, rice, broccoli');
  const ck = names.findIndex(n => /chicken/i.test(n)), ckRow = p.locator('.fditem').nth(ck);
  ok(+(await ckRow.locator('[data-f=grams]').inputValue()) === 150, 'chicken uses the typed 150 g');
  ok((await p.inputValue('#fdEdNote')).includes('chicken breast 150g'), 'description carried into the editor');
  await p.screenshot({ path: O + '-3-text-result.png' });
  // 2. manual protein correction: type in protein, move straight to kcal, then tap Save without leaving the box
  const p0 = await totP(p), cp0 = +(await ckRow.locator('[data-f=protein_g]').inputValue());
  await ckRow.locator('[data-f=protein_g]').tap(); await ckRow.locator('[data-f=protein_g]').fill('50');
  ok(Math.abs(await totP(p) - (p0 - cp0 + 50)) < 0.11, 'total protein updates live while typing');
  await ckRow.locator('[data-f=kcal]').tap(); await p.keyboard.press('Control+A'); await p.keyboard.type('260');
  ok(await ckRow.locator('[data-f=kcal]').evaluate(e => e === document.activeElement), 'moving to the next box keeps focus (no re-render)');
  const want = Math.round((p0 - cp0 + 50) * 10) / 10; await p.screenshot({ path: O + '-4-manual-protein.png' });
  await p.locator('#fdSave').tap(); await p.waitForSelector('.fdrow', { timeout: 15000 }); await p.waitForTimeout(1200);
  ok(Math.abs(await dayP(p) - want) < 0.11, `day protein total = corrected ${want} g (got ${await dayP(p)})`);
  ok((await p.textContent('.fdrow .fdmac')).includes(want.toLocaleString('en-GB') + ' g protein'), 'meal row shows corrected protein');
  // 3. reopen: correction persisted; rename a food -> hint -> re-check with description
  await p.click('.fdrow'); await p.waitForSelector('#fdSave');
  ok(+(await p.locator('.fditem').nth(ck).locator('[data-f=protein_g]').inputValue()) === 50, 'corrected protein persisted');
  const br = (await p.$$eval('.fditem .fdname', l => l.map(i => i.value))).findIndex(n => /broccoli/i.test(n));
  await p.locator('.fditem').nth(br).locator('.fdname').fill('cottage cheese 150g');
  ok(/renamed a food/i.test(await p.textContent('#fdHint')), 'renaming shows the re-check hint');
  const before = await totP(p); t0 = Date.now(); await p.click('#fdRecheck'); await p.waitForFunction(() => !document.querySelector('#fdRecheck').disabled, null, { timeout: 60000 }); console.log('  re-check', Date.now() - t0, 'ms');
  const n2 = await p.$$eval('.fditem .fdname', l => l.map(i => i.value)); console.log('  after re-check:', n2.join(', '), '|', await p.textContent('#fdTot'));
  ok(n2.some(n => /cottage/i.test(n)) && !n2.some(n => /broccoli/i.test(n)) && await totP(p) > before, 're-check used the corrected food (cottage cheese, more protein)');
  await p.screenshot({ path: O + '-5-recheck.png' });
  const after = await totP(p); await p.click('#fdSave'); await p.waitForTimeout(2500);
  ok(Math.abs(await dayP(p) - after) < 0.11, 're-checked protein saved to day total');
  // 4. photo + description
  await p.setInputFiles('#fdUpload', 'tests/fixtures/food-fish.jpg'); await p.waitForSelector('#fdNote'); await p.fill('#fdNote', 'baked salmon fillet 200g and chips 150g');
  await p.waitForFunction(() => document.querySelector('#fdCompImg')?.src?.startsWith('blob:'), null, { timeout: 15000 }); await p.screenshot({ path: O + '-6-photo-note.png' });
  await p.click('#fdGo'); await p.waitForSelector('#fdSave', { timeout: 60000 });
  const n3 = await p.$$eval('.fditem .fdname', l => l.map(i => i.value)); console.log('  photo+text:', n3.join(', '));
  ok(n3.some(n => /salmon/i.test(n)) && !n3.some(n => /batter/i.test(n)), 'photo + text: the description wins (salmon)'); await p.screenshot({ path: O + '-7-photo-result.png' });
  await p.click('#fdSave'); await p.waitForTimeout(2500);
  ok(await p.locator('.fdrow').count() === 2 && await p.locator('.fdrow img').count() === 1, 'two meals saved, one with photo');
  ok(/17 of 20/.test(await p.textContent('#fdLeft')), 'text, re-check and photo each used one check (17 left)'); await p.screenshot({ path: O + '-8-diary.png', fullPage: false });
  await p.evaluate(() => document.querySelector('#dock [data-tab=workout]').click()); await p.waitForTimeout(800);
  ok((await p.textContent('#foodTodayCard')).includes(Math.round(await p.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /cloud\.foodDays/.test(k))) || '{}')).then(c => Object.values(c)[0]?.protein_g || 0)) + ' g protein'), 'Home tile shows the corrected protein');
  await p.evaluate(() => document.getElementById('foodTodayCard').scrollIntoView({ block: 'center' })); await p.screenshot({ path: O + '-9-home.png' });
  ok(!errs.length, 'no page errors ' + errs.join(' | '));
} catch (e) { fails++; console.error('ERROR', e); }
finally { await b.close(); srv?.kill(); await cleanupTestData({ quiet: true }); }
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
