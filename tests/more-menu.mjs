// More menu: grouped destinations, backdrop/Escape/Close dismissal, keyboard focus, narrow widths.
// Usage: node tests/more-menu.mjs [baseURL]
import { chromium, devices } from 'playwright-core';
import fs from 'fs';
const URL = process.argv[2] || 'http://127.0.0.1:8765/';
const OUT = '/opt/cursor/artifacts';
fs.mkdirSync(OUT, { recursive: true });
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const NAMES = ['Injection log', 'Certificates', 'GLP1 Life Course', 'Community', 'Personal Trainers', 'Photo diary', 'Food check-in', 'Meal plan', 'Recipes', 'Compare prices', 'Aldi', 'Lidl', 'Settings', 'Help', 'Privacy', 'Membership'];
async function signedIn(p) {
  await p.goto(URL + '?t=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__kova?.switchTab);
  if (await p.locator('#authScreen:not([hidden])').count()) {
    await p.locator('#wCreate').click({ force: true });
    await p.fill('#regName', 'More'); await p.fill('#regEmail', `more${Date.now()}@example.com`); await p.fill('#regSecret', 'password123');
    await p.locator('#regBtn').click({ force: true });
    await p.waitForFunction(() => document.getElementById('authScreen')?.hidden);
  }
  if (await p.locator('#onboard:not([hidden])').count()) await p.locator('#obSkip').click({ force: true });
  await p.waitForFunction(() => getComputedStyle(document.getElementById('dock')).display !== 'none');
}
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const phone = await b.newContext({ ...devices['Pixel 7'], locale: 'en-GB', serviceWorkers: 'block' });
const p = await phone.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await signedIn(p);
await p.click('#orbBtn'); await p.waitForSelector('#launcher.open');
const txt = await p.textContent('#launcher');
ok(NAMES.every(n => txt.includes(n)), 'every existing destination is listed');
ok(/£\d/.test(txt) === false, 'More does not promote a price');
ok(await p.locator('#moreAdmin').isHidden(), 'admin row stays hidden without an admin session');
ok(await p.evaluate(() => document.activeElement?.id === 'moreClose'), 'Close is focused when More opens');
await p.keyboard.press('Tab');
ok(/Injection log/.test(await p.evaluate(() => document.activeElement?.innerText || '')), 'Tab moves to the first row');
await p.keyboard.press('Shift+Tab');
ok(await p.evaluate(() => document.activeElement?.id === 'moreClose'), 'Shift+Tab returns to Close');
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
ok(await p.isHidden('#launcher'), 'Escape closes More');
await p.click('#orbBtn'); await p.waitForSelector('#launcher.open');
await p.mouse.click(200, 120); await p.waitForTimeout(400);
ok(await p.isHidden('#launcher'), 'tap on the dimmed area closes More');
await p.click('#orbBtn'); await p.waitForSelector('#launcher.open');
const above = await p.evaluate(() => { const r = document.querySelector('.lsheet').getBoundingClientRect(); return { x: Math.round(r.left + 24), y: Math.max(8, Math.round(r.top - 24)), top: Math.round(r.top) }; });
ok(above.top > 120, `sheet starts below the backdrop (${above.top})`);
await p.mouse.click(above.x, above.y); await p.waitForTimeout(400);
ok(await p.isHidden('#launcher'), 'tap just above the sheet closes More');
await p.click('#orbBtn'); await p.waitForSelector('#launcher.open');
await p.click('#moreClose'); await p.waitForTimeout(400);
ok(await p.isHidden('#launcher'), 'Close button dismisses More');
await p.click('#orbBtn'); await p.waitForSelector('#launcher.open');
await p.evaluate(() => scrollTo(0, 0));
await p.waitForTimeout(400);
await p.screenshot({ path: OUT + '/more_mobile_top.png' });
await p.evaluate(() => { const s = document.querySelector('.lsheet'); s.scrollTop = s.scrollHeight; });
await p.waitForTimeout(200);
await p.screenshot({ path: OUT + '/more_mobile_bottom.png' });
await p.click('#launcher [data-tab=classes]');
await p.waitForTimeout(400);
ok(await p.isVisible('#tab-classes') && await p.isHidden('#launcher'), 'course row opens the course and closes More');
await p.screenshot({ path: OUT + '/more_opened_course.png' });
await p.click('#orbBtn'); await p.waitForSelector('#launcher.open');
await p.click('#launcher [data-lscroll=injCard]');
await p.waitForTimeout(500);
ok(await p.isVisible('#tab-progress') && await p.isHidden('#launcher'), 'injection log row opens Progress');
ok(!errs.length, 'no page errors ' + errs.join(' | '));
await phone.close();

for (const [w, h] of [[320, 640], [360, 740], [393, 852], [1280, 800]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'en-GB', serviceWorkers: 'block', isMobile: w < 500, hasTouch: w < 500 });
  const q = await ctx.newPage();
  await signedIn(q);
  await q.evaluate(() => { scrollTo(0, 0); document.getElementById('orbBtn').click(); });
  await q.waitForSelector('#launcher.open');
  const fit = await q.evaluate(() => {
    const W = innerWidth, sheet = document.querySelector('.lsheet').getBoundingClientRect(), dock = document.querySelector('.dock').getBoundingClientRect();
    const rows = [...document.querySelectorAll('.morerow')].filter(e => e.offsetParent);
    const bad = [];
    if (document.documentElement.scrollWidth > W + 1) bad.push('page overflow');
    if (sheet.left < -1 || sheet.right > W + 1) bad.push('sheet off screen');
    if (sheet.bottom > dock.top + 8) bad.push('sheet under dock ' + Math.round(sheet.bottom) + '>' + Math.round(dock.top));
    for (const e of rows) { const r = e.getBoundingClientRect(); if (r.height < 48) bad.push('short ' + e.innerText.slice(0, 16)); if (r.right > W + 1) bad.push('clip ' + e.innerText.slice(0, 16)); }
    return { bad, sheetTop: Math.round(sheet.top), canScroll: document.querySelector('.lsheet').scrollHeight > document.querySelector('.lsheet').clientHeight + 2 };
  });
  ok(!fit.bad.length && fit.sheetTop > 40, `${w}x${h} more fits ${JSON.stringify(fit)}`);
  if (w === 1280) {
    await q.waitForTimeout(400);
    await q.screenshot({ path: OUT + '/desktop_more.png' });
    await q.keyboard.press('Escape'); await q.waitForTimeout(300);
    ok(await q.isHidden('#launcher'), 'desktop Escape closes More');
  }
  await ctx.close();
}
await b.close();
console.log(fail ? `${fail} FAILED` : 'ALL MORE MENU CHECKS PASSED');
process.exit(fail ? 1 : 0);
