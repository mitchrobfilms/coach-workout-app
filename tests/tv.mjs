// TV = Google Cast only: no TV-browser mode / ?tv=1 guidance / AirPlay; the class screen has a Cast button that casts the class video.
import { chromium, devices } from 'playwright-core';
const URL = process.argv[2] || 'http://localhost:8765/';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' }); const p = await (await b.newContext({ ...devices['Pixel 5'] })).newPage();
await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(500);
const html = await p.content();
ok(!/tvCard|\?tv=1|AirPlay|Watch on your TV|big-screen/i.test(html), 'no TV-browser mode, ?tv=1 or AirPlay in the UI');
ok(await p.$('#castBtn') !== null && /Cast/.test(await p.textContent('#castBtn')), 'Cast button on the class screen');
const cast = await p.evaluate(async () => (await import('./cast.js')).castClick(null)); ok(cast === 'nocast', 'no Cast SDK -> friendly "nocast" (no AirPlay / TV-mode fallback)');
await p.goto(URL + '?tv=1'); await p.waitForTimeout(500); ok(!(await p.evaluate(() => document.documentElement.classList.contains('tv'))), '?tv=1 no longer switches modes');
await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL CAST TESTS PASSED'); process.exit(fail ? 1 : 0);
