// Simulates Chrome Android SpeechRecognition: sessions end every ~2.5s, interim results, no-speech/network errors.
import { chromium, devices } from 'playwright-core';
const URL = process.argv[2] || 'http://localhost:8765/';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await b.newContext({ ...devices['Pixel 5'], locale: 'en-GB', permissions: ['camera', 'microphone'] });
await ctx.addInitScript(() => {
  window.__sr = { starts: 0, active: null, script: [] };
  class FakeSR { constructor() { this.continuous = false; this.interimResults = false; this.lang = ''; }
    start() { if (window.__sr.active) throw new Error('InvalidStateError: already started'); window.__sr.active = this; window.__sr.starts++; window.__sr.lang = this.lang; this._idx = 0; this._results = [];
      this._t = setTimeout(() => this._end(), 2500); }
    _emit(text, final) { if (!this.interimResults && !final) return; const r = [{ transcript: text }]; r.isFinal = final; const i = final ? this._idx++ : this._idx; this._results[i] = r; this.onresult?.({ resultIndex: i, results: this._results }); }
    _error(err) { this.onerror?.({ error: err }); this._end(); }
    _end() { clearTimeout(this._t); if (window.__sr.active === this) window.__sr.active = null; this.onend?.(); }
    stop() { this._end(); } abort() { this._end(); } }
  window.webkitSpeechRecognition = FakeSR; window.SpeechRecognition = FakeSR;
  window.__say = (text, final = true) => window.__sr.active?._emit(text, final);
});
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload();
if (await p.$('#authScreen:not([hidden])')) { await p.fill('#regName', 'Mitchell'); await p.fill('#regEmail', 'm@example.com'); await p.fill('#regSecret', '1234'); await p.click('#regBtn'); await p.waitForTimeout(400); if (await p.$('#onboard:not([hidden])')) await p.click('#obSkip'); }
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log(c ? 'ok  ' : 'FAIL', m); };
await p.click('#micBtn'); await p.waitForTimeout(300);
ok(await p.evaluate(() => window.__sr.starts === 1 && !!window.__sr.active), 'mic on starts recognition (lang ' + await p.evaluate(() => window.__sr.lang) + ')');
ok((await p.textContent('#micLabel')).includes('Hey Kova'), 'indicator: ' + await p.textContent('#micLabel'));
await p.waitForTimeout(3200);
ok(await p.evaluate(() => window.__sr.starts >= 2 && !!window.__sr.active), 'auto-restarts after session ends (starts=' + await p.evaluate(() => window.__sr.starts) + ')');
await p.evaluate(() => window.__sr.active._error('no-speech')); await p.waitForTimeout(400);
ok(await p.evaluate(() => !!window.__sr.active), 'restarts after no-speech');
await p.evaluate(() => window.__sr.active._error('network')); await p.waitForTimeout(600);
ok(await p.evaluate(() => !!window.__sr.active), 'restarts after network error (with backoff)');
await p.evaluate(() => window.__sr.active._error('aborted')); await p.waitForTimeout(400);
ok(await p.evaluate(() => !!window.__sr.active), 'restarts after aborted');
// start workout by voice, interim wake word
await p.evaluate(() => window.__say('hey co', false)); await p.waitForTimeout(50);
await p.evaluate(() => window.__say('hey cover', false)); await p.waitForTimeout(80);
ok(await p.evaluate(() => window.__kova.voiceState.mode === 'armed'), 'wake word matched on INTERIM "hey cover" -> armed');
ok(!(await p.$eval('#heardChip', e => e.hidden)), 'live transcript chip shows: ' + await p.textContent('#heardChip'));
await p.evaluate(() => window.__say('hey cover start workout', true)); await p.waitForTimeout(1500);
ok(await p.evaluate(() => !!window.__kova.sess), 'final "hey cover start workout" started the workout');
// TTS pausing: speech synthesis in headless may be silent; simulate by calling hooks
await p.waitForTimeout(2600);
await p.evaluate(() => { window.__sr.active || null; });
await p.evaluate(() => window.__say('kova pause', true)); await p.waitForTimeout(400);
ok(await p.evaluate(() => window.__kova.sess?.paused === true), '"kova pause" paused (no "hey")');
await p.waitForTimeout(600);
await p.evaluate(() => window.__say('hey nova', true)); await p.waitForTimeout(100);
await p.evaluate(() => window.__say('resume', true)); await p.waitForTimeout(300);
ok(await p.evaluate(() => window.__kova.sess?.paused === false), 'wake then separate command "resume" works');
await p.waitForTimeout(400);
const i0 = await p.evaluate(() => window.__kova.sess.i);
await p.evaluate(() => window.__say("hey coba next", true)); await p.waitForTimeout(300);
ok(await p.evaluate(i => window.__kova.sess.i === i + 1, i0), '"hey coba next" skipped');
await p.evaluate(() => window.__say('next up wall push-ups', true)); await p.waitForTimeout(300);
ok(await p.evaluate(i => window.__kova.sess.i === i + 1, i0), 'Kova saying "next up" does NOT trigger skip');
ok(await p.evaluate(() => window.__kova.voiceState.on && window.__sr.starts > 3), 'still listening after commands (starts=' + await p.evaluate(() => window.__sr.starts) + ')');
await p.evaluate(() => window.__kova.ttsStart('high', 'Short line')); await p.waitForTimeout(100);
ok(await p.evaluate(() => !window.__sr.active && window.__kova.voiceState.ttsBusy), 'listening paused while Kova speaks');
await p.waitForTimeout(3700);
ok(await p.evaluate(() => !!window.__sr.active && !window.__kova.voiceState.ttsBusy), 'listening resumes after speech (safety timer, even if onend never fires)');
await p.click('#sessMic'); await p.waitForTimeout(3000);
ok(await p.evaluate(() => !window.__sr.active), 'mic off stops and does not restart');
console.log('errors:', errs.length ? errs : 'none'); if (errs.length) fail++;
console.log(fail ? `${fail} FAILED` : 'ALL VOICE TESTS PASSED'); process.exitCode = fail ? 1 : 0;
await b.close();
