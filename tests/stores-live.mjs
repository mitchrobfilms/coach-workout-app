// Aldi / Lidl / Prices sections against real data. Usage: node tests/stores-live.mjs [URL] [OUTDIR]
// Default URL is the live site. Registers a fresh account at Android phone size, then taps through every section.
import { chromium, devices } from 'playwright-core';
const URL = process.argv[2] || 'https://mitchrobfilms.github.io/coach-workout-app/', OUT = process.argv[3] || '';
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log(c ? 'ok  ' : 'FAIL', m); };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const ctx = await b.newContext({ ...devices['Pixel 7'] }); const p = await ctx.newPage(); const errs = [], bad = [];
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/404|favicon/.test(m.text()) && errs.push(m.text()));
p.on('response', r => /\/data\/.+\.json/.test(r.url()) && !r.ok() && bad.push(r.status() + ' ' + r.url()));
await p.goto(URL + '?t=' + Date.now(), { waitUntil: 'networkidle' });
await p.fill('#regName', 'Test'); await p.fill('#regEmail', 't@example.com'); await p.fill('#regSecret', '4321'); await p.click('#regBtn'); await p.waitForTimeout(1200);
if (await p.isVisible('#obSkip')) await p.click('#obSkip'); await p.waitForTimeout(500);
const count = sel => p.$$eval(sel, l => l.length);
// home tiles
ok(await p.isVisible('.hometiles [data-gotab=aldi]') && await p.isVisible('.hometiles [data-gotab=lidl]') && await p.isVisible('.hometiles [data-gotab=prices]'), 'three home tiles');
// Aldi
await p.click('.hometiles [data-gotab=aldi]'); await p.waitForTimeout(1500);
ok(await p.isVisible('#tab-aldi'), 'Aldi tile opens Aldi section');
const as = await p.textContent('#aldiStatus'); ok(/00:30/.test(as) && /Last checked: \d+ \w+, \d\d:\d\d UK/.test(as), 'Aldi status: ' + as);
ok(await count('#aldiOffers .offer') > 0, `Aldi offers render (${await count('#aldiOffers .offer')})`);
await p.click('#aldiHp'); await p.waitForTimeout(200); ok(await count('#aldiOffers .offer') > 0, `Aldi all offers (${await count('#aldiOffers .offer')})`);
ok(await count('#aldiPriceList .offer') > 0, `Aldi price list renders (${await count('#aldiPriceList .offer')})`);
await p.click('#aldiCats [data-pcat=Eggs]'); await p.waitForTimeout(700);
ok(await p.$eval('#aldiCats [data-pcat=Eggs]', e => e.classList.contains('on') && getComputedStyle(e).backgroundColor !== getComputedStyle(document.querySelector('#aldiCats [data-pcat=All]')).backgroundColor), 'tapped category is highlighted');
const eggs = await p.$$eval('#aldiPriceList .offer b', l => l.map(x => x.textContent)); ok(eggs.length > 0 && eggs.some(t => /egg/i.test(t)), `Eggs category shows eggs (${eggs.length})`);
ok(await p.$eval('#aldiPriceCount', e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }), 'results scrolled into view after tapping category');
if (OUT) await p.screenshot({ path: `${OUT}/aldi-section.png` });
await p.click('#aldiCats [data-pcat=All]'); await p.fill('#aldiSearch', 'chicken'); await p.waitForTimeout(300);
ok(await count('#aldiPriceList .offer') > 0 && /chicken/i.test(await p.textContent('#aldiPriceCount')), `search "chicken" (${await p.textContent('#aldiPriceCount')})`);
ok(await p.$eval('#aldiSearch', e => getComputedStyle(e).color) === 'rgb(11, 17, 22)', 'search text is dark');
ok(/was|Last price/.test(await p.textContent('#aldiPriceList')), 'last-price history shown');
await p.fill('#aldiSearch', 'zzzz'); await p.waitForTimeout(200); ok(/No matches/.test(await p.textContent('#aldiPriceList')), 'empty state');
if (OUT) { await p.fill('#aldiSearch', ''); await p.evaluate(() => scrollTo(0, 0)); await p.click('#aldiHp'); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/aldi-section-top.png` }); }
// Lidl via nav
await p.click('.tabs button[data-tab=lidl]'); await p.waitForTimeout(400);
const ls = await p.textContent('#lidlStatus'); ok(/00:30/.test(ls) && /Last checked/.test(ls), 'Lidl status: ' + ls);
ok(await count('#lidlOffers .offer') > 0, `Lidl offers render (${await count('#lidlOffers .offer')})`);
await p.click('#lidlHp'); await p.waitForTimeout(200); ok(await count('#lidlOffers .offer') > 0, `Lidl all offers (${await count('#lidlOffers .offer')})`);
ok(await p.$$eval('#lidlOffers .ostore', l => l.every(x => x.textContent === 'Lidl')), 'Lidl section only shows Lidl');
await p.evaluate(() => scrollTo(0, 0)); if (OUT) await p.screenshot({ path: `${OUT}/lidl-section.png` });
await p.mouse.wheel(0, 3000); await p.waitForTimeout(300); ok(await p.evaluate(() => scrollY > 500), 'Lidl list scrolls');
// Prices
await p.click('.tabs button[data-tab=prices]'); await p.waitForTimeout(400);
ok(await count('#cmpList .cmp') > 10, `comparison rows (${await count('#cmpList .cmp')})`);
ok(await count('#cmpList .cmpcell .ostore.asda') > 0 && /Typical price/.test(await p.textContent('#cmpList')), 'Asda typical prices in comparison');
ok(!/403|block/i.test(await p.textContent('#tab-prices')), 'no block notice');
await p.fill('#cmpSearch', 'chicken'); await p.waitForTimeout(300);
ok(await count('#cmpList .cmp') > 0 && await count('#cmpMore .offer') > 0, `compare search chicken (${await count('#cmpList .cmp')} staples, ${await count('#cmpMore .offer')} items)`);
await p.fill('#cmpSearch', ''); await p.evaluate(() => scrollTo(0, 0)); if (OUT) await p.screenshot({ path: `${OUT}/prices-only.png` });
ok(!bad.length, 'data files fetched OK ' + bad.join(', ')); ok(!errs.length, 'no console errors ' + errs.join(' | '));
await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL STORE TESTS PASSED'); process.exit(fail ? 1 : 0);
