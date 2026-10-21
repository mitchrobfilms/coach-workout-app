import { chromium } from 'playwright-core';
const URL = process.argv[2] || 'https://glp1life.co.uk/', O = '/workspace/shots/glp1life/course-' + (process.argv[3] || 'live');
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36' });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push('console: ' + m.text())); p.on('requestfailed', r => errs.push('reqfail ' + r.url()));
await p.goto(URL); await p.waitForTimeout(2500);
console.log('logged-out visible:', await p.evaluate(() => [...document.querySelectorAll('section.tab')].filter(s => s.offsetParent).map(s => s.id).join()), 'dock:', await p.$('#dock') && await p.isVisible('#dock'));
// no real cloud signup on live: reveal the app shell behind the auth screen (read-only)
await p.evaluate(() => { document.body.classList.remove('authScreen'); document.querySelectorAll('.overlay:not([hidden]), #authWrap, #welcome').forEach(e => e.hidden = true); }); await p.waitForTimeout(500);
await p.screenshot({ path: O + '-afterreg.png' }); console.log('after reg tabs:', await p.evaluate(() => [...document.querySelectorAll('section.tab')].filter(s => s.offsetParent).map(s => s.id).join() + ' body:' + document.body.className + ' ' + document.querySelector('.overlay:not([hidden])')?.id)); await p.click('#dock [data-tab=workouts]'); await p.waitForTimeout(1500); await p.screenshot({ path: O + '-fitness.png' });
const card = await p.$('#tab-workouts [data-goto=classes]'); console.log('course card visible:', card && await card.isVisible());
if (card) await card.click(); await p.waitForTimeout(1500);
const st = await p.evaluate(() => ({ tab: [...document.querySelectorAll('section.tab')].filter(s => s.offsetParent).map(s => s.id).join(), mods: document.querySelectorAll('#courseRoot .cmod').length, lessons: document.querySelectorAll('#courseRoot [data-lesson]').length, html: document.querySelector('#courseRoot')?.innerHTML.slice(0, 200) }));
console.log(JSON.stringify(st)); await p.screenshot({ path: O + '-modules.png' });
if (st.mods) { await p.click('#courseRoot .cmod summary'); await p.click('#courseRoot [data-lesson]'); await p.waitForTimeout(1500); await p.screenshot({ path: O + '-lesson.png' }); console.log('lesson open:', await p.isVisible('#lessonModal')); await p.click('#lessonModal .rclose, #lessonModal [aria-label=Close]').catch(() => {}); }
console.log('errors:', errs.join(' | ') || 'none'); await b.close();
