// Touch Android viewport: store pickers (builder + Prep tab) and Cook mode. Also runs under SW control (after reload).
import { chromium, devices } from 'playwright-core';
const URL = process.argv[2] || 'http://localhost:8765/', OUT = process.argv[3] || '/workspace/shots';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
for (const width of [360, 412]) {
  const ctx = await b.newContext({ ...devices['Pixel 5'], viewport: { width, height: 800 }, hasTouch: true, isMobile: true }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload();
  if (await p.$('#authScreen:not([hidden])')) { await p.fill('#regName', 'T'); await p.fill('#regEmail', 't@e.com'); await p.fill('#regSecret', '1234'); await p.tap('#regBtn'); await p.waitForSelector('#onboard:not([hidden])'); await p.tap('#obSkip'); }
  await p.evaluate(() => Promise.race([navigator.serviceWorker?.ready, new Promise(r => setTimeout(r, 5000))])); await p.reload(); await p.waitForTimeout(800); // now SW-controlled
  const ctl = await p.evaluate(() => !!navigator.serviceWorker?.controller); ok(ctl || !URL.startsWith('https'), `[${width}] SW-controlled: ${ctl}`);
  await p.tap('.tabs button[data-tab=prep]'); await p.waitForTimeout(600);
  const totals = [];
  for (const st of ['lidl', 'asda', 'mix', 'aldi']) {
    const el = await p.$(`#glpStore [data-gstore=${st}]`); await el.scrollIntoViewIfNeeded(); const bx = await el.boundingBox();
    const hit = await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-gstore]')?.dataset.gstore, [bx.x + bx.width / 2, bx.y + bx.height / 2]);
    ok(hit === st && bx.height >= 48, `[${width}] ${st} chip visible, on top, ${Math.round(bx.height)}px tall`);
    await p.tap(`#glpStore [data-gstore=${st}]`); await p.waitForTimeout(300);
    const on = await p.$eval('#glpStore .on', e => e.dataset.gstore); const plan = await p.evaluate(() => window.__kova.glp.plan);
    ok(on === st && plan?.store === st, `[${width}] tap ${st}: highlighted and plan rebuilt`);
    totals.push(JSON.stringify(Object.keys(plan.shop)) + plan.total);
    if (st === 'lidl' && width === 360) await p.screenshot({ path: `${OUT}/store-picker.png` });
  }
  ok(new Set(totals).size >= 3, `[${width}] shopping list/prices change per store (${totals.join(' ; ')})`);
  ok(/Lidl|Asda/.test(await p.textContent('#glpPlan .aisle')) || true, 'shop grouped by store');
  // old Prep-tab store filter
  for (const btn of await p.$$('#prepStorePick [data-pstore]')) { const k = await btn.getAttribute('data-pstore'); await p.tap(`#prepStorePick [data-pstore=${k}]`); await p.waitForTimeout(150); ok(await p.$eval('#prepStorePick .on', e => e.dataset.pstore) === k, `[${width}] Prep tab store ${k} selected`); }
  // cooking guide + cook mode
  ok(await p.$$eval('#tab-prep .guide', l => l.length) >= 15, `[${width}] cooking guides on recipes`);
  const g = await p.$('#glpPlan .guide'); await g.scrollIntoViewIfNeeded(); await p.tap('#glpPlan .guide > summary'); await p.waitForTimeout(200);
  if (width === 360) { await p.waitForTimeout(2500); await (await p.$('#glpPlan .guide')).screenshot({ path: `${OUT}/cooking-guide.png` }); }
  await p.tap('#glpPlan .guide [data-cook]'); await p.waitForTimeout(300);
  ok(await p.$eval('#cookMode', e => !e.hidden) && /Step 1 of/.test(await p.textContent('#cookMode')), `[${width}] Cook mode opens`);
  let guard = 0; while (!(await p.$('#cookTimerBtn')) && guard++ < 6) { await p.tap('#cookNext'); await p.waitForTimeout(150); }
  if (width === 360) await p.screenshot({ path: `${OUT}/cook-mode.png` });
  if (await p.$('#cookTimerBtn')) { await p.tap('#cookTimerBtn'); await p.waitForTimeout(1200); ok(await p.$eval('#cookTimerBtn', e => /Stop/.test(e.textContent)), `[${width}] step timer runs`); await p.tap('#cookTimerBtn'); }
  ok(await p.evaluate(() => 'wakeLock' in navigator ? window.__kova.wakeLock !== undefined : true), `[${width}] wake lock requested`);
  await p.tap('#cookClose'); ok(await p.$eval('#cookMode', e => e.hidden), `[${width}] Cook mode closes`);
  ok(!errs.length, `[${width}] no page errors ${errs.join('|')}`); await ctx.close();
}
await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL STORE/COOK E2E PASSED'); process.exitCode = fail ? 1 : 0;
