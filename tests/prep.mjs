import { chromium, webkit, devices } from 'playwright-core';
const URL = process.argv[2] || 'http://localhost:8765/';
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log(c ? 'ok  ' : 'FAIL', m); };
for (const [name, type, dev] of [['chrome-android', chromium, devices['Pixel 5']], ['webkit-iphone', webkit, devices['iPhone 13']]]) {
  console.log(`[${name}]`);
  const b = await type.launch(type === chromium ? { executablePath: '/usr/bin/google-chrome' } : {});
  const p = await (await b.newContext({ ...dev, locale: 'en-GB', timezoneId: 'Europe/London' })).newPage(); const errs = []; p.on('pageerror', e => { if (!/access control checks/.test(e.message)) errs.push(e.message); });
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.fill('#regName', 'Mitchell'); await p.fill('#regEmail', 'm@example.com'); await p.fill('#regSecret', '1234'); await p.click('#regBtn'); await p.waitForSelector('#onboard:not([hidden])', { timeout: 15000 }); await p.click('#obSkip');
  ok(/Reta/.test(await p.title()) && /Reta/.test(await p.textContent('.brand')) && !/Kova/.test(await p.textContent('body')), 'renamed: Reta everywhere, no Kova');
  await p.click('.tabs button[data-tab=prep]');
  for (const m of ['breakfast', 'lunch', 'dinner', 'snack']) ok(await p.isVisible('#prep-' + m), 'section ' + m);
  for (const m of ['breakfast', 'lunch', 'dinner']) { const n = await p.$$eval(`#prep-${m} .recipe`, r => r.length); ok(n >= 4, `${m}: ${n} recipes`); }
  ok(await p.$$eval('#prepStorePick .chip', c => c.map(x => x.textContent.replace('✓ ', '')).join(',')) === 'Lidl,Aldi,Asda,Any supermarket', 'store picker Lidl/Aldi/Asda/Any');
  await p.click('[data-pstore=asda]'); ok(/value packs/.test(await p.textContent('#prepStoreNotes')), 'Asda notes shown');
  ok(!/£|\$|€/.test(await p.$eval('#prepSections', e => { const c = e.cloneNode(true); c.querySelectorAll('.guide').forEach(g => g.remove()); return c.textContent; })), 'no prices in batch-cook recipes (GLP-1 builder shows prices separately)');
  const card = await p.textContent('#recipe-p-chickenrice');
  ok(/600 g \/ 1.3 lb/.test(card) && /1 day only/.test(card) && /3 days/.test(card) && /retatrutide/.test(card) && /kcal/.test(card) && /protein/.test(card), 'card: metric+imperial, rice 1 day, chicken 3 days, GLP-1, kcal/protein');
  await p.click('#prepDays [data-days="3"]'); ok(/3 days \+ 1 to freeze/.test(await p.textContent('#recipe-p-chilli')), '3-day prep portions');
  await p.click('#buildWeekBtn'); await p.waitForTimeout(150);
  ok(await p.$$eval('#prepWeek .weekpick', r => r.length) === 3, 'Build my week picked breakfast, lunch and dinner');
  const shopIds = await p.evaluate(() => window.__kova.shop.recipes); ok(shopIds.length === 3, 'shopping list filled with 3 recipes: ' + shopIds.join(','));
  await p.click('#prepWeek [data-swap=lunch]'); await p.waitForTimeout(100); ok((await p.evaluate(() => window.__kova.shop.recipes)).length === 3, 'swap keeps 3');
  await p.click('[data-goshop2]'); ok(await p.$$eval('#shopList .tick', t => t.length) >= 8, 'shop list has prep ingredients: ' + await p.$$eval('#shopList .tick', t => t.length));
  // dislikes respected
  const builds = await p.evaluate(() => { window.__kova.settings && (window.__kova.settings.dislikes = ['chicken', 'egg']); return null; });
  await p.evaluate(() => { const k = Object.keys(localStorage).find(k => k.endsWith('.settings')); const s = JSON.parse(localStorage[k]); s.dislikes = ['chicken', 'eggs']; localStorage[k] = JSON.stringify(s); });
  await p.reload(); await p.click('.tabs button[data-tab=prep]');
  let bad = 0; for (let k = 0; k < 6; k++) { await p.click('#buildWeekBtn'); await p.waitForTimeout(50); if (/chicken|\begg/i.test(await p.textContent('#prepWeek'))) bad++; }
  ok(!bad && !(await p.$('#recipe-p-chickenrice')), 'dislikes (chicken, eggs) never picked or listed');
  await p.click('[data-pstore=lidl]'); await p.evaluate(() => { scrollTo(0, 0); document.getElementById('toast').hidden = true; });
  await p.screenshot({ path: `prep-${name}.png`, fullPage: false });
  // voice
  await p.click('.tabs button[data-tab=workout]');
  await p.evaluate(() => window.__kova.handleHeard(['hey reta what should I prep'])); await p.waitForTimeout(300);
  ok(await p.isVisible('#tab-prep') && /prep/i.test(await p.evaluate(() => window.__kova.captions.slice(-1)[0] || '')), 'voice "Hey Reta, what should I prep?" opens prep + answers: ' + (await p.evaluate(() => window.__kova.captions.slice(-1)[0] || '')).slice(0, 90));
  ok(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
}
process.exitCode = fail ? 1 : 0; console.log(fail ? `${fail} FAILED` : 'all prep checks passed');
