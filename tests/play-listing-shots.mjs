// Demo screenshots for the Play listing draft. Local fixtures only, plus one shot of the live site.
import { chromium, devices } from 'playwright-core';
import fs from 'fs';
const URL = process.argv[2] || 'http://127.0.0.1:8765/';
const OUT = '/opt/cursor/artifacts';
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const phone = await b.newContext({ ...devices['Pixel 7'], locale: 'en-GB', serviceWorkers: 'block' });
const p = await phone.newPage();
await p.route('**/*supabase.co/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
await p.goto(URL + '?demo=' + Date.now(), { waitUntil: 'domcontentloaded' });
if (await p.isVisible('#wCreate')) await p.click('#wCreate');
if (await p.isVisible('#regName')) {
  await p.fill('#regName', 'Demo member');
  await p.fill('#regEmail', `demo${Date.now()}@example.test`);
  await p.fill('#regSecret', 'password123');
  await Promise.all([p.waitForNavigation({ waitUntil: 'domcontentloaded' }), p.click('#regBtn')]);
}
await p.waitForTimeout(400);
if (await p.isVisible('#obSkip')) await p.click('#obSkip');
await p.waitForTimeout(300);
const pre = await p.evaluate(() => { const id = localStorage.getItem('kova.auth.current'); return id ? `kova.u.${id}.` : 'kova.'; });
await p.evaluate(pre => {
  const day = (n) => new Date(Date.now() - n * 864e5).toISOString();
  localStorage.setItem(pre + 'weights', JSON.stringify([{ date: day(21), kg: 92.4 }, { date: day(7), kg: 90.1 }]));
  localStorage.setItem(pre + 'injections', JSON.stringify([{ id: 'demo-inj', med: 'Demo medication', dose: '1', unit: 'mg', at: day(2), site: 'Abdomen', effects: [], notes: 'Demo entry, not a real dose' }]));
  localStorage.setItem(pre + 'settings', JSON.stringify({ name: 'Demo member', plan: 'plus', goalKg: 85, heightCm: 170 }));
}, pre);
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(400);
if (await p.isVisible('#obSkip')) await p.click('#obSkip');
await p.evaluate(() => {
  const bar = document.createElement('div');
  bar.id = 'demoBanner';
  bar.textContent = 'DEMO DATA — not a real member';
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#1a1024;color:#fff;text-align:center;font:700 13px sans-serif;padding:8px 12px';
  document.body.prepend(bar);
});
const shot = async (name, tab) => {
  if (tab) await p.click(`#dock [data-tab="${tab}"]`);
  await p.waitForTimeout(350);
  await p.screenshot({ path: `${OUT}/${name}.png` });
};
await shot('play_demo_home');
await shot('play_demo_fitness', 'workouts');
await shot('play_demo_food', 'foodhub');
await shot('play_demo_progress', 'progress');
await p.click('#orbBtn');
await p.waitForTimeout(300);
await p.screenshot({ path: OUT + '/play_demo_more.png' });
const home = await p.textContent('#dock');
if (!/Home/.test(home) || !/Fitness/.test(home)) throw new Error('demo home is missing the pending dock');

const live = await phone.newPage();
await live.goto('https://glp1life.co.uk/?livecheck=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
await live.waitForTimeout(800);
const liveHtml = await live.content();
if (liveHtml.includes('Fitness Studio') || liveHtml.includes('id="billingStatus"')) throw new Error('live site already has this branch');
const liveDock = (await live.locator('#dock').innerText()).replace(/\s+/g, ' ').trim();
if (liveDock === 'Home Fitness Food Progress More') throw new Error('live dock already matches this redesign');
await live.evaluate(() => {
  const a = document.getElementById('authScreen'); if (a) a.hidden = true;
  const bar = document.createElement('div');
  bar.textContent = 'LIVE SITE — this is not the pending Home, Fitness, Food, Progress dock';
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#7a1f1f;color:#fff;text-align:center;font:700 13px sans-serif;padding:8px 12px';
  document.body.prepend(bar);
});
await live.screenshot({ path: OUT + '/play_live_site_without_redesign.png' });
await b.close();
console.log('PLAY LISTING SHOTS SAVED', { liveDock });
