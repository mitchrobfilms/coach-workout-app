// Video class library: member list is empty (all third-party videos removed 2026-10-21) until Coach Ava (AI-generated
// instructor) classes pass human safety review. Checks the Fitness tab's "coming soon" state, course banner, no empty tiles,
// Home "Ideas" hidden, and that the player/Cast code still works when a video is added (injected via a routed library).
import { chromium, devices } from 'playwright-core';
import fs from 'fs';
const URL = process.argv[2] || 'http://localhost:8765/', OUT = '/workspace/shots/glp1life';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const lib = JSON.parse(fs.readFileSync(new globalThis.URL('../library-videos.json', import.meta.url)));
ok(Array.isArray(lib.videos) && lib.videos.length === 0, 'library-videos.json has no member videos');
ok(!JSON.stringify(lib.videos).match(/youtube|archive\.org|Melissa/i), 'no YouTube / archive.org / Melissa entries left');
const drafts = JSON.parse(fs.readFileSync(new globalThis.URL('../admin/ai-class-drafts.json', import.meta.url)));
const draftIds = JSON.stringify(drafts).match(/ai-[a-z0-9-]+/g) || [];
ok(!lib.videos.some(v => draftIds.includes(v.id)), 'admin AI drafts are not in the member library');
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' }); const ctx = await b.newContext({ ...devices['Pixel 5'], serviceWorkers: 'block' }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1500);
await p.click('#wCreate'); await p.fill('#regName', 'Sia'); await p.fill('#regEmail', 'v@example.com'); await p.fill('#regSecret', 'password123'); await p.press('#regSecret', 'Enter'); await p.waitForTimeout(700);
await p.evaluate(() => { const k = Object.keys(localStorage).find(k => k.endsWith('.settings')); const s = JSON.parse(localStorage[k] || '{}'); s.onboarded = true; localStorage[k] = JSON.stringify(s); }); await p.reload(); await p.waitForTimeout(1500);
ok(await p.$eval('#videoIdeas', e => e.hidden && !e.querySelector('[data-video]')), 'Home "Ideas for you" hidden (no videos)');
await p.evaluate(() => window.__kova.switchTab('workouts')); await p.waitForTimeout(500);
ok(await p.$eval('#dock [data-tab=workouts]', e => /Fitness/.test(e.textContent)), 'Fitness tab in bottom nav');
ok(await p.$eval('#fitCourse', e => !!e.offsetParent && /GLP1 Life Course/.test(e.textContent)), 'course banner visible on Fitness');
ok(await p.$$eval('#videoLib .vtile', l => l.length) === 0, 'no empty category tiles (Warm-up/Cool-down etc. hidden)');
ok(await p.$eval('#vSoon', e => !!e.offsetParent && /New Coach Ava classes coming soon/.test(e.textContent)), '"New Coach Ava classes coming soon" shown');
ok(!(await p.$('#videoLib [data-video]')), 'no video cards');
await p.screenshot({ path: `${OUT}/videos-coming-soon.png` });
await p.click('#fitCourse'); await p.waitForTimeout(300); ok(await p.$$eval('#courseRoot .cmod', l => l.length) === 7, 'course banner opens the course (7 modules)');
await p.click('#courseRoot .cmod summary'); await p.click('#courseRoot [data-lesson]'); await p.waitForTimeout(200); ok(/prescriber/.test(await p.textContent('#lessonModal')), 'lesson reminds: follow prescriber + leaflet'); await p.waitForTimeout(400); ok(await p.$eval('#lessonModal .rsheet', e => getComputedStyle(e).opacity === '1' && e.getBoundingClientRect().top > -5), 'lesson sheet actually visible (opacity 1, on screen)');
await p.click('#lessonDone'); await p.waitForTimeout(200); ok(/1 of/.test(await p.textContent('#courseRoot .coursehead')), 'lesson tick saved');
ok(!(await p.$eval('#tab-classes', e => [...e.querySelectorAll('h2')].some(h => h.offsetParent && /30-minute/.test(h.textContent)))), '30-minute workouts section gone');
// Player + Cast kept for future classes: route a one-video library (local mp4) and check tile -> grid -> player.
const fake = { ...lib, videos: [{ id: 'test-ava', title: 'Test class', cat: 'chair', mins: 10, level: 'Beginner', source: 'archive', src: URL.replace(/\?.*/, '') + 'media/squats.mp4', page: URL, poster: URL.replace(/\?.*/, '') + 'media/squats.jpg', credit: 'GLP1 Life test', licenceUrl: URL, embeddable: true }] };
await p.route('**/library-videos.json*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(fake) }));
await p.reload(); await p.waitForFunction(() => window.__kova?.videosReady); await p.evaluate(() => window.__kova.switchTab('workouts')); await p.waitForTimeout(400);
ok(await p.$$eval('#videoLib .vtile', l => l.length) === 1 && !(await p.$('#vSoon')), 'with a video: 1 tile, no coming-soon card');
await p.click('#videoLib [data-vcat="chair"]'); await p.click('#videoLib [data-video="test-ava"]'); await p.waitForTimeout(600);
ok(/media\/squats\.mp4$/.test(await p.$eval('#videoPlayer', e => e.src)), 'player opens in-app <video>');
ok(!!(await p.$('#videoCast')), 'Cast button present in player');
await p.evaluate(() => { window.__castOpened = 0; window.Capacitor = { isNativePlatform: () => true, Plugins: { ApkUpdater: { openCastSettings: async () => { window.__castOpened++; return {}; } } } }; });
await p.click('#videoClose'); await p.click('#videoLib [data-video="test-ava"]'); await p.waitForTimeout(400);
ok(!(await p.$eval('#videoCast', e => e.hidden)), 'APK: Cast to TV button shown'); await p.click('#videoCast'); await p.waitForTimeout(300);
ok(await p.evaluate(() => window.__castOpened) === 1, 'APK: opens Android Cast panel'); await p.click('#videoClose');
await p.evaluate(() => delete window.Capacitor); await p.unroute('**/library-videos.json*');
ok(!errs.length, 'no page errors ' + errs.join('|'));
await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL VIDEO LIBRARY TESTS PASSED'); process.exit(fail ? 1 : 0);
