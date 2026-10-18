import { chromium, webkit, devices } from 'playwright-core';
const URL = (process.argv[2] || 'http://localhost:8765/') + '?speed=90';
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log(c ? 'ok  ' : 'FAIL', m); };
import fs from 'node:fs';
const BEEP = fs.readFileSync('beep.mp3');
const PB = `const P = o => { const a = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1 })); for (const [k, v] of Object.entries(o)) a[k] = { z: 0, visibility: 1, ...v }; return a; };
 const base = { 11: { x: .58, y: .3 }, 12: { x: .42, y: .3 }, 23: { x: .55, y: .55 }, 24: { x: .45, y: .55 }, 25: { x: .55, y: .72 }, 26: { x: .45, y: .72 }, 27: { x: .55, y: .9 }, 28: { x: .45, y: .9 } };`;
for (const [name, type, dev, cls] of [['chrome-android', chromium, devices['Pixel 5'], 'boxing'], ['webkit-iphone', webkit, devices['iPhone 13'], 'dance']]) {
  console.log(`[${name}]`);
  const b = await type.launch(type === chromium ? { executablePath: '/usr/bin/google-chrome', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] } : {});
  const ctx = await b.newContext({ ...dev, locale: 'en-GB', timezoneId: 'Europe/London', permissions: type === chromium ? ['camera'] : [] });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => { if (!/access control checks/.test(e.message)) errs.push(e.message); });
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.fill('#regName', 'Mitchell'); await p.fill('#regEmail', 'm@example.com'); await p.fill('#regSecret', '1234'); await p.click('#regBtn'); await p.waitForSelector('#onboard:not([hidden])', { timeout: 15000 }); await p.click('#obSkip');
  await p.click('.tabs button[data-tab=classes]'); await p.waitForSelector('#classList .ccard');
  ok(await p.$$eval('#classList .ccard', c => c.length) === 5, '5 class cards');
  ok((await p.textContent('#classList')).includes('Latin Dance Cardio (Zumba-style)') && /not affiliated with Zumba/.test(await p.textContent('#tab-classes')), 'Latin label + no-affiliation note');
  ok(await p.$$eval('#classList .dur', d => d.every(x => x.textContent === '30:00')), 'every card shows 30:00');
  ok(await p.$$eval('#classList .lead img', i => i.length) === 5 && (await p.textContent('#class-boxing .lead')).includes('male') && (await p.textContent('#class-yoga .lead')).includes('female'), 'trainer avatar + lead on cards');
  ok(!(await p.$('[data-watch]')), 'Watch full class hidden while Drive IDs are empty');
  ok(/Recommended/.test(await p.textContent('#recCard')), 'Recommended for you card');
  await p.check('#lowEnergy'); await p.waitForTimeout(300); ok(/Yoga|Pilates/.test(await p.textContent('#recCard h3')), 'low energy -> gentle pick: ' + await p.textContent('#recCard h3'));
  ok(await p.$$eval('#classList .newbadge', n => n.length) === 5, 'fresh account: all classes show a New badge');
  await p.click('[data-cfilter="Mind & body"]'); await p.waitForTimeout(300); ok(await p.$$eval('#classList .ccard', c => c.length) === 2, 'category filter (Mind & body) -> 2 classes'); await p.click('[data-cfilter=all]'); await p.waitForTimeout(300);
  await p.fill('#classSearch', 'warrior'); await p.waitForTimeout(300); ok((await p.$$eval('#classList .ccard', c => c.map(x => x.id))).join() === 'class-yoga', 'search by move name ("warrior") -> Yoga');
  await p.fill('#classSearch', 'zumba'); await p.waitForTimeout(300); ok((await p.$$eval('#classList .ccard', c => c.map(x => x.id))).join() === 'class-latin', 'search "zumba" -> Latin');
  await p.fill('#classSearch', ''); await p.waitForTimeout(300);
  // online library: a new entry + a Drive id arrive via library.json only (no code change)
  const lib = JSON.parse(await (await fetch(URL.replace(/\?.*/, '') + 'library.json')).text());
  lib.classes[0].drive_file_id = '1AbCdEfGhIjKlMnOp_test';
  lib.classes.push({ id: 'stretch-test', title: 'Gentle Stretch', category: 'Recovery', tags: ['gentle'], trainer: 'f', duration: 195, intensity: 'Gentle', poster: 'media/classes/yoga/seated-fold.jpg', blurb: 'Test class from library.json only.', music: { style: 'ambient', bpm: 60 }, met: 2, track: 'hold', voice: ['stretch'], drive_file_id: '', added: new Date().toISOString().slice(0, 10), script: { warm: [{ name: 'Breathe', dur: 60, slug: 'mountain-arms' }], main: [{ name: 'Seated forward fold', dur: 60, slug: 'seated-fold' }], cool: [{ name: 'Child\'s pose', dur: 60, slug: 'childs-pose' }] } });
  await p.route('**/library.json*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(lib) }));
  await p.click('.tabs button[data-tab=progress]'); await p.click('.tabs button[data-tab=classes]'); await p.waitForSelector('#class-stretch-test');
  ok(await p.isVisible('#class-stretch-test .newbadge') && await p.isVisible('[data-cfilter=Recovery]') && /3:15/.test(await p.textContent('#class-stretch-test .dur')), 'new library entry appears on returning to the tab, with New badge + its own category');
  await p.click('[data-cfilter=new]'); await p.waitForTimeout(300); ok(await p.$$eval('#classList .ccard', c => c.length) >= 1, 'New filter');
  await p.click('[data-cfilter=all]'); await p.waitForTimeout(300);
  ok(!(await p.$('[data-watch=dance]')) && !!(await p.$('[data-watch=boxing]')), 'Watch full class only where drive_file_id is set');
  await p.click('[data-watch=boxing]'); ok(await p.isVisible('#driveModal') && (await p.getAttribute('#driveFrame', 'src')) === 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp_test/preview' && (await p.getAttribute('#driveFrame', 'allowfullscreen')) !== null, 'Watch full class opens Drive /preview iframe (fullscreen allowed)');
  await p.click('#driveClose'); ok(!(await p.isVisible('#driveModal')), 'modal closes');
  await p.unroute('**/library.json*');
  // offline: library falls back to the last good copy
  await p.route('**/library.json*', r => r.abort());
  await p.evaluate(() => window.__kova.renderClasses()); await p.waitForTimeout(400);
  ok(await p.evaluate(() => window.__kova.libraryOffline) && await p.$$eval('#classList .ccard', c => c.length) === 6, 'offline: library served from the cached copy');
  await p.unroute('**/library.json*'); await p.evaluate(() => window.__kova.renderClasses()); await p.waitForTimeout(400);
  ok(await p.$$eval('#classList .ccard', c => c.length) === 5, 'back online: live library.json (5 classes)');
  await p.evaluate(() => window.__kova.showUpdateToast({ postMessage() {} })); ok(await p.isVisible('#updateToast') && /Update available, tap to refresh/.test(await p.textContent('#updateToast')), 'update toast'); await p.evaluate(() => { document.getElementById('updateToast').hidden = true; window.__kova.updateReady = false; });
  await p.screenshot({ path: `classes-${name}.png` });
  // recorded instructor voice (fake manifest + clip routed in)
  await p.route('**/media/voice/voice-manifest.json*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ lines: [
    { id: 'class.boxing.welcome', trainer: 'm', file: 'm/class.boxing.welcome.mp3', text: "Welcome to Boxing! I'm Reta. 30 minutes, beginner friendly. Let's start with a 5 minute warm-up.", tags: ['class'] },
    { id: 'class.dance.welcome', trainer: 'f', file: 'f/class.dance.welcome.mp3', text: "Welcome to Dance! I'm Reta. 30 minutes, beginner friendly. Let's start with a 5 minute warm-up.", tags: ['class'] },
    { id: 'common.pause', trainer: 'm', file: 'm/common.pause.mp3', text: "Paused. Say resume when you're ready." }, { id: 'common.pause', trainer: 'f', file: 'f/common.pause.mp3', text: "Paused. Say resume when you're ready." } ] }) }));
  await p.route('**/media/voice/*/*.mp3', r => r.fulfill({ contentType: 'audio/mpeg', body: BEEP }));
  // start the class
  if (cls === 'boxing') await p.evaluate(() => window.__kova.handleHeard(['hey reta start boxing'])); else await p.click(`[data-startclass=${cls}]`);
  await p.waitForFunction(() => window.__kova.sess?.cls && window.__kova.sess.i >= 0, null, { timeout: 10000 });
  const info = await p.evaluate(() => ({ id: window.__kova.sess.cls.id, tr: window.__kova.sess.trainer, n: document.querySelectorAll('#timeline .seg').length, hud: !document.getElementById('classHud').hidden }));
  ok(info.id === cls && info.tr === (cls === 'boxing' ? 'm' : 'f') && info.n === 40 && info.hud, `${cls} started (${cls === 'boxing' ? 'voice' : 'tap'}), lead trainer ${info.tr}, 40-step timeline, class HUD`);
  await p.waitForTimeout(1500);
  const lv = await p.evaluate(() => window.__kova.lastVoice);
  ok(lv && lv.id === `class.${cls}.welcome` && lv.src.includes(`/${cls === 'boxing' ? 'm' : 'f'}/`), 'recorded welcome line played in the lead trainer\'s voice: ' + JSON.stringify(lv));
  ok(await p.evaluate(() => (window.__kova.cls.music?.scheduled || 0) > 4), 'generated music is playing (events scheduled: ' + await p.evaluate(() => window.__kova.cls.music?.scheduled) + ')');
  ok(await p.evaluate(() => !!window.__kova.classMedia?.src), 'trainer media (class clip or fallback): ' + JSON.stringify(await p.evaluate(() => window.__kova.classMedia)));
  if (cls === 'dance') {
    await p.evaluate(() => { window.__kova.sess.t = 1e6; }); await p.waitForTimeout(300); // hold this step so the bar isn't re-anchored by fast-forwarded step changes
    const c1 = await p.evaluate(() => window.__kova.eightCount); await p.waitForTimeout(700); const c2 = await p.evaluate(() => window.__kova.eightCount); await p.evaluate(() => { window.__kova.sess.t = 1; });
    ok(await p.isVisible('#chEight') && c1 && c2 && c1 !== c2, `beat-synced 8-count display (${c1} -> ${c2})`);
  } else ok(!(await p.isVisible('#chEight')), 'no 8-count for boxing');
  // voice: music volume
  const v0 = await p.evaluate(() => window.__kova.cls.music.vol);
  await p.evaluate(() => window.__kova.handleHeard(['hey reta louder'])); const v1 = await p.evaluate(() => window.__kova.cls.music.vol);
  await p.evaluate(() => window.__kova.handleHeard(['hey reta quieter music'])); await p.evaluate(() => window.__kova.handleHeard(['hey reta quieter'])); const v2 = await p.evaluate(() => window.__kova.cls.music.vol);
  ok(v1 > v0 && v2 < v1 && +(await p.inputValue('#musicVol')) === Math.round(v2 * 100), `louder/quieter + slider (${v0} -> ${v1} -> ${v2})`);
  await p.evaluate(() => window.__kova.handleHeard(['hey reta pause'])); ok(await p.evaluate(() => window.__kova.sess.paused && window.__kova.cls.music.paused), 'pause pauses class + music'); ok(await p.evaluate(() => window.__kova.lastVoice?.id === 'common.pause'), 'pause line matched by text to its recording');
  await p.evaluate(() => window.__kova.handleHeard(['hey reta resume'])); ok(await p.evaluate(() => !window.__kova.sess.paused), 'resume');
  const i0 = await p.evaluate(() => window.__kova.sess.i); await p.evaluate(() => window.__kova.handleHeard(['hey reta skip'])); ok(await p.evaluate(() => window.__kova.sess.i) >= i0 + 1, 'skip moves to the next step');
  // interactive tracking with synthetic poses
  if (cls === 'boxing') {
    const n = await p.evaluate(`(() => { ${PB} while (window.__kova.sess.cls.steps[window.__kova.sess.i].track !== 'punch') window.__kova.classNext(); window.__kova.sess.t = 1e6; const g = { 13: { x: .6, y: .42 }, 15: { x: .56, y: .3, z: -.1 }, 14: { x: .4, y: .42 }, 16: { x: .44, y: .3, z: -.1 } }; let t = performance.now();
      for (let rep = 0; rep < 6; rep++) { for (let i = 0; i < 8; i++) { const l = P({ ...base, ...g }); window.__kova.classFeed(l, l, t += 33); }
        const e = rep % 2 ? { 14: { x: .42, y: .3, z: -.2 }, 16: { x: .42, y: .3, z: -.45 } } : { 13: { x: .58, y: .3, z: -.2 }, 15: { x: .58, y: .3, z: -.45 } };
        for (let i = 0; i < 5; i++) { const l = P({ ...base, ...g, ...e }); window.__kova.classFeed(l, l, t += 33); } }
      window.__kova.sess.t = 1; return [document.getElementById('repCount').textContent, document.getElementById('chStat').textContent]; })()`);
    ok(n[0] === '6' && /L 3 · R 3/.test(n[1]), 'punches counted live: ' + n.join(' | '));
  } else {
    const sc = await p.evaluate(`(() => { ${PB} while (window.__kova.sess.cls.steps[window.__kova.sess.i].kind !== 'main') window.__kova.classNext(); let t = performance.now(), r; for (let k = 0; k < 200; k++) { const dx = .03 * Math.sin(k / 3); const o = {}; for (const [i, v] of Object.entries(base)) o[i] = { x: v.x + dx, y: v.y }; Object.assign(o, { 15: { x: .6 + dx * 3, y: .4 }, 16: { x: .4 - dx * 3, y: .4 }, 13: { x: .6, y: .4 }, 14: { x: .4, y: .4 } }); const l = P(o); r = window.__kova.classFeed(l, l, t += 33); } return [r.score, document.getElementById('chStat').textContent, document.getElementById('chMeterN').textContent]; })()`);
    ok(sc[0] > 0 && /Move score/.test(sc[1]), 'dance move score + rhythm meter update: ' + sc.join(' | '));
  }
  await p.screenshot({ path: `class-${cls}-${name}.png` });
  if (cls === 'boxing') { await p.evaluate(() => { while (!window.__kova.sess.cls.steps[window.__kova.sess.i].fix) window.__kova.classNext(); window.__kova.sess.t = 1e6; }); ok(await p.isVisible('#fixLabel.corrective') && /Drive up from your hips/.test(await p.textContent('#fixLabel')), 'corrective cue chip on the uppercut clip'); await p.screenshot({ path: `class-fixchip-${name}.png` }); await p.evaluate(() => { window.__kova.sess.t = 1; }); }
  // run to the end (speed=90 -> ~20s)
  await p.waitForSelector('#screen-end.active', { timeout: 60000 });
  const end = await p.evaluate(() => ({ s: document.getElementById('summaryText').textContent, rows: document.getElementById('totalsTable').textContent, h: JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.endsWith('.classes')))) }));
  ok(/Class complete/.test(end.s) && /calories/.test(end.s) && /Calories \(approx\.\)/.test(end.rows), 'end-of-class summary with approx. calories');
  ok(end.h.length === 1 && end.h[0].cls === cls && end.h[0].completed && end.h[0].kcal > 0, 'class saved to this account: ' + JSON.stringify({ cls: end.h[0].cls, kcal: end.h[0].kcal, metric: end.h[0].metric }));
  if (cls === 'boxing') ok(/Punches6|Punches/.test(end.rows) && end.h[0].stats.punches === 6, 'boxing stats: punches ' + end.h[0].stats.punches);
  await p.screenshot({ path: `class-end-${name}.png` });
  // yoga hold check (short)
  await p.click('.tabs button[data-tab=classes]'); await p.click('[data-startclass=yoga]'); await p.waitForFunction(() => window.__kova.sess?.cls?.id === 'yoga' && window.__kova.sess.i >= 0);
  ok(await p.evaluate(() => window.__kova.sess.trainer === 'f'), 'yoga led by the female trainer');
  await p.evaluate(() => { while (window.__kova.sess.cls.steps[window.__kova.sess.i].pose !== 'chair') window.__kova.classNext(); window.__kova.sess.paused = true; });
  const y = await p.evaluate(`(() => { ${PB} const ch = P({ ...base, 23: { x: .55, y: .6, z: .15 }, 24: { x: .45, y: .6, z: .15 }, 25: { x: .55, y: .75, z: -.05 }, 26: { x: .45, y: .75, z: -.05 }, 27: { x: .55, y: .92 }, 28: { x: .45, y: .92 } });
    window.__kova.sess.paused = false; let t = performance.now(); for (let k = 0; k < 92; k++) window.__kova.classFeed(ch, ch, t += 33); const held = document.getElementById('repCount').textContent;
    window.__kova.sess.lastSay = 0; const st = P(base); for (let k = 0; k < 30; k++) window.__kova.classFeed(st, st, t += 33); return [held, document.getElementById('repCount').textContent, document.getElementById('cueLine').textContent + ' / ' + window.__kova.captions.slice(-3).join(' / ')]; })()`);
  ok(y[0] === '3' && y[1] === '3' && /Sink a bit lower into the chair pose/.test(y[2]), 'yoga hold timer counts only in pose + "Sink a bit lower" cue: ' + y.join(' | '));
  await p.evaluate(() => window.__kova.handleHeard(['hey reta end']));
  await p.waitForSelector('#screen-end.active'); ok(/Nice effort/.test(await p.textContent('#summaryText')), 'ending early saves too');
  ok(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
}
process.exitCode = fail ? 1 : 0; console.log(fail ? `${fail} FAILED` : 'all class e2e checks passed');
