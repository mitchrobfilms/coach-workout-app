import { nav } from './nav.mjs';
import { chromium, webkit, devices } from 'playwright-core';
const URL = process.argv[2] || 'http://localhost:8765/';
let fail = 0;
for (const [name, type, dev] of [['chrome-android', chromium, devices['Pixel 5']], ['webkit-iphone', webkit, devices['iPhone 13']]]) {
  const b = await type.launch(type === chromium ? { executablePath: '/usr/bin/google-chrome', headless: true } : { headless: true });
  const ctx = await b.newContext({ ...dev, locale: 'en-GB' }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => { if (!/due to access control checks/.test(e.message)) errs.push(e.message); }); // WebKit reports HEAD probes cancelled by the test's own reload as page errors
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload();
  if (await p.$('#authScreen:not([hidden])')) { await p.fill('#regName', 'Test'); await p.fill('#regEmail', 't@example.com'); await p.fill('#regSecret', '1234'); await p.click('#regBtn'); await p.waitForSelector('#onboard:not([hidden])', { timeout: 15000 }); await p.click('#obSkip'); }
  await nav(p, 'progress');
  const r = await p.$eval('#weightBtn', e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; });
  const ir = await p.$eval('#weightInput', e => e.getBoundingClientRect().width);
  console.log(`[${name}] input width ${Math.round(ir)}px, save button ${r.map(Math.round).join('x')}`);
  if (ir < 150 || r[1] < 44) { fail++; console.log('FAIL layout'); }
  const cases = [['85', 'kg', 85], ['85.5', 'kg', 85.5], ['85,5', 'kg', 85.5], ['13st 4lb', 'kg', 84.4], ['13 4', 'st', 84.4], ['190', 'lb', 86.2], ['abc', 'kg', null], ['', 'kg', null]];
  for (const [val, unit, want] of cases) {
    await p.click(`#weightForm .seg button[data-unit=${unit}]`); await p.fill('#weightInput', val);
    await p.tap('#weightBtn').catch(() => p.click('#weightBtn')); await p.waitForTimeout(150);
    const w = await p.evaluate(() => { const k = Object.keys(localStorage).find(k => k.endsWith('weights')); return k ? JSON.parse(localStorage[k]) : []; });
    const last = w[w.length - 1]?.kg, err = await p.$eval('#weightError', e => e.hidden ? '' : e.textContent), t = await p.textContent('#toast');
    const ok = want === null ? !!err : last === want && !err;
    if (!ok) fail++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} "${val}" [${unit}] -> ${want === null ? 'error: ' + err : last + ' kg, toast: ' + t}`);
    if (want === null) await p.evaluate(() => localStorage.setItem('_', '')); 
  }
  // Enter key submits without reloading
  await p.click('#weightForm .seg button[data-unit=kg]'); await p.fill('#weightInput', '84'); const before = await p.evaluate(() => performance.timeOrigin); await p.press('#weightInput', 'Enter'); await p.waitForTimeout(300);
  const reload = (await p.evaluate(() => performance.timeOrigin)) !== before; console.log(`  ${reload ? 'FAIL' : 'ok  '} Enter key saves without page reload`); if (reload) fail++;
  await p.screenshot({ path: `weight-${name}.png`, fullPage: true });
  console.log(`  progress list: ${(await p.$$eval('#weightList li', l => l.map(x => x.textContent))).slice(0, 3).join(' | ')}`);
  console.log(`  errors: ${errs.length ? errs : 'none'}`); if (errs.length) fail++;
  await b.close();
}
console.log(fail ? `${fail} FAILED` : 'ALL WEIGHT UI TESTS PASSED'); process.exitCode = fail ? 1 : 0;
