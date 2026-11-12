// Local demo screenshots for the community chat. Does not call Supabase.
// Usage: node tests/community-chat-shots.mjs [baseURL] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.argv[2] || 'http://127.0.0.1:8765/';
const OUT = process.argv[3] || '/opt/cursor/artifacts';
fs.mkdirSync(OUT, { recursive: true });
const url = BASE.replace(/\/$/, '') + '/?chatdemo=1';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'en-GB', timezoneId: 'Europe/London', serviceWorkers: 'block', hasTouch: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Selling medication' : undefined));
try {
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__kova?.switchTab);
  if (await p.locator('#authScreen:not([hidden])').count()) {
    await p.locator('#wCreate').click({ force: true });
    await p.fill('#regName', 'Mitchell');
    await p.fill('#regEmail', `chat${Date.now()}@example.com`);
    await p.fill('#regSecret', 'password123');
    await p.locator('#regBtn').click({ force: true });
    await p.waitForFunction(() => document.getElementById('authScreen')?.hidden);
  }
  if (await p.locator('#onboard:not([hidden])').count()) await p.locator('#obSkip').click({ force: true });
  await p.waitForTimeout(300);
  await p.locator('#commHome').scrollIntoViewIfNeeded();
  ok(await p.locator('#commHome').isVisible(), 'home card is on the page');
  await p.click('#commHome');
  await p.waitForSelector('[data-wa-view="list"]');
  const list = await p.textContent('#communityRoot');
  ok(['Announcements', 'General', 'Food & Recipes', 'Fitness', 'Weight-loss Wins'].every(n => list.includes(n)), 'five sections');
  ok(list.includes('Guidelines') && await p.locator('.wabadge').count() >= 1, 'pinned guidelines and an unread badge');
  ok(!(await p.locator('#waAdmin').count()), 'member list does not show admin tools');
  await p.screenshot({ path: OUT + '/community_section_list.png' });

  await p.click('[data-open="food"]');
  await p.waitForSelector('.waquote');
  await p.waitForTimeout(250);
  await p.evaluate(() => { const t = document.querySelector('.wathread'); const mine = document.querySelector('.wabubble.out'); if (!t || !mine) return; t.scrollTop += mine.getBoundingClientRect().top - t.getBoundingClientRect().top + 6; });
  const chat = await p.textContent('#waThread');
  ok(/turkey mince/.test(chat) && /Priya/.test(chat), 'reply quote shows the original message');
  ok(await p.locator('.wareacts button.on').count() >= 1 && await p.locator('.wabubble.out').count() >= 1, 'own green bubble and a reaction');
  ok(await p.locator('.waimg').count() >= 1, 'photo attachment');
  await p.screenshot({ path: OUT + '/community_chat_replies.png' });

  await p.locator('.wabubble.in').first().click({ button: 'right' });
  await p.waitForSelector('#waSheet');
  await p.click('[data-act="reply"]');
  ok(await p.locator('#waReply:not([hidden])').count() === 1, 'reply composer opens from the menu');
  await p.click('#waReplyClear');
  await p.fill('#waText', 'Saving this chilli idea for Sunday.');
  await p.click('#waSend');
  await p.waitForFunction(() => document.body.innerText.includes('Saving this chilli idea'));
  await p.fill('#waText', 'WhatsApp me on 07700 900123 for cheaper pens');
  await p.click('#waSend');
  await p.waitForSelector('.wabubble.held');
  ok(/Held for review/.test(await p.textContent('#waThread')), 'selling message is held instead of posted as a normal bubble');

  await p.evaluate(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; window.__kova.openCommunityChat('admin'); });
  await p.waitForSelector('[data-wa-view="admin"]');
  ok(/Announcement-only/.test(await p.textContent('#communityRoot')) && /Old check-ins/.test(await p.textContent('#communityRoot')), 'admin manager lists sections including archived');
  await p.screenshot({ path: OUT + '/community_admin_sections.png' });
  const before = await p.locator('.wasec b').allTextContents();
  await p.click('[data-up="wins"]');
  await p.waitForTimeout(200);
  const after = await p.locator('.wasec b').allTextContents();
  ok(after.indexOf('Weight-loss Wins') < before.indexOf('Weight-loss Wins'), 'move up reorders a section');

  await p.evaluate(() => window.__kova.openCommunityChat('queue'));
  await p.waitForSelector('[data-wa-view="queue"]');
  const queue = await p.textContent('#communityRoot');
  ok(/cheaper pens/.test(queue) && /Casey/.test(queue) && /Held for review/.test(queue), 'reports queue shows held messages and a mute');
  await p.screenshot({ path: OUT + '/community_reports_queue.png' });

  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__kova?.openCommunityChat);
  if (await p.locator('#onboard:not([hidden])').count()) await p.locator('#obSkip').click({ force: true });
  await p.evaluate(() => window.__kova.switchTab('community'));
  await p.waitForSelector('[data-wa-view="list"]');
  const feature = async (view, file, probe) => {
    await p.evaluate(v => window.__kova.openCommunityChat(v), view);
    await p.waitForTimeout(350);
    ok(await p.locator(probe).count() > 0, `${file} shows ${probe}`);
    await p.screenshot({ path: `${OUT}/${file}` });
  };
  await feature('voice', 'community_voice_note.png', '.wavoice');
  ok(await p.locator('#waRec').count() === 1, 'hold-to-record bar is visible');
  await feature('pin', 'community_pinned.png', '.wapinbar');
  await feature('poll', 'community_poll.png', '.wapoll');
  await feature('challenge', 'community_challenge.png', '.wachal');
  await feature('wins', 'community_wins.png', '.wawin');
  ok(await p.locator('.waceleb').count() === 1, 'wins post shows a celebration');
  await feature('typing', 'community_typing_receipts.png', '.watyping');
  ok(/Seen by/.test(await p.content()) || await p.locator('.watick').count() > 0, 'read ticks are shown');
  await feature('notify', 'community_notification_settings.png', '#waReceipts');
  await feature('mention', 'community_mentions_search.png', '#waMentions');
  await p.evaluate(() => window.__kova.openCommunityChat('search'));
  await p.waitForTimeout(300);
  ok(/chilli/i.test(await p.textContent('#communityRoot')), 'search lists matching messages');
  await p.screenshot({ path: OUT + '/community_search.png' });
  await feature('dm', 'community_dm_list.png', '[data-wa-view="dms"]');
  await feature('dmchat', 'community_dm_chat.png', '[data-wa-view="dmchat"]');

  await p.setViewportSize({ width: 360, height: 740 });
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__kova?.switchTab);
  if (await p.locator('#onboard:not([hidden])').count()) await p.locator('#obSkip').click({ force: true });
  await p.evaluate(() => window.__kova.switchTab('community'));
  await p.waitForSelector('[data-open="food"]');
  await p.click('[data-open="food"]');
  await p.waitForSelector('.wacompose');
  const fit = await p.evaluate(() => {
    const compose = document.querySelector('.wacompose').getBoundingClientRect();
    const dock = document.querySelector('.dock').getBoundingClientRect();
    const thread = document.querySelector('.wathread').getBoundingClientRect();
    return { composeTop: compose.top, composeBottom: compose.bottom, dockTop: dock.top, threadH: thread.height, inner: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  ok(fit.composeBottom <= fit.dockTop + 2 && fit.threadH > 120 && !fit.overflow, `composer sits above the dock (${JSON.stringify(fit)})`);
  await p.screenshot({ path: OUT + '/community_mobile.png' });
  ok(!errs.length, 'no page errors ' + errs.join(' | '));
} catch (e) { console.error(e); fail++; } finally { await b.close(); }
console.log(fail ? `${fail} FAILED` : 'CHAT SHOTS OK');
process.exit(fail ? 1 : 0);
