// Text zoom N% is emulated as a CSS viewport of width/N at devicePixelRatio N (same layout as Android font scaling of rem/px UI).
// Device-fit audit: widths 320-1024 + landscape, text zoom 100/130/160%, gesture vs 3-button nav (bottom inset 24/48 px),
// 32 px status bar. Checks overflow, clipped/overlapping tap targets, class sheet below status bar with nav hidden.
// Tiles -> /tmp/grid (compose with tools/grid.py), plus trainers-after.png and home-after.png.
import { chromium, devices } from 'playwright-core';
const URL = process.argv[2] || 'http://localhost:8765/', OUT = '/workspace/shots/glp1life', TILES = '/tmp/grid';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
let fail = 0; const ok = (c, m) => { if (!c) { console.log('FAIL', m); fail++; } };
const DEV = [[320, 640], [360, 800], [384, 832], [393, 851], [412, 915], [480, 960], [673, 841], [884, 1104], [768, 1024], [1024, 1366]];
const TABS = ['workout', 'progress', 'prep', 'classes', 'trainers', 'prices', 'settings', 'member', 'community'];
async function page(w, h, zoom = 1, nav = 24) {
  const ctx = await b.newContext({ ...devices['Pixel 5'], viewport: { width: Math.round(w / zoom), height: Math.round(h / zoom) }, deviceScaleFactor: zoom, locale: 'en-GB' }); const p = await ctx.newPage();
  await p.addInitScript(([z, n]) => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = `:root{--sat-fb:${Math.round(32 / z)}px;--sab-fb:${Math.round(n / z)}px}`; document.head.append(s); }); }, [zoom, nav]);
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  if (await p.isVisible('#wCreate')) await p.click('#wCreate');
  if (await p.isVisible('#regName')) { await p.fill('#regName', 'Mitchell'); await p.fill('#regEmail', `m${w}@example.com`); await p.fill('#regSecret', 'password123'); if (await p.isVisible('#regSecret2')) await p.fill('#regSecret2', 'password123'); await p.press('#regSecret', 'Enter'); }
  await p.waitForTimeout(600);
  if (await p.isVisible('#onboard')) await p.evaluate(() => { const k = Object.keys(localStorage).find(k => k.endsWith('.settings')); const s = JSON.parse(localStorage[k] || '{}'); s.onboarded = true; localStorage[k] = JSON.stringify(s); }).then(() => p.reload()).then(() => p.waitForTimeout(700));
  return { p, ctx };
}
const audit = p => p.evaluate(() => {
  const W = innerWidth, bad = [], vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden'; };
  if (document.documentElement.scrollWidth > W + 1) bad.push(`overflow ${document.documentElement.scrollWidth}>${W}`);
  const t = [...document.querySelectorAll('.tab.active a, .tab.active button, .tab.active .linkcard, .tab.active .trtags li')].filter(vis).filter(e => !e.closest('.catscroll, .vchips, .cmtabs') && !(e.closest('details:not([open])') && !e.closest('summary')));
  for (const e of t) { const r = e.getBoundingClientRect(); if (r.right > W + 1 || r.left < -1) bad.push(`clipped ${e.id || e.className} "${e.textContent.trim().slice(0, 25)}"`); }
  for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) { if (t[i].contains(t[j]) || t[j].contains(t[i])) continue; const a = t[i].getBoundingClientRect(), c = t[j].getBoundingClientRect(); if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 4 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 4) bad.push(`overlap "${t[i].textContent.trim().slice(0, 18)}" / "${t[j].textContent.trim().slice(0, 18)}"`); }
  return [...new Set(bad)].slice(0, 6);
});
const go = async (p, t) => { await p.evaluate(t => { const b = document.querySelector(`.dock [data-tab="${t}"]`); if (b) b.click(); else window.__kova?.switchTab?.(t); }, t); await p.waitForTimeout(350); };
let n = 0, checks = 0;
for (const [w, h] of DEV) for (const [z, nav] of [[1, 24], [1.3, 48], [1.6, 24]]) {
  if (z === 1.6 && w > 480) continue;
  const { p, ctx } = await page(w, h, z, nav);
  for (const t of TABS) { await go(p, t); const bad = await audit(p); checks++; ok(!bad.length, `${w}x${h} zoom ${z * 100}% nav ${nav}px ${t}: ${bad.join('; ')}`); }
  if (z === 1.3 && w === 393) { await go(p, 'trainers'); await p.screenshot({ path: `${OUT}/trainers-after.png`, fullPage: true }); }
  if (z === 1 && w === 393) { await go(p, 'workout'); await p.screenshot({ path: `${OUT}/home-after.png` }); }
  if (z !== 1.6) { await go(p, 'classes');
    const opened = await p.evaluate(() => { const c = document.querySelector('#supportCards [data-support], #supportCards button, #supportCards .card'); c?.click(); return !!c; }); await p.waitForTimeout(450);
    if (opened && await p.isVisible('#recipeModal')) { const m = await p.evaluate(() => { const s = document.querySelector('#recipeModal .rsheet').getBoundingClientRect(), x = document.querySelector('#recipeClose').getBoundingClientRect(), d = document.querySelector('#dock'); return { top: s.top, bottom: s.bottom, h: innerHeight, xTop: x.top, nav: d ? getComputedStyle(d).display : 'none' }; });
      checks++; ok(m.top >= 32 / z && m.xTop >= 32 / z && m.bottom <= m.h + 1 && m.nav === 'none', `${w}x${h} zoom ${z * 100}% sheet top ${Math.round(m.top)} close ${Math.round(m.xTop)} bottom ${Math.round(m.bottom)}/${m.h} nav ${m.nav}`); }
    if (z === 1 || w === 360) await p.screenshot({ path: `${TILES}/${String(n++).padStart(2, '0')}_${w}x${h}_${z * 100}.png` }); await p.click('#recipeClose').catch(() => {}); }
  await ctx.close();
}
for (const [w, h] of [[800, 360], [915, 412]]) { const { p, ctx } = await page(w, h, 1, 0); for (const t of TABS) { await go(p, t); const bad = await audit(p); checks++; ok(!bad.length, `landscape ${w}x${h} ${t}: ${bad.join('; ')}`); } await go(p, 'workout'); await p.screenshot({ path: `${TILES}/${String(n++).padStart(2, '0')}_${w}x${h}_100.png` }); await ctx.close(); }
await b.close(); console.log(`${checks} checks, ${fail ? fail + ' FAILED' : 'ALL DEVICE-FIT CHECKS PASSED'}`); process.exit(fail ? 1 : 0);
