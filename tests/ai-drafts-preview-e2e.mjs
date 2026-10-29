// Admin-only AI class drafts: throwaway admin signs in to the LIVE admin page, opens "AI class drafts",
// checks both drafts show "Approved by Mitchell 2026-10-21, published" and are in library-videos.json (approved 2026-10-21), plays the Bunny Stream embed and screenshots it. Cleans up after.
//   node tests/ai-drafts-preview-e2e.mjs [https://glp1life.co.uk/] [outdir]   (needs SUPABASE_ACCESS_TOKEN)
import { cleanupTestData, sql } from './cleanup.mjs';
import { chromium } from 'playwright-core';
import { SB_URL, SB_KEY } from '../cloud.js';
const URL = process.argv[2] || 'https://glp1life.co.uk/', OUT = process.argv[3] || '/tmp';
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log(c ? 'ok  ' : 'FAIL', m); };
const s = Date.now(), AD = `glp1life.test.admin${s}@example.com`, PW = 'Test-' + s;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--disable-http2'] });
try {
  const ad = await (await fetch(SB_URL + '/auth/v1/signup', { method: 'POST', headers: { apikey: SB_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email: AD, password: PW }) })).json();
  ok(ad.access_token, 'throwaway admin user'); await sql(`insert into public.admins(user_id) values ('${ad.user.id}')`);
  const lib = await (await fetch(URL + 'library-videos.json?' + s)).json(); ok(['ai-walk-15', 'ai-seated-10'].every(id => lib.videos.some(v => v.id === id && v.source === 'bunny')), 'approved classes are in member library-videos.json');
  const a = await (await b.newContext({ viewport: { width: 1280, height: 1000 } })).newPage(); a.on('pageerror', e => console.log('ADMIN ERR', e.message));
  await a.goto(URL + 'admin/?t=' + s, { waitUntil: 'networkidle' }); await a.fill('#le', AD); await a.fill('#lp', PW); await a.click('#lf button');
  await a.waitForSelector('#app:not([hidden])', { timeout: 15000 }); ok(true, 'admin signed in');
  await a.click('.tabs button[data-v="aidrafts"]'); await a.waitForSelector('#aiDraftList iframe', { timeout: 15000 });
  const txt = await a.textContent('#aiDraftList'); const drafts = await (await fetch(URL + 'admin/ai-class-drafts.json?' + s)).json(), pend = drafts.classes.filter(c => !c.published);
  ok((txt.match(/Approved by Mitchell 2026-10-21, published/g) || []).length === 2, 'the 2 approved classes show "Approved by Mitchell 2026-10-21, published"');
  ok((txt.match(/Awaiting safety review/g) || []).length === pend.length && pend.every(c => !lib.videos.some(v => v.id === c.id)), `${pend.length} unreviewed draft(s) show "Awaiting safety review" and are not in the member library`); ok(txt.includes('AI-generated instructor'), 'AI instructor label');
  const frames = await a.$$('#aiDraftList iframe'); ok(frames.length === drafts.classes.filter(c => c.bunny?.guid).length, `${frames.length} Bunny embeds`);
  const f = await frames[0].contentFrame(); await f.waitForSelector('video', { timeout: 20000 });
  await f.evaluate(() => { document.querySelector('video').muted = true; }); await f.click('.plyr__control--overlaid, [data-plyr=play]', { timeout: 15000 }).catch(e => console.log('play click', e.message)); // preload=false: plyr/hls.js loads on play
  await a.waitForTimeout(9000);
  const st = await f.evaluate(() => { const v = document.querySelector('video'); return { t: v.currentTime, paused: v.paused, w: v.videoWidth, rs: v.readyState }; });
  ok(st.t > 3 && !st.paused && st.w > 0, `embed playing (t=${st.t.toFixed(1)}s, ${st.w}px, readyState ${st.rs})`);
  await frames[0].scrollIntoViewIfNeeded(); await a.screenshot({ path: `${OUT}/ai-drafts-admin-preview.png`, fullPage: false });
  await f.evaluate(() => { document.querySelector('video').currentTime = 100; }); await a.waitForTimeout(6000);
  const t2 = await f.evaluate(() => document.querySelector('video').currentTime); ok(t2 > 100, `seek + keeps playing mid-class (t=${t2.toFixed(1)}s)`);
  await frames[0].screenshot({ path: `${OUT}/ai-drafts-playing-frame.png` });
} finally { await b.close(); await cleanupTestData({ quiet: true }); }
console.log(fail ? `${fail} FAILED` : 'all passed'); process.exit(fail ? 1 : 0);
