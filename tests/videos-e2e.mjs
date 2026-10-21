// Video class library: list + categories, archive.org player with CC BY-ND credit + Cast button, official YouTube embed,
// non-embeddable videos open on YouTube, Home "Ideas for you". Also checks every library entry is reachable.
import { chromium, devices } from 'playwright-core';
import fs from 'fs';
const URL = process.argv[2] || 'http://localhost:8765/', OUT = '/workspace/shots/glp1life';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const lib = JSON.parse(fs.readFileSync(new globalThis.URL('../library-videos.json', import.meta.url)));
for (const v of lib.videos.filter(v => v.source === 'archive')) { const r = await fetch(v.src, { method: 'HEAD', redirect: 'follow' }).catch(() => fetch(v.src, { method: 'HEAD', redirect: 'follow' })); ok(r.ok && /video\/mp4/.test(r.headers.get('content-type') || ''), `archive mp4 reachable: ${v.id} (${r.status})`); }
for (const v of lib.videos.filter(v => v.source === 'youtube' && v.embeddable)) { const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(v.page)}&format=json`); ok(r.ok, `YouTube embeddable: ${v.youtubeId} ${v.title.slice(0, 40)}`); }
ok(lib.videos.filter(v => v.source === 'archive').every(v => v.credit === 'Dr Melissa West, Yoga With Melissa, CC BY-ND 4.0'), 'every archive video carries the CC BY-ND 4.0 credit');
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' }); const ctx = await b.newContext({ ...devices['Pixel 5'] }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1500);
await p.click('#wCreate'); await p.fill('#regName', 'Sia'); await p.fill('#regEmail', 'v@example.com'); await p.fill('#regSecret', 'password123'); await p.press('#regSecret', 'Enter'); await p.waitForTimeout(700);
await p.evaluate(() => { const k = Object.keys(localStorage).find(k => k.endsWith('.settings')); const s = JSON.parse(localStorage[k] || '{}'); s.onboarded = true; localStorage[k] = JSON.stringify(s); }); await p.reload(); await p.waitForTimeout(1500);
ok(await p.$$eval('#videoIdeas [data-video]', l => l.length) === 3, 'Home "Ideas for you" shows 3 video classes');
await p.evaluate(() => window.__kova.switchTab('workouts')); await p.waitForTimeout(500);
ok(await p.$$eval('#videoLib .vrow', l => l.length) >= 8, 'Workouts grouped into category rows');
ok(await p.$$eval('#videoLib [data-video], #videoLib [data-vext]', l => l.length) === lib.videos.length, `library lists ${lib.videos.length} videos`);
await p.click('#videoLib [data-vcat="recovery"]'); await p.waitForTimeout(200); const rec = await p.$$eval('#videoLib [data-video], #videoLib [data-vext]', l => l.length); ok(rec >= 5, `Recovery, back & sciatica filter (${rec})`);
await p.$eval('#videoLib', e => e.scrollIntoView()); await p.screenshot({ path: `${OUT}/videos-library.png` });
await p.click('#vBack'); await p.click('#videoLib [data-video^="ywm-741"]'); ok(!!(await p.$('#wStart')), 'warm-up step offered before class'); await p.click('#wStart'); await p.waitForTimeout(1200); ok(/Warm-up/.test(await p.textContent('#videoModal')), 'warm-up timer runs'); await p.screenshot({ path: `${OUT}/warmup.png` }); if (await p.$('#wSkip')) await p.click('#wSkip'); await p.waitForTimeout(300); await p.waitForTimeout(800);
const a = await p.evaluate(() => ({ src: document.querySelector('#videoPlayer')?.src, credit: document.querySelector('.vcredit')?.textContent, cast: !!document.querySelector('#videoCast'), dock: getComputedStyle(document.querySelector('#dock')).display }));
ok(/archive\.org\/download\/741-hd\/.+\.mp4$/.test(a.src), 'archive class plays from archive.org (unedited file)'); ok(/Dr Melissa West, Yoga With Melissa, CC BY-ND 4.0/.test(a.credit), 'credit shown'); ok(a.cast, 'Cast button'); ok(a.dock === 'none', 'nav hidden under player sheet');
await p.screenshot({ path: `${OUT}/videos-player-archive.png` }); await p.click('#videoClose');
await p.click('#videoLib [data-video="yt-Z9C38koJNTc"]'); if (await p.$('#wSkip')) await p.click('#wSkip'); await p.waitForTimeout(300); await p.waitForTimeout(800);
ok(/^https:\/\/www\.youtube-nocookie\.com\/embed\/Z9C38koJNTc/.test(await p.$eval('#videoModal iframe', e => e.src)), 'YouTube via official embed player');
await p.screenshot({ path: `${OUT}/videos-player-youtube.png` }); await p.click('#videoClose');
ok(!(await p.$('#videoLib [data-vext]')), 'no "opens on YouTube" cards (non-embeddable videos dropped)');
ok(lib.videos.every(v => v.embeddable), 'library only has in-app playable videos');
await p.evaluate(() => window.__kova.switchTab('classes')); await p.waitForTimeout(300); ok(await p.$$eval('#courseRoot .cmod', l => l.length) === 7, 'course has 7 modules');
await p.click('#courseRoot .cmod summary'); await p.click('#courseRoot [data-lesson]'); await p.waitForTimeout(200); ok(/prescriber/.test(await p.textContent('#lessonModal')), 'lesson reminds: follow prescriber + leaflet');
await p.screenshot({ path: `${OUT}/course-lesson.png` }); await p.click('#lessonDone'); await p.waitForTimeout(200); ok(/1 of/.test(await p.textContent('#courseRoot .coursehead')), 'lesson tick saved');
await p.screenshot({ path: `${OUT}/course.png` });
ok(!(await p.$eval('#tab-classes', e => [...e.querySelectorAll('h2')].some(h => h.offsetParent && /30-minute/.test(h.textContent)))), '30-minute workouts section gone');
await p.evaluate(() => window.__kova.switchTab('workouts')); await p.waitForTimeout(300);
await p.click('#videoLib [data-video="yt-Z9C38koJNTc"]'); if (await p.$('#wSkip')) await p.click('#wSkip'); await p.waitForTimeout(300); await p.waitForTimeout(500);
ok(!(await p.$('#videoModal a[href*="youtube"]')), 'no outbound YouTube links in player sheet'); ok(await p.$eval('#videoCast', e => e.hidden), 'web: Cast button hidden where it cannot cast YouTube');
await p.click('#videoClose');
// simulate the Android app (native system cast panel)
await p.evaluate(() => { window.__castOpened = 0; window.Capacitor = { isNativePlatform: () => true, Plugins: { ApkUpdater: { openCastSettings: async () => { window.__castOpened++; return {}; } } } }; });
await p.click('#videoLib [data-video="yt-Z9C38koJNTc"]'); if (await p.$('#wSkip')) await p.click('#wSkip'); await p.waitForTimeout(300); await p.waitForTimeout(500);
ok(!(await p.$eval('#videoCast', e => e.hidden)), 'APK: Cast to TV button shown for YouTube'); await p.click('#videoCast'); await p.waitForTimeout(300);
ok(await p.evaluate(() => window.__castOpened) === 1, 'APK: opens Android Cast panel'); await p.screenshot({ path: `${OUT}/videos-cast-apk.png` }); await p.click('#videoClose');
await p.evaluate(() => delete window.Capacitor);
ok(!errs.length, 'no page errors ' + errs.join('|'));
await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL VIDEO LIBRARY TESTS PASSED'); process.exit(fail ? 1 : 0);
