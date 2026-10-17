import { chromium, devices } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const p = await (await b.newContext({ ...devices['Pixel 5'] })).newPage();
await p.goto('http://localhost:8765/'); await p.click('.tabs button[data-tab=progress]');
await p.setViewportSize({ width: 393, height: 430 }); // keyboard open: ~half the screen
await p.focus('#weightInput'); await p.waitForTimeout(900);
const vis = await p.$eval('#weightBtn', e => { const r = e.getBoundingClientRect(); const nav = document.querySelector('.tabs').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, navTop: Math.round(nav.top) }; });
console.log(vis, vis.bottom <= vis.navTop ? 'Save visible above nav/keyboard' : 'Save HIDDEN');
await p.screenshot({ path: 'weight-keyboard.png' }); await b.close();
