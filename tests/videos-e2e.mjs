// Video class library: member list = GLP1 Life Coach Ava (AI-generated instructor) classes on Bunny Stream, published only after
// human safety review (first two approved by Mitchell 2026-10-21). Checks tiles, course banner, in-app Bunny player + class info
// (AI label in info, never "qualified"), completion tracking, and Cast (web: hidden for Bunny; APK: Android screen-mirror panel).
import { chromium, devices } from 'playwright-core';
import fs from 'fs';
const URL = process.argv[2] || 'http://localhost:8765/', OUT = '/workspace/shots/glp1life', TAG = process.argv[3] || 'videos';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const lib = JSON.parse(fs.readFileSync(new globalThis.URL('../library-videos.json', import.meta.url)));
const GUID = { 'ai-seated-10': '39c7e26d-3e2e-4c21-a611-92b840da3713', 'ai-walk-15': '67ddaa1e-c96b-44bb-bf99-467c3c10c445' };
ok(lib.videos.length === 2 && lib.videos.every(v => v.source === 'bunny' && GUID[v.id] === v.bunnyId && v.access === 'free' && v.level === 'Beginner'), 'library: 2 free Beginner Bunny classes with the approved GUIDs');
ok(lib.videos.find(v => v.id === 'ai-seated-10')?.cat === 'chair' && lib.videos.find(v => v.id === 'ai-walk-15')?.cat === 'walking' && lib.categories.chair === 'Chair-based', 'tiles: Chair-based + Walking');
ok(!JSON.stringify(lib.videos).match(/youtube|archive\.org|Melissa|supersededGuid/i), 'no third-party / superseded entries');
ok(!/qualified (instructor|coach|trainer)|certified|registered/i.test(JSON.stringify(lib.instructors)) && /AI-generated instructor/.test(lib.instructors['coach-ava'].label), 'Coach Ava: AI label, never called qualified');
const drafts = JSON.parse(fs.readFileSync(new globalThis.URL('../admin/ai-class-drafts.json', import.meta.url)));
ok(drafts.classes.every(c => c.published && /Approved by Mitchell 2026-10-21, published/.test(c.status) && lib.videos.some(v => v.bunnyId === c.bunny.guid)), 'admin drafts marked approved + published, GUIDs match');
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required', '--disable-http2'] /* box network coalesces assets.mediadelivery.net onto the iframe host's HTTP/2 connection -> 404s */ }); const ctx = await b.newContext({ ...devices['Pixel 5'], serviceWorkers: 'block' }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1500);
await p.click('#wCreate'); await p.fill('#regName', 'Sia'); await p.fill('#regEmail', 'v@example.com'); await p.fill('#regSecret', 'password123'); await p.press('#regSecret', 'Enter'); await p.waitForTimeout(700);
await p.evaluate(() => { const k = Object.keys(localStorage).find(k => k.endsWith('.settings')); const s = JSON.parse(localStorage[k] || '{}'); s.onboarded = true; localStorage[k] = JSON.stringify(s); }); await p.reload(); await p.waitForFunction(() => window.__kova?.videosReady);
// live site uses cloud sign-up (no real accounts made by tests): reveal the app shell behind the auth screen, as tests/live-course.mjs does
if (await p.evaluate(() => !!document.querySelector('#authScreen:not([hidden])'))) { console.log('note: live cloud auth, revealing app shell'); await p.evaluate(() => { document.body.classList.remove('authScreen'); document.querySelectorAll('.overlay:not([hidden]), #authWrap, #welcome').forEach(e => e.hidden = true); }); await p.waitForTimeout(400); }
await p.evaluate(() => window.__kova.switchTab('workouts')); await p.waitForTimeout(600);
ok(await p.$eval('#dock [data-tab=workouts]', e => /Fitness/.test(e.textContent)), 'Fitness tab in bottom nav');
ok(await p.$eval('#fitCourse', e => !!e.offsetParent && /GLP1 Life Course/.test(e.textContent)), 'course banner visible on Fitness');
const tiles = await p.$$eval('#videoLib .vtile', l => l.map(t => t.textContent.replace(/\s+/g, ' ')));
ok(tiles.length === 2 && tiles.some(t => /Chair-based/.test(t)) && tiles.some(t => /Walking/.test(t)), 'Fitness shows 2 tiles: ' + tiles.join(' | '));
ok(!(await p.$('#vSoon')), 'no coming-soon card');
await p.$eval('#videoLib', e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(300);
await p.screenshot({ path: `${OUT}/${TAG}-tiles.png` });
await p.click('#fitCourse'); await p.waitForTimeout(300); ok(await p.$$eval('#courseRoot .cmod', l => l.length) === 7, 'course banner opens the course (7 modules)');
await p.evaluate(() => window.__kova.switchTab('workouts')); await p.waitForTimeout(300);
await p.click('#videoLib [data-vcat="walking"]'); await p.waitForTimeout(300); await p.click('#videoLib [data-video="ai-walk-15"]'); await p.waitForTimeout(800);
ok((await p.$eval('#videoFrame', e => e.src)).includes('iframe.mediadelivery.net/embed/786067/' + GUID['ai-walk-15']), 'player opens in-app Bunny embed (walk)');
const info = await p.textContent('#videoModal');
ok(/Coach Ava/.test(info) && /AI-generated instructor/.test(info) && !/qualified (instructor|coach)|certified/i.test(info), 'class info: Coach Ava + AI label, not "qualified"');
ok(/Beginner/.test(info) && (await p.$$eval('.avaex li', l => l.length)) >= 8, 'difficulty + exercise list shown');
ok(await p.$eval('#videoCast', e => e.hidden), 'web: Cast hidden for Bunny video (TV receiver gets 403 without referrer)');
await p.waitForFunction(() => window.__kova.videoPjs === 'ready', null, { timeout: 20000 }).then(() => ok(true, 'Bunny player.js "ready" received (completion tracking wired)'), () => ok(false, 'Bunny player.js ready'));
const t0 = Date.now(); await p.waitForFunction(() => window.__kova.videoTime > 3, null, { timeout: 25000 }).catch(() => {});
const vt = await p.evaluate(() => window.__kova.videoTime || 0); ok(vt > 3, `class is playing (player time ${vt.toFixed(1)} s)`);
await p.screenshot({ path: `${OUT}/${TAG}-playing.png` });
await p.click('#videoDoneBtn'); await p.waitForTimeout(300);
const st = await p.evaluate(() => { const k = Object.keys(localStorage); const g = s => JSON.parse(localStorage[k.find(x => x.endsWith('.' + s))] || 'null'); return { done: g('videosDone'), sess: g('sessions') }; });
ok(st.done?.['ai-walk-15'] && st.sess?.some(s => s.video === 'ai-walk-15' && s.minutes === 15 && s.completed), 'completed workout recorded (videosDone + sessions)');
await p.click('#videoClose'); await p.waitForTimeout(300);
ok(/Done/.test(await p.textContent('#videoLib [data-video="ai-walk-15"]')), 'card shows ✓ Done');
await p.click('#vBack'); await p.click('#videoLib [data-vcat="chair"]'); await p.click('#videoLib [data-video="ai-seated-10"]');
await p.waitForTimeout(500); ok((await p.$eval('#videoFrame', e => e.src)).includes(GUID['ai-seated-10']), 'seated class opens in-app Bunny embed');
await p.click('#videoClose');
await p.evaluate(() => { window.__castOpened = 0; window.Capacitor = { isNativePlatform: () => true, Plugins: { ApkUpdater: { openCastSettings: async () => { window.__castOpened++; return {}; } } } }; });
await p.click('#videoLib [data-video="ai-seated-10"]'); await p.waitForTimeout(400);
ok(!(await p.$eval('#videoCast', e => e.hidden)), 'APK: Cast to TV (screen mirroring) shown'); await p.click('#videoCast'); await p.waitForTimeout(300);
ok(await p.evaluate(() => window.__castOpened) === 1, 'APK: opens Android Cast panel'); await p.click('#videoClose');
ok(!errs.length, 'no page errors ' + errs.join('|'));
await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL VIDEO LIBRARY TESTS PASSED'); process.exit(fail ? 1 : 0);
