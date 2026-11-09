// Membership UI fixtures. No live Stripe, Play or database calls.
import { chromium, devices } from 'playwright-core';
import fs from 'fs';
const URL = process.argv[2] || 'http://127.0.0.1:8765/';
const OUT = '/opt/cursor/artifacts';
fs.mkdirSync(OUT, { recursive: true });
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const state = { is_admin: true, live_paywall: false, preview: null, complimentary: null, stripe: null, play: null };
async function boot(p) {
  await p.route('**/*supabase.co/**', route => {
    const url = route.request().url(), method = route.request().method();
    const json = (s, b) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });
    if (url.includes('/rpc/membership_state')) return json(200, state);
    if (url.includes('/rpc/my_plan')) return json(200, { plan: 'free' });
    if (url.includes('/rpc/admin_set_preview')) {
      const body = route.request().postDataJSON() || {};
      state.preview = body.p_mode === 'off' ? null : body.p_mode;
      return json(200, { preview: body.p_mode, entitlement_unchanged: true, fixture: true });
    }
    if (url.includes('/rpc/is_admin')) return json(200, true);
    if (url.includes('/rpc/admin_trainers')) return json(200, []);
    if (url.includes('/rpc/admin_list_access_codes')) return json(200, [{ id: 'fixture-1', code_hint: 'W9K2', label: 'Fixture, not live', lifetime: false, duration_days: 30, max_redemptions: 5, used: 0, redeem_by: null, active: true, revoked_at: null }]);
    if (url.includes('/rpc/admin_create_access_code')) return json(200, { id: 'fixture-new', code: 'FIXTURENOTLIVE', hint: 'LIVE', fixture: true });
    if (method === 'GET' || method === 'POST') return json(200, []);
    return json(200, {});
  });
  await p.goto(URL + '?m=' + Date.now(), { waitUntil: 'domcontentloaded' });
  if (await p.isVisible('#wCreate')) await p.click('#wCreate');
  if (await p.isVisible('#regName')) {
    await p.fill('#regName', 'Member'); await p.fill('#regEmail', `mem${Date.now()}@example.com`); await p.fill('#regSecret', 'password123');
    await Promise.all([p.waitForNavigation({ waitUntil: 'domcontentloaded' }), p.click('#regBtn')]);
  }
  await p.waitForTimeout(500);
  if (await p.isVisible('#obSkip')) await p.click('#obSkip');
  const pre = await p.evaluate(() => { const id = localStorage.getItem('kova.auth.current'); return id ? `kova.u.${id}.` : 'kova.'; });
  await p.evaluate(pre => localStorage.setItem(pre + 'cloud.session', JSON.stringify({ access_token: 'fixture', refresh_token: 'fixture', expires_at: Math.floor(Date.now() / 1000) + 86400, user: { id: '00000000-0000-4000-8000-0000000000aa', email: 'fixture-admin@example.test' } })), pre);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(400);
  if (await p.isVisible('#obSkip')) await p.click('#obSkip');
}
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const phone = await b.newContext({ ...devices['Pixel 7'], locale: 'en-GB', serviceWorkers: 'block' });
const p = await phone.newPage();
await boot(p);
await p.evaluate(() => window.__kova.switchTab('member'));
await p.waitForTimeout(400);
ok(/Checkout is off/.test(await p.textContent('#billingMode')), 'web checkout is described as off');
ok(/not a confirmed charge/.test(await p.textContent('#billingNote')), 'old prices are not treated as a Stripe price');
ok(!(await p.locator('#tab-member a[href*="stripe.com"], #tab-member a[href*="checkout"]').count()), 'membership page has no payment link');
await p.click('#previewFree'); await p.waitForTimeout(200);
ok(/viewing as Free/.test(await p.textContent('#previewBanner')) && /unchanged/.test(await p.textContent('#previewBanner')), 'Free preview is labelled and does not claim a real change');
ok((await p.locator('#tab-member').getAttribute('data-preview')) === 'free', 'Free preview marks the membership screen');
await p.locator('#adminPreview').screenshot({ path: OUT + '/membership_preview_free.png' });
await p.locator('.plans').screenshot({ path: OUT + '/membership_preview_free_plans.png' });
await p.click('#previewPremium'); await p.waitForTimeout(200);
ok(/viewing as Premium/.test(await p.textContent('#previewBanner')), 'Premium preview is labelled');
ok((await p.locator('#tab-member').getAttribute('data-preview')) === 'premium', 'Premium preview marks the membership screen');
await p.locator('#adminPreview').screenshot({ path: OUT + '/membership_preview_premium.png' });
await p.locator('.plans').screenshot({ path: OUT + '/membership_preview_premium_plans.png' });
await p.evaluate(() => { window.Capacitor = { isNativePlatform: () => true, Plugins: {} }; });
await p.evaluate(() => window.__kova.switchTab('member'));
await p.waitForTimeout(300);
const playTxt = await p.textContent('#billingStatus');
ok(/Google Play Billing is the payment method/.test(playTxt) && /unavailable/.test(playTxt) && !/https?:\/\//.test(playTxt) && !/buy on the website/i.test(playTxt) && !/stripe\.com/i.test(playTxt), 'Play Billing is named and does not steer to Stripe');
ok(await p.locator('#playSubscribe').isDisabled(), 'subscribe stays disabled without a Console product');
await p.locator('#billingStatus').screenshot({ path: OUT + '/play_not_configured.png' });
await p.evaluate(() => { window.__kova.playFixture = { configured: true, fixture: true, productId: 'fixture.not.a.console.id', basePlanId: 'fixture-base' }; window.Capacitor.Plugins.PlayBilling = { purchase: async () => ({ pending: true, fixture: true, purchaseToken: 'fixture-token' }), restore: async () => ({ purchaseTokens: [] }) }; });
state.play = { kind: 'play', state: 'SUBSCRIPTION_STATE_ACTIVE', ends_at: '2026-12-01T00:00:00Z' };
await p.evaluate(() => window.__kova.switchTab('member'));
await p.waitForTimeout(300);
ok(/already on this account/.test(await p.textContent('#billingMode')) && await p.locator('#playSubscribe').isHidden(), 'an active Play membership hides a second subscription');
await p.locator('#billingStatus').screenshot({ path: OUT + '/play_already_entitled.png' });
state.play = null;
await p.evaluate(() => window.__kova.switchTab('member'));
await p.waitForTimeout(200);
await p.locator('#playSubscribe').click();
await p.waitForTimeout(200);
ok(/pending/i.test(await p.textContent('#playResult')) && /not been granted/i.test(await p.textContent('#playResult')), 'a pending fixture does not grant access');
await p.locator('#billingStatus').screenshot({ path: OUT + '/play_pending_fixture.png' });
await phone.close();

let creates = 0, lastCreate = null, listed = [];
const desk = await b.newContext({ viewport: { width: 1100, height: 900 }, locale: 'en-GB', serviceWorkers: 'block' });
const d = await desk.newPage();
await d.addInitScript(() => sessionStorage.setItem('glp1admin', JSON.stringify({ access_token: 'fixture', user: { email: 'fixture-admin@example.test' } })));
await d.route('**/*supabase.co/**', route => {
  const url = route.request().url();
  const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  if (url.includes('/rpc/is_admin')) return json(true);
  if (url.includes('/rpc/admin_trainers')) return json([]);
  if (url.includes('/rpc/admin_list_access_codes')) return json(listed);
  if (url.includes('/rpc/admin_create_access_code')) {
    creates++; lastCreate = route.request().postDataJSON();
    listed = [{ id: 'fixture-new', code_hint: 'LIVE', label: lastCreate.p_label || '', lifetime: lastCreate.p_lifetime, duration_days: lastCreate.p_duration_days, max_redemptions: lastCreate.p_max_redemptions, used: 0, redeem_by: null, active: true, revoked_at: null }];
    return json({ id: 'fixture-new', code: 'FIXTURENOTLIVE', hint: 'LIVE', fixture: true });
  }
  return json([]);
});
await d.goto(URL + 'admin/?a=' + Date.now(), { waitUntil: 'domcontentloaded' });
await d.waitForSelector('#app:not([hidden])', { timeout: 8000 });
await d.click('[data-v=access]');
await d.waitForTimeout(300);
ok(/Nothing is created until you press Create/.test(await d.textContent('#acList')), 'admin list starts empty');
await d.screenshot({ path: OUT + '/admin_codes_empty.png' });
await d.click('#acForm button[type=submit]');
await d.waitForTimeout(200);
ok(/how many days/i.test(await d.textContent('#acErr')) && creates === 0 && await d.isHidden('#acOnce'), 'an incomplete form is rejected and no code is requested');
await d.screenshot({ path: OUT + '/admin_code_rejected.png' });
await d.fill('#acDays', '30'); await d.check('#acLife');
ok((await d.inputValue('#acDays')) === '' && await d.locator('#acDays').isDisabled(), 'choosing lifetime clears the day count');
await d.fill('#acMax', '1'); await d.fill('#acLabel', 'Lifetime fixture, not live');
await d.click('#acForm button[type=submit]');
await d.waitForTimeout(200);
ok(creates === 1 && lastCreate?.p_lifetime === true && lastCreate?.p_duration_days == null, 'lifetime is sent only when the day count is empty');
await d.uncheck('#acLife'); await d.fill('#acDays', '30'); await d.fill('#acMax', '5'); await d.fill('#acLabel', 'Fixture, not live');
await d.click('#acForm button[type=submit]');
await d.waitForTimeout(300);
const listText = await d.textContent('#acList');
ok(creates === 2 && lastCreate?.p_lifetime === false && lastCreate?.p_duration_days === 30 && (await d.textContent('#acPlain')) === 'FIXTURENOTLIVE' && await d.isVisible('#acFixture') && /LIVE/.test(listText) && !/FIXTURENOTLIVE/.test(listText), 'one-time code is a labelled fixture and the list keeps only the hint');
await d.screenshot({ path: OUT + '/admin_code_created_fixture.png' });
await desk.close();
await b.close();
console.log(fail ? `${fail} FAILED` : 'ALL MEMBERSHIP UI CHECKS PASSED');
process.exit(fail ? 1 : 0);
