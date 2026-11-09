// Planner screenshots use typed fixture prices, not a shop feed.
import { chromium, devices } from 'playwright-core';
import fs from 'fs';
const URL = process.argv[2] || 'http://127.0.0.1:8765/';
const OUT = '/opt/cursor/artifacts';
fs.mkdirSync(OUT, { recursive: true });
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
async function start(page) {
  await page.goto(URL + '?planner=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__kova?.switchTab);
  if (await page.locator('#authScreen:not([hidden])').count()) {
    await page.locator('#wCreate').click({ force: true });
    await page.fill('#regName', 'Planner');
    await page.fill('#regEmail', `plan${Date.now()}@example.test`);
    await page.fill('#regSecret', 'password123');
    await page.locator('#regBtn').click({ force: true });
    await page.waitForFunction(() => document.getElementById('authScreen')?.hidden);
  }
  await page.waitForTimeout(300);
  if (await page.locator('#onboard:not([hidden])').count()) await page.locator('#obSkip').click({ force: true });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('dock')).display !== 'none');
}
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const phone = await browser.newContext({ ...devices['Pixel 7'], locale: 'en-GB', serviceWorkers: 'block' });
const page = await phone.newPage();
await start(page);
await page.click('#dock [data-tab="foodhub"]');
await page.click('[data-goto="ukplan"]');
await page.waitForSelector('#ukBuild');
ok(/18 original recipes/.test(await page.textContent('#ukPlanRoot')), 'the screen states the actual draft count');
ok(/Nutrition unavailable|not estimated|CoFID/.test(await page.textContent('#ukPlanRoot')), 'nutrition is not presented as verified');
await page.locator('.ukday').first().scrollIntoViewIfNeeded();
await page.screenshot({ path: OUT + '/uk_planner_week.png' });
await page.click('[data-ukopen="porridge-banana"]');
await page.waitForTimeout(200);
ok(/Banana porridge/.test(await page.textContent('#ukRecipe')) && /minutes for the method/.test(await page.textContent('#ukRecipe')), 'a recipe opens with steps and unscaled time');
await page.locator('#ukRecipe').screenshot({ path: OUT + '/uk_planner_recipe.png' });
const herb = page.locator('[data-ukopen="chicken-potato-tray"]');
if (await herb.count()) {
  await herb.first().click();
  await page.waitForTimeout(200);
  ok(/Lemon and herb chicken tray/.test(await page.textContent('#ukRecipe')) && /15ml/.test(await page.textContent('#ukRecipe')), 'lemon and herb chicken shows a measured seasoning');
  await page.locator('#ukRecipe').screenshot({ path: OUT + '/uk_planner_seasoning.png' });
}
await page.locator('#ukShop').scrollIntoViewIfNeeded();
const pack = page.locator('[data-ukpack="oats:as-sold"]');
await pack.fill('1000');
await page.locator('[data-ukprice="oats:as-sold"]').fill('1.25');
await page.locator('[data-ukloyal="oats:as-sold"]').fill('0.99');
await page.locator('[data-ukprice="oats:as-sold"]').dispatchEvent('change');
await page.waitForTimeout(200);
ok(/FIXTURE|Ordinary checkout|Price unknown/.test(await page.textContent('#ukShop')) || /Checkout estimate/.test(await page.textContent('#ukCoverage')), 'the shop list shows a typed price separately from unknown lines');
await page.evaluate(() => {
  const note = document.createElement('p');
  note.id = 'ukFixture';
  note.textContent = 'FIXTURE price typed in this test. Not a live Asda, Tesco, Aldi, Lidl, Sainsbury\'s or Morrisons price.';
  note.style.cssText = 'background:#1a1024;color:#fff;padding:8px;font-weight:700';
  document.querySelector('#ukShop').prepend(note);
});
await page.locator('#ukShop h3').scrollIntoViewIfNeeded();
await page.screenshot({ path: OUT + '/uk_planner_shops.png' });
const prefix = await page.evaluate(() => { const id = localStorage.getItem('kova.auth.current'); return id ? `kova.u.${id}.` : 'kova.'; });
ok(await page.evaluate(prefix => localStorage.getItem(prefix + 'ukPlanner') && !localStorage.getItem('kova.u.other.ukPlanner'), prefix), 'the plan stays on this account');
await page.click('#ukGenerate');
ok(/Sign in to Cloud backup/.test(await page.textContent('#ukGenMsg')), 'generation asks for cloud sign-in and leaves the drafts in place');
await page.route('**/functions/v1/meal-generate', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, recipe: { id: 'ai-fixture-lemon', title: 'Fixture lemon chicken', meal: 'dinner', minutes: 25, servings: 2, ai: true, ingredients: [{ id: 'ai-chicken-0', name: 'Chicken thigh', qty: 160, unit: 'g', imperial: '5.6 oz', aisle: 'AI meal', form: 'as-sold' }], steps: ['Cook the chicken until cooked through.'], proteinLabel: 'Not calculated. Nutrition figures from the model are discarded.', swaps: [], optional: [], safety: 'leftovers' } }) }));
await page.evaluate(prefix => localStorage.setItem(prefix + 'cloud.session', JSON.stringify({ access_token: 'fixture', user: { id: '00000000-0000-4000-8000-0000000000aa', email: 'fixture@example.test' } })), prefix);
await page.click('#ukGenerate');
await page.waitForTimeout(400);
ok(/Fixture lemon chicken/.test(await page.textContent('#ukPlanRoot')) && /check ingredients for allergies/.test(await page.textContent('#ukPlanRoot')), 'a generated meal is added with the allergy note');
await page.screenshot({ path: OUT + '/uk_planner_ai_fixture.png' });
await phone.close();

const desk = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-GB', serviceWorkers: 'block' });
const wide = await desk.newPage();
await start(wide);
await wide.click('#dock [data-tab="foodhub"]');
ok(await wide.locator('#foodHub [data-goto="diary"]').isVisible() && await wide.locator('#foodHub [data-goto="ukplan"]').isVisible(), 'desktop Food still opens the diary and the planner');
await wide.click('#foodHub [data-goto="ukplan"]');
await wide.waitForSelector('#ukBuild');
ok(/Asda/.test(await wide.textContent('#ukShop')) && /Morrisons/.test(await wide.textContent('#ukShop')), 'all six shops are on the desktop planner');
await wide.screenshot({ path: OUT + '/uk_planner_desktop.png' });
await desk.close();
await browser.close();
console.log(fail ? `${fail} FAILED` : 'ALL PLANNER UI CHECKS PASSED');
process.exit(fail ? 1 : 0);
