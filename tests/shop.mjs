import { nav } from './nav.mjs';
import { chromium, webkit, devices } from 'playwright-core';
const URL = process.argv[2] || 'http://localhost:8765/';
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log(c ? 'ok  ' : 'FAIL', m); };
for (const [name, type, dev] of [['chrome-android', chromium, devices['Pixel 5']], ['webkit-iphone', webkit, devices['iPhone 13']]]) {
  console.log(`[${name}]`);
  const b = await type.launch(type === chromium ? { executablePath: '/usr/bin/google-chrome' } : {});
  const p = await (await b.newContext({ ...dev, locale: 'en-GB', timezoneId: 'Europe/London' })).newPage(); const errs = []; p.on('pageerror', e => { if (!/access control checks/.test(e.message)) errs.push(e.message); else console.log('  (ignored WebKit unload-cancelled fetch:', e.message.slice(0, 60) + ')'); });
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload();
  const reg = async (n, e) => { await p.fill('#regName', n); await p.fill('#regEmail', e); await p.fill('#regSecret', '1234'); await p.click('#regBtn'); await p.waitForSelector('#onboard:not([hidden])', { timeout: 15000 }); await p.click('#obSkip'); };
  await reg('Mitchell', 'm@example.com');
  await p.click('#orbBtn'); await p.waitForTimeout(350); ok(await p.isVisible('#launcher [data-tab=shop]'), 'Shop tile in launcher'); await p.click('#orbBtn'); await p.waitForTimeout(300);
  await nav(p, 'food'); await p.click('#tab-food [data-goshop]'); ok(await p.isVisible('#tab-shop'), 'Food tab CTA opens Shop');
  ok(await p.$$eval('.recipe', r => r.length) >= 10, 'recipes listed: ' + await p.$$eval('.recipe', r => r.length));
  const first = await p.textContent('#recipe-chicken-rice-veg'); ok(/300 g \/ 11 oz/.test(first) && /Pack: 600g–1kg pack/.test(first), 'recipe shows metric/imperial + pack hint');
  ok((await p.textContent('#storeNote')).length > 10 && await p.isVisible('#storePick [data-store=lidl].on'), 'UK -> Lidl preselected');
  ok(await p.$$eval('#storePick .chip', c => c.map(x => x.textContent).join(',')) === 'Lidl,Aldi,Asda,Any supermarket', 'stores: Lidl, Aldi, Asda, Any');
  ok(!/£|\$|€|\bprice:/i.test(await p.textContent('#tab-shop')), 'no prices shown');
  await p.click('[data-week=chicken-rice-veg]'); await p.click('[data-week=lentil-chilli]');
  ok((await p.textContent('#shopCount')).endsWith('/' + await p.$$eval('#shopList .tick', t => t.length)) && await p.$$eval('#shopList .tick', t => t.length) >= 10, 'this week list built: ' + await p.textContent('#shopCount'));
  ok(/250 g \(9 oz\) for Chicken.*300 g \(11 oz\) for Lentil/s.test(await p.textContent('#shopList')), 'merged rice quantities across recipes');
  await p.click('#shopList input[data-tick="eggs"], #shopList input[data-tick]'); await p.waitForTimeout(100);
  ok(/^1\//.test(await p.textContent('#shopCount')), 'tick-off updates count: ' + await p.textContent('#shopCount'));
  await p.click('#basicsList [data-addcat="Dairy & eggs"]'); await p.waitForTimeout(100);
  ok((await p.textContent('#shopList')).includes('Cottage cheese'), 'basics category added to list');
  await p.reload(); await nav(p, 'shop');
  ok(/^1\//.test(await p.textContent('#shopCount')) && (await p.textContent('#shopList')).includes('Cottage cheese'), 'list + ticks persist after reload');
  await p.screenshot({ path: `shop-${name}.png`, fullPage: false });
  // per-account
  await nav(p, 'settings'); await p.click('#logoutBtn'); await p.waitForTimeout(600); await p.click('#toRegister'); await reg('Sam', 's@example.com');
  await nav(p, 'shop'); ok((await p.textContent('#shopList')).includes('Your list is empty'), 'second account has its own empty list');
  // dislikes filter recipes
  await nav(p, 'settings'); await p.click('#foodPicker [data-f=eggs]'); await p.click('#foodPicker [data-f=eggs]');
  await nav(p, 'shop'); ok(!(await p.textContent('#recipeList')).match(/\bEggs\b|omelette/i), 'recipes with disliked eggs hidden');
  console.log('  errors:', errs.length ? errs : 'none'); if (errs.length) fail++;
  await b.close();
}
console.log(fail ? `${fail} FAILED` : 'ALL SHOP TESTS PASSED'); process.exitCode = fail ? 1 : 0;
