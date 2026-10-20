// TV mode (?tv=1), Cast button, steps sheet.
import { chromium, devices } from 'playwright-core';
const URL = process.argv[2] || 'http://localhost:8765/', OUT = process.argv[3] || '';
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log(c ? 'ok  ' : 'FAIL', m); };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const onboard = async p => { await (async () => { if (await p.isVisible('#wCreate')) await p.click('#wCreate'); })(); await p.fill('#regName', 'Tess'); await p.fill('#regEmail', 'tess@example.com'); await p.fill('#regSecret', '4321'); await p.$eval('#registerForm', f => f.requestSubmit()); await p.waitForTimeout(1200); if (await p.isVisible('#obSkip')) await p.click('#obSkip'); await p.waitForTimeout(300); };
const errs = [];
// TV
const t = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage(); t.on('pageerror', e => errs.push(e.message));
await t.goto(URL + '?tv=1', { waitUntil: 'networkidle' }); await onboard(t);
ok(await t.evaluate(() => document.documentElement.classList.contains('tv')), 'tv class on ?tv=1');
await t.evaluate(() => document.querySelector('#dock [data-tab=classes]')?.click()); await t.waitForTimeout(500);
ok(await t.isHidden('#dock'), 'dock hidden in TV mode');
await t.evaluate(() => document.querySelector('#classList button')?.focus()); const f1 = await t.evaluate(() => document.activeElement.outerHTML.slice(0, 60));
await t.keyboard.press('ArrowDown'); await t.waitForTimeout(300); const f2 = await t.evaluate(() => document.activeElement.outerHTML.slice(0, 60));
ok(f1 !== f2, 'D-pad arrow moves focus');
if (OUT) await t.screenshot({ path: `${OUT}/tv-mode-classes.png` });
// Phone: cast button + tv card + steps sheet
const p = await (await b.newContext({ ...devices['Pixel 7'] })).newPage(); p.on('pageerror', e => errs.push(e.message));
await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(1500); await onboard(p);
ok(await p.$('#castBtn') && /\?tv=1/.test(await p.textContent('#tvUrl')), 'Cast button + TV URL present');
await p.evaluate(() => document.getElementById('screen-session').classList.add('active')); await p.waitForTimeout(2500); ok(await p.evaluate(() => !!document.querySelector('script[src*="cast_sender.js"]') && typeof window.__onGCastApiAvailable === 'function'), 'Cast Web Sender SDK requested in Chrome (headless has no Cast devices)');
await p.evaluate(() => document.getElementById('screen-session').classList.remove('active')); await p.evaluate(() => document.querySelector('#dock [data-tab=workout]').click()); await p.waitForTimeout(400); await p.click('#stepsCard'); await p.waitForSelector('.stepsheet'); ok(/Health Connect/.test(await p.textContent('.stepsheet')), 'steps sheet offers Health Connect + manual');
if (OUT) await p.screenshot({ path: `${OUT}/steps-sheet.png` });
ok(!errs.length, 'no page errors ' + errs.join(' | '));
await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL TV TESTS PASSED'); process.exit(fail ? 1 : 0);
