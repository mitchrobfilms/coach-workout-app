import { nav } from './nav.mjs';
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
// Lidl via the Reta launcher
await nav(p, 'lidl'); await p.waitForTimeout(400);
const ls = await p.textContent('#lidlStatus'); ok(/00:30/.test(ls) && /Last checked/.test(ls), 'Lidl status: ' + ls);
ok(await count('#lidlWeeks .weekbtn') === 2, 'two week buttons');
const wr = await p.$$eval('#lidlWeeks .weekbtn small', l => l.map(x => x.textContent)); ok(wr.every(t => /^\w{3} \d+ \w{3} to \w{3} \d+ \w{3}$/.test(t)) && /^Thu/.test(wr[0]), 'week ranges: ' + wr.join(' | '));
ok(await p.$eval('#lidlWeeks [data-lweek="0"]', e => e.classList.contains('on')), 'This week selected by default');
await p.click('#lidlHp'); await p.waitForTimeout(200); const tw = await count('#lidlOffers .offer'); ok(tw > 0, `Lidl this week offers (${tw})`);
ok(await p.$$eval('#lidlOffers .ostore', l => l.every(x => x.textContent === 'Lidl')), 'Lidl section only shows Lidl');
await p.evaluate(() => scrollTo(0, 0)); if (OUT) await p.screenshot({ path: `${OUT}/lidl-this-week.png` });
await p.click('#lidlWeeks [data-lweek="1"]'); await p.waitForTimeout(300);
ok(await p.$eval('#lidlWeeks [data-lweek="1"]', e => e.classList.contains('on') && getComputedStyle(e).backgroundColor === 'rgb(22, 212, 192)'), 'Next week button turns teal');
const nw = await count('#lidlOffers .offer'), nwt = await p.textContent('#lidlOffers'); ok(nw > 0 || /appear from/.test(nwt), `Lidl next week (${nw}${nw ? '' : ': ' + nwt})`);
ok(/Next week: Thu/.test(await p.textContent('#lidlWeekRange')), 'next week range line');
await p.evaluate(() => scrollTo(0, 0)); if (OUT) await p.screenshot({ path: `${OUT}/lidl-next-week.png` });
ok(/Lidl only publishes offer prices online|Lidl products/.test(await p.textContent('#lidlPriceStatus')), 'Lidl price list status');
ok(await p.isVisible('#lidlManual'), 'in-store prices card');
await p.mouse.wheel(0, 3000); await p.waitForTimeout(400); ok(await p.evaluate(() => scrollY > 500), 'Lidl list scrolls');
ok(await p.$eval('#dock', e => e.classList.contains('hide')), 'dock hides on scroll down');
await p.mouse.wheel(0, -400); await p.waitForTimeout(400); ok(await p.$eval('#dock', e => !e.classList.contains('hide')), 'dock shows on scroll up');
// Dock + launcher
ok(await count('#dock [data-tab]') === 4 && await p.isVisible('#orbBtn'), 'dock: 4 icons + orb');
const db = await p.$$eval('#dock button', l => l.map(b => b.getBoundingClientRect().height)); ok(db.every(h => h >= 48), 'dock touch targets ' + db.map(Math.round).join(','));
await p.click('#dock [data-tab=progress]'); await p.waitForTimeout(450);
ok(await p.$eval('#dockInd', i => { const a = document.querySelector('#dock [data-tab=progress]').getBoundingClientRect(), r = i.getBoundingClientRect(); return Math.abs(a.left - r.left) < 3 && getComputedStyle(i).opacity === '1'; }), 'indicator slides to active item');
ok(await p.$eval('#dock [data-tab=progress] span', e => getComputedStyle(e).opacity === '1') && await p.$eval('#dock [data-tab=food] span', e => getComputedStyle(e).opacity === '0'), 'label only on active item');
await p.click('#orbBtn'); await p.waitForTimeout(400); ok(await p.isVisible('#launcher .lgrid'), 'orb opens launcher');
const tiles = await p.$$eval('#launcher .lgrid button span:last-child', l => l.map(x => x.textContent)); ok(['Coach', 'Aldi', 'Lidl', 'Prices', 'Injection log', 'Certificates', 'Settings'].every(t => tiles.includes(t)), 'launcher tiles: ' + tiles.join(', '));
if (OUT) await p.screenshot({ path: `${OUT}/nav-launcher-open.png` });
await p.click('#launcher [data-lscroll=injCard]'); await p.waitForTimeout(700); ok(await p.isVisible('#tab-progress') && await p.isHidden('#launcher'), 'Injection log tile opens progress');
await p.click('#orbBtn'); await p.waitForTimeout(350); await p.mouse.click(200, 120); await p.waitForTimeout(350); ok(await p.isHidden('#launcher'), 'tap outside closes launcher');
await nav(p, 'settings'); await p.waitForTimeout(300); ok(await p.isVisible('#tab-settings') && await p.$eval('#orbBtn', e => e.classList.contains('active')), 'settings via launcher, orb marked');
await nav(p, 'workout'); await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(450); if (OUT) await p.screenshot({ path: `${OUT}/nav-dock.png` });
// Prices
await nav(p, 'prices'); await p.waitForTimeout(400);
ok(await count('#cmpList .cmp') > 10, `comparison rows (${await count('#cmpList .cmp')})`);
ok(await count('#cmpList .cmpcell .ostore.asda') > 0 && /Typical price/.test(await p.textContent('#cmpList')), 'Asda typical prices in comparison');
ok(!/403|block/i.test(await p.textContent('#tab-prices')), 'no block notice');
await p.fill('#cmpSearch', 'chicken'); await p.waitForTimeout(300);
ok(await count('#cmpList .cmp') > 0 && await count('#cmpMore .offer') > 0, `compare search chicken (${await count('#cmpList .cmp')} staples, ${await count('#cmpMore .offer')} items)`);
await p.fill('#cmpSearch', ''); await p.evaluate(() => scrollTo(0, 0)); if (OUT) await p.screenshot({ path: `${OUT}/prices-only.png` });
ok(!bad.length, 'data files fetched OK ' + bad.join(', ')); ok(!errs.length, 'no console errors ' + errs.join(' | '));
await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL STORE TESTS PASSED'); process.exit(fail ? 1 : 0);
