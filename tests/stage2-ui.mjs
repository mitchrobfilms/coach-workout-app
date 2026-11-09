// Stage 2 UI: food diary edit/save without calling Gemini or writing production data, plus weight units and the 3 L water goal.
// Usage: node tests/stage2-ui.mjs [baseURL]
import { chromium, devices } from 'playwright-core';
const URL = process.argv[2] || 'http://127.0.0.1:8765/';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const ANALYSIS = {
  is_food: true, message: 'Test fixture estimate, not a live photo check.', portion: 'medium', score: 'Protein star',
  tips: ['Start with the protein on your plate first.'],
  items: [
    { name: 'Chicken breast', state: 'cooked', grams: 150, kcal: 248, protein_g: 46, carbs_g: 0, fat_g: 5, fibre_g: 0, confidence: 'high' },
    { name: 'White rice', state: 'cooked', grams: 150, kcal: 195, protein_g: 4, carbs_g: 42, fat_g: 1, fibre_g: 1, confidence: 'high' },
  ],
};
let saved = [];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'en-GB', serviceWorkers: 'block' });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.route('**/*supabase.co/**', route => {
  const url = route.request().url(), method = route.request().method();
  const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.includes('/functions/v1/food-photo')) {
    if (method === 'GET') return json(200, { ready: true, remaining: 20, limit: 20 });
    return json(200, ANALYSIS);
  }
  if (url.includes('/rest/v1/food_diary')) {
    if (method === 'GET') return json(200, saved);
    if (method === 'POST') {
      const body = route.request().postDataJSON();
      const row = Array.isArray(body) ? body[0] : body;
      saved = [{ ...row, id: 'fixture-meal-1', created_at: new Date().toISOString(), photo_path: null }];
      return json(201, []);
    }
    return json(200, []);
  }
  if (method === 'GET' || method === 'POST') return json(200, []);
  return json(200, {});
});
await p.goto(URL + '?t=' + Date.now(), { waitUntil: 'domcontentloaded' });
if (await p.isVisible('#wCreate')) await p.click('#wCreate');
await p.fill('#regName', 'Stage Two'); await p.fill('#regEmail', 'stage2@example.com'); await p.fill('#regSecret', 'password123');
await Promise.all([p.waitForNavigation({ waitUntil: 'domcontentloaded' }), p.click('#regBtn')]);
await p.waitForFunction(() => !!localStorage.getItem('kova.auth.current'));
if (await p.isVisible('#obSkip')) await p.click('#obSkip');
await p.waitForTimeout(300);
const prefix = await p.evaluate(() => { const id = localStorage.getItem('kova.auth.current'); return id ? `kova.u.${id}.` : 'kova.'; });
await p.evaluate(pre => {
  const day = (n) => new Date(Date.now() - n * 864e5).toISOString();
  localStorage.setItem(pre + 'weights', JSON.stringify([
    { date: day(28), kg: 92.4 }, { date: day(21), kg: 91.2 }, { date: day(14), kg: 90.1 }, { date: day(7), kg: 89.0 },
  ]));
  localStorage.setItem(pre + 'injections', JSON.stringify([{ id: 'fixture-inj', at: day(3), med: 'Other', custom: 'Fixture pen', dose: 'as entered', unit: 'mg', site: 'Abdomen left', effects: [], notes: 'Local test fixture, not a live log' }]));
  localStorage.setItem(pre + 'sessions', JSON.stringify([{ date: day(1), totals: {}, minutes: 15, completed: true, video: 'ai-walk-15', title: 'Beginner Indoor Walk' }]));
  localStorage.setItem(pre + 'settings', JSON.stringify({ ...JSON.parse(localStorage.getItem(pre + 'settings') || '{}'), onboarded: true, name: 'Stage Two' }));
  localStorage.setItem(pre + 'cloud.session', JSON.stringify({ access_token: 'fixture-token', refresh_token: 'fixture-refresh', expires_at: Math.floor(Date.now() / 1000) + 86400, user: { id: '00000000-0000-4000-8000-000000000001', email: 'fixture@example.com' } }));
}, prefix);
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(600);
if (await p.isVisible('#obSkip')) await p.click('#obSkip');
ok((await p.locator('#waterGoalSel').inputValue()) === '3000', 'water goal stays 3.0 L');
await p.evaluate(() => window.__kova.switchTab('progress'));
await p.waitForTimeout(400);
ok(await p.locator('#progChart svg.wchart').count() === 1, 'weight chart is drawn from saved weigh-ins');
ok(/Total lost/.test(await p.textContent('#progSummary')), 'progress summary uses the saved weigh-ins');
ok(/Beginner Indoor Walk/.test(await p.textContent('#sessionList')), 'completed workout stays on Progress');
ok(/Other/.test(await p.textContent('#injList')) && /as entered/.test(await p.textContent('#injList')) && /Local test fixture/.test(await p.textContent('#injList')), 'injection log shows the entered text');
await p.click('#weightForm .seg button[data-unit=st]');
ok(/13st/.test(await p.locator('#weightInput').getAttribute('placeholder')), 'stone entry stays available');
await p.fill('#weightInput', '14st 2lb'); await p.click('#weightBtn'); await p.waitForTimeout(400);
if (await p.isVisible('#celebClose')) await p.click('#celebClose');
ok(/st/.test(await p.textContent('#weightList')), 'saved weigh-in shows in stones');
await p.click('#weightForm .seg button[data-unit=lb]');
ok(/190/.test(await p.locator('#weightInput').getAttribute('placeholder')), 'pounds entry stays available');
const clipped = await p.evaluate(() => {
  const W = innerWidth, bad = [];
  if (document.documentElement.scrollWidth > W + 1) bad.push('overflow');
  for (const e of document.querySelectorAll('#tab-progress button')) { if (!e.offsetParent) continue; const r = e.getBoundingClientRect(); if (r.height < 47.5) bad.push('small ' + e.textContent.trim().slice(0, 20)); if (r.right > W + 1) bad.push('clip ' + e.textContent.trim().slice(0, 20)); }
  return bad;
});
ok(!clipped.length, 'progress tap targets and width ' + clipped.join(','));
await p.evaluate(() => window.__kova.switchTab('foodhub'));
await p.waitForTimeout(200);
ok(await p.isVisible('#foodHub [data-goto=diary]') && await p.isVisible('#foodHub [data-goto=aldi]') && await p.isVisible('#foodHub [data-goto=prices]'), 'Food hub still opens diary, Aldi and price compare');
ok(/No meals logged yet today/.test(await p.textContent('#foodHubToday')), 'Food hub does not invent a day total');
await p.evaluate(() => window.__kova.switchTab('diary'));
await p.waitForSelector('#fdType', { timeout: 8000 });
await p.click('#fdType'); await p.waitForSelector('#fdNote');
await p.fill('#fdNote', 'chicken breast 150g, white rice 150g');
await p.click('#fdGo'); await p.waitForSelector('#fdSave', { timeout: 8000 });
const names = await p.$$eval('.fdname', l => l.map(i => i.value));
ok(names.some(n => /chicken/i.test(n)) && names.some(n => /rice/i.test(n)), 'text-only editor lists the fixture foods');
const row = p.locator('.fditem').first();
const before = +((await p.textContent('#fdTot')).match(/([\d.]+) g protein/)[1]);
const was = +(await row.locator('[data-f=protein_g]').inputValue());
await row.locator('[data-f=protein_g]').tap();
await row.locator('[data-f=protein_g]').fill('50');
const live = +((await p.textContent('#fdTot')).match(/([\d.]+) g protein/)[1]);
ok(Math.abs(live - (before - was + 50)) < 0.11, `protein total updates while typing (${live})`);
await row.locator('[data-f=kcal]').tap();
ok(await row.locator('[data-f=kcal]').evaluate(e => e === document.activeElement), 'moving to kcal keeps the keyboard focus');
await p.keyboard.press('Control+A'); await p.keyboard.type('260');
ok((await row.locator('[data-f=kcal]').inputValue()) === '260', 'kcal accepts typed digits');
await p.locator('#fdSave').tap();
await p.waitForSelector('.fdrow', { timeout: 8000 });
const dayTxt = await p.textContent('#photoDiaryRoot');
ok(dayTxt.includes(String(live)) && /protein/i.test(dayTxt), `saved day total keeps the corrected protein (${live} g)`);
ok(!errs.length, 'no page errors ' + errs.join(' | '));
await b.close();
console.log(fail ? `${fail} FAILED` : 'ALL STAGE 2 UI CHECKS PASSED');
process.exit(fail ? 1 : 0);
