// Settings > App updates row (web + simulated APK) + Classes screenshots.
import { chromium, devices } from 'playwright-core';
const URL = process.argv[2] || 'http://localhost:8765/', OUT = '/workspace/shots/glp1life';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
for (const apk of [false, true]) {
  const ctx = await b.newContext({ ...devices['Pixel 5'] }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  if (apk) await ctx.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, Plugins: { App: { getInfo: async () => ({ version: '1.0.6', build: '6' }) }, ApkUpdater: { openCastSettings: async () => ({}) } } }; });
  if (apk) await p.route('https://api.github.com/**', r => r.fulfill({ json: { tag_name: 'apk-v1.0.7', assets: [{ name: 'GLP1-Life.apk', browser_download_url: 'https://github.com/x/GLP1-Life.apk' }] } }));
  await p.goto(URL); await p.waitForTimeout(1500);
  await p.click('#wCreate'); await p.fill('#regName', 'Sia'); await p.fill('#regEmail', 'u@example.com'); await p.fill('#regSecret', 'password123'); await p.press('#regSecret', 'Enter'); await p.waitForTimeout(1500);
  if (await p.isVisible('#obSkip')) await p.click('#obSkip');
  await p.waitForTimeout(2500);
  if (apk) ok(await p.isVisible('#apkUpdate'), 'APK: update banner auto-shows on launch when newer release exists');
  await p.evaluate(() => window.__kova?.switchTab ? window.__kova.switchTab('settings') : document.querySelector('[data-tab="settings"]')?.click());
  await p.waitForTimeout(500); await p.$eval('#updCard', e => e.scrollIntoView({ block: 'center' }));
  await p.click('#updCheck'); await p.waitForTimeout(1200);
  const t = await p.textContent('#updInfo'); console.log(t);
  ok(apk ? /Installed: v1\.0\.6.*v1\.0\.7 available/.test(t) : /web v36/.test(t), `${apk ? 'APK' : 'web'}: Check for updates row shows version`);
  await p.screenshot({ path: `${OUT}/settings-updates-${apk ? 'apk' : 'web'}.png` });
  if (!apk) { await p.evaluate(() => document.querySelector('.dock [data-tab="classes"]').click()); await p.waitForTimeout(800); await p.screenshot({ path: `${OUT}/classes-no-30min.png`, fullPage: true }); }
  ok(!errs.length, 'no page errors ' + errs.join('|')); await ctx.close();
}
await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL UPDATE TESTS PASSED'); process.exit(fail ? 1 : 0);
