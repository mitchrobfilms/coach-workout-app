import { chromium, devices } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const TABS = ['workout', 'progress', 'prep', 'classes', 'workouts', 'trainers', 'prices', 'aldi', 'lidl', 'settings', 'community'];
let bad = 0;
for (const [w, h] of [[320, 640], [360, 800], [412, 915], [480, 1000], [768, 1024]]) {
  const ctx = await b.newContext({ ...devices['Pixel 5'], viewport: { width: w, height: h } }); const p = await ctx.newPage();
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(1200);
  await p.click('#wCreate'); await p.fill('#regName', 'Mitchell Robinson'); await p.fill('#regEmail', 'g@example.com'); await p.fill('#regSecret', 'password123'); await p.press('#regSecret', 'Enter'); await p.waitForTimeout(1200);
  if (await p.isVisible('#obSkip')) await p.click('#obSkip'); await p.waitForTimeout(500);
  for (const t of TABS) {
    await p.evaluate(t => window.__kova.switchTab(t), t); await p.waitForTimeout(250);
    const r = await p.evaluate(() => { const over = document.documentElement.scrollWidth > innerWidth + 1; scrollTo(0, 1e7); return new Promise(res => setTimeout(() => { const d = document.querySelector('.dock').getBoundingClientRect(); const tab = document.querySelector('.tab.active'); const els = [...tab.querySelectorAll('*')].filter(e => e.offsetParent && !e.children.length && e.getBoundingClientRect().height); const last = Math.max(...els.map(e => e.getBoundingClientRect().bottom)); res({ over, under: last > d.top + 1, last: Math.round(last), dock: Math.round(d.top) }); }, 200)); });
    if (r.over || r.under) { bad++; console.log('ISSUE', w + 'x' + h, t, JSON.stringify(r)); }
  }
  await p.screenshot({ path: `/workspace/shots/glp1life/grid-${w}x${h}-community.png` }); await ctx.close();
}
await b.close(); console.log(bad ? `${bad} issues` : 'GRID CLEAN');
