import { getAuth } from './auth.js';
import { idbSet, idbAll, idbClear, requestPersist, makeBackup, parseBackup, restoreInto, backupDue, BACKUP_KEYS } from './backup.js';
import { summary as progressSummary, chartSVG, stLb, bmiBand, sortEntries } from './progress.js';
import { DISCLAIMER as INJ_DISCLAIMER, MEDS, UNITS, SITES, EFFECTS, makeEntry, lastSite, nextDue, isDue, describeSchedule, makeICS, sortInj } from './inject.js';
import { guideFor, stepText, SAFETY as COOK_SAFETY, BATCH_ORDER, GLP1_NOTES, THERMO_TIP, fmtTimer } from './cook.js';
import { newAwards, drawCertificate, awardsFromHistory, redateCerts } from './certs.js';
import { saveBlob, shareBlob } from './files.js';
import { waterMl, migrateDaily, addWater, litres, imperial, STEP_ML, DEFAULT_GOAL_ML } from './hydration.js';
import { buildGlp1Plan, GLP1_TIPS, STAPLES, STAPLE, GLP1_RECIPES as GLP1_RECIPES_ALL, fitPortion } from './glp1.js';
import { lidlWeek, lidlWeekOffers, fmtDay, offersFor, isHighProtein, STORE_NAMES, fmtGBP, fmtChecked, HIGH_PROTEIN } from './offers.js';
import { makeAnalyser, CoachEngine, allVisible, LM } from './logic.js';
import { findWake, nextDelay } from './voice.js';
import { healthConnectAvailable, healthConnectSteps } from './health.js';
import { initCast, castClick, setCastSource, follow as castFollow, castState, initTvMode } from './cast.js';
import { loadVideos, renderVideoLib, openVideo, videoById, videoCard, pickIdeas } from './videos.js';
import { parseWeight as parseWeightText, fmtWeight } from './weight.js';
import { buildLibrary, isNewClass, METRIC, kcal as metKcal, classKcal, recommend, PunchCounter, RhythmMeter, HoldTracker, makePilates } from './classes.js';
import { MusicPlayer, styleFor } from './music.js';
import { LINES, introText, slug as lineSlug } from './voicelines.js';
import { welcomeLine, stepStartLines, halfwayLine, tenLine, countInLine, layerLine, cueLine, countLine, punchesLine, heldLine, soFarLine, summaryLines, nextLine, CUE_EVERY, LAYER_EVERY, COUNT_IN_AT } from './classvoice.js';
import { PREP_RECIPES, MEAL_SECTIONS, PREP_STORE_NOTES, SAFETY, buildWeek } from './prep.js';
import { RECIPES, STORES, storeBasics, buildList, fmtQty, shopKey, AISLES } from './shopping.js';
import { MEALS, analyseDay, dayKey, streak, PICKER_FOODS, fussyIdeas, READY_MEALS, LABEL_GUIDE, COUNTRIES, detectCountry, readyMealTip, filterByDislikes, MEAL_IDEAS, mentionsDisliked } from './food.js';

const MP_VER = '1.1.1';
const MP_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const qs = new URLSearchParams(location.search);
const SPEED = Math.max(1, +qs.get('speed') || 1); // test hook: ?speed=30 runs timers 30x faster
const $ = id => document.getElementById(id);
const auth = getAuth(), user = auth.currentUser(), PREFIX = auth.dataPrefix(user); // per-account data
// Saved twice: localStorage (fast, sync) + an IndexedDB mirror. If Chrome drops localStorage, we restore from IndexedDB on launch.
var wpReady = false, injReady = false;
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(PREFIX + k)) ?? d; } catch { return d; } },
  set: (k, v) => { const j = JSON.stringify(v); try { localStorage.setItem(PREFIX + k, j); } catch {} idbSet(PREFIX + k, j); },
};
import { makeCloud } from './cloud.js';
const cloud = makeCloud(store, PREFIX, { certBlob: c => certBlob(c) }); let cloudTimer = null, cloudPulling = false;
{ const set0 = store.set; store.set = (k, v) => { if (cloud.user && !String(k).startsWith('cloud.')) { if (k === 'certificates') store.set('cloud.certImgs', store.get('cloud.certImgs', [])); if (!cloudPulling && ['weights', 'injections', 'certificates'].includes(k)) cloud.noteDelete(k, store.get(k, []), v); clearTimeout(cloudTimer); cloudTimer = setTimeout(() => cloudPush(), 4000); } set0(k, v); }; }
// Continuous auto-backup: every change is pushed ~4 s later; also when the app is hidden/closed and when back online.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && cloud.user && cloudTimer) { clearTimeout(cloudTimer); cloudTimer = null; cloudPush(); } });
addEventListener('online', () => cloud.user && cloudPush());
setInterval(() => { if (cloud.user && document.visibilityState === 'visible') cloudPush(); }, 5 * 60e3);
async function cloudPush() { if (!cloud.user || !navigator.onLine || cloudPulling) return; try { await cloud.push(settings, user); renderCloud?.(); } catch (e) { console.warn('cloud sync', e.message); } }
let restoredFromIdb = 0;
{ const lsKeys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX));
  const mirror = await Promise.race([idbAll(PREFIX), new Promise(r => setTimeout(() => r({}), 1500))]);
  for (const [k, v] of Object.entries(mirror)) if (localStorage.getItem(k) == null) { try { localStorage.setItem(k, v); restoredFromIdb++; } catch {} }
  for (const k of lsKeys) if (!(k in mirror)) idbSet(k, localStorage.getItem(k)); }
requestPersist().then(p => { window.__kova && (window.__kova.persisted = p); });
// Feature flags. Instructor voice (recorded lines, TTS, 'voice' wake word + mic) and the on-screen AI trainer
// (avatar, name badge, talking/lip-sync clip) are OFF for now; flip here (or localStorage features JSON) to bring them back.
const FEATURES = Object.assign({ voice: false, trainerOnScreen: false, formCheckDefault: false }, (() => { try { return JSON.parse(localStorage.getItem('glp1life.features') || '{}'); } catch { return {}; } })());
(window.__kova ||= {}).features = FEATURES;
document.documentElement.classList.toggle('novoice', !FEATURES.voice); document.documentElement.classList.toggle('notrainer', !FEATURES.trainerOnScreen);
const settings = Object.assign({ formCheck: !!FEATURES.formCheckDefault, name: user?.name || '', trainer: 'm', onboarded: false, speech: true, beeps: true, llm: false, llmUrl: '', llmModel: '', llmKey: '', glp1: false, fussy: false, likes: [], dislikes: [], country: 'auto' }, store.get('settings', {}));

/* ---------- workout definition (bodyweight + household items only) ---------- */
const MOVES = {
  march:   { name: 'March on the spot', clip: 'warmup', how: 'Lift your knees, swing your arms, breathe easy.' },
  pushup:  { name: 'Wall push-ups', clip: 'wallpushups', counted: true, view: 'side', how: 'Hands on the wall at shoulder height, body straight, bend your elbows and push back. Easier: step closer to the wall.' },
  squat:   { name: 'Sit-to-stand squats', clip: 'squats', counted: true, view: 'side', how: 'Stand up from a sturdy chair and sit back down slowly. Easier: push on your thighs.' },
  knees:   { name: 'Standing knee lifts', clip: 'kneelifts', counted: true, view: 'front', how: 'Lift each knee towards hip height, one side at a time. Hold a chair for balance if needed.' },
  bridge:  { name: 'Glute bridges', clip: 'bridges', counted: true, view: 'side', how: 'On a towel or carpet, knees bent. Squeeze your bum and lift your hips. Turn side-on to the camera.' },
  lunge:   { name: 'Step-back lunges', clip: 'lunges', counted: true, view: 'side', how: 'Small step back, keep hold of the chair, and bend both knees a little. Easier: just tap the foot back.', cue: 'Small step, keep hold of the chair' },
  deadbug: { name: 'Dead bug', clip: 'deadbug', view: 'side', counted: true, how: 'On a towel or carpet: arms up, knees bent at 90°. Slowly tap one heel to the floor, bring it back, then the other. Keep your back flat. Easier: smaller taps.', cue: 'Arms up, tap one heel down, keep your back flat' },
};
const STRETCHES = [['Calf stretch', 'Hands on the wall, one leg back, heel down.'], ['Front-of-thigh stretch', 'Hold a chair, bring one heel towards your bum.'], ['Chest stretch', 'Hand on a door frame, turn gently away.'], ['Hamstring stretch', 'Heel forward on the floor, hinge at the hips.']];
const ORDER = ['pushup', 'squat', 'knees', 'bridge', 'lunge', 'deadbug'];
function buildPlan() {
  const s = [{ kind: 'warm', move: 'march', dur: 180, label: 'Warm-up' }];
  s.push({ kind: 'rest', dur: 15, next: ORDER[0], label: 'Get ready', round: 1 });
  for (let r = 1; r <= 2; r++) ORDER.forEach((m, i) => {
    s.push({ kind: 'work', move: m, dur: 30, round: r, label: `Round ${r} of 2` });
    const last = r === 2 && i === ORDER.length - 1;
    s.push({ kind: 'rest', dur: 30, round: i === ORDER.length - 1 ? r + 1 : r, label: last ? 'Rest' : `Round ${i === ORDER.length - 1 ? r + 1 : r} of 2`, next: last ? 'cool' : ORDER[(i + 1) % ORDER.length] });
  });
  STRETCHES.forEach(([n, h]) => s.push({ kind: 'cool', name: n, how: h, dur: 45, label: 'Cool-down' }));
  return s;
}
const PLAN = buildPlan();
$('planList').innerHTML = [['Warm-up: march on the spot', '3 min'], ...ORDER.map(m => [MOVES[m].name, '2 × 30s']), ['Cool-down stretches', '3 min']].map(([a, b]) => `<li><span>${a}</span><span>${b}</span></li>`).join('');

/* ---------- trainer demo clips (media/ first, then bundled clips/, else poster/avatar placeholder) ---------- */
const MEDIA = { march: 'warmup', pushup: 'wall-pushups', squat: 'squats', knees: 'knee-lifts', bridge: 'glute-bridges', lunge: 'lunges', deadbug: 'dead-bug', cool: 'cooldown' };
const BUNDLED = { march: 'warmup', pushup: 'wallpushups', squat: 'squats', knees: 'kneelifts', bridge: 'bridges', lunge: 'lunges', deadbug: 'deadbug', cool: 'cooldown' };
const probeCache = {};
async function exists(u) { // HEAD probe, cached 60s, so clips dropped into media/ later get picked up
  const c = probeCache[u]; if (c && Date.now() - c.t < 60000) return c.ok;
  let ok = false; try { ok = (await fetch(u, { method: 'HEAD', cache: 'no-store' })).ok; } catch {}
  probeCache[u] = { ok, t: Date.now() }; return ok;
}
const TRAINERS = { m: { label: 'Coach (male)', voice: /\b(male|daniel|ryan|george|arthur|oliver|thomas|james|alfie)\b/i }, f: { label: 'Coach (female)', voice: /\b(female|woman|serena|kate|libby|sonia|hazel|susan|fiona|martha|amy|emma|maisie)\b/i } };
async function firstExisting(list) { for (const u of list) if (await exists(u)) return u; return null; }
// Candidates: trainer folder (hd first for the big view), then shared media/, then bundled clips/.
function demoCandidates(key, hd) {
  const n = MEDIA[key], t = settings.trainer || 'm';
  return [...(hd ? [`media/${t}/${n}-hd.mp4`] : []), `media/${t}/${n}.mp4`, ...(hd ? [`media/${n}-hd.mp4`] : []), `media/${n}.mp4`];
}
async function setDemo(v, key, { hd = false } = {}) {
  if (!v || !MEDIA[key]) return;
  const tile = v.parentElement, want = v.dataset.key = key + (hd ? ':hd' : '') + settings.trainer;
  const [mp4, jpg] = await Promise.all([firstExisting(demoCandidates(key, hd)), firstExisting([`media/${settings.trainer}/${MEDIA[key]}.jpg`, `media/${MEDIA[key]}.jpg`])]);
  if (v.dataset.key !== want) return; // superseded
  const src = mp4 || `clips/${BUNDLED[key]}.mp4`;
  if (jpg) { v.poster = jpg; tile.style.setProperty('--poster', `url("${jpg}")`); } else v.removeAttribute('poster');
  if (v.getAttribute('src') === src) return;
  tile.classList.remove('missing');
  v.onerror = () => tile.classList.add('missing'); // poster/avatar placeholder stays visible
  tile.classList.toggle('floor', key === 'bridge' || key === 'deadbug'); // lying-down moves: never crop head/feet
  v.src = src; v.playbackRate = 1; v.play().catch(() => {});
  window.__kova.trainerSrc = src;
}
async function applyTrainerAvatar() {
  const src = (await firstExisting([`media/${settings.trainer}/avatar.jpg`])) || (settings.trainer === 'f' ? 'avatar-f.svg' : 'avatar.jpg');
  document.querySelectorAll('.trainer-avatar').forEach(i => i.src = src);
  document.documentElement.dataset.trainer = settings.trainer; pickVoice?.();
}
// Fix explanations for "show me" moments. joints = landmark ids to colour red on the user's skeleton.
const FIX = {
  pushup: { straight: ['Body in one straight line', 'Watch me. Squeeze your tummy and bum so you stay in one straight line from head to heels.', [11, 12, 23, 24, 27, 28]],
            shallow: ['Elbows bend to about 90°', 'Watch me. Bend your elbows more and bring your chest towards the wall, hands at shoulder height.', [11, 12, 13, 14, 15, 16]],
            fast: ['2 seconds in, 2 seconds out', 'Watch my speed. Slowly in towards the wall, slowly push back.', [13, 14]],
            any: ['Hands at shoulder height', 'Watch me. Hands on the wall at shoulder height, body straight, elbows bend and push back.', [11, 12, 13, 14, 15, 16]] },
  squat: { shallow: ['Knees bent at 90°', 'Watch me. Sit right back until you touch the chair, knees bent to about 90 degrees, then stand tall.', [23, 24, 25, 26]],
           fast: ['Slow sit, slow stand', 'Watch my speed. Lower for two seconds, stand for two.', [25, 26]],
           any: ['Sit back, chest up', 'Watch me. Feet hip-width apart, sit back to the chair, chest up, then stand tall.', [23, 24, 25, 26]] },
  knees: { any: ['Knee up to hip height', 'Watch me. Lift each knee up towards hip height and stand tall.', [23, 24, 25, 26]] },
  bridge: { shallow: ['Knees, hips, shoulders in line', 'Watch me. Squeeze your bum and lift until your knees, hips and shoulders make a straight line.', [11, 12, 23, 24, 25, 26]],
            fast: ['Lift, hold, lower slowly', 'Watch me. Lift, hold for a second at the top, then lower slowly.', [23, 24]],
            any: ['Squeeze and lift', 'Watch me. Feet flat, squeeze your bum and lift your hips.', [23, 24]] },
  lunge: { shallow: ['Small step, hold the chair', 'Watch me. A small step back, keep hold of the chair, and bend both knees a little more with your chest up.', [23, 24, 25, 26, 27, 28]],
           fast: ['Step back slowly', 'Watch my speed. Step back slowly and come up with control.', [25, 26]],
           any: ['Small step, hold the chair', 'Watch me. Keep hold of the chair, take a small step back and bend both knees a little.', [25, 26]] },
  deadbug: { any: ['Tap one heel, back flat', 'Watch me. Arms up, knees at 90 degrees. Tap one heel down slowly, bring it back, then the other. Keep your back flat on the floor.', [23, 24, 25, 26]],
             fast: ['Slow heel taps', 'Watch my speed. Slow heel taps, keep your back flat.', [25, 26, 27, 28]] },
  march: { any: ['Knees up, arms swing', 'Watch me. Lift your knees and swing your arms.', [25, 26]] },
};
const SHOW_COOLDOWN = 45000;
async function showMe(move, issue = 'any', { manual = false } = {}) {
  if (!sess || sess.showing || !FIX[move]) return false;
  const t = performance.now(); sess.lastShow ||= {};
  if (!manual && t - (sess.lastShow[move] || -1e9) < SHOW_COOLDOWN) return false;
  sess.lastShow[move] = t;
  const [label, text, joints] = FIX[move][issue] || FIX[move].any;
  sess.showing = true; sess.badJoints = new Set(joints); sess.badUntil = Infinity; window.__kova.showCount = (window.__kova.showCount || 0) + 1;
  const v = $('trainerVid'), wasSwapped = layout.swapped;
  if (wasSwapped) setSwapped(false); // the trainer always takes the big view to demonstrate
  $('stage').classList.add('showing'); await setDemo(v, move, { hd: true });
  $('fixLabel').textContent = label; $('fixLabel').hidden = false; v.playbackRate = 0.6; try { v.currentTime = 0; } catch {} v.play().catch(() => {});
  setCue(label, true); say(text, { kind: 'high' });
  await new Promise(r => setTimeout(r, SPEED > 1 ? 3000 : Math.max(6500, text.length * 70)));
  if (!sess) return true;
  $('stage').classList.remove('showing'); $('fixLabel').hidden = true; v.playbackRate = 1;
  if (wasSwapped) setSwapped(true);
  sess.showing = false; sess.badStreak = 0; sess.badUntil = performance.now() + 3000; sess.lastTick = performance.now();
  const st = cur();
  if (st.kind === 'rest') setDemo(v, st.next === 'cool' ? 'cool' : st.next, { hd: true });
  if (st.kind === 'work' || st.kind === 'warm') { coach.startWork(); setCue('Your turn!'); say('Your turn!', { kind: 'high' }); } else setCue('Breathe and shake it out');
  return true;
}

/* ---------- class layout: trainer big, you small (tap to swap, drag the small tile in landscape) ---------- */
const layout = { swapped: false, drag: null, pos: null };
function setSwapped(on) {
  layout.swapped = on;
  $('trainerView').classList.toggle('big', !on); $('trainerView').classList.toggle('pip', on);
  $('youView').classList.toggle('big', on); $('youView').classList.toggle('pip', !on);
  applyPipPos();
}
function orient() {
  const land = innerWidth > innerHeight;
  $('stage').classList.toggle('landscape', land); $('stage').classList.toggle('portrait', !land); applyPipPos();
}
function applyPipPos() {
  document.querySelectorAll('.view').forEach(v => v.style.transform = '');
  const pip = document.querySelector('.view.pip');
  if (pip && layout.pos && $('stage').classList.contains('landscape')) pip.style.transform = `translate(${layout.pos.x}px, ${layout.pos.y}px)`;
}
addEventListener('resize', orient); addEventListener('orientationchange', () => setTimeout(orient, 200)); orient();
$('swapBtn').onclick = () => setSwapped(!layout.swapped);
for (const el of [$('trainerView'), $('youView')]) {
  el.addEventListener('pointerdown', e => {
    if (!el.classList.contains('pip')) return;
    layout.drag = { x0: e.clientX, y0: e.clientY, base: layout.pos || { x: 0, y: 0 }, moved: false }; el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', e => {
    const d = layout.drag; if (!d || !el.classList.contains('pip') || !$('stage').classList.contains('landscape')) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0; if (Math.hypot(dx, dy) > 8) d.moved = true;
    if (!d.moved) return;
    const st = $('stage').getBoundingClientRect(), r = el.getBoundingClientRect();
    const base = el.style.transform ? { x: (layout.pos?.x || 0), y: (layout.pos?.y || 0) } : { x: 0, y: 0 };
    const x = Math.min(0, Math.max(-(st.width - r.width - 24), d.base.x + dx)), y = Math.min(0, Math.max(-(st.height - r.height - 24), d.base.y + dy));
    el.style.transform = `translate(${x}px, ${y}px)`; d.cur = { x, y }; void base;
  });
  el.addEventListener('pointerup', () => {
    const d = layout.drag; layout.drag = null; if (!d) return;
    if (d.moved) { layout.pos = d.cur || layout.pos; } else setSwapped(!layout.swapped); // tap = swap
  });
}
function buildTimeline() {
  const total = PLAN.reduce((a, s) => a + s.dur, 0);
  $('timeline').innerHTML = PLAN.map((s, i) => `<div class="seg ${s.kind}" style="flex:${s.dur / total}" title="${s.kind === 'work' || s.kind === 'warm' ? MOVES[s.move].name : s.kind === 'cool' ? s.name : 'Rest'}"><i id="tl${i}"></i></div>`).join('');
}
buildTimeline();
function updateTimeline() {
  if (!sess) return;
  PLAN.forEach((s, i) => { const el = $('tl' + i); if (!el) return; el.style.width = i < sess.i ? '100%' : i > sess.i ? '0%' : `${100 * (1 - Math.max(0, sess.t) / s.dur)}%`; el.parentElement.classList.toggle('now', i === sess.i); });
}
// Form score: rolling quality of recent reps (100 = clean rep, lower for shallow/fast/flagged reps).
function formRep(q) {
  sess.form = sess.form == null ? q : Math.round(sess.form * 0.7 + q * 0.3);
  const f = sess.form; $('formScore').textContent = f; const bar = $('formBar'); bar.style.width = f + '%';
  bar.style.background = f >= 75 ? '#3ddc84' : f >= 50 ? '#ffb547' : '#ff4d4d';
}
function updateEnergy() {
  if (!sess) return;
  const s = cur(), here = s?.kind === 'work' && sess.analyser?.rc ? sess.analyser.rc.reps : 0;
  const now = Object.values(sess.totals).reduce((a, b) => a + b, 0) + here, last = sess.lastTotal;
  const max = Math.max(now, last || 0, 1);
  $('eNowN').textContent = now; $('eNow').style.width = `${100 * now / max}%`;
  $('eLastN').textContent = last == null ? '–' : last; $('eLast').style.width = last == null ? '0%' : `${100 * last / max}%`;
  $('energy').classList.toggle('ahead', last != null && now > last);
}

/* ---------- audio: speech + beeps ---------- */
let actx = null, voice = null, voiceTrainer = null; // voiceTrainer: class lead overrides the voice during a class
function pickVoice() { if (!('speechSynthesis' in window)) return; const v = speechSynthesis.getVoices(), gb = v.filter(x => /en[-_]GB/i.test(x.lang)), re = TRAINERS[voiceTrainer || settings.trainer]?.voice; voice = (re && gb.find(x => re.test(x.name))) || gb[0] || (re && v.find(x => /^en/i.test(x.lang) && re.test(x.name))) || v.find(x => /^en/i.test(x.lang)) || null; }
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
/* ---------- instructor voice: pre-recorded lines (media/voice/<m|f>/<id>.mp3) with phone-voice fallback ---------- */
const VOICE = { byId: new Map(), byText: new Map(), queue: [], cur: null, cache: new Map(), loaded: false };
const vnorm = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
async function loadVoiceManifest() {
  if (!FEATURES.voice) return;
  try {
    const r = await fetch(`media/voice/voice-manifest.json?v=${Date.now()}`, { cache: 'no-store' }); if (!r.ok) return;
    const doc = await r.json(); VOICE.byId.clear(); VOICE.byText.clear();
    const list = Array.isArray(doc) ? doc : Array.isArray(doc.lines) ? doc.lines : Object.entries(doc.lines || doc).filter(([, v]) => v && typeof v === 'object').map(([id, v]) => ({ id, ...v }));
    for (const e of list) {
      if (!e || !e.id) continue;
      const ts = e.trainer ? [e.trainer] : String(e.file || '').match(/(^|\/)(m|f)\//) ? [String(e.file).match(/(^|\/)(m|f)\//)[2]] : ['m', 'f'];
      for (const t of ts) { VOICE.byId.set(`${t}|${e.id}`, e); if (e.text) VOICE.byText.set(`${t}|${vnorm(e.text)}`, e); }
    }
    VOICE.loaded = true; window.__kova.voiceLines = VOICE.byId.size;
  } catch {}
}
loadVoiceManifest();
function voiceSrc(e, t) { const f = String(e.file || `${t}/${e.id}.mp3`).replace(/^\.?\//, ''); return /^media\//.test(f) ? f : `media/voice/${f}`; }
function findLine(id, text, t) {
  const byId = id && VOICE.byId.get(`${t}|${id}`);
  if (byId && (!byId.text || !text || vnorm(byId.text) === vnorm(text))) return byId; // id must still say the same thing
  return VOICE.byText.get(`${t}|${vnorm(text)}`) || null;
}
const voiceTrainerNow = () => voiceTrainer || settings.trainer || 'm';
function preloadLines(items) { // items: [{id, text}] -> warm the browser cache for the next move's lines
  if (!FEATURES.voice) return;
  if (settings.voiceMode === 'phone') return;
  for (const { id, text } of items) { const e = findLine(id, text, voiceTrainerNow()); if (!e) continue; const src = voiceSrc(e, voiceTrainerNow()); if (VOICE.cache.has(src)) continue; const a = new Audio(); a.preload = 'auto'; a.src = src; VOICE.cache.set(src, a); if (VOICE.cache.size > 40) VOICE.cache.delete(VOICE.cache.keys().next().value); }
}
const voiceBusy = () => !!VOICE.cur || !!window.speechSynthesis?.speaking;
function duck(on) { if (on && window.__kova) window.__kova.ducks = (window.__kova.ducks || 0) + 1; try { music?.duck?.(on); } catch {} }
function stopVoice() { VOICE.queue.length = 0; if (VOICE.cur) { VOICE.cur.onended = VOICE.cur.onerror = null; VOICE.cur.pause(); VOICE.cur = null; } window.speechSynthesis?.cancel(); talkLook(false); }
// One queue for recorded and phone-voice lines: 'high' interrupts, anything else waits its turn (at most one waiting).
function enqueueVoice(item) {
  if (item.kind === 'high') stopVoice();
  else if (voiceBusy()) { if (!VOICE.queue.length) VOICE.queue.push(item); return; }
  runVoice(item);
}
function voiceDone() { const n = VOICE.queue.shift(); if (n) return runVoice(n); talkLook(false); duck(false); setTimeout(ttsEnd, 50); }
function runVoice(item) { talkLook(!!(item.talk && item.rec)); if (item.rec) playRecorded(item); else speakTTS(item.text, item.kind); }
function playRecorded({ rec, t, kind, text }, k = 0) { // rec: one manifest entry, or several chained in order (number + phrase)
  const list = Array.isArray(rec) ? rec : [rec], e = list[k];
  const src = voiceSrc(e, t), a = VOICE.cache.get(src) || new Audio(src); VOICE.cache.delete(src);
  VOICE.cur = a; window.__kova.lastVoice = { id: list.map(x => x.id).join('+'), src, text }; (window.__kova.voiceLog ||= []).push(e.id); if (!k) { duck(true); ttsStart(kind, text); }
  const done = fallback => { if (VOICE.cur !== a) return; VOICE.cur = null; if (fallback) return speakTTS(text, kind); if (k + 1 < list.length) return playRecorded({ rec, t, kind, text }, k + 1); voiceDone(); };
  a.onended = () => done(false); a.onerror = () => done(true);
  try { a.currentTime = 0; } catch {}
  a.play().catch(() => done(true));
  if (k + 1 < list.length) { const n = voiceSrc(list[k + 1], t); if (!VOICE.cache.has(n)) { const b = new Audio(); b.preload = 'auto'; b.src = n; VOICE.cache.set(n, b); } }
}
/* "Talking" look: while a long recorded speech plays (class welcome, cool-down intro), a talking-to-camera clip of the
   class trainer fades in over the move demo. Muted, and lips aren't synced, so it's only used for those speeches. */
// Swap point for lip-synced clips later: change TALK_CLIP (or set TALK_LOOK = false to turn the look off).
const TALK_LOOK = true, TALK_CLIP = (t, hd) => `media/${t}/talk${hd ? '-hd' : ''}.mp4`;
function talkLook(on) {
  const v = $('talkVid'); if (!v) return;
  if (on && TALK_LOOK && FEATURES.trainerOnScreen && sess?.cls && settings.talkLook !== false) {
    const t = sess.trainer || 'm', src = TALK_CLIP(t, !$('stage').classList.contains('swapped'));
    if (v.getAttribute('src') !== src) v.src = src;
    v.hidden = false; v.play().catch(() => {}); requestAnimationFrame(() => v.classList.add('on')); window.__kova.talking = (window.__kova.talking || 0) + 1; window.__kova.talkOn = true;
  } else if (!v.hidden) { v.classList.remove('on'); window.__kova.talkOn = false; clearTimeout(talkLook.t); talkLook.t = setTimeout(() => { if (!v.classList.contains('on')) { v.pause(); v.hidden = true; } }, 350); }
}
/** say(text, {kind, id, alts}): id = stable phrase id; alts = other ids/texts whose recording may be played instead (caption follows the recording). */
function say(text, { kind = 'coach', id = null, alts = [], parts = null, preferAlts = false, talk = false } = {}) {
  if (!id && !parts && kind === 'count' && /^\d+$/.test(text)) ({ id = null, parts = null } = countLine(+text));
  const t = voiceTrainerNow(), on = settings.voiceMode !== 'phone';
  const alt = () => { for (const x of alts) { const r = VOICE.byId.get(`${t}|${x}`) || VOICE.byText.get(`${t}|${vnorm(x)}`); if (r) { text = r.text || text; return r; } } return null; };
  let rec = on && ((preferAlts && alt()) || findLine(id, text, t) || (!preferAlts && alt()));
  if (!rec && on && parts?.length) { const r = parts.map(p => VOICE.byId.get(`${t}|${p}`)); if (r.every(Boolean)) rec = r; } // chained number + phrase clips
  if (!FEATURES.voice) return; // no instructor voice or coach captions for now
  bubble(text);
  if (!settings.speech) return;
  enqueueVoice({ rec: rec || null, t, kind, text, talk });
}
const sayLine = l => l && say(l.text, l);
function speakTTS(text, kind = 'coach') {
  if (!('speechSynthesis' in window)) return voiceDone();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice; u.lang = voice?.lang || 'en-GB'; u.rate = kind === 'count' ? 1.15 : 1.0;
  let fin = false; const end = () => { if (fin) return; fin = true; voiceDone(); };
  u.onstart = () => { duck(true); ttsStart(kind, text); }; u.onend = u.onerror = end;
  speechSynthesis.speak(u);
  setTimeout(() => { if (!speechSynthesis.speaking && !speechSynthesis.pending) end(); }, 400 + text.length * 120); // engines that never fire onend
}
function unlockAudio() {
  try { actx ||= new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch {}
  if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); }
}
function beep(f = 880, ms = 140, when = 0) {
  if (!settings.beeps || !actx) return;
  const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + when;
  o.frequency.value = f; o.type = 'sine'; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + ms / 1000 + 0.02);
}
const chime = () => { beep(660, 120); beep(990, 180, 0.12); };
let bubbleT; function bubble(text) { if (window.__kova) (window.__kova.captions ||= []).push(text); const b = $('bubble'); b.textContent = text; b.classList.add('show'); clearTimeout(bubbleT); bubbleT = setTimeout(() => b.classList.remove('show'), Math.max(3500, text.length * 80)); }
function toast(t, ms = 2500) { const el = $('toast'); el.textContent = t; el.classList.remove('hasbtn'); el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, ms); }

/* ---------- optional LLM hook (text only, off by default) ---------- */
async function llm(prompt) {
  if (!settings.llm || !settings.llmKey || !settings.llmUrl) return null;
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(settings.llmUrl, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.llmKey}` },
      body: JSON.stringify({ model: settings.llmModel || 'gpt-4o-mini', max_tokens: 180, messages: [
        { role: 'system', content: `You are the GLP1 Life assistant, a warm, upbeat British home-fitness coach for ${settings.name}, a total beginner using bodyweight only (no equipment to buy). Be brief, kind, specific and non-judgemental. Never suggest extreme or very-low-calorie diets. Not medical advice.` },
        { role: 'user', content: prompt }] }) });
    clearTimeout(to); if (!r.ok) return null;
    const j = await r.json(); return j.choices?.[0]?.message?.content?.trim() || null;
  } catch { return null; }
}

/* ---------- camera + pose ---------- */
let landmarker = null, stream = null, facing = 'user', lastVideoTime = -1, lastPose = null;
const video = $('video'), canvas = $('overlay'), ctx = canvas.getContext('2d');
async function initPose() {
  if (landmarker) return landmarker;
  const { FilesetResolver, PoseLandmarker } = await import(`${MP_URL}/vision_bundle.mjs`);
  const fileset = await FilesetResolver.forVisionTasks(`${MP_URL}/wasm`);
  const opts = d => ({ baseOptions: { modelAssetPath: MODEL, delegate: d }, runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  try { landmarker = await PoseLandmarker.createFromOptions(fileset, opts('GPU')); landmarker._delegate = 'GPU'; }
  catch (e) { console.warn('GPU delegate failed, using CPU', e); landmarker = await PoseLandmarker.createFromOptions(fileset, opts('CPU')); landmarker._delegate = 'CPU'; }
  window.__kova.delegate = landmarker._delegate;
  landmarker.CONN = PoseLandmarker.POSE_CONNECTIONS;
  return landmarker;
}
async function startCamera() {
  if (window.__tvMode) throw new Error('TV mode: no camera');
  stream?.getTracks().forEach(t => t.stop());
  stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } } });
  video.srcObject = stream; await video.play().catch(() => {});
  $('mirror').classList.toggle('flip', facing === 'user');
}
// Camera form-check: optional, off by default. Toggle in the session top bar.
function formCheckUI() { $('stage').classList.toggle('nocam', !settings.formCheck); const b = $('formCheckBtn'); if (b) { b.setAttribute('aria-pressed', String(!!settings.formCheck)); b.textContent = settings.formCheck ? '📷 Form check on' : '📷 Form check'; } }
async function setFormCheck(on) { settings.formCheck = on; store.set('settings', settings); formCheckUI();
  if (on && sess) { try { await startCamera(); initPose().then(() => setCue('')).catch(() => setCue('Pose model failed to load. Feedback is off.', true)); } catch { setCue('Camera blocked. Allow camera access for form feedback.', true); } }
  if (!on) { stream?.getTracks().forEach(t => t.stop()); stream = null; } }
$('formCheckBtn').onclick = () => setFormCheck(!settings.formCheck); formCheckUI();
$('flipBtn').onclick = async () => { facing = facing === 'user' ? 'environment' : 'user'; try { await startCamera(); } catch (e) { toast('Could not switch camera'); facing = 'user'; } };
function draw(res) {
  if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const lm = res?.landmarks?.[0]; if (!lm) return;
  const W = canvas.width, H = canvas.height;
  ctx.lineWidth = Math.max(3, W / 200);
  const bad = sess && sess.badJoints && performance.now() < (sess.badUntil || 0) ? sess.badJoints : null; // "You vs demo": red = fix this, green = good
  const RED = '#ff4d4d', GOOD = bad ? '#3ddc84' : 'rgba(22,212,192,.9)';
  for (const { start, end } of landmarker.CONN) { const a = lm[start], b = lm[end]; if ((a.visibility ?? 1) < .5 || (b.visibility ?? 1) < .5) continue; ctx.strokeStyle = bad && (bad.has(start) || bad.has(end)) ? RED : GOOD; ctx.beginPath(); ctx.moveTo(a.x * W, a.y * H); ctx.lineTo(b.x * W, b.y * H); ctx.stroke(); }
  for (let i = 11; i < 33; i++) { const p = lm[i]; if ((p.visibility ?? 1) < .5) continue; const r = bad?.has(i); ctx.fillStyle = r ? RED : '#fff'; ctx.beginPath(); ctx.arc(p.x * W, p.y * H, ctx.lineWidth * (r ? 2.2 : 1.3), 0, 7); ctx.fill(); }
}
function poseLoop() {
  if (!sess) return;
  if (landmarker && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    try { const res = landmarker.detectForVideo(video, performance.now()); lastPose = res; draw(res); (sess.cls ? classOnPose : onPose)(res); } catch (e) { console.warn(e); }
  }
  requestAnimationFrame(poseLoop);
}

/* ---------- session flow ---------- */
let sess = null, coach = null, wakeLock = null;
async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && sess) keepAwake(); });
const fmtT = s => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function show(id) { document.querySelectorAll('#tab-workout .screen').forEach(s => s.classList.toggle('active', s.id === id)); }

async function startWorkout() {
  if (sess) return;
  unlockAudio(); switchTab('workout');
  coach = new CoachEngine({ name: settings.name, say, now: () => performance.now() });
  sess = { i: -1, t: 0, paused: false, totals: Object.fromEntries(ORDER.filter(m => MOVES[m].counted).map(m => [m, 0])), started: Date.now(), analyser: null, lastTick: performance.now(), inFrame: false };
  window.__kova.sess = sess;
  const prevS = store.get('sessions', []).slice(-1)[0]; sess.lastTotal = prevS ? Object.values(prevS.totals).reduce((a, b) => a + b, 0) : null; sess.form = null;
  $('formScore').textContent = '–'; $('formBar').style.width = '0%';
  show('screen-session'); keepAwake(); orient(); setSwapped(false); updateEnergy();
  $('moveName').textContent = 'Getting ready'; setCue('Starting camera…');
  coach.line('greet', { force: true });
  if (settings.formCheck) { try { await startCamera(); } catch (e) { setCue('Camera blocked. Allow camera access and reload.', true); console.warn(e); } } else setCue('');
  if (settings.formCheck) initPose().then(() => setCue('')).catch(e => { console.error('pose init failed', e); setCue('Pose model failed to load. Check your connection.', true); });
  requestAnimationFrame(poseLoop);
  next(); sess.timer = setInterval(tick, 100);
}
function cur() { return PLAN[sess.i]; }
function next() {
  const prev = cur();
  if (prev?.kind === 'work' && sess.analyser) {
    if (MOVES[prev.move].counted) sess.totals[prev.move] += sess.analyser.rc.reps;
    const reps = sess.analyser.rc.reps;
    if (MOVES[prev.move].counted) llm(`${settings.name} just did ${reps} reps of ${MOVES[prev.move].name} in 30s (round ${prev.round}). Give one short encouraging line.`).then(t => t && sess && bubble(t));
  }
  sess.i++;
  if (sess.i >= PLAN.length) return finish(true);
  const s = cur(); sess.t = s.dur; sess.analyser = null; sess.said = {};
  $('restPanel').hidden = s.kind !== 'rest'; $('stage').classList.toggle('resting', s.kind === 'rest');
  $('roundTag').textContent = s.label; $('stepTag').textContent = `${sess.i + 1}/${PLAN.length}`;
  $('repCount').textContent = s.kind === 'work' && MOVES[s.move].counted ? '0' : '–'; updateTimeline(); updateEnergy();
  if (s.kind === 'rest') {
    const nm = s.next === 'cool' ? 'Cool-down stretches' : MOVES[s.next].name;
    $('moveName').textContent = 'Rest'; $('nextName').textContent = nm;
    $('nextHow').textContent = s.next === 'cool' ? 'Slow, gentle stretches. Hold each one and breathe.' : MOVES[s.next].how;
    setDemo($('trainerVid'), s.next === 'cool' ? 'cool' : s.next, { hd: true });
    setCue('Breathe and shake it out');
    say(`${sess.i > 2 ? coach.pick('rest') + ' ' : ''}Next up: ${nm}.`, { kind: 'high' });
  } else if (s.kind === 'cool') {
    setDemo($('trainerVid'), 'cool', { hd: true }); $('moveName').textContent = s.name; setCue(s.how); say(`${s.name}. ${s.how} Hold for 20 to 30 seconds each side.`, { kind: 'high' });
  } else {
    const m = MOVES[s.move]; $('moveName').textContent = m.name;
    sess.analyser = makeAnalyser(s.move); coach.startWork(); setDemo($('trainerVid'), s.move, { hd: true }); sess.badStreak = 0; sess.repBad = false;
    setCue(m.cue || (m.view === 'side' ? 'Turn side-on to the camera' : 'Face the camera'));
    say(s.kind === 'warm' ? `Let's warm up. March on the spot for 3 minutes.` : `Go! ${m.name}.${m.cue ? ' ' + m.cue + '.' : ''}`, { kind: 'high' }); beep(1200, 250);
  }
  ring();
}
function tick() {
  const now = performance.now(), dt = (now - sess.lastTick) / 1000 * SPEED; sess.lastTick = now;
  if (sess.paused || sess.showing) return;
  sess.t -= dt; const s = cur();
  if (s.kind === 'rest' || s.kind === 'cool') for (const k of [3, 2, 1]) if (sess.t <= k && !sess.said['b' + k]) { sess.said['b' + k] = 1; beep(660, 120); }
  if (s.kind === 'warm') {
    if (sess.t <= 120 && !sess.said.w2) { sess.said.w2 = 1; coach.line('idle', { force: true }); }
    if (sess.t <= 10 && !sess.said.w10) { sess.said.w10 = 1; say('10 seconds left of the warm-up.', { kind: 'high' }); }
  }
  if (sess.t <= 0) { beep(440, 350); next(); return; }
  ring(); updateTimeline();
}
function ring() { const s = cur(); if (!s) return; $('ringProg').style.strokeDashoffset = 326.7 * (1 - Math.max(0, sess.t) / s.dur); $('timeLeft').textContent = fmtT(sess.t); }
function setCue(t, warn = false) { const c = $('cueLine'); c.textContent = t; c.classList.toggle('warn', warn); }

function onPose(res) {
  window.__kova.frames = (window.__kova.frames || 0) + 1;
  const s = cur(); if (!s || sess.paused || sess.showing) return;
  const lm = res.landmarks?.[0], w = res.worldLandmarks?.[0];
  if (s.kind === 'rest') return;
  const t = performance.now();
  let result = { ready: false };
  if (lm && w) result = sess.analyser ? sess.analyser.frame(lm, w, t) : { ready: allVisible(lm, [LM.LS, LM.RS, LM.LH, LM.RH]) };
  sess.inFrame = result.ready;
  if (!result.ready) setCue('Step back so I can see your whole body', true);
  else if ($('cueLine').classList.contains('warn')) setCue((s.kind === 'work' && MOVES[s.move].cue) || '');
  if (s.kind === 'cool') return;
  if (s.kind === 'work' && result.ready) trackForm(s.move, result);
  if (sess.showing) return;
  const line = coach.onFrame({ move: s.move, result, timeLeft: s.kind === 'work' ? sess.t : 99, counted: s.kind === 'work' && !!MOVES[s.move].counted });
  if (line && result.ready) setCue(line, /lower|straight|slow|higher|back/i.test(line));
  if (s.kind === 'work' && sess.analyser?.rc) $('repCount').textContent = MOVES[s.move].counted ? sess.analyser.rc.reps : '';
}
// Bad-rep tracking: 2+ bad reps in a row triggers a "show me" demo (max once per 45s per move).
function trackForm(move, result) {
  const FLAGJ = { straight: [11, 12, 23, 24, 27, 28] };
  for (const f of result.flags || []) { sess.repBad = true; sess.lastIssue = f; sess.badJoints = new Set(FLAGJ[f] || []); sess.badUntil = performance.now() + 2500; }
  for (const ev of result.events || []) {
    if (ev.type === 'shallow') { formRep(40); sess.badStreak = (sess.badStreak || 0) + 1; sess.lastIssue = 'shallow'; sess.badJoints = new Set((FIX[move]?.shallow || FIX[move]?.any || [, , []])[2]); sess.badUntil = performance.now() + 2500; }
    if (ev.type === 'rep') {
      const fast = move !== 'knees' && ev.ms < 1000;
      if (sess.repBad || fast) { sess.badStreak = (sess.badStreak || 0) + 1; if (fast && !sess.repBad) sess.lastIssue = 'fast'; formRep(sess.repBad ? 60 : 70); }
      else { sess.badStreak = 0; formRep(100); }
      setTimeout(updateEnergy, 0);
      sess.repBad = false;
    }
  }
  if (!sess.showing && sess.badStreak >= 2) showMe(move, sess.lastIssue);
}

function pause(p = !sess?.paused) { if (!sess) return; sess.paused = p; if (sess.cls) music?.setPaused(p); $('pauseBtn').textContent = p ? 'Resume' : 'Pause'; say(p ? 'Paused. Say resume when you\'re ready.' : 'And we\'re back.', { kind: 'high' }); }
$('pauseBtn').onclick = () => pause();
$('skipBtn').onclick = () => sess && (sess.cls ? classNext() : next());
$('endBtn').onclick = () => sess && (sess.cls ? classFinish(false) : finish(false));
async function finish(completed) {
  const s = cur(); if (s?.kind === 'work' && sess.analyser && MOVES[s.move].counted) sess.totals[s.move] += sess.analyser.rc.reps;
  clearInterval(sess.timer); stream?.getTracks().forEach(t => t.stop()); stream = null; wakeLock?.release?.(); wakeLock = null;
  const hist = store.get('sessions', []), prev = hist[hist.length - 1];
  const rec = { date: new Date().toISOString(), totals: sess.totals, minutes: Math.round((Date.now() - sess.started) / 60000), completed };
  hist.push(rec); store.set('sessions', hist);
  const labels = Object.fromEntries(Object.entries(MOVES).map(([k, v]) => [k, v.name.toLowerCase()]));
  const summary = coach.summary(sess.totals, prev, labels);
  $('summaryText').textContent = summary;
  $('totalsTable').innerHTML = Object.entries(sess.totals).map(([k, v]) => `<tr><td>${MOVES[k].name}</td><td>${v}${prev ? ` <small class="muted">(last ${prev.totals[k] ?? 0})</small>` : ''}</td></tr>`).join('');
  sess = null; window.__kova.sess = null; show('screen-end'); say(summary + ' Fancy doing your food check-in?', { kind: 'high' });
  $('endFoodTip') ? ($('endFoodTip').textContent = 'Refuel idea: ' + mealSuggestion()) : $('totalsTable').insertAdjacentHTML('afterend', `<div class="card note small" id="endFoodTip">Refuel idea: ${mealSuggestion()}</div>`);
  renderProgress();
  const extra = await llm(`Session finished (${completed ? 'complete' : 'ended early'}). Reps today: ${JSON.stringify(rec.totals)}. Last session: ${prev ? JSON.stringify(prev.totals) : 'none'}. Give a 2-sentence warm summary and one bodyweight-only progression tip.`);
  if (extra) $('summaryText').textContent = extra;
}
$('startBtn').onclick = startWorkout;
$('againBtn').onclick = () => show('screen-start');
$('endFoodBtn').onclick = () => switchTab('food');

/* ---------- tabs ---------- */
function switchTab(t) {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.id === 'tab-' + t));
  document.querySelectorAll('#dock [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === t)); moveDockInd(); document.querySelectorAll('#launcher [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === t && !b.dataset.lscroll)); $('orbBtn').classList.toggle('active', !['workout', 'classes', 'food', 'progress'].includes(t));
  if (t === 'progress') renderProgress(); if (t === 'food') renderFoodStats(); if (t === 'shop') renderShop(); if (t === 'prep') renderPrep(); if (t === 'classes') renderClasses(); if (t === 'prices' || t === 'aldi' || t === 'lidl') renderPrices();
}
const buzz = () => { try { navigator.vibrate?.(12); } catch {} };
function moveDockInd() { const on = document.querySelector('#dock [data-tab].active'), ind = $('dockInd'); if (!ind) return; if (!on) { ind.style.opacity = 0; return; } const d = $('dock').getBoundingClientRect(), r = on.getBoundingClientRect(); ind.style.opacity = 1; ind.style.width = r.width + 'px'; ind.style.transform = `translateX(${r.left - d.left}px)`; }
addEventListener('resize', moveDockInd); requestAnimationFrame(moveDockInd);
function openLauncher(on) { const l = $('launcher'); if (on) { l.hidden = false; requestAnimationFrame(() => l.classList.add('open')); } else { l.classList.remove('open'); setTimeout(() => { if (!l.classList.contains('open')) l.hidden = true; }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220); } $('orbBtn').setAttribute('aria-expanded', on); $('orbBtn').classList.toggle('open', on); }
window.__reta = Object.assign(window.__reta || {}, { openLauncher });
document.querySelectorAll('#dock [data-tab]').forEach(b => b.onclick = () => { buzz(); if (sess) return toast('Finish or end the workout first'); openLauncher(false); switchTab(b.dataset.tab); scrollTo(0, 0); });
$('orbBtn').onclick = () => { buzz(); openLauncher($('launcher').hidden || !$('launcher').classList.contains('open')); };
$('launcher').onclick = e => { if (e.target.id === 'launcher') openLauncher(false); };
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('launcher').hidden) openLauncher(false); });
document.querySelectorAll('#launcher [data-tab], #launcher [data-ltile]').forEach(b => b.onclick = () => { buzz(); if (sess) return toast('Finish or end the workout first'); openLauncher(false);
  if (b.dataset.ltile === 'coach' && !FEATURES.voice) { switchTab('workout'); scrollTo(0, 0); return; }
  if (b.dataset.ltile === 'coach') { switchTab('workout'); scrollTo(0, 0); $('talkBtn').hidden = false; $('talkBtn').scrollIntoView?.({ block: 'center' }); toast('🎙️ Say "voice" or tap Talk'); return; }
  window.__noHideUntil = Date.now() + 1200; switchTab(b.dataset.tab); const sc = b.dataset.lscroll; if (sc) setTimeout(() => $(sc)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); else scrollTo(0, 0); });

/* ---------- food check-in ---------- */
const foodHist = () => store.get('food', {});
const today = () => foodHist()[dayKey()]?.entries || {};
$('foodForm').innerHTML = MEALS.map(m => `<div class="meal"><label for="f-${m.id}">${m.icon} ${m.label}</label><div class="row"><textarea id="f-${m.id}" placeholder="${{ breakfast: 'e.g. porridge with banana, coffee', lunch: 'e.g. ham sandwich, crisps', dinner: 'e.g. chicken curry and rice', snacks: 'e.g. biscuits, an apple', drinks: 'e.g. 2 teas, a can of coke, water' }[m.id]}"></textarea><button type="button" class="dict" data-meal="${m.id}" title="Dictate">🎙️</button></div></div>`).join('');
$('glp1').checked = settings.glp1; $('glp1').onchange = e => { settings.glp1 = e.target.checked; store.set('settings', settings); };
function loadFood() { const e = today(); MEALS.forEach(m => $('f-' + m.id).value = e[m.id] || ''); }
loadFood();
function renderFoodStats() { const h = foodHist(); $('foodStreak').textContent = streak(h); $('foodScoreToday').textContent = h[dayKey()]?.score ?? '–'; }
renderFoodStats();
async function analyseFood({ speak = true } = {}) {
  const entries = Object.fromEntries(MEALS.map(m => [m.id, $('f-' + m.id).value.trim()]));
  const r = analyseDay(entries, foodOpts());
  const h = foodHist(); h[dayKey()] = { entries, score: r.score, at: Date.now() }; store.set('food', h);
  const html = [`<div class="res"><h4>Score: ${r.score}/10 · 🔥 ${streak(h)} day streak</h4><p>${r.headline}</p></div>`];
  for (const m of MEALS) {
    const a = r.meals[m.id]; if (a.empty && !a.flags.length) continue;
    html.push(`<div class="res"><h4>${m.icon} ${m.label} ${a.ok ? '<span class="ok">✓ looks good</span>' : ''}</h4>${a.flags.map(f => `<div class="flag">• ${f.msg}</div>`).join('')}${a.swaps.length ? `<b>Try:</b><ul>${a.swaps.map(s => `<li>${s}</li>`).join('')}</ul>` : ''}</div>`);
  }
  if (r.ideas.length) html.push(`<div class="res"><h4>Easy whole-meal ideas</h4><ul>${r.ideas.map(s => `<li>${s}</li>`).join('')}</ul></div>`);
  const recs = myRecipes().slice(0, 3); if (r.ideas.length && recs.length) html.push(`<div class="res"><h4>🛒 Recipes with shopping lists</h4>${recs.map(x => `<button class="linkbtn" data-recipe="${x.id}">${x.name} →</button>`).join('<br>')}</div>`);
  html.push(`<p class="small muted">${r.tips[0]}</p><div id="llmFood"></div>`);
  $('foodResult').innerHTML = html.join(''); renderFoodStats();
  $('foodResult').querySelectorAll('[data-recipe]').forEach(b => b.onclick = () => openRecipe(b.dataset.recipe));
  if (speak) say(`Thanks ${settings.name}. Today's food score is ${r.score} out of 10. ${r.headline}`, { kind: 'high' });
  const extra = await llm(`Food check-in for today (free text): ${JSON.stringify(entries)}. Rule-based flags: ${JSON.stringify(Object.fromEntries(MEALS.map(m => [m.id, r.meals[m.id].flags.map(f => f.k)])))}. ${settings.glp1 ? 'User takes a GLP-1-type medication; emphasise protein at small meals.' : ''} Give 3 short, kind, specific swap ideas for a moderate calorie deficit.`);
  if (extra && $('llmFood')) $('llmFood').innerHTML = `<div class="res"><h4>Extra thoughts</h4><p>${extra.replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p></div>`;
  return r;
}
$('analyseBtn').onclick = () => { unlockAudio(); analyseFood(); };

const country = () => settings.country && settings.country !== 'auto' ? settings.country : detectCountry();
function foodOpts() { return { glp1: settings.glp1, fussy: settings.fussy, likes: settings.likes, dislikes: settings.dislikes, country: country() }; }
function renderFoodProfile() {
  const c = country(), rm = READY_MEALS[c];
  $('readyCountry').textContent = `(${COUNTRIES[c]})`; $('readyStores').textContent = rm.stores + ' Availability varies, so check labels.';
  $('readyTypes').innerHTML = filterByDislikes(rm.types, settings.dislikes).map(x => `<li>${x}</li>`).join('');
  $('labelGuide').innerHTML = LABEL_GUIDE.map(x => `<li>${x}</li>`).join('');
  $('fussyCard').hidden = !settings.fussy; $('fussyList').innerHTML = fussyIdeas(settings, 6).map(x => `<li>${x}</li>`).join('');
  $('foodPicker').innerHTML = PICKER_FOODS.map(f => `<button type="button" class="chip ${settings.likes.includes(f) ? 'like' : settings.dislikes.includes(f) ? 'no' : ''}" data-f="${f}">${settings.likes.includes(f) ? '👍 ' : settings.dislikes.includes(f) ? '🚫 ' : ''}${f}</button>`).join('');
  $('foodPicker').querySelectorAll('.chip').forEach(b => b.onclick = () => { const f = b.dataset.f;
    if (settings.likes.includes(f)) { settings.likes = settings.likes.filter(x => x !== f); settings.dislikes.push(f); }
    else if (settings.dislikes.includes(f)) settings.dislikes = settings.dislikes.filter(x => x !== f);
    else settings.likes.push(f);
    store.set('settings', settings); renderFoodProfile(); });
}
function mealSuggestion() { // used by the coach (voice + end of workout)
  const o = foodOpts(); const pool = o.fussy ? fussyIdeas(o, 6) : filterByDislikes(MEAL_IDEAS, o.dislikes);
  return Math.random() < 0.35 ? readyMealTip(o.country, o.dislikes) : `How about ${(pool[Math.floor(Math.random() * pool.length)] || 'something with protein and veg').replace(/\.$/, '').replace(/^./, c => c.toLowerCase())}?`;
}
renderFoodProfile();

{ const dd = store.get('daily', {}); if (migrateDaily(dd)) store.set('daily', dd); }
/* ---------- progress + weigh-ins ---------- */
// Weigh-ins: free-text parsing (decimal comma, st+lb, lb) with inline errors. See weight.js.
// Weigh-in date: <input type=date> (+ optional time) -> ISO. Past allowed, future rejected. No time: now (today) or 09:00 local.
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function weighDate(day, time) {
  if (!day) return { iso: new Date().toISOString() };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: 'Please pick a valid date.' };
  const now = new Date(), t = time || (day === localDay(now) ? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` : '09:00');
  const d = new Date(`${day}T${t}`); if (isNaN(d)) return { error: 'Please pick a valid date.' };
  if (d.getTime() > now.getTime() + 60000) return { error: 'That date is in the future. Pick today or an earlier day.' };
  if (d.getFullYear() < 2000) return { error: 'Please pick a valid date.' };
  return { iso: d.toISOString() };
}
(window.__kova ||= {}).weighDate = weighDate;
function saveWeightKg(kg, date = new Date().toISOString()) { const w = store.get('weights', []); while (w.some(x => x.date === date)) date = new Date(Date.parse(date) + 1).toISOString(); w.push({ date, kg }); store.set('weights', w); renderProgress(); if (injReady) awardCerts(); }
function saveWeight(text, unit = settings.weightUnit || 'kg', date) { const r = parseWeightText(text, unit); if (r.kg) saveWeightKg(r.kg, date); return r; }
function bindWeightForm(form, { onSaved } = {}) {
  const input = form.querySelector('input'), err = form.querySelector('.error'), segs = form.querySelectorAll('.seg button');
  const setUnit = u => { settings.weightUnit = u; store.set('settings', settings); segs.forEach(b => b.classList.toggle('on', b.dataset.unit === u)); input.placeholder = u === 'st' ? 'e.g. 13st 4lb' : u === 'lb' ? 'e.g. 190' : 'e.g. 85.5'; };
  segs.forEach(b => b.onclick = () => { setUnit(b.dataset.unit); input.focus(); });
  setUnit(settings.weightUnit || 'kg');
  input.addEventListener('focus', () => setTimeout(() => form.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)); // keep Save above the iOS keyboard
  input.addEventListener('input', () => { err.hidden = true; });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const dd = form.querySelector('[name=wdate]'), tt = form.querySelector('[name=wtime]'), wd = dd ? weighDate(dd.value, tt?.value) : { iso: undefined };
    if (wd.error) { err.textContent = wd.error; err.hidden = false; dd.focus(); return; }
    const r = saveWeight(input.value, settings.weightUnit || 'kg', wd.iso);
    if (r.error) { err.textContent = r.error; err.hidden = false; input.focus(); return; }
    err.hidden = true; input.value = ''; input.blur(); if (dd) { dd.value = localDay(); dd.max = localDay(); if (tt) tt.value = ''; }
    toast(`✅ Weigh-in saved: ${fmtWeight(r.kg, settings.weightUnit)}`); onSaved?.(r.kg);
  });
}
bindWeightForm($('weightForm'));
{ const dd = $('weightDate'); if (dd) { dd.value = dd.max = localDay(); setInterval(() => { if (dd.max !== localDay()) { if (dd.value === dd.max) dd.value = localDay(); dd.max = localDay(); } }, 60000); } }
function renderProgress() {
  const d = iso => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const s = store.get('sessions', []);
  $('sessionList').innerHTML = s.length ? s.slice().reverse().map(x => `<li><span>${d(x.date)}${x.completed ? '' : ' <small class="muted">(ended early)</small>'}</span><span>${Object.values(x.totals).reduce((a, b) => a + b, 0)} reps · ${x.minutes} min</span></li>`).join('') : '<li class="muted">No workouts yet. Your first one is waiting!</li>';
  const f = foodHist();
  $('foodList').innerHTML = Object.keys(f).length ? Object.keys(f).sort().reverse().map(k => `<li><span>${d(k + 'T12:00')}</span><span>${f[k].score}/10</span></li>`).join('') : '<li class="muted">No check-ins yet.</li>';
  if (wpReady) renderWeightProgress();
}
renderProgress();

/* ---------- settings ---------- */
settings.voiceMode ||= 'recorded';
const S = { setVoiceMode: 'voiceMode', setFussy: 'fussy', setCountry: 'country', setName: 'name', setSpeech: 'speech', setBeeps: 'beeps', setLlm: 'llm', setLlmUrl: 'llmUrl', setLlmModel: 'llmModel', setLlmKey: 'llmKey' };
for (const [id, k] of Object.entries(S)) { const el = $(id); if (el.type === 'checkbox') el.checked = !!settings[k]; else el.value = settings[k] || (k === 'country' ? 'auto' : ''); }
$('saveSettings').onclick = () => { for (const [id, k] of Object.entries(S)) { const el = $(id); settings[k] = el.type === 'checkbox' ? el.checked : el.value.trim(); } settings.country ||= 'auto'; store.set('settings', settings); greetText(); renderFoodProfile(); toast('Saved'); };
$('clearData').onclick = () => { if (confirm('Delete all workouts, food check-ins, weigh-ins and settings on this phone?')) { Object.keys(localStorage).filter(k => k.startsWith('kova.')).forEach(k => localStorage.removeItem(k)); idbClear('kova.').then(() => location.reload()); } };
function greetText() { const h = new Date().getHours(); $('startGreeting').textContent = `${h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening'}, ${settings.name}!`; }
greetText();

/* ---------- voice: "voice" wake word + commands + dictation ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const REC_LANG = /^en\b/i.test(navigator.language || '') ? navigator.language : 'en-GB';
const voiceState = { on: false, mode: 'idle', armedUntil: 0, armedIdx: -1, dictate: null, rec: null, failures: 0, ttsBusy: false, wakeIdx: new Set(), restarts: 0 };
window.__kova = { voiceState, PLAN, voiceBusy };
$('voiceSupport').textContent = !SR ? 'Voice recognition isn\'t supported in this browser. Use the on-screen buttons, or your keyboard\'s mic for food dictation.' : isIOS ? 'On iPhone/iPad, continuous listening is limited, so use the "Tap to talk" button.' : 'Supported. Tap the mic in the top bar to start listening for "voice".';
function micUI() {
  const b = $('micBtn'); b.classList.toggle('on', voiceState.on); b.classList.toggle('off', !voiceState.on); b.classList.toggle('armed', voiceState.mode !== 'idle');
  $('micLabel').textContent = !voiceState.on ? 'Mic off' : voiceState.mode === 'dictate' ? 'Dictating…' : voiceState.mode === 'armed' ? 'Listening…' : voiceState.ttsBusy ? 'Speaking…' : 'Listening for "voice"';
  $('listenBadge').hidden = voiceState.mode === 'idle'; $('listenBadge').textContent = voiceState.mode === 'dictate' ? '🎙️ Dictating…' : '🎙️ Listening…';
  b.setAttribute('aria-pressed', voiceState.on);
  const sm = $('sessMic'); sm.className = b.className.replace('mic', 'iconbtn mic'); $('sessMicLabel').textContent = !voiceState.on ? 'Mic off' : voiceState.mode !== 'idle' ? 'Listening…' : 'voice';
}
let chipT;
function heardChip(text, final) { // live transcript so you can see what the phone hears
  const c = $('heardChip'); if (!text) return;
  c.textContent = `🎙️ “${text.trim()}”`; c.classList.toggle('interim', !final); c.hidden = false;
  clearTimeout(chipT); chipT = setTimeout(() => c.hidden = true, final ? 3500 : 6000);
}
function arm(idx) {
  chime(); voiceState.mode = 'armed'; voiceState.armedIdx = idx; voiceState.armedUntil = Date.now() + 8000; micUI();
  clearTimeout(arm.t); arm.t = setTimeout(() => { if (voiceState.mode === 'armed') { voiceState.mode = 'idle'; micUI(); } }, 8000);
}
// One result (interim or final) from the recogniser. idx = result index within the current session.
function onTranscript(text, final, idx) {
  heardChip(text, final);
  if (voiceState.mode === 'dictate') {
    if (!final) return;
    const d = voiceState.dictate; voiceState.mode = 'idle'; voiceState.dictate = null; micUI(); return d?.(text.trim());
  }
  // the coach's own short rep counts may leak into the mic: only a wake phrase gets through while speaking.
  const w = findWake(text);
  if (voiceState.mode === 'idle') {
    if (!w) return;
    if (!voiceState.wakeIdx.has(idx)) { voiceState.wakeIdx.add(idx); arm(idx); }
    if (final && w.rest) { voiceState.mode = 'idle'; micUI(); runCommand(w.rest); }
    return;
  }
  if (voiceState.mode === 'armed' && final && Date.now() < voiceState.armedUntil) {
    const cmd = idx === voiceState.armedIdx ? (w ? w.rest : '') : (w ? w.rest : text);
    if (!cmd.trim()) return; // just "hey reta" so far; wait for the command
    voiceState.mode = 'idle'; micUI(); runCommand(cmd);
  }
}
function handleHeard(alts) { onTranscript(alts[0], true, `t${Date.now()}${Math.random()}`); } // test hook: treat as one final result
function startRec() {
  if (!FEATURES.voice) return;
  if (!SR || !voiceState.on || voiceState.ttsBusy || document.hidden || voiceState.rec) return;
  const r = new SR(); r.lang = REC_LANG; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
  const session = ++voiceState.restarts; voiceState.wakeIdx = new Set();
  r.onresult = e => {
    voiceState.failures = 0;
    for (let i = e.resultIndex; i < e.results.length; i++) onTranscript(e.results[i][0].transcript, e.results[i].isFinal, `${session}:${i}`);
  };
  r.onerror = e => {
    window.__kova.lastRecError = e.error;
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { voiceState.on = false; micUI(); toast('Microphone permission is blocked. Allow it in Chrome\'s site settings.', 4000); return; }
    if (e.error === 'network') { voiceState.failures++; heardChip('Voice needs an internet connection in Chrome', true); }
    else if (e.error === 'audio-capture') { voiceState.failures++; heardChip('Mic is busy or unavailable', true); }
    else if (e.error !== 'no-speech' && e.error !== 'aborted') voiceState.failures++;
  };
  r.onend = () => { // Chrome Android ends sessions every few seconds / after each phrase: restart
    if (voiceState.rec === r) voiceState.rec = null;
    if (voiceState.on && !voiceState.ttsBusy) setTimeout(startRec, voiceState.failures ? nextDelay(voiceState.failures) : 150);
  };
  voiceState.rec = r;
  try { r.start(); } catch (err) { voiceState.rec = null; voiceState.failures++; setTimeout(startRec, nextDelay(voiceState.failures)); }
}
function stopRec(abort = true) { const r = voiceState.rec; voiceState.rec = null; try { abort ? r?.abort() : r?.stop(); } catch {} }
// Pause listening while the coach talks (longer lines) so the phone doesn't hear itself; resume right after.
function ttsStart(kind, text = '') { if (!voiceState.on || kind === 'count') return; voiceState.ttsBusy = true; stopRec(); micUI();
  clearTimeout(ttsStart.t); ttsStart.t = setTimeout(() => { if (voiceState.ttsBusy) { voiceState.ttsBusy = false; micUI(); startRec(); } }, 2500 + text.length * 90); } // safety: Chrome Android sometimes never fires onend
function ttsEnd() { if (!voiceState.ttsBusy) return; if (VOICE.cur || window.speechSynthesis?.speaking || window.speechSynthesis?.pending) return; voiceState.ttsBusy = false; micUI(); setTimeout(startRec, 250); }
document.addEventListener('visibilitychange', () => { if (document.hidden) stopRec(); else setTimeout(startRec, 300); });
function oneShot() { const r = new SR(); r.lang = REC_LANG; r.continuous = false; r.interimResults = true;
  let n = 0; r.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) onTranscript(e.results[i][0].transcript, e.results[i].isFinal, `os${n}:${i}`); };
  r.onend = () => { n++; if (voiceState.mode === 'armed') { voiceState.mode = 'idle'; micUI(); } }; try { r.start(); } catch {} return r; }
function setMic(on) {
  if (!FEATURES.voice) return;
  if (!SR) return toast('Voice isn\'t supported in this browser');
  if (isIOS) return toast('On iPhone, use the Tap to talk button');
  unlockAudio(); voiceState.on = on; voiceState.failures = 0;
  if (on) { startRec(); toast('Listening'); } else { stopRec(); voiceState.mode = 'idle'; voiceState.ttsBusy = false; }
  micUI();
}
$('micBtn').onclick = () => setMic(!voiceState.on);
$('sessMic').onclick = () => setMic(!voiceState.on);
// Tap-to-talk: iOS (partial SR support) gets a one-shot recogniser; browsers without SR get a typed command box.
if (FEATURES.voice && (isIOS || !SR)) { $('talkBtn').hidden = false; }
$('talkBtn').onclick = () => {
  unlockAudio();
  if (!SR) { const c = prompt('Type a command (start workout, pause, resume, next, end, log food, how many reps, weigh-in, what\'s next):'); if (c) runCommand(c.toLowerCase()); return; }
  if (voiceState.mode !== 'dictate') arm('tap'); voiceState.armedIdx = -1; oneShot();
};
function dictate(prompt, cb) {
  say(prompt, { kind: 'high' }); voiceState.mode = 'dictate'; micUI();
  voiceState.dictate = cb;
  if (isIOS && SR) setTimeout(oneShot, 1800); // one-shot after the prompt finishes
  clearTimeout(dictate.t); dictate.t = setTimeout(() => { if (voiceState.mode === 'dictate') { voiceState.mode = 'idle'; voiceState.dictate = null; micUI(); } }, 20000);
}
function foodDictation(i = 0) {
  if (i >= MEALS.length) { analyseFood(); return; }
  const m = MEALS[i];
  const q = i === 0 ? `What did you eat today, ${settings.name}? Let's start with breakfast. Say skip to leave one blank, or done to finish.` : `And ${m.label.toLowerCase()}?`;
  dictate(q, raw => {
    const t = raw.toLowerCase().trim();
    if (/^(done|finish|that's it|that's all)\b/.test(t)) return analyseFood();
    if (!/^(skip|pass|next)$/.test(t)) $('f-' + m.id).value = ($('f-' + m.id).value ? $('f-' + m.id).value + ', ' : '') + raw;
    foodDictation(i + 1);
  });
}
document.querySelectorAll('.dict').forEach(b => b.onclick = () => {
  if (!SR) return toast('Use your keyboard\'s mic button to dictate');
  unlockAudio(); const id = b.dataset.meal; b.classList.add('rec');
  voiceState.mode = 'dictate'; micUI();
  voiceState.dictate = raw => { const el = $('f-' + id); el.value = (el.value ? el.value + ', ' : '') + raw; b.classList.remove('rec'); };
  if (!voiceState.on) { const r = oneShot(); r.addEventListener('end', () => b.classList.remove('rec')); }
});
function parseWeight(t) { // voice: "82.5 kilos", "13 stone 4", "190 pounds"
  const m = t.match(/\d[\d.,]*\s*(?:st(?:one)?s?\s*(?:and\s*)?(?:\d+\s*(?:lbs?|pounds?)?)?|kg|kgs|kilos?|kilograms?|lbs?|pounds?)?/);
  if (!m) return false; const r = saveWeight(m[0].replace(/\bkilos?\b|kilograms?/, 'kg').trim());
  return !!r.kg;
}
function stepName(s) { return !s ? 'nothing, we\'re done' : s.kind === 'rest' ? 'a short rest' : s.kind === 'cool' ? s.name : MOVES[s.move].name; }
function runCommand(raw) {
  const t = raw.toLowerCase().replace(/[,!?]|\.(?!\d)/g, '').trim();
  window.__kova.lastCommand = t;
  const ccmd = classCommand(t); if (ccmd !== undefined) return ccmd;
  if (/\b(start|begin)\b.*\b(workout|session|training)\b|^(start|let's go|lets go)$/.test(t)) { if (sess) return say('We\'re already going!', { kind: 'high' }); switchTab('workout'); show('screen-start'); return startWorkout(); }
  if (/\b(pause|hold on|wait|stop for a sec)\b/.test(t)) return sess ? pause(true) : say('Nothing to pause right now.', { kind: 'high' });
  if (/\b(resume|continue|carry on|unpause|go again)\b/.test(t)) return sess ? pause(false) : say('Say "start workout" to begin.', { kind: 'high' });
  if (/\b(next|skip)\b/.test(t) && !/what'?s next/.test(t)) return sess ? (say('Skipping ahead.', { kind: 'high' }), sess.cls ? classNext() : next()) : say('Nothing to skip.', { kind: 'high' });
  if (/\b(end|finish|stop) (the )?(workout|session)\b|^(end|finish|stop)$/.test(t)) return sess ? (sess.cls ? classFinish(false) : finish(false)) : say('No workout running.', { kind: 'high' });
  if (/\b(log|track|add|record)\b.*\b(food|meal|eat|ate)\b|food check|^food$/.test(t)) { if (sess) return say('Let\'s log food after the workout.', { kind: 'high' }); switchTab('food'); return foodDictation(0); }
  if (/how many (reps|rep)|rep count|how am i doing/.test(t)) {
    if (!sess) { const h = store.get('sessions', []), l = h[h.length - 1]; return say(l ? `Last session you did ${Object.values(l.totals).reduce((a, b) => a + b, 0)} reps in total.` : 'No reps logged yet. Let\'s start a workout!', { kind: 'high' }); }
    const s = cur(); const here = s.kind === 'work' && sess.analyser?.rc ? sess.analyser.rc.reps : 0;
    const total = Object.values(sess.totals).reduce((a, b) => a + b, 0) + here;
    return say(s.kind === 'work' && MOVES[s.move].counted ? `${here} reps on this move, ${total} so far today.` : `${total} reps so far today.`, { kind: 'high' });
  }
  if (/weigh|weight/.test(t)) { const inline = t.match(/\d/); if (inline && parseWeight(t)) return say('Weigh-in saved. Remember, it\'s the trend over weeks that matters.', { kind: 'high' }); return dictate('Sure. What do you weigh today? You can say kilos, pounds, or stone.', r => say(parseWeight(r.toLowerCase()) ? 'Got it, weigh-in saved.' : 'Sorry, I didn\'t catch a number. You can type it on the Progress tab.', { kind: 'high' })); }
  if (/show me|how do i|demo|show how/.test(t)) { if (!sess) return say('Start a workout and I\'ll show you each move.', { kind: 'high' }); const s = cur(); const mv = s.kind === 'rest' ? (s.next === 'cool' ? null : s.next) : s.kind === 'warm' ? 'march' : s.move; if (!mv) return say('Just gentle stretches now. Follow the timer.', { kind: 'high' }); return showMe(mv, sess.lastIssue || 'any', { manual: true }); }
  if (/\bprep\b|meal prep|batch cook/.test(t)) { if (sess) return say('Let\'s plan your prep after the workout.', { kind: 'high' }); switchTab('prep'); if (!Object.values(shop.prep.week || {}).some(Boolean)) buildMyWeek({ silent: true }); return say(prepSummary(), { kind: 'high' }); }
  if (/shopping|what (do|should) i buy|what to buy|grocer/.test(t)) { if (sess) return say('Let\'s look at the shopping list after the workout.', { kind: 'high' }); switchTab('shop'); const n = Object.values(buildList(shop.recipes, shop.extra)).flat().filter(e => !shop.ticks[e.key]).length; return say(n ? `You've got ${n} things left to buy on this week's list.` : 'Your list is empty. Add a recipe or some weekly basics.', { kind: 'high' }); }
  if (/what (should|can) i (eat|have)|meal idea|hungry|dinner idea|lunch idea|ready meal/.test(t)) return say(mealSuggestion(), { kind: 'high' });
  if (/what'?s next|what is next|what's coming|what next/.test(t)) { if (!sess) return say('Next is your Week 1 workout. Say "start workout" when you\'re ready.', { kind: 'high' }); const s = cur(); const n = s.kind === 'rest' ? PLAN[sess.i + 1] : PLAN[sess.i + 1]?.kind === 'rest' ? PLAN[sess.i + 2] : PLAN[sess.i + 1]; return say(`Up next: ${stepName(n)}.`, { kind: 'high' }); }
  say('Sorry, I didn\'t catch that. Try pause, next, resume, or what\'s next.', { kind: 'high' });
}
window.__kova.runCommand = runCommand; window.__kova.ttsStart = ttsStart; window.__kova.ttsEnd = ttsEnd; window.__kova.showMe = showMe; window.__kova.trackForm = trackForm; window.__kova.handleHeard = handleHeard;
micUI();
// App updates: when a new service worker is waiting, offer "Update available, tap to refresh"; tapping activates it and reloads.
function showUpdateToast(worker) {
  const el = $('updateToast'); if (!el || !worker) return;
  el.hidden = false; window.__kova.updateReady = true;
  // Auto-apply web updates: activate the new version straight away (reload happens on controllerchange), unless a workout is running.
  if (!document.querySelector('#screen-session.active')) { el.textContent = 'Updating GLP1 Life…'; worker.postMessage({ type: 'SKIP_WAITING' }); return; }
  el.onclick = () => { el.textContent = 'Updating…'; worker.postMessage({ type: 'SKIP_WAITING' }); setTimeout(() => location.reload(), 1500); };
}
window.__kova.showUpdateToast = showUpdateToast;
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading && window.__kova.updateReady) { reloading = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js').then(reg => {
    if (reg.waiting && navigator.serviceWorker.controller) showUpdateToast(reg.waiting);
    reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdateToast(w); }); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    setInterval(() => reg.update().catch(() => {}), 30 * 60000);
  }).catch(() => {});
}

/* ---------- accounts (phone-only, see auth.js) + onboarding + trainer picker ---------- */
function showErr(id, msg) { const e = $(id); e.textContent = msg || ''; e.hidden = !msg; }
function authView(which) { $('loginForm').hidden = which !== 'login'; $('registerForm').hidden = which !== 'register'; $('authWelcome').hidden = which !== 'welcome'; $('resetForm').hidden = which !== 'reset'; $('authAccounts').hidden = which !== 'login'; $('toLogin').hidden = false; }
function renderAccounts() {
  const list = auth.listAccounts();
  $('authAccounts').innerHTML = list.length ? `<p class="small muted">Accounts on this phone</p>${list.map(a => `<button type="button" class="acct" data-email="${a.email}"><b>${a.name.replace(/</g, '&lt;')}</b><span>${a.email}</span></button>`).join('')}` : '';
  $('authAccounts').querySelectorAll('.acct').forEach(b => b.onclick = () => { authView('login'); $('loginEmail').value = b.dataset.email; $('loginSecret').focus(); });
}
function openAuth() { renderAccounts(); authView(auth.listAccounts().length ? 'login' : 'welcome'); $('authScreen').hidden = false; }
$('wCreate').onclick = () => { authView('register'); $('regName').focus(); };
$('wLogin').onclick = () => { authView('login'); $('loginEmail').focus(); };
$('toRegister').onclick = () => authView('register');
$('toLogin').onclick = () => authView('login');
// Accounts are cloud (Supabase) accounts; a local profile on this phone mirrors it for offline use.
// Dev only (localhost test server): local-only accounts so the offline test suites don't create cloud users.
import { SB_URL as SB_URL_A, SB_KEY as SB_KEY_A } from './cloud.js';
const LOCAL_DEV = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !/[?&]cloudauth=1/.test(location.search);
const moveCloudSession = u => { const k = PREFIX + 'cloud.session', s = localStorage.getItem(k); if (s && u) { localStorage.setItem(auth.dataPrefix(u) + 'cloud.session', s); if (auth.dataPrefix(u) !== PREFIX) localStorage.removeItem(k); } };
const friendly = m => /already registered|already exists/i.test(m) ? 'That email already has an account. Tap "I already have an account" to log in.' : /invalid login|invalid credentials/i.test(m) ? 'Email or password is wrong.' : /fetch|network/i.test(m) ? 'No internet connection. Connect and try again.' : m;
$('registerForm').addEventListener('submit', async e => {
  e.preventDefault(); showErr('regError'); $('regBtn').disabled = true;
  const name = $('regName').value.trim(), email = $('regEmail').value.trim().toLowerCase(), pw = $('regSecret').value;
  try {
    if (!LOCAL_DEV) { if (!name) throw new Error('Please enter your name.'); if (pw.length < 8) throw new Error('Use a password of at least 8 characters.'); await cloud.signUp(email, pw, name); }
    const u = await auth.signUp({ name, email, secret: pw }); moveCloudSession(u);
    localStorage.setItem(auth.dataPrefix(u) + 'settings', JSON.stringify({ ...JSON.parse(localStorage.getItem(auth.dataPrefix(u) + 'settings') || '{}'), name: u.name })); location.reload(); }
  catch (err) { showErr('regError', friendly(err.message)); } finally { $('regBtn').disabled = false; }
});
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault(); showErr('loginError'); $('loginBtn').disabled = true;
  const email = $('loginEmail').value.trim().toLowerCase(), pw = $('loginSecret').value, local = auth.listAccounts().find(a => a.email === email);
  try {
    if (LOCAL_DEV || (local && !navigator.onLine)) { await auth.signIn({ email, secret: pw }); return location.reload(); }
    const cu = await cloud.signIn(email, pw); // new phone or existing: cloud is the source of truth
    const u = local ? await auth.adoptCloud({ email, secret: pw }) : await auth.signUp({ name: email.split('@')[0], email, secret: pw });
    moveCloudSession(u || auth.currentUser()); location.reload(); }
  catch (err) { showErr('loginError', friendly(err.message)); } finally { $('loginBtn').disabled = false; }
});
$('forgotBtn').onclick = async () => {
  const email = $('loginEmail').value.trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(email)) return showErr('loginError', 'Type your email first, then tap Forgot password.');
  try { const r = await fetch(`${SB_URL_A}/auth/v1/recover?redirect_to=${encodeURIComponent(location.origin + location.pathname)}`, { method: 'POST', headers: { apikey: SB_KEY_A, 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
    if (!r.ok && r.status !== 429) throw new Error('Could not send the reset email. Try again in a minute.'); toast('📧 If that email has an account, a reset link is on its way.'); } catch (x) { showErr('loginError', friendly(x.message)); }
};
// Password-reset link lands here with #access_token=…&type=recovery
{ const hp = new URLSearchParams(location.hash.slice(1)); if (hp.get('type') === 'recovery' && hp.get('access_token')) { const tok = hp.get('access_token'); history.replaceState(null, '', location.pathname); $('authScreen').hidden = false; authView('reset');
  $('resetForm').onsubmit = async e => { e.preventDefault(); const pw = $('newPw').value; if (pw.length < 8) return showErr('resetError', 'Use at least 8 characters.');
    const r = await fetch(`${SB_URL_A}/auth/v1/user`, { method: 'PUT', headers: { apikey: SB_KEY_A, authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) }), j = await r.json().catch(() => ({}));
    if (!r.ok) return showErr('resetError', j.msg || j.message || 'Reset link expired. Request a new one.');
    const email = (j.email || '').toLowerCase(); // this phone's copy adopts the new password at next log in (data kept)
    toast('✅ Password changed. Log in with your new password.'); authView('login'); $('loginEmail').value = email; }; } }
$('logoutBtn').onclick = () => { if (sess) return toast('End the workout first'); stopRec?.(); auth.signOut(); location.reload(); };
$('switchAcct').onclick = $('logoutBtn').onclick;
if (user) $('acctInfo').textContent = `Signed in as ${user.name} (${user.email}) on this phone.`;

async function renderTrainerPickers() {
  const hasF = await firstExisting(['media/f/warmup.mp4', 'media/f/wall-pushups.mp4']), hasM = await firstExisting(['media/m/warmup.mp4', 'media/m/wall-pushups.mp4']);
  const av = { m: (await firstExisting(['media/m/avatar.jpg'])) || 'avatar.jpg', f: (await firstExisting(['media/f/avatar.jpg'])) || 'avatar-f.svg' };
  const html = ['m', 'f'].map(t => `<button type="button" class="trainer ${settings.trainer === t ? 'on' : ''}" data-t="${t}"><img src="${av[t]}" alt=""><b>${TRAINERS[t].label}</b><small class="muted">${(t === 'f' ? hasF : hasM) ? 'Own demo videos' : t === 'm' ? 'Current demo videos' : 'Her videos are coming soon. Uses the current demos for now'}</small></button>`).join('');
  for (const id of ['trainerPick', 'trainerPickSettings']) { $(id).innerHTML = html; $(id).querySelectorAll('.trainer').forEach(b => b.onclick = () => { settings.trainer = b.dataset.t; store.set('settings', settings); applyTrainerAvatar(); renderTrainerPickers(); probeCache && Object.keys(probeCache).forEach(k => delete probeCache[k]); }); }
}
renderTrainerPickers(); applyTrainerAvatar();
bindWeightForm($('obWeightForm'), { onSaved: () => {} });
const finishOnboard = () => { settings.onboarded = true; store.set('settings', settings); $('onboard').hidden = true; greetText(); };
$('obDone').onclick = finishOnboard; $('obSkip').onclick = finishOnboard;
if (!user) openAuth();
else if (!settings.onboarded) $('onboard').hidden = false;
window.__kova.auth = auth; window.__kova.layout = layout; window.__kova.setSwapped = setSwapped;


/* ---------- shopping lists (per account) ---------- */
const shop = Object.assign({ recipes: [], extra: [], ticks: {}, store: null }, store.get('shop', {}));
shop.store ||= ['UK', 'IE'].includes(country()) ? 'lidl' : 'any';
const saveShop = () => store.set('shop', shop);
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function myRecipes() {
  const dis = settings.dislikes || [];
  let list = RECIPES.filter(r => !mentionsDisliked(r.name + ' ' + r.ing.map(g => g.item).join(' '), dis));
  if (settings.fussy) list = list.sort((a, b) => (/fussy|jacket|omelette|chicken, rice/i.test(b.name + b.meal) ? 1 : 0) - (/fussy|jacket|omelette|chicken, rice/i.test(a.name + a.meal) ? 1 : 0));
  return list;
}
function tickRow(key, title, sub, { add = null } = {}) {
  const on = !!shop.ticks[key];
  return `<label class="tick ${on ? 'done' : ''}"><input type="checkbox" data-tick="${esc(key)}" ${on ? 'checked' : ''}><span class="t"><b>${esc(title)}</b>${sub ? `<small>${sub}</small>` : ''}</span>${add ? `<button type="button" class="add" data-add='${esc(JSON.stringify(add))}'>＋ List</button>` : ''}</label>`;
}
function renderShop() {
  const list = buildList(shop.recipes, shop.extra); let n = 0, done = 0;
  const html = AISLES.filter(a => list[a]?.length).map(a => `<div class="aisle">${a}</div>` + list[a].map(e => { n++; if (shop.ticks[e.key]) done++; return tickRow(e.key, e.item, [e.uses.join('; '), e.pack ? `Pack: ${esc(e.pack)}` : ''].filter(Boolean).join('<br>')); }).join('')).join('');
  $('shopList').innerHTML = html || '<p class="small muted">Your list is empty. Tap "＋ Add to this week\'s list" on a recipe, or "＋ List" on the weekly basics below.</p>';
  $('shopCount').textContent = n ? `${done}/${n}` : '';
  $('recipeList').innerHTML = myRecipes().map(r => {
    const on = shop.recipes.includes(r.id);
    return `<div class="recipe" id="recipe-${r.id}"><h4>${esc(r.name)}</h4><div class="tags">${r.veg ? '<span class="v">Vegetarian</span>' : ''}<span>${esc(r.meal)}</span><span>Serves ${r.serves}</span><span>Protein ${r.protein}</span><span>${r.kcal} kcal</span><span>${r.mins} min</span></div>
      <button type="button" class="addweek ${on ? 'on' : ''}" data-week="${r.id}">${on ? '✓ On this week\'s list (tap to remove)' : '＋ Add to this week\'s list'}</button>
      <b class="small">Shopping list</b>${r.ing.map(g => { const q = fmtQty(g.q); return tickRow(shopKey(g.item), g.item, `<span class="qty">${esc(q.metric)}${q.imperial ? ` / ${esc(q.imperial)}` : ''}</span>${g.pack ? ` · Pack: ${esc(g.pack)}` : ''}`); }).join('')}
      <details><summary class="small">Method</summary><ol>${r.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol></details></div>`;
  }).join('') || '<p class="small muted">All recipes contain foods you marked as "won\'t eat". Edit your food profile in Settings.</p>';
  $('storePick').innerHTML = Object.entries(STORES).map(([k, v]) => `<button type="button" class="chip ${shop.store === k ? 'on' : ''}" data-store="${k}">${v.name}</button>`).join('');
  $('storeNote').textContent = `${STORES[shop.store].note} No prices shown; availability varies, so check labels.`;
  const basics = storeBasics(shop.store), dis = settings.dislikes || [];
  $('basicsList').innerHTML = Object.entries(basics).map(([cat, items]) => `<div class="card"><div class="row between"><div class="aisle">${cat}</div><button type="button" class="small" data-addcat="${esc(cat)}">＋ Add all to list</button></div>${items.filter(([it]) => !mentionsDisliked(it, dis)).map(([it, pack]) => tickRow(shopKey(it), it, `Typical pack: ${esc(pack)}`, { add: { item: it, aisle: cat === 'Snacks' && /fruit/i.test(it) ? 'Fruit' : cat, pack } })).join('')}</div>`).join('');
  const root = $('tab-shop');
  root.querySelectorAll('[data-tick]').forEach(c => c.onchange = () => { if (c.checked) shop.ticks[c.dataset.tick] = true; else delete shop.ticks[c.dataset.tick]; saveShop(); renderShop(); });
  root.querySelectorAll('[data-week]').forEach(b => b.onclick = () => { const id = b.dataset.week; shop.recipes = shop.recipes.includes(id) ? shop.recipes.filter(x => x !== id) : [...shop.recipes, id]; saveShop(); renderShop(); toast(shop.recipes.includes(id) ? '🛒 Added to this week\'s list' : 'Removed from the list'); });
  root.querySelectorAll('[data-add]').forEach(b => b.onclick = e => { e.preventDefault(); const x = JSON.parse(b.dataset.add); if (!shop.extra.some(y => shopKey(y.item) === shopKey(x.item))) shop.extra.push(x); saveShop(); renderShop(); toast('🛒 Added to your list'); });
  root.querySelectorAll('[data-addcat]').forEach(b => b.onclick = () => { for (const [it, pack] of basics[b.dataset.addcat]) if (!mentionsDisliked(it, dis) && !shop.extra.some(y => shopKey(y.item) === shopKey(it))) shop.extra.push({ item: it, aisle: b.dataset.addcat, pack }); saveShop(); renderShop(); toast(`🛒 ${b.dataset.addcat} added`); });
  root.querySelectorAll('[data-store]').forEach(b => b.onclick = () => { shop.store = b.dataset.store; saveShop(); renderShop(); });
}
$('shopClearTicked').onclick = () => {
  const ticked = new Set(Object.keys(shop.ticks)); shop.extra = shop.extra.filter(x => !ticked.has(shopKey(x.item)));
  shop.recipes = shop.recipes.filter(id => { const r = [...RECIPES, ...PREP_RECIPES].find(x => x.id === id); return r && !r.ing.every(g => ticked.has(shopKey(g.item))); });
  shop.ticks = {}; saveShop(); renderShop(); toast('Ticked items cleared');
};
$('shopShare').onclick = async () => {
  const list = buildList(shop.recipes, shop.extra);
  const text = 'GLP1 Life shopping list\n' + AISLES.filter(a => list[a]?.length).map(a => `\n${a}\n` + list[a].map(e => `${shop.ticks[e.key] ? '[x]' : '[ ]'} ${e.item}${e.pack ? ` (${e.pack})` : ''}`).join('\n')).join('\n');
  try { if (navigator.share) await navigator.share({ title: 'Shopping list', text }); else { await navigator.clipboard.writeText(text); toast('List copied'); } } catch {}
};
function openRecipe(id) { switchTab('shop'); setTimeout(() => $('recipe-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }
document.querySelectorAll('[data-goshop]').forEach(b => b.onclick = () => { if (!sess) { switchTab('shop'); scrollTo(0, 0); } });
window.__kova.shop = shop;


/* ---------- meal prep (per account) ---------- */
shop.prep = Object.assign({ days: 4, week: {} }, shop.prep || {});
const prepById = id => PREP_RECIPES.find(r => r.id === id);
function prepCard(r) {
  const on = shop.recipes.includes(r.id), days = shop.prep.days;
  const portions = r.meal === 'snack' ? `Makes ${r.makes}` : r.makes > days ? `Makes ${r.makes}: ${days} days + ${r.makes - days} to freeze or share` : `Makes ${r.makes} portions (${days} days)`;
  return `<div class="recipe" id="recipe-${r.id}"><h4>${esc(r.name)}</h4>
    <div class="tags">${r.veg ? '<span class="v">Vegetarian</span>' : ''}${r.fussy ? '<span class="f">Fussy-friendly</span>' : ''}<span>${portions}</span><span>≈${r.kcal} kcal</span><span>≈${r.protein}g protein</span><span>per portion</span><span>${r.mins} min</span></div>
    <button type="button" class="addweek ${on ? 'on' : ''}" data-week="${r.id}">${on ? '✓ On shopping list (tap to remove)' : '＋ Add to shopping list'}</button>
    <b class="small">Shopping list (whole batch)</b>${r.ing.map(g => { const q = fmtQty(g.q); return tickRow(shopKey(g.item), g.item, `<span class="qty">${esc(q.metric)}${q.imperial ? ` / ${esc(q.imperial)}` : ''}</span>${g.pack ? ` · Pack: ${esc(g.pack)}` : ''}`); }).join('')}
    <div class="storebox">🧊 <b>Fridge:</b> ${esc(r.store.fridge)} · <b>Freezer:</b> ${esc(r.store.freezer)}<br>🔥 <b>Reheat:</b> ${esc(r.store.reheat)}</div>
    <div class="glp1">💊 <b>GLP-1 / retatrutide-friendly:</b> ${esc(r.glp1)}</div>
    ${guideHTML(r)}</div>`;
}
function prepSummary() {
  const w = shop.prep.week, names = ['breakfast', 'lunch', 'dinner'].map(m => w[m] && prepById(w[m])).filter(Boolean);
  if (!names.length) return 'Tap Build my week and I\'ll pick a breakfast, lunch and dinner to prep.';
  return `For your ${shop.prep.days}-day prep: ${names.map((r, k) => `${['breakfast', 'lunch', 'dinner'][k]}, ${r.name}`).join('; ')}. The ingredients are on your shopping list.`;
}
function buildMyWeek({ silent = false } = {}) {
  const w = buildWeek({ dislikes: settings.dislikes || [], fussy: settings.fussy, seed: Date.now(), mentionsDisliked });
  shop.recipes = shop.recipes.filter(id => !id.startsWith('p-') || !['breakfast', 'lunch', 'dinner'].includes(prepById(id)?.meal));
  shop.prep.week = {};
  for (const m of ['breakfast', 'lunch', 'dinner']) if (w[m]) { shop.prep.week[m] = w[m].id; shop.recipes.push(w[m].id); }
  saveShop(); renderPrep();
  const n = Object.values(buildList(shop.recipes, shop.extra)).flat().length;
  if (!silent) toast(`✨ Week built. Shopping list now has ${n} items`, 3500);
  return w;
}
function renderPrep() {
  shop.prep.days ||= 4;
  $('prepStorePick').innerHTML = Object.entries(STORES).map(([k, v]) => `<button type="button" class="chip storechip ${shop.store === k ? 'on' : ''}" data-pstore="${k}" aria-pressed="${shop.store === k}">${shop.store === k ? '✓ ' : ''}${v.name}</button>`).join('');
  $('prepStoreNotes').innerHTML = (PREP_STORE_NOTES[shop.store] || PREP_STORE_NOTES.any).map(x => `<li>${esc(x)}</li>`).join('') + '<li class="muted">No prices or product names. Availability varies, so check labels.</li>';
  document.querySelectorAll('#prepDays button').forEach(b => b.classList.toggle('on', +b.dataset.days === shop.prep.days));
  $('prepSafety').innerHTML = SAFETY.map(x => `<li>${esc(x)}</li>`).join('');
  const w = shop.prep.week;
  $('prepWeek').innerHTML = ['breakfast', 'lunch', 'dinner'].some(m => w[m]) ? `<h3>Your ${shop.prep.days}-day prep</h3>` + ['breakfast', 'lunch', 'dinner'].map(m => { const r = prepById(w[m]); return r ? `<div class="weekpick"><span class="t"><b>${m[0].toUpperCase() + m.slice(1)}:</b> ${esc(r.name)}<small>≈${r.kcal} kcal · ≈${r.protein}g protein · fridge ${esc(r.store.fridge.toLowerCase())}</small></span><button type="button" data-goto="${r.id}">View</button><button type="button" data-swap="${m}">🔄 Swap</button></div>` : ''; }).join('') + '<button type="button" data-goshop2>🛒 Open shopping list</button>' : '';
  const dis = settings.dislikes || [];
  $('prepSections').innerHTML = MEAL_SECTIONS.map(([m, title]) => {
    const list = PREP_RECIPES.filter(r => r.meal === m && !mentionsDisliked(r.name + ' ' + r.ing.map(g => g.item).join(' '), dis)).sort((a, b) => settings.fussy ? (b.fussy ? 1 : 0) - (a.fussy ? 1 : 0) : 0);
    return `<section class="prepsec" id="prep-${m}"><h2>${title}</h2>${list.map(prepCard).join('') || '<p class="small muted">Nothing here without foods you won\'t eat. Edit your food profile in Settings.</p>'}</section>`;
  }).join('');
  const root = $('tab-prep');
  root.querySelectorAll('[data-pstore]').forEach(b => b.onclick = () => { shop.store = b.dataset.pstore; saveShop(); renderPrep(); toast(`🛒 Store: ${STORES[shop.store].name}`); });
  root.querySelectorAll('#prepDays button').forEach(b => b.onclick = () => { shop.prep.days = +b.dataset.days; saveShop(); renderPrep(); });
  root.querySelectorAll('[data-tick]').forEach(c => c.onchange = () => { if (c.checked) shop.ticks[c.dataset.tick] = true; else delete shop.ticks[c.dataset.tick]; saveShop(); renderPrep(); });
  root.querySelectorAll('[data-week]').forEach(b => b.onclick = () => { const id = b.dataset.week; shop.recipes = shop.recipes.includes(id) ? shop.recipes.filter(x => x !== id) : [...shop.recipes, id]; saveShop(); renderPrep(); toast(shop.recipes.includes(id) ? '🛒 Added to your shopping list' : 'Removed from the list'); });
  root.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => $('recipe-' + b.dataset.goto)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  root.querySelectorAll('[data-swap]').forEach(b => b.onclick = () => {
    const m = b.dataset.swap, curId = shop.prep.week[m];
    const pool = PREP_RECIPES.filter(r => r.meal === m && r.id !== curId && !mentionsDisliked(r.name + ' ' + r.ing.map(g => g.item).join(' '), dis) && (!settings.fussy || r.fussy || !PREP_RECIPES.some(x => x.meal === m && x.fussy && x.id !== curId)));
    if (!pool.length) return toast('No other option without your dislikes');
    const r = pool[Math.floor(Math.random() * pool.length)];
    shop.recipes = shop.recipes.filter(x => x !== curId); shop.recipes.push(r.id); shop.prep.week[m] = r.id; saveShop(); renderPrep(); toast(`🔄 ${m}: ${r.name}`);
  });
  root.querySelectorAll('[data-goshop2]').forEach(b => b.onclick = () => { switchTab('shop'); scrollTo(0, 0); });
}
$('buildWeekBtn').onclick = () => buildMyWeek();
window.__kova.buildMyWeek = buildMyWeek;

/* ================= CLASSES: full 30-minute follow-along classes ================= */
let music = null, classManifest = null, CLASSES = [];
const classById = id => CLASSES.find(c => c.id === id);
/* Online library: library.json is fetched network-first (cache-busted) on every launch and whenever the Classes tab is shown;
   the last good copy is kept in localStorage for offline use. Adding a class = edit library.json + add media/classes/<id>/. */
const LIB_KEY = 'reta.library';
async function loadLibrary() {
  let doc = null;
  try { const r = await fetch(`library.json?v=${Date.now()}`, { cache: 'no-store' }); if (r.ok) { doc = await r.json(); localStorage.setItem(LIB_KEY, JSON.stringify(doc)); } } catch {}
  if (!doc) { try { doc = JSON.parse(localStorage.getItem(LIB_KEY) || 'null'); window.__kova.libraryOffline = !!doc; } catch {} } else window.__kova.libraryOffline = false;
  if (doc) { CLASSES = buildLibrary(doc); window.__kova.CLASSES = CLASSES; CLASSES.filter(c => c.problems.length).forEach(c => console.warn('library.json:', c.id, c.problems)); }
  return CLASSES;
}
loadLibrary();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !sess && $('tab-classes').classList.contains('active')) renderClasses(); });
const CLS_TRAINER_NAME = { m: 'Coach (male)', f: 'Coach (female)' };
const latestKg = () => { const w = sortEntries(store.get('weights', [])); return w.length ? w[w.length - 1].kg : null; };
async function loadClassManifest() { // media/classes/manifest.json is written by the clip generator as each class finishes
  try { const r = await fetch('media/classes/manifest.json', { cache: 'no-store' }); classManifest = r.ok ? await r.json() : null; } catch { classManifest = null; }
  return classManifest;
}
const driveId = id => { const v = String(classById(id)?.drive || '').trim(); return /^[\w-]{10,}$/.test(v) ? v : ''; };
// Clips the manifest lists for a class. Expected shape: { classes: { boxing: { moves: [{ slug, name, video, video_hd, poster }] } } };
// also tolerates plain arrays of slugs/paths. Paths are relative to media/classes/.
function manifestMoves(clsId) {
  const m = classManifest; if (!m) return [];
  const raw = m.classes?.[clsId]?.moves || m.classes?.[clsId]?.clips || m[clsId]?.moves || m[clsId] || [];
  if (!Array.isArray(raw)) return [];
  return raw.map(x => typeof x === 'string' ? { slug: x.split('/').pop().replace(/(-hd)?\.(mp4|jpg)$/i, ''), name: '' } : x).filter(x => x && x.slug);
}
const GENERIC = new Set(['and', 'the', 'with', 'left', 'right', 'round', 'again', 'low', 'impact', 'pose', 'slow', 'easy', 'side', 'basic', 'combo', 'full', 'arms', 'arm', 'then', 'hold', 'chair', 'small', 'big', 'speed', 'power', 'finisher', 'layered', 'routine']);
const toks = s => new Set(String(s || '').toLowerCase().split(/[^a-z0-9]+/).map(w => w.replace(/(es|s)$/, '')).filter(w => w.length > 2 && !GENERIC.has(w)));
/** The manifest move for a step: exact slug, then alt slugs, then best distinctive-token match; warm-up/main fall back to the class's base move. */
function moveFor(cls, step) {
  const moves = manifestMoves(cls.id); if (!step?.slug) return null;
  if (!moves.length) return { slug: step.slug, guess: true };
  for (const k of [step.slug, ...(step.alt || [])]) { const hit = moves.find(m => m.slug === k); if (hit) return hit; }
  const want = new Set([...toks(step.slug), ...toks(step.name), ...(step.alt || []).flatMap(a => [...toks(a)])]);
  let best = null, score = 0;
  for (const m of moves) { const n = [...new Set([...toks(m.slug), ...toks(m.name)])].filter(w => want.has(w)).length; if (n > score) { score = n; best = m; } }
  if (best) return best;
  return step.kind === 'cool' ? null : moves[0];
}
const slugFor = (cls, step) => moveFor(cls, step)?.slug || null;
function classClipCandidates(cls, step, t, hd = true) {
  const base = `media/classes/${cls.id}`, mv = moveFor(cls, step); if (!mv) return [];
  const rel = p => p ? `media/classes/${p.replace(/^\.?\//, '')}` : null;
  const per = t !== cls.lead ? [...(hd ? [`${base}/${t}/${mv.slug}-hd.mp4`] : []), `${base}/${t}/${mv.slug}.mp4`] : [];
  return [...new Set([...per, ...(hd ? [rel(mv.video_hd), `${base}/${mv.slug}-hd.mp4`] : []), rel(mv.video), `${base}/${mv.slug}.mp4`].filter(Boolean))];
}
const posterFor = (cls, step, t) => { const mv = moveFor(cls, step); const base = `media/classes/${cls.id}`; return mv ? [...(t !== cls.lead ? [`${base}/${t}/${mv.slug}.jpg`] : []), ...(mv.poster ? [`media/classes/${mv.poster}`] : []), `${base}/${mv.slug}.jpg`] : []; };
async function setClassDemo(cls, step) {
  const v = $('trainerVid'), tile = v.parentElement, t = sess?.trainer || cls.lead;
  const want = v.dataset.key = `${cls.id}:${step.slug}:${t}`;
  const fbKey = step.fb && MEDIA[step.fb] ? step.fb : 'march';
  const [clip, poster, fbClip, fbJpg] = await Promise.all([firstExisting(classClipCandidates(cls, step, t)), firstExisting(posterFor(cls, step, t)), firstExisting([`media/${t}/${MEDIA[fbKey]}-hd.mp4`, `media/${t}/${MEDIA[fbKey]}.mp4`, `media/${MEDIA[fbKey]}.mp4`]), firstExisting([`media/${t}/${MEDIA[fbKey]}.jpg`, `media/${MEDIA[fbKey]}.jpg`])]);
  if (v.dataset.key !== want) return;
  // Fallback order: class clip -> class poster (still) -> another trainer clip for a similar move -> bundled clip.
  const src = clip || (poster ? null : fbClip || `clips/${BUNDLED[fbKey]}.mp4`);
  const still = poster || fbJpg;
  if (still) { v.poster = still; tile.style.setProperty('--poster', `url("${still}")`); } else v.removeAttribute('poster');
  tile.classList.toggle('floor', /bridge|deadbug|pushup/.test(step.fb || '') || /lying|clam|leg-lift|bird|plank|child|fold|twist|knee-hug|relax|figure|pelvic|knee-folds/.test(step.slug || ''));
  window.__kova.classMedia = { step: step.name, src: src || still, kind: clip ? 'class-clip' : poster ? 'poster' : 'fallback-trainer-clip' };
  if (!src) { v.pause(); v.removeAttribute('src'); v.load(); tile.classList.remove('missing'); return; }
  if (v.getAttribute('src') === src) return;
  tile.classList.remove('missing'); v.onerror = () => tile.classList.add('missing');
  v.src = src; v.playbackRate = 1; v.play().catch(() => {});
}
async function classTrainerFor(cls) { // trainer picker override only when that trainer's clips exist for this class
  const pick = settings.classTrainer || 'lead';
  if (pick === 'lead' || pick === cls.lead) return cls.lead;
  const firstMain = cls.steps.find(s => s.kind === 'main');
  if (await exists(`media/classes/${cls.id}/${pick}/${slugFor(cls, firstMain)}.mp4`)) return pick;
  toast(`No ${CLS_TRAINER_NAME[pick]} clips for ${cls.name} yet, so the class lead is teaching.`, 3500);
  return cls.lead;
}

/* ---------- class session ---------- */
const csCur = () => sess.cls.steps[sess.i];
function classTimeline() {
  const c = sess.cls;
  $('timeline').innerHTML = c.steps.map((s, i) => `<div class="seg ${s.kind === 'main' ? 'work' : s.kind === 'trans' || s.kind === 'water' ? 'rest' : s.kind}" style="flex:${s.dur / c.total}" title="${esc(s.name)}"><i id="tl${i}"></i></div>`).join('');
}
function classUpdateTimeline() { sess.cls.steps.forEach((s, i) => { const el = $('tl' + i); if (!el) return; el.style.width = i < sess.i ? '100%' : i > sess.i ? '0%' : `${100 * (1 - Math.max(0, sess.t) / s.dur)}%`; el.parentElement.classList.toggle('now', i === sess.i); }); }
function setForm(v) { if (v == null) return; v = Math.max(0, Math.min(100, Math.round(v))); sess.form = v; $('formScore').textContent = v; const b = $('formBar'); b.style.width = v + '%'; b.style.background = v >= 75 ? '#3ddc84' : v >= 50 ? '#ffb547' : '#ff4d4d'; }
const metricName = c => METRIC[c.primary] || 'moves';
function classMetric() { const st = sess.stats, p = sess.cls.primary; return p === 'punch' ? st.L + st.R : p === 'hold' ? Math.round(st.held) : p === 'reps' ? st.reps + Math.round(st.plank / 5) : st.onbeat; }
function classEnergy() {
  const now = classMetric(), last = sess.lastMetric, max = Math.max(now, last || 0, 1);
  $('eNowN').textContent = now; $('eNow').style.width = `${100 * now / max}%`;
  $('eLastN').textContent = last == null ? '–' : last; $('eLast').style.width = last == null ? '0%' : `${100 * last / max}%`;
  $('energy').classList.toggle('ahead', last != null && now > last);
}
async function startClass(id) {
  const cls = classById(id); if (!cls) return;
  if (sess) return say('Let\'s finish this one first.', { kind: 'high' });
  unlockAudio(); await loadClassManifest();
  switchTab('workout');
  const trainer = await classTrainerFor(cls);
  const hist = store.get('classes', []).filter(x => x.cls === id);
  sess = { cls, trainer, i: -1, t: 0, paused: false, started: Date.now(), lastTick: performance.now(), inFrame: false, an: null, said: {}, kcal: 0, kg: latestKg() || 75, kgKnown: !!latestKg(),
    stats: { L: 0, R: 0, hooks: 0, guard: [], onbeat: 0, scoreSum: 0, scoreN: 0, rhythmSum: 0, held: 0, poseTime: 0, poseOk: 0, reps: 0, plank: 0, perStep: {} }, lastMetric: hist.length ? hist[hist.length - 1].metric : null, lastSay: 0, cueI: 0 };
  window.__kova.sess = sess; window.__kova.cls = { get sess() { return sess; }, get music() { return music; } };
  voiceTrainer = trainer; pickVoice(); applyClassAvatar(trainer);
  $('trainerName').textContent = `${CLS_TRAINER_NAME[trainer]} · ${cls.name.replace(' (Zumba-style)', '')}`;
  sess.form = null; $('formScore').textContent = '–'; $('formBar').style.width = '0%';
  $('stage').classList.add('classmode'); $('classHud').hidden = false; $('stepTag').hidden = true;
  $('repLabel').textContent = metricName(cls); $('repCount').textContent = '0';
  $('chEight').hidden = !cls.eightCount;
  $('chEight').innerHTML = Array.from({ length: 8 }, (_, k) => `<i>${k + 1}</i>`).join('');
  $('chMeterLabel').textContent = { punch: 'Guard', rhythm: 'Rhythm', hold: 'In pose', reps: 'Control' }[cls.primary] || 'Effort';
  $('musicVol').value = Math.round((settings.musicVol ?? 0.5) * 100);
  try { if (actx) { music = new MusicPlayer(actx); music.setVolume(settings.musicVol ?? 0.5); } } catch (e) { console.warn('music', e); }
  show('screen-session'); keepAwake(); orient(); setSwapped(false); classTimeline(); classEnergy();
  $('moveName').textContent = cls.name; setCue('Starting camera…');
  await Promise.race([loadVoiceManifest(), new Promise(r => setTimeout(r, 1200))]); // never block the class on voice files
  sayLine(welcomeLine(cls));
  if (settings.formCheck) { try { await startCamera(); } catch (e) { setCue('Camera blocked. You can still follow along; allow camera access for live feedback.', true); } } else setCue('');
  if (settings.formCheck) initPose().then(() => setCue('')).catch(() => setCue('Pose model failed to load. Follow along; feedback is off.', true));
  requestAnimationFrame(poseLoop);
  classNext(); sess.timer = setInterval(classTick, 100);
}
function applyClassAvatar(t) { firstExisting([`media/${t}/avatar.jpg`]).then(src => document.querySelectorAll('.stage .trainer-avatar').forEach(i => i.src = src || (t === 'f' ? 'avatar-f.svg' : 'avatar.jpg'))); }
function makeTracker(cls, s) {
  if (s.track === 'punch') return new PunchCounter();
  if (s.track === 'rhythm') return new RhythmMeter();
  if (s.track === 'hold' || s.track === 'still') return new HoldTracker(s.pose || null);
  if (s.track === 'reps' && s.rep) return makePilates(s.rep);
  if (s.track === 'plank') return makePilates('plank');
  return null;
}
function classNext() {
  if (!sess?.cls) return;
  const prev = sess.i >= 0 ? csCur() : null;
  if (prev?.rep && sess.an?.rc) sess.stats.perStep[prev.name] = sess.an.rc.reps;
  sess.i++;
  const cls = sess.cls; if (sess.i >= cls.steps.length) return classFinish(true);
  sess.stats.heldBase = sess.stats.held; sess.stats.plankBase = sess.stats.plank;
  const s = csCur(); sess.t = s.dur; sess.said = {}; sess.an = makeTracker(cls, s); sess.stepStart = performance.now(); sess.cueI = 0; sess.lastCueAt = performance.now();
  const rest = s.kind === 'trans' || s.kind === 'water';
  $('restPanel').hidden = !rest; $('stage').classList.toggle('resting', rest);
  $('roundTag').textContent = { warm: 'Warm-up', main: 'Main', trans: 'Transition', water: 'Water break', cool: 'Cool-down' }[s.kind];
  $('moveName').textContent = rest ? s.name : s.name;
  const nxt = cls.steps[sess.i + 1];
  if (rest) { $('nextName').textContent = nxt?.name || 'Finish'; $('nextHow').textContent = nxt?.how || ''; if (nxt) setClassDemo(cls, nxt); }
  else setClassDemo(cls, s);
  const fx = rest ? null : s.fix; // corrective cue for clips whose form isn't perfect (from library.json)
  $('fixLabel').hidden = !fx; $('fixLabel').textContent = fx ? `⚠️ ${fx}` : ''; $('fixLabel').classList.toggle('corrective', !!fx);
  music?.start(styleFor(cls, s), s.bpm);
  setCue(s.combo ? `Combo: ${s.combo}` : s.counts ? s.counts[0] : s.how.split('.')[0]);
  for (const l of stepStartLines(cls, sess.i)) sayLine(l); // same lines (and order) as the full-length videos
  { const n = cls.steps.slice(sess.i + 1).find(x => x.kind !== 'trans' && x.kind !== 'water'); if (n) preloadLines([{ id: `class.${cls.id}.${lineSlug(n.name)}.intro`, text: introText(n) }, nextLine(cls, n), ...(n.cues || []).map(t => ({ id: `cue.${lineSlug(t)}`, text: t }))]); }
  if (!rest) beep(1200, 200);
  $('repCount').textContent = s.rep ? '0' : classMetric();
  classUpdateTimeline(); ring2(); classEnergy();
}
function ring2() { const s = csCur(); if (!s) return; $('ringProg').style.strokeDashoffset = 326.7 * (1 - Math.max(0, sess.t) / s.dur); $('timeLeft').textContent = fmtT(sess.t); }
function coachSay(text, gap = 6000, kind = 'coach', id = null, extra = {}) { if (typeof text === 'object') { extra = text; text = extra.text; id = extra.id ?? id; } const n = performance.now(); if (n - sess.lastSay < gap / SPEED) return false; sess.lastSay = n; setCue(text); if (voiceBusy() && kind !== 'high') { bubble(text); return true; } say(text, { ...extra, kind, id }); return true; }
function classTick() {
  if (!sess?.cls) return;
  const now = performance.now(), dt = (now - sess.lastTick) / 1000 * SPEED; sess.lastTick = now;
  if (sess.paused) return;
  const s = csCur(); sess.t -= dt;
  sess.kcal += metKcal(s.met, sess.kg, dt); $('chKcal').textContent = Math.round(sess.kcal);
  // 8-count display synced to the music clock
  if (music && !$('chEight').hidden) { const c = music.count(); if (c !== sess.lastCount) { sess.lastCount = c; $('chEight').querySelectorAll('i').forEach((el, k) => { el.classList.toggle('on', k < c); el.classList.toggle('one', k === 0 && c === 1); }); window.__kova.eightCount = c; } }
  // countdowns + timed coaching
  const el = s.dur - sess.t;
  if (s.kind === 'main' && s.dur >= 60 && el >= s.dur / 2 && !sess.said.half) { sess.said.half = 1; coachSay(halfwayLine(s), 0); }
  if (s.kind === 'main' && sess.t <= 10 && !sess.said.t10) { sess.said.t10 = 1; sayLine(tenLine(s)); }
  if ((s.kind === 'trans' || s.kind === 'water') && sess.t <= COUNT_IN_AT && !sess.said.c8) { sess.said.c8 = 1; if (sess.cls.steps[sess.i + 1]) sayLine(countInLine(sess.cls)); }
  for (const k of [3, 2, 1]) if (sess.t <= k && !sess.said['b' + k]) { sess.said['b' + k] = 1; beep(660, 110); }
  if (s.cues?.length && (now - sess.lastCueAt) * SPEED > CUE_EVERY * 1000) { sess.lastCueAt = now; coachSay(cueLine(s.cues[sess.cueI++ % s.cues.length]), 4000); }
  if (s.counts?.length > 1 && (now - sess.stepStart) * SPEED > LAYER_EVERY * 1000 * (sess.said.layer || 1) && (sess.said.layer || 1) < s.counts.length) { const L = sess.said.layer || 1; sess.said.layer = L + 1; coachSay(layerLine(s, L), 0, 'high'); }
  if (sess.t <= 0) { beep(440, 300); classNext(); return; }
  ring2(); classUpdateTimeline();
}
function classOnPose(res) {
  window.__kova.frames = (window.__kova.frames || 0) + 1;
  if (!sess?.cls || sess.paused) return;
  const s = csCur(); if (!s || !sess.an) return;
  const lm = res.landmarks?.[0], w = res.worldLandmarks?.[0]; if (!lm || !w) { setCue('Step back so I can see your whole body', true); return; }
  classFeed(lm, w, performance.now());
}
// Feed one pose frame to the current step's tracker (also used by tests with synthetic landmarks).
function classFeed(lm, w, t) {
  const s = csCur(), an = sess.an, st = sess.stats; if (!an) return null;
  const beat = music ? { period: music.period, phase: x => music.phase(x), count: x => music.count(x) } : { period: 60000 / s.bpm, phase: x => ((x - sess.stepStart) / (60000 / s.bpm)) % 1, count: x => Math.floor((x - sess.stepStart) / (60000 / s.bpm)) % 8 + 1 };
  const r = an instanceof RhythmMeter ? an.frame(lm, t, beat, s.dir || '') : an.frame(lm, w, t);
  if (!r.ready) { setCue('Step back so I can see your whole body', true); return r; }
  if ($('cueLine').classList.contains('warn')) setCue('');
  const joints = r.joints ? new Set(r.joints) : null; sess.badJoints = r.ok === false && joints ? joints : null; sess.badUntil = performance.now() + 1500;
  if (an instanceof PunchCounter) {
    for (const e of r.events) { e.side === 'L' ? st.L++ : st.R++; if (e.kind === 'hook') st.hooks++; }
    if (r.events.length) { $('repCount').textContent = st.L + st.R; classEnergy(); }
    $('chStat').textContent = `🥊 L ${st.L} · R ${st.R}`; setMeter(an.guardOk * 100); setForm(an.guardOk * 100); st.guard.push(an.guardOk);
    if (r.flags.includes('guard')) coachSay('Guard up! Hands back to your cheeks.', 5000);
    else if (r.events.length && (st.L + st.R) % 25 === 0) coachSay(punchesLine(st.L + st.R), 3000);
  } else if (an instanceof RhythmMeter) {
    st.onbeat = st.onbeat + r.events.length; st.scoreSum += r.score; st.scoreN++; st.rhythmSum += r.rhythm;
    $('chStat').textContent = `💃 Move score ${r.score}`; setMeter(r.rhythm * 100); setForm(r.score); $('repCount').textContent = st.onbeat; if (r.events.length) classEnergy();
    if (r.rhythm > 0.72 && r.energy > 0.15) coachSay('Great rhythm! You\'re right on the beat.', 20000);
    else if (r.flags.includes('still')) coachSay('Keep moving. Small steps are perfect.', 9000);
    else if (r.rhythm < 0.35 && st.scoreN > 60) coachSay('Listen for the kick drum and step with it.', 15000);
  } else if (an instanceof HoldTracker) {
    const prevHeld = Math.floor(an.held - (r.held - an.held));
    st.poseTime++; if (r.ok) st.poseOk++;
    st.held = (st.heldBase || 0) + an.held; $('repCount').textContent = Math.floor(an.held);
    $('chStat').textContent = s.pose ? `🧘 Hold ${Math.floor(an.held)}s ${r.ok && r.still ? '✓' : ''}` : `🧘 Steady ${Math.floor(an.held)}s`;
    setMeter(100 * st.poseOk / Math.max(1, st.poseTime)); setForm(100 * st.poseOk / Math.max(1, st.poseTime));
    if (s.pose && r.ok === false && r.tip) coachSay(r.tip, 7000);
    else if (r.flags.includes('wobble')) coachSay('Find a still point to look at. Breathe.', 12000);
    else if (Math.floor(an.held) > 0 && Math.floor(an.held) % 20 === 0 && Math.floor(an.held) !== sess.said.heldMark) { sess.said.heldMark = Math.floor(an.held); coachSay(heldLine(Math.floor(an.held)), 0); }
    void prevHeld;
  } else { // pilates reps / plank
    if (r.held != null) { st.plank = (st.plankBase || 0) + r.held; $('repCount').textContent = Math.floor(r.held); $('chStat').textContent = `⏱ Plank ${Math.floor(r.held)}s ${r.ok ? '✓' : ''}`; setMeter(r.ok ? 100 : 30); setForm(r.ok ? 100 : 55); if (!r.ok) coachSay(r.tip, 7000); }
    for (const e of r.events || []) {
      if (e.type === 'rep') { st.reps++; $('repCount').textContent = an.rc.reps; $('chStat').textContent = `✓ ${an.rc.reps} reps`; const fast = e.ms < 1200; setForm(fast ? 65 : 100); setMeter(fast ? 60 : 100); sayLine(countLine(an.rc.reps)); if (fast) coachSay('Slower and more controlled.', 8000); classEnergy(); }
      if (e.type === 'shallow') { setForm(50); coachSay(s.rep === 'bridge' ? 'Lift a little higher, squeeze your glutes.' : 'A little bigger range, still slow.', 7000); }
    }
  }
  return r;
}
function setMeter(v) { v = Math.max(0, Math.min(100, Math.round(v))); $('chMeter').style.width = v + '%'; $('chMeterN').textContent = v; }
$('musicVol').oninput = e => { settings.musicVol = e.target.value / 100; store.set('settings', settings); music?.setVolume(settings.musicVol); };
function changeVolume(d) { settings.musicVol = Math.max(0, Math.min(1, Math.round(((settings.musicVol ?? 0.5) + d) * 10) / 10)); store.set('settings', settings); music?.setVolume(settings.musicVol); $('musicVol').value = Math.round(settings.musicVol * 100); return settings.musicVol; }
async function classFinish(completed) {
  if (!sess?.cls) return;
  const c = sess.cls, st = sess.stats, s = csCur(); if (s?.rep && sess.an?.rc) st.perStep[s.name] = sess.an.rc.reps;
  clearInterval(sess.timer); music?.stop(); music = null; stream?.getTracks().forEach(t => t.stop()); stream = null; wakeLock?.release?.(); wakeLock = null;
  const elapsed = c.steps.slice(0, Math.max(0, sess.i)).reduce((a, x) => a + x.dur, 0) + (s ? s.dur - Math.max(0, sess.t) : 0);
  const metric = classMetric(), kc = Math.round(sess.kcal);
  const rec = { date: new Date().toISOString(), cls: c.id, name: c.name, completed, minutes: Math.round(elapsed / 60), kcal: kc, metric, form: sess.form,
    stats: { punches: st.L + st.R, left: st.L, right: st.R, hooks: st.hooks, guardPct: st.guard.length ? Math.round(100 * st.guard.reduce((a, b) => a + b, 0) / st.guard.length) : null, moveScore: st.scoreN ? Math.round(st.scoreSum / st.scoreN) : null, rhythmPct: st.scoreN ? Math.round(100 * st.rhythmSum / st.scoreN) : null, onbeat: st.onbeat, heldSec: Math.round(st.held), inPosePct: st.poseTime ? Math.round(100 * st.poseOk / st.poseTime) : null, reps: st.reps, plankSec: Math.round(st.plank), perStep: st.perStep } };
  const hist = store.get('classes', []); const prev = hist.filter(x => x.cls === c.id).slice(-1)[0]; hist.push(rec); store.set('classes', hist);
  const rows = [['Time', fmtT(elapsed)], ['Calories (approx.)', `≈${kc} kcal${sess.kgKnown ? '' : ' (add a weigh-in for a better estimate)'}`]];
  const used = new Set(c.steps.map(x => x.track));
  if (used.has('punch')) rows.push(['Punches', `${st.L + st.R} (L ${st.L} · R ${st.R})`], ['Hooks', st.hooks], ['Guard up', rec.stats.guardPct == null ? '–' : rec.stats.guardPct + '%']);
  if (used.has('rhythm')) rows.push(['Move score', rec.stats.moveScore ?? '–'], ['Stayed in rhythm', rec.stats.rhythmPct == null ? '–' : rec.stats.rhythmPct + '%'], ['On-beat moves', st.onbeat]);
  if (used.has('hold')) rows.push(['Time held in poses', `${Math.round(st.held)}s`], ['In the pose', rec.stats.inPosePct == null ? '–' : rec.stats.inPosePct + '%']);
  if (used.has('reps') || used.has('plank')) rows.push(['Controlled reps', st.reps], ...(used.has('plank') ? [['Plank hold', `${Math.round(st.plank)}s`]] : []), ...Object.entries(st.perStep).map(([k, v]) => [k, `${v} reps`]));
  const vs = prev ? (metric > prev.metric ? ` That's more ${metricName(c)} than last time (${prev.metric}).` : ` Last time: ${prev.metric} ${metricName(c)}.`) : '';
  const summary = `${completed ? 'Class complete!' : 'Nice effort!'} ${c.name.replace(' (Zumba-style)', '')}: ${fmtT(elapsed)} and about ${kc} calories.${vs} Remember to drink some water.`;
  $('summaryText').textContent = summary;
  $('totalsTable').innerHTML = rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(String(v))}</td></tr>`).join('');
  $('stage').classList.remove('classmode'); $('classHud').hidden = true; $('fixLabel').hidden = true; $('fixLabel').classList.remove('corrective'); $('repLabel').textContent = 'reps';
  sess = null; window.__kova.sess = null; voiceTrainer = null; pickVoice(); applyTrainerAvatar(); buildTimeline();
  show('screen-end'); for (const l of summaryLines(c, completed, !!(prev && metric > prev.metric))) sayLine(l); renderClassHist(); // spoken: recorded outro; the numbers stay on screen
}
function classCommand(t) { // returns undefined when not a class command
  if (/\b(start|begin|play|do)\b/.test(t)) { // match any class in the library by id, title words or its "voice" aliases
    const words = c => [c.id, ...c.voice, ...c.title.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3 && !['class', 'cardio', 'style'].includes(w))];
    const hit = CLASSES.find(c => words(c).some(w => new RegExp(`\\b${w.toLowerCase()}\\b`).test(t)));
    if (hit) { if (sess) return say('Let\'s finish this one first.', { kind: 'high' }); startClass(hit.id); return true; }
  }
  if (/\b(louder|turn (it|the music) up|music up|volume up|more music)\b/.test(t)) { const v = changeVolume(0.15); return say(`Music up, ${Math.round(v * 100)} percent.`, { kind: 'high' }); }
  if (/\b(quieter|softer|turn (it|the music) down|music down|volume down|less music)\b/.test(t)) { const v = changeVolume(-0.15); return say(v ? `Music down, ${Math.round(v * 100)} percent.` : 'Music off.', { kind: 'high' }); }
  if (/\b(mute|stop) (the )?music\b/.test(t)) { changeVolume(-1); return say('Music off.', { kind: 'high' }); }
  if (sess?.cls && /what'?s next|what is next|what next/.test(t)) { const n = sess.cls.steps.slice(sess.i + 1).find(x => x.kind !== 'trans' && x.kind !== 'water'); return n ? sayLine({ ...nextLine(sess.cls, n), kind: 'high' }) : say('That\'s the end of the class.', { kind: 'high' }); }
  if (sess?.cls && /how many|how am i doing|rep count|calories/.test(t)) return sayLine(soFarLine(classMetric(), metricName(sess.cls), Math.round(sess.kcal)));
  if (/\b(classes|class library)\b/.test(t) && !sess) { switchTab('classes'); return say('Here are your classes. Say "start boxing", or pick one.', { kind: 'high' }); }
  return undefined;
}

/* ---------- class library ---------- */
const classUI = { filter: 'all', q: '' };

const lowEnergyToday = () => settings.lowEnergyDay === dayKey();
async function classPoster(c) {
  const first = c.steps.find(s => s.kind === 'main') || c.steps[0];
  return (await firstExisting([...(c.poster ? [c.poster] : []), ...(first ? posterFor(c, first, c.lead) : []), `media/classes/${c.id}/poster.jpg`])) || (await firstExisting([`media/${c.lead}/${MEDIA[first.fb] || 'warmup'}.jpg`, `media/${MEDIA[first.fb] || 'warmup'}.jpg`])) || 'hero.jpg';
}
const mm = sec => `${Math.round(sec / 60)} min`;
async function renderClasses() {
  await Promise.all([loadClassManifest(), loadLibrary()]);
  if (!CLASSES.length) { $('classList').innerHTML = '<p class="muted">The class library couldn\'t load. Check your connection and try again.</p>'; $('recCard').innerHTML = ''; return; }
  classUI.seen = store.get('classSeen', []); // snapshot for this visit; anything not in it gets a "New" badge
  const kg = latestKg();
  const rec = recommend(CLASSES, { history: store.get('classes', []), lowEnergy: lowEnergyToday(), glp1: settings.glp1 });
  $('recCard').innerHTML = rec ? `<div class="small muted">⭐ Recommended for you</div><h3>${esc(rec.cls.name)}</h3><div class="why">${esc(rec.why)} ${mm(rec.cls.total)} · ${esc(rec.cls.intensity)} · ≈${classKcal(rec.cls, kg)} kcal</div>
    <div class="btns row" style="gap:8px;margin-top:8px"><button class="primary" data-startclass="${esc(rec.cls.id)}">▶ Start ${esc(rec.cls.name.replace(' (Zumba-style)', ''))}</button></div>
    <label class="toggle"><input type="checkbox" id="lowEnergy" ${lowEnergyToday() ? 'checked' : ''}> Low energy today${settings.glp1 ? ' (GLP-1 friendly gentle options)' : ''}</label>` : '';
  const cats = [...new Set(CLASSES.map(c => c.category))];
  if (classUI.filter !== 'all' && classUI.filter !== 'new' && !cats.includes(classUI.filter)) classUI.filter = 'all';
  $('classFilters').innerHTML = [['all', 'All'], ['new', 'New'], ...cats.map(c => [c, c])].map(([k, v]) => `<button type="button" class="chip ${classUI.filter === k ? 'on' : ''}" data-cfilter="${esc(k)}">${esc(v)}</button>`).join('');
  $('classTrainer').value = settings.classTrainer || 'lead';
  $('classSearch').value = classUI.q;
  await renderClassList();
  if ($('lowEnergy')) $('lowEnergy').onchange = e => { settings.lowEnergyDay = e.target.checked ? dayKey() : null; store.set('settings', settings); renderClasses(); };
  $('tab-classes').querySelectorAll('#recCard [data-startclass]').forEach(b => b.onclick = () => startClass(b.dataset.startclass));
  $('tab-classes').querySelectorAll('[data-cfilter]').forEach(b => b.onclick = () => { classUI.filter = b.dataset.cfilter; $('classFilters').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === b)); renderClassList(); });
  store.set('classSeen', [...new Set([...classUI.seen, ...CLASSES.map(c => c.id)])]);
  renderClassHist();
}
async function renderClassList() {
  const kg = latestKg(), q = classUI.q.trim().toLowerCase(), seen = classUI.seen || [];
  const hay = c => [c.title, c.category, c.blurb, c.intensity, CLS_TRAINER_NAME[c.lead], ...c.tags, ...c.voice, ...c.steps.map(x => x.name)].join(' ').toLowerCase();
  const list = CLASSES.filter(c => (classUI.filter === 'all' || (classUI.filter === 'new' ? isNewClass(c, seen) : c.category === classUI.filter)) && (!q || q.split(/\s+/).every(w => hay(c).includes(w))));
  const posters = await Promise.all(list.map(classPoster));
  const avatars = await Promise.all(list.map(c => firstExisting([`media/${c.lead}/avatar.jpg`])));
  $('classList').innerHTML = list.length ? list.map((c, k) => `<div class="ccard" id="class-${esc(c.id)}">
    <div class="poster" style="background-image:url('${esc(posters[k])}')">${isNewClass(c, seen) ? '<span class="newbadge">New</span>' : ''}<span class="lead"><img src="${avatars[k] || (c.lead === 'f' ? 'avatar-f.svg' : 'avatar.jpg')}" alt="">${CLS_TRAINER_NAME[c.lead]} leads</span><span class="dur">${fmtT(c.total)}</span></div>
    <div class="body"><h3>${esc(c.name)}</h3><div class="tags"><span class="int">${esc(c.intensity)}</span><span>${esc(c.category)}</span><span>Beginner</span><span>Low impact</span><span>No equipment</span><span>≈${classKcal(c, kg)} kcal</span>${c.music !== 'ambient' ? `<span>${c.steps.some(x => x.bpm !== c.bpm && x.kind === 'main') ? `${Math.min(...c.steps.filter(x => x.kind === 'main').map(x => x.bpm))}–${Math.max(...c.steps.filter(x => x.kind === 'main').map(x => x.bpm))}` : c.bpm} bpm</span>` : '<span>Ambient music</span>'}</div>
      <p>${esc(c.blurb)}</p><p class="small">${mm(c.sections.warm)} warm-up · ${mm(c.sections.main)} main · ${mm(c.sections.cool)} cool-down</p>
      <div class="btns"><button class="primary" data-startclass="${esc(c.id)}">▶ Start class</button>${driveId(c.id) ? `<button type="button" data-watch="${esc(c.id)}">📺 Watch full class</button>` : ''}</div></div></div>`).join('') : '<p class="muted">No classes match. Try another search or filter.</p>';
  const root = $('classList');
  root.querySelectorAll('[data-startclass]').forEach(b => b.onclick = () => startClass(b.dataset.startclass));
  root.querySelectorAll('[data-watch]').forEach(b => b.onclick = () => openDrive(b.dataset.watch));
}
$('classSearch').oninput = e => { classUI.q = e.target.value; renderClassList(); };
$('classTrainer').onchange = e => { settings.classTrainer = e.target.value; store.set('settings', settings); };
function renderClassHist() {
  const h = store.get('classes', []), d = iso => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  $('classHist').innerHTML = h.length ? h.slice(-8).reverse().map(x => `<li><span>${d(x.date)} · ${esc(x.name.replace(' (Zumba-style)', ''))}${x.completed ? '' : ' <small class="muted">(ended early)</small>'}</span><span>${x.minutes} min · ≈${x.kcal} kcal</span></li>`).join('') : '<li class="muted">No classes yet. Pick one above!</li>';
}
function openDrive(id) {
  const fid = driveId(id); if (!fid) return;
  $('driveTitle').textContent = classById(id).name + ': full class';
  $('driveFrame').src = `https://drive.google.com/file/d/${encodeURIComponent(fid)}/preview`; $('driveModal').hidden = false;
}
$('driveClose').onclick = () => { $('driveModal').hidden = true; $('driveFrame').src = 'about:blank'; };
window.__kova.startClass = startClass; window.__kova.classFeed = (lm, w, t) => classFeed(lm, w, t ?? performance.now()); window.__kova.classNext = () => classNext(); window.__kova.renderClasses = renderClasses; window.__kova.loadLibrary = loadLibrary;

/* ---------- weight-loss progress (progress.js) ---------- */
wpReady = true;
const unitW = () => settings.weightUnit || 'kg';
const fmtLoss = kg => { const a = Math.abs(kg); return unitW() === 'kg' ? `${a.toFixed(1)} kg` : unitW() === 'lb' ? `${(a / 0.45359237).toFixed(1)} lb` : stLb(a).text; };
const signed = v => v == null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtLoss(v)}`;
let editingW = null;
function renderWeightProgress() {
  const w = store.get('weights', []), sum = progressSummary(w, { goalKg: settings.goalKg, heightCm: settings.heightCm }), d = iso => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' });
  if (!sum) {
    $('progSummary').innerHTML = '<div class="card"><p>Log your first weigh-in below to start your progress chart. Weigh at the same time of day, ideally once a week.</p></div>';
    $('homeProgress').innerHTML = `<div class="row between"><h3>📉 Your progress</h3></div><p class="small muted">No weigh-ins yet. Add one to track your weight loss.</p><button type="button" class="primary" data-gotab="progress">Add a weigh-in</button>`;
  } else {
    const t = v => `<span class="${v == null ? '' : v < 0 ? 'good' : v > 0 ? 'up' : ''}">${signed(v)}</span>`;
    $('progSummary').innerHTML = `<div class="statgrid">
      <div class="stat2"><small>Start</small><b>${fmtWeight(sum.start, unitW())}</b></div>
      <div class="stat2"><small>Now</small><b>${fmtWeight(sum.current, unitW())}</b></div>
      <div class="stat2 hl"><small>Total lost</small><b>${sum.lost > 0 ? fmtLoss(sum.lost) : sum.lost < 0 ? '+' + fmtLoss(sum.lost) : '0'}</b><small>${sum.lost > 0 ? `${sum.lost.toFixed(1)} kg · ${stLb(sum.lost).text}` : ''}</small></div>
      <div class="stat2 hl"><small>% lost</small><b>${Math.max(0, sum.pct).toFixed(1)}%</b></div>
      <div class="stat2"><small>Last 7 days</small><b>${t(sum.trend7)}</b></div>
      <div class="stat2"><small>Last 30 days</small><b>${t(sum.trend30)}</b></div>
      ${sum.bmi ? `<div class="stat2 wide"><small>BMI</small><b>${sum.bmi}</b><small>${bmiBand(sum.bmi)}</small></div>` : ''}</div>
      ${sum.goal ? `<div class="card goalcard"><div class="row between"><b>Goal ${fmtWeight(sum.goal.kg, unitW())}</b><span>${sum.goal.pct}%</span></div><div class="bar"><i style="width:${sum.goal.pct}%"></i></div><p class="small muted">${sum.goal.toGo > 0 ? `${fmtLoss(sum.goal.toGo)} to go` : '🎉 Goal reached!'}</p></div>` : '<p class="small muted">Set a goal weight below to see a progress bar.</p>'}`;
    $('homeProgress').innerHTML = `<div class="row between"><h3>📉 Your progress</h3><button type="button" class="small" data-gotab="progress">See all</button></div>
      <div class="statgrid three"><div class="stat2"><small>Now</small><b>${fmtWeight(sum.current, unitW())}</b></div><div class="stat2 hl"><small>Lost</small><b>${sum.lost > 0 ? fmtLoss(sum.lost) : '0'}</b></div><div class="stat2"><small>% lost</small><b>${Math.max(0, sum.pct).toFixed(1)}%</b></div></div>
      ${w.length > 1 ? chartSVG(w, { goalKg: settings.goalKg, unit: unitW() === 'st' ? 'st' : unitW() === 'lb' ? 'lb' : 'kg', height: 120 }) : ''}
      ${sum.goal ? `<div class="bar"><i style="width:${sum.goal.pct}%"></i></div><p class="small muted">${sum.goal.pct}% of the way to your goal</p>` : ''}`;
  }
  $('progChart').innerHTML = w.length > 1 ? chartSVG(w, { goalKg: settings.goalKg, unit: unitW() === 'st' ? 'st' : unitW() === 'lb' ? 'lb' : 'kg', marks: store.get('injections', []).map(e => e.at) }) : '<p class="small muted">Your chart appears after 2 weigh-ins.</p>';
  $('milestoneList').innerHTML = sum ? sum.milestones.slice(0, 10).map(m => `<li class="${m.done ? 'done' : ''}">${m.done ? '🏅' : '⬜'} ${m.label}${m.done ? '' : ` <small class="muted">(${fmtLoss(Math.max(0, m.need - sum.lost))} to go)</small>`}</li>`).join('') : '<li class="muted">Milestones at 5%, 10%, every 5 kg and every stone.</li>';
  const sorted = sortEntries(w).reverse();
  $('weightList').innerHTML = sorted.length ? sorted.map((x, i) => { const p = sorted[i + 1], dd = p ? x.kg - p.kg : null;
    if (editingW === x.date) return `<li class="editing"><form class="wedit" novalidate data-date="${esc(x.date)}"><input name="v" type="text" inputmode="decimal" value="${esc(fmtWeight(x.kg, unitW()).replace(' kg', ''))}" aria-label="Weight"><input name="d" type="date" value="${localDay(new Date(x.date))}" max="${localDay()}" aria-label="Date"><input name="t" type="time" value="${new Date(x.date).toTimeString().slice(0, 5)}" aria-label="Time"><button class="primary">Save</button><button type="button" data-wcancel>Cancel</button></form></li>`;
    return `<li><span>${d(x.date)}<br><b>${fmtWeight(x.kg, unitW())}</b>${dd !== null ? ` <small class="muted">(${dd > 0 ? '+' : ''}${dd.toFixed(1)} kg)</small>` : ''}</span><span class="wbtns"><button type="button" data-wedit="${esc(x.date)}">Edit</button><button type="button" class="danger" data-wdel="${esc(x.date)}">Delete</button></span></li>`; }).join('') : '<li class="muted">No weigh-ins yet.</li>';
  $('goalInput').value ||= settings.goalKg ? fmtWeight(settings.goalKg, unitW()).replace(' kg', '') : ''; $('heightInput').value ||= settings.heightCm || '';
  document.querySelectorAll('[data-gotab]').forEach(b => b.onclick = () => { switchTab(b.dataset.gotab); scrollTo(0, 0); });
  renderBackupStatus(); if (typeof renderInject === 'function' && injReady) renderInject();
}
$('weightList').addEventListener('click', e => {
  const ed = e.target.closest('[data-wedit]'), del = e.target.closest('[data-wdel]'), cancel = e.target.closest('[data-wcancel]');
  if (ed) { editingW = ed.dataset.wedit; renderWeightProgress(); $('weightList').querySelector('.wedit input')?.focus(); }
  if (cancel) { editingW = null; renderWeightProgress(); }
  if (del) { if (!confirm('Delete this weigh-in?')) return; store.set('weights', store.get('weights', []).filter(x => x.date !== del.dataset.wdel)); toast('Weigh-in deleted'); renderProgress(); if (injReady) awardCerts(); }
});
$('weightList').addEventListener('submit', e => {
  e.preventDefault(); const f = e.target, r = parseWeightText(f.v.value, unitW()); if (!r.kg) return toast(r.error);
  const w = store.get('weights', []), it = w.find(x => x.date === f.dataset.date); if (!it) return;
  const wd = weighDate(f.d.value || localDay(new Date(it.date)), f.t?.value || new Date(it.date).toTimeString().slice(0, 5)); if (wd.error) return toast(wd.error);
  it.kg = r.kg; if (wd.iso !== it.date) { let iso = wd.iso; while (w.some(x => x !== it && x.date === iso)) iso = new Date(Date.parse(iso) + 1).toISOString(); it.date = iso; }
  store.set('weights', w); editingW = null; toast('✅ Weigh-in updated'); renderProgress(); if (injReady) awardCerts();
});
$('saveGoal').onclick = () => {
  const g = $('goalInput').value.trim(), h = $('heightInput').value.trim(); let err = '';
  if (g) { const r = parseWeightText(g, unitW()); if (r.kg) settings.goalKg = r.kg; else err = r.error; } else delete settings.goalKg;
  if (h) { const cm = parseFloat(h.replace(',', '.')); if (cm >= 100 && cm <= 250) settings.heightCm = cm; else err ||= 'Height should be in cm, e.g. 178.'; } else delete settings.heightCm;
  $('goalError').hidden = !err; $('goalError').textContent = err; store.set('settings', settings); if (!err) toast('Goal saved'); renderWeightProgress();
};
/* ---------- backup / restore ---------- */
const hasData = () => store.get('weights', []).length + store.get('sessions', []).length + Object.keys(store.get('food', {})).length > 0;
function renderBackupStatus() {
  const last = store.get('backupAt', null), p = window.__kova?.persisted;
  $('saveStatus').innerHTML = `✅ Saved on this phone${p === true ? ' · 🔒 Chrome has agreed to keep it (persistent storage)' : ''}${restoredFromIdb ? ` · ♻️ ${restoredFromIdb} item(s) restored from the backup copy` : ''}`;
  $('lastBackup').textContent = last ? `Last backup: ${new Date(last).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No backup file yet.';
  const due = backupDue(last, Date.now(), hasData()) && Date.now() - (store.get('backupNudgeAt', 0)) > 864e5;
  $('backupNudge').hidden = true; if (window.__noBackupNudge !== false) return; // cloud sync is the only backup
  $('backupNudge').innerHTML = due ? `💾 <b>Time for a backup?</b> It's been ${last ? 'over 2 weeks' : 'a while'}. Keep a copy of your weigh-ins safe in Drive or WhatsApp.<div class="row"><button type="button" class="primary" id="nudgeBackup">Back up now</button><button type="button" id="nudgeLater">Later</button></div>` : '';
  if (due) { $('nudgeBackup').onclick = () => doBackup(); $('nudgeLater').onclick = () => { store.set('backupNudgeAt', Date.now()); renderBackupStatus(); }; }
}
async function doBackup() {
  const b = makeBackup(k => store.get(k, null), { account: user ? { name: user.name } : null }), text = JSON.stringify(b, null, 1);
  const name = `glp1life-backup-${new Date().toISOString().slice(0, 10)}.json`, file = new File([text], name, { type: 'application/json' });
  let shared = false;
  try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'GLP1 Life backup', text: 'My GLP1 Life backup. Keep this file safe.' }); shared = true; } } catch (e) { if (e?.name === 'AbortError') return; }
  if (!shared) await saveBlob(file, name);
  store.set('backupAt', new Date().toISOString()); window.__kova.lastBackupText = text; toast(shared ? '💾 Backup shared' : '💾 Backup downloaded'); renderBackupStatus();
}
$('backupBtn').onclick = doBackup;
$('restoreBtn').onclick = () => $('restoreFile').click();
$('restoreFile').onchange = async e => {
  const f = e.target.files?.[0]; if (!f) return; const r = parseBackup(await f.text()); e.target.value = '';
  if (r.error) return toast(r.error);
  if (!confirm(`Restore backup from ${new Date(r.backup.created).toLocaleDateString('en-GB')}? Weigh-ins are merged; other data is replaced.`)) return;
  restoreInto(k => store.get(k, null), (k, v) => store.set(k, v), r.backup); toast('✅ Backup restored'); setTimeout(() => location.reload(), 800);
};
renderWeightProgress();

/* ---------- GLP-1 meal prep builder + live offers ---------- */
let offersData = null, pricesData = null, fullData = null, lidlPrices = null, lidlManual = null;
const glp = Object.assign({ store: 'aldi', days: 3, meals: 3, protein: 30, fussy: !!settings.fussy, gentle: false, veg: false, prefer: [], plan: null }, store.get('glp1', {}));
const saveGlp = () => store.set('glp1', glp);
async function loadOffers() {
  for (const [f, set] of [['data/offers.json', v => offersData = v], ['data/prices.json', v => pricesData = v], ['data/full-prices.json', v => fullData = v], ['data/lidl-prices.json', v => lidlPrices = v], ['data/lidl-manual.json', v => lidlManual = v]]) {
    try { const r = await fetch(`${f}?v=${Date.now()}`, { cache: 'no-store' }); if (r.ok) { const j = await r.json(); set(j); localStorage.setItem('reta.' + f, JSON.stringify(j)); continue; } } catch {}
    try { set(JSON.parse(localStorage.getItem('reta.' + f) || 'null')); } catch {}
  }
  renderPrices(); if (glp.plan) renderGlpPlan();
}
const offerUI = { aldi: true, lidl: true, lidlWeek: 0 };
const fmtUK = iso => iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' UK' : '?';
const storeLine = k => { const s = offersData?.stores?.[k]; return s ? `Live offers update daily at 00:30. Last checked: ${fmtUK(s.checked)}${s.status === 'stale' ? ' (latest check failed, showing last list)' : ''}.` : 'Offers couldn\'t load. Check your connection and reopen this page.'; };
function storeStatusText() { return ['aldi', 'lidl'].map(k => `${STORE_NAMES[k]}: ${storeLine(k)}`).join(' ') + ' Asda: typical prices.'; }
const offerCard = o => { const key = STAPLES.find(s => s.match.test(o.name) && !(s.exclude && s.exclude.test(o.name)))?.key;
  return `<div class="offer"><div class="otop"><span class="ostore ${o.store}">${STORE_NAMES[o.store]}</span><b>${esc(o.name)}</b></div>
  <div class="oprice"><b>${fmtGBP(o.price)}</b>${o.was ? ` <del>${fmtGBP(o.was)}</del>` : ''}${o.perKg ? ` <small>${fmtGBP(o.perKg)}/kg</small>` : ''}${o.size ? ` <small>· ${esc(o.size)}</small>` : ''}</div>
  <div class="small">${o.protein != null ? `<span class="pbadge ${isHighProtein(o) ? 'hp' : ''}">${o.protein} g protein /100 g</span>` : '<span class="muted">Protein: check label</span>'} ${o.promo ? `<span class="muted">· ${esc(o.promo)}</span>` : ''}${o.to ? ` <span class="muted">· until ${fmtChecked(o.to)}</span>` : ''}</div>
  <div class="row"><button type="button" class="primary" data-useoffer='${esc(JSON.stringify({ key, name: o.name, store: o.store, size: o.size }))}'>＋ Use in meal plan</button><a class="btnlink" href="${esc(o.url)}" target="_blank" rel="noopener">View ↗</a></div></div>`; };
function bindUseOffer(root) { root.querySelectorAll('[data-useoffer]').forEach(b => b.onclick = () => { const x = JSON.parse(b.dataset.useoffer);
  if (x.key) { glp.prefer = [...new Set([x.key, ...glp.prefer])].slice(0, 5); if (glp.store !== 'mix' && glp.store !== x.store) glp.store = 'mix'; saveGlp(); buildGlp(); toast(`✅ Plan rebuilt around ${x.name}`); switchTab('prep'); $('glpCard').scrollIntoView({ behavior: 'smooth' }); }
  else { if (!shop.extra.some(y => shopKey(y.item) === shopKey(x.name))) shop.extra.push({ item: `${x.name} (${STORE_NAMES[x.store]} offer)`, aisle: 'Proteins', pack: x.size }); saveShop(); renderShop(); toast('🛒 Added to your shopping list'); } }); }
function renderStoreOffers(k) {
  const el = $(k + 'Offers'); if (!el) return;
  $(k + 'Status').textContent = storeLine(k); $(k + 'Hp').checked = offerUI[k];
  let list = offersData ? offersFor(offersData, { store: k, highProtein: offerUI[k] }) : [], emptyMsg = '';
  if (k === 'lidl') {
    const wk = offerUI.lidlWeek, W = [0, 1].map(o => lidlWeek(new Date(), o));
    $('lidlWeeks').innerHTML = ['This week', 'Next week'].map((n, i) => `<button type="button" class="weekbtn ${wk === i ? 'on' : ''}" aria-pressed="${wk === i}" data-lweek="${i}"><b>${n}</b><small>${fmtDay(W[i].start)} to ${fmtDay(W[i].end)}</small></button>`).join('');
    $('lidlWeekRange').textContent = `${wk ? 'Next week' : 'This week'}: ${fmtDay(W[wk].start)} to ${fmtDay(W[wk].end)}`;
    list = lidlWeekOffers(list, W[wk], wk);
    if (wk === 1 && !lidlWeekOffers(offersData?.stores?.lidl?.items, W[1], 1).length) emptyMsg = `Next week's offers appear from ${fmtDay(W[0].start)} (Lidl publishes each week's leaflet a week ahead). They'll show here after the next 00:30 check.`;
    $('lidlWeeks').querySelectorAll('[data-lweek]').forEach(b => b.onclick = () => { offerUI.lidlWeek = +b.dataset.lweek; renderStoreOffers('lidl'); });
    renderLidlPrices();
  }
  $(k + 'OfferCount').textContent = offersData ? `${list.length} offer${list.length === 1 ? '' : 's'}${offerUI[k] ? ' (high protein)' : ''}` : '';
  el.innerHTML = list.length ? list.slice(0, 80).map(offerCard).join('') : `<p class="empty">${emptyMsg || (offersData ? (offerUI[k] ? 'No high-protein offers for this week. Untick "High protein only" to see all.' : 'No offers right now.') : 'Offers couldn\'t load.')}</p>`;
  bindUseOffer(el);
}
const lidlUI = { q: '' };
function renderLidlPrices() {
  const live = lidlPrices?.status === 'live' && lidlPrices.items?.length;
  $('lidlPriceStatus').textContent = live ? `${lidlPrices.items.length} Lidl products. Prices update daily at 00:30. Last checked: ${fmtUK(lidlPrices.checked)}.` : `Lidl only publishes offer prices online. We check every night at 00:30 and will add a full price list here if that changes${lidlPrices?.checked ? ` (last checked ${fmtUK(lidlPrices.checked)})` : ''}.`;
  $('lidlPriceBox').hidden = !live;
  if (live) { const q = lidlUI.q.trim().toLowerCase(), l = lidlPrices.items.filter(i => !q || i.name.toLowerCase().includes(q));
    $('lidlPriceList').innerHTML = l.length ? l.slice(0, 60).map(i => `<div class="offer"><div class="otop"><span class="ostore lidl">Lidl</span><b>${esc(i.name)}</b></div><div class="oprice"><b>${fmtGBP(i.price)}</b></div><div class="small">${histLine(i)}</div><div class="row"><a class="btnlink" href="${esc(i.url)}" target="_blank" rel="noopener">View ↗</a></div></div>`).join('') : '<p class="empty">No matches.</p>'; }
  const m = lidlManual?.items || [];
  $('lidlManual').innerHTML = m.length ? m.slice().sort((a, b) => String(b.date).localeCompare(a.date)).map(i => `<div class="row between small manualrow"><span><b>${esc(i.item)}</b>${i.size ? ` <span class="muted">· ${esc(i.size)}</span>` : ''}<br><span class="muted">${esc(i.source || 'shelf label')} · seen ${i.date ? fmtDay(i.date) : '?'}</span></span><b>${fmtGBP(+i.price)}</b></div>`).join('') : '<p class="empty">No in-store prices added yet.</p>';
}
$('lidlSearch').oninput = e => { lidlUI.q = e.target.value; renderLidlPrices(); };
for (const k of ['aldi', 'lidl']) $(k + 'Hp').onchange = e => { offerUI[k] = e.target.checked; renderStoreOffers(k); };
function renderOffers() { renderStoreOffers('aldi'); renderStoreOffers('lidl'); }
const priceUI = { q: '', cat: 'All' };
const histLine = i => i.last?.p != null ? (i.price < i.last.p ? `<span class="pbadge hp">⬇ was ${fmtGBP(i.last.p)} on ${fmtChecked(i.last.d)}</span>` : `<span class="muted">⬆ was ${fmtGBP(i.last.p)} on ${fmtChecked(i.last.d)}</span>`) : `<span class="muted">Last price ${fmtGBP(i.price)}, unchanged since ${fmtChecked(i.history?.[0]?.d)}</span>`;
const priceRow = i => `<div class="offer"><div class="otop"><span class="ostore aldi">Aldi</span><b>${esc(i.name)}</b></div><div class="oprice"><b>${fmtGBP(i.price)}</b>${i.was ? ` <del>${fmtGBP(i.was)}</del>` : ''}${i.perKg ? ` <small>${fmtGBP(i.perKg)}/kg</small>` : ''}${i.size ? ` <small>· ${esc(i.size)}</small>` : ''}</div>
  <div class="small">${i.protein != null ? `<span class="pbadge ${i.protein >= 10 ? 'hp' : ''}">${i.protein} g protein /100 g</span> ` : ''}${histLine(i)}</div><div class="row"><a class="btnlink" href="${esc(i.url)}" target="_blank" rel="noopener">View on Aldi ↗</a></div></div>`;
function renderAldiPrices(scroll) {
  const el = $('aldiPriceList'); if (!el) return;
  const a = fullData?.stores?.aldi, items = a?.items || [];
  $('aldiFullStatus').textContent = items.length ? `${items.length} Aldi products. Prices update daily at 00:30. Last checked: ${fmtUK(a.checked)}.` : 'Price list couldn\'t load. Check your connection and reopen this page.';
  const cats = ['All', ...new Set(items.map(i => i.cat))];
  $('aldiCats').innerHTML = cats.map(c => `<button type="button" class="chip ${priceUI.cat === c ? 'on' : ''}" aria-pressed="${priceUI.cat === c}" data-pcat="${esc(c)}">${esc(c)}</button>`).join('');
  const q = priceUI.q.trim().toLowerCase();
  const list = items.filter(i => (priceUI.cat === 'All' || i.cat === priceUI.cat) && (!q || `${i.name} ${i.brand || ''}`.toLowerCase().includes(q)));
  $('aldiPriceCount').textContent = items.length ? `${list.length} result${list.length === 1 ? '' : 's'}${priceUI.cat !== 'All' ? ` in ${priceUI.cat}` : ''}${q ? ` for "${priceUI.q.trim()}"` : ''}` : '';
  el.innerHTML = list.length ? list.slice(0, 60).map(priceRow).join('') + (list.length > 60 ? `<p class="small muted">Showing 60 of ${list.length}. Search or pick a category to narrow down.</p>` : '') : (items.length ? `<p class="empty">No matches.${priceUI.cat !== 'All' ? ' <button type="button" class="linkbtn" data-pcat="All">Search all categories</button>' : ''}</p>` : '');
  document.querySelectorAll('#aldiCats [data-pcat], #aldiPriceList [data-pcat]').forEach(b => b.onclick = () => { priceUI.cat = b.dataset.pcat; renderAldiPrices(true); });
  if (scroll) $('aldiPriceCount').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('aldiSearch').oninput = e => { priceUI.q = e.target.value; renderAldiPrices(); };
const cmpUI = { q: '' };
function renderCompare() {
  const el = $('cmpList'); if (!el) return;
  const q = cmpUI.q.trim().toLowerCase(), items = pricesData?.items || [];
  $('cmpStatus').textContent = `Aldi and Lidl update daily at 00:30 (last checked ${fmtUK(offersData?.stores?.aldi?.checked)}). Asda: typical price.`;
  const rows = items.filter(i => !q || i.name.toLowerCase().includes(q) || i.key.includes(q));
  el.innerHTML = rows.length ? rows.map(i => { const pr = { aldi: i.offers?.aldi?.price != null && i.offers.aldi.grams ? i.offers.aldi.price / i.offers.aldi.grams * i.pack : i.prices.aldi, lidl: i.offers?.lidl?.price != null && i.offers.lidl.grams ? i.offers.lidl.price / i.offers.lidl.grams * i.pack : i.prices.lidl, asda: i.prices.asda };
    const min = Math.min(...Object.values(pr).filter(v => v != null));
    const tag = { aldi: i.full?.aldi ? 'live' : (i.offers?.aldi ? 'offer' : 'typical'), lidl: i.offers?.lidl ? 'offer' : 'typical', asda: 'Typical price' };
    return `<div class="cmp"><b>${esc(i.name)}</b> <small class="muted">per ${i.pack >= 1000 ? i.pack / 1000 + ' kg' : i.pack + ' g'}</small><div class="cmprow">${['aldi', 'lidl', 'asda'].map(k => pr[k] == null ? '' : `<div class="cmpcell ${pr[k] === min ? 'best' : ''}"><span class="ostore ${k}">${STORE_NAMES[k]}</span><b>${fmtGBP(Math.round(pr[k] * 100) / 100)}</b><small>${tag[k]}</small></div>`).join('')}</div></div>`; }).join('') : '<p class="empty">No matching staples.</p>';
  const ql = q.length > 1 ? (fullData?.stores?.aldi?.items || []).filter(i => i.name.toLowerCase().includes(q)).slice(0, 10) : [];
  const lo = q.length > 1 ? (offersData?.stores?.lidl?.items || []).filter(i => i.name.toLowerCase().includes(q)).slice(0, 10) : [];
  $('cmpMore').innerHTML = q.length > 1 ? `<h3>Aldi shelf prices for "${esc(cmpUI.q.trim())}"</h3>${ql.length ? ql.map(priceRow).join('') : '<p class="empty">None found.</p>'}<h3>Lidl offers for "${esc(cmpUI.q.trim())}"</h3>${lo.length ? lo.map(offerCard).join('') : '<p class="empty">None on offer right now.</p>'}` : '';
  bindUseOffer($('cmpMore'));
}
$('cmpSearch').oninput = e => { cmpUI.q = e.target.value; renderCompare(); };
function renderPrices() { renderOffers(); renderAldiPrices(); renderCompare(); }
document.querySelectorAll('[data-gotab]').forEach(b => { if (['aldi', 'lidl', 'prices'].includes(b.dataset.gotab)) b.onclick = () => { if (sess) return toast('Finish or end the workout first'); switchTab(b.dataset.gotab); scrollTo(0, 0); }; });
function renderGlpForm() {
  $('glpStore').innerHTML = [['aldi', 'Aldi'], ['lidl', 'Lidl'], ['asda', 'Asda'], ['mix', 'Cheapest mix']].map(([k, n]) => `<button type="button" class="chip storechip ${glp.store === k ? 'on' : ''}" data-gstore="${k}" aria-pressed="${glp.store === k}">${glp.store === k ? '✓ ' : ''}${n}</button>`).join('');
  $('glpDays').value = glp.days; $('glpMeals').value = glp.meals; $('glpProt').value = glp.protein; $('glpProtVal').textContent = `${glp.protein} g`;
  $('glpFussy').checked = glp.fussy; $('glpGentle').checked = glp.gentle; $('glpVeg').checked = glp.veg;
  $('glpStore').querySelectorAll('[data-gstore]').forEach(b => b.onclick = () => { glp.store = b.dataset.gstore; saveGlp(); renderGlpForm(); buildGlp(); toast(`🛒 Store: ${b.textContent.replace('✓ ', '')}. Plan and prices updated`); });
}
for (const [id, k, num] of [['glpDays', 'days', 1], ['glpMeals', 'meals', 1], ['glpProt', 'protein', 1], ['glpFussy', 'fussy'], ['glpGentle', 'gentle'], ['glpVeg', 'veg']]) $(id).addEventListener(num ? 'input' : 'change', e => { glp[k] = num ? +e.target.value : e.target.checked; $('glpProtVal').textContent = `${glp.protein} g`; saveGlp(); });
function buildGlp() {
  // "Use in meal plan": treat preferred items as if on offer so recipes using them rank first.
  glp.plan = buildGlp1Plan({ ...glp, prices: pricesData, prefer: glp.prefer }); saveGlp(); renderGlpPlan();
}
function renderGlpPlan() {
  const p = glp.plan; if (!p) return $('glpPlan').innerHTML = '';
  const SL = { breakfast: '🌅 Breakfast', lunch: '🥗 Lunch', dinner: '🍲 Dinner', snack: '🍎 Snack' };
  const hit = p.plan.every(x => x.protein >= x.target - 3);
  $('glpPlan').innerHTML = `<div class="planhead"><b>${p.days}-day plan · ${STORE_NAMES[p.store] || 'Mix of stores'}</b><span>${hit ? '✅' : '⚠️'} ~${p.protein} g protein a meal</span></div>
    ${p.plan.map(x => `<div class="glpmeal"><div class="row between"><b>${SL[x.slot]}</b><small>${x.portions} portion${x.portions > 1 ? 's' : ''}</small></div><h4>${esc(x.recipe.name)}</h4>
      <div class="tags"><span class="pb">${x.protein} g protein</span><span>${x.kcal} kcal</span><span>${fmtGBP(x.costPerPortion)} a portion</span>${x.onOffer ? '<span class="v">Uses offers</span>' : ''}${x.recipe.gentle ? '<span>Gentle</span>' : ''}</div>
      <p class="small"><b>Per portion:</b> ${x.lines.map(l => `${esc(l.name.replace(/\s*\(.*\)$/, ''))} ${l.g} g`).join(', ')}</p>
      ${guideHTML(x.recipe)}</div>`).join('')}
    <details class="card"><summary><b>🗂️ Batch-cook order</b></summary><ul class="small">${BATCH_ORDER.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>
    <h3>🛒 Shopping list · total ${fmtGBP(p.total)}</h3>
    ${Object.entries(p.shop).map(([st, items]) => `<div class="aisle">${STORE_NAMES[st]}</div><ul class="shoplines">${items.map(i => `<li><span>${i.packs} × ${esc(i.name)}${i.offer ? ' <span class="pbadge hp">Offer</span>' : ''}<br><small class="muted">You need about ${i.need}${i.unit}</small></span><span><b>${fmtGBP(i.cost)}</b>${i.was ? `<br><del class="small">${fmtGBP(i.was * i.packs)}</del>` : ''}</span></li>`).join('')}</ul>`).join('')}
    <p class="small muted">${storeStatusText()}</p>
    <button type="button" id="glpToShop">＋ Add all to my shopping list</button>
    <details class="tips" open><summary><b>💡 GLP-1 eating tips</b></summary><ul class="small">${p.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>`;
  $('glpToShop').onclick = () => { for (const [st, items] of Object.entries(p.shop)) for (const i of items) { const item = `${i.name} (${STORE_NAMES[st]})`; if (!shop.extra.some(y => shopKey(y.item) === shopKey(item))) shop.extra.push({ item, aisle: STAPLE[i.key]?.core ? 'Proteins' : 'Tins & cupboard', pack: `${i.packs} × ${fmtGBP(i.price)}` }); } saveShop(); renderShop(); toast('🛒 Added to your shopping list'); };
}
$('glpBuild').onclick = () => { buildGlp(); toast('✨ GLP-1 plan built'); };
renderGlpForm(); renderGlpPlan(); loadOffers();
window.__kova.glp = glp; window.__kova.buildGlp = buildGlp;

/* ---------- Injection log (log only: no dose suggestions, maths or validation) ---------- */
const injDT = iso => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const localInput = d => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
$('injDisclaimer').textContent = '⚠️ ' + INJ_DISCLAIMER;
$('injMed').innerHTML = MEDS.map(m => `<option>${m}</option>`).join(''); $('injUnit').innerHTML = UNITS.map(u => `<option>${u}</option>`).join('');
$('injSite').innerHTML = '<option value="">Choose site</option>' + SITES.map(x => `<option>${x}</option>`).join('');
$('injEffects').innerHTML = EFFECTS.map(x => `<label class="check"><input type="checkbox" value="${x}"> ${x}</label>`).join('');
$('injMed').onchange = () => { $('injCustomWrap').hidden = $('injMed').value !== 'Other'; };
function injResetForm() {
  const l = sortInj(store.get('injections', [])), last = l[l.length - 1];
  if (last) { const known = MEDS.includes(last.med); $('injMed').value = known ? last.med : 'Other'; $('injCustom').value = known ? '' : last.med; $('injUnit').value = last.unit; }
  $('injCustomWrap').hidden = $('injMed').value !== 'Other';
  $('injDose').value = ''; $('injAt').value = localInput(new Date()); $('injSite').value = ''; $('injNotes').value = '';
  $('injEffects').querySelectorAll('input').forEach(c => c.checked = false);
}
function renderInject() {
  const l = sortInj(store.get('injections', [])), ls = lastSite(l), sch = store.get('injectSchedule', null);
  $('injLastSite').textContent = ls ? `(last used: ${ls}, try a different spot)` : '';
  $('injList').innerHTML = l.length ? l.slice().reverse().map(e => `<li><span>${injDT(e.at)}<br><b>${esc(e.med)}${e.dose ? ` · ${esc(e.dose)} ${esc(e.unit)}` : ''}</b>${e.site ? `<br><small>${esc(e.site)}</small>` : ''}${e.effects?.length ? `<br><small class="muted">${esc(e.effects.join(', '))}</small>` : ''}${e.notes ? `<br><small class="muted">${esc(e.notes)}</small>` : ''}</span><span class="wbtns"><button type="button" class="danger" data-injdel="${esc(e.id)}">Delete</button></span></li>`).join('') : '<li class="muted">No injections logged yet.</li>';
  if (sch) { $('injSchedType').value = sch.type; $('injWeekday').value = sch.weekday ?? 1; $('injDays').value = sch.days ?? 7; $('injTime').value = sch.time; }
  $('injWdWrap').hidden = $('injSchedType').value !== 'weekly'; $('injDaysWrap').hidden = $('injSchedType').value !== 'every'; $('injIcs').hidden = !$('injSchedType').value;
  const nd = nextDue(sch, l), due = isDue(sch, l);
  $('injNext').hidden = !sch && !l.length; $('injNext').classList.toggle('due', due);
  $('injNext').innerHTML = `<h3>💉 ${due ? 'Injection due' : 'Next injection'}</h3><p>${nd ? `<b>${injDT(nd.toISOString())}</b> · ${describeSchedule(sch)}` : 'No reminder set.'}${l.length ? `<br><small class="muted">Last: ${injDT(l[l.length - 1].at)}${lastSite(l) ? ` · ${esc(lastSite(l))}` : ''}</small>` : ''}</p><p class="small muted">${INJ_DISCLAIMER}</p><button type="button" class="primary" data-gotab="progress" id="injGo">Log an injection</button>`;
  $('injGo').onclick = () => { switchTab('progress'); $('injCard').scrollIntoView(); };
  $('injNotifyStatus').textContent = !('Notification' in window) ? 'This browser can\'t show notifications. Use Add to calendar.' : Notification.permission === 'granted' ? `Notifications on${'showTrigger' in Notification.prototype ? ' (scheduled)' : ': you\'ll be reminded when you open the app, and in the background where Chrome allows'}. For a reminder that always fires, also tap Add to calendar.` : Notification.permission === 'denied' ? 'Notifications are blocked for this site in Chrome. Use Add to calendar instead.' : 'Saving a reminder asks for notification permission. For a reminder that always fires on Android, also tap Add to calendar.';
}
$('injSchedType').onchange = () => { $('injWdWrap').hidden = $('injSchedType').value !== 'weekly'; $('injDaysWrap').hidden = $('injSchedType').value !== 'every'; $('injIcs').hidden = !$('injSchedType').value; };
$('injForm').onsubmit = e => {
  e.preventDefault(); const at = $('injAt').value ? new Date($('injAt').value) : new Date();
  const entry = makeEntry({ med: $('injMed').value, custom: $('injCustom').value, dose: $('injDose').value, unit: $('injUnit').value, at, site: $('injSite').value, effects: [...$('injEffects').querySelectorAll('input:checked')].map(c => c.value), notes: $('injNotes').value });
  store.set('injections', [...store.get('injections', []), entry]); toast('✅ Injection logged'); injResetForm(); renderWeightProgress(); scheduleInjNotify();
};
$('injList').addEventListener('click', e => { const b = e.target.closest('[data-injdel]'); if (!b || !confirm('Delete this injection entry?')) return; store.set('injections', store.get('injections', []).filter(x => x.id !== b.dataset.injdel)); renderWeightProgress(); scheduleInjNotify(); });
const readSched = () => { const t = $('injSchedType').value; return t ? { type: t, weekday: +$('injWeekday').value, days: Math.max(1, +$('injDays').value || 7), time: $('injTime').value || '09:00' } : null; };
$('injSaveSched').onclick = async () => {
  const sch = readSched(); store.set('injectSchedule', sch);
  if (sch && 'Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} }
  await scheduleInjNotify(); renderInject(); toast(sch ? `⏰ Reminder saved: ${describeSchedule(sch)}` : 'Reminder off');
};
$('injIcs').onclick = () => { const sch = readSched(); if (!sch) return; const blob = new Blob([makeICS(sch)], { type: 'text/calendar' }); saveBlob(blob, 'glp1life-injection-reminder.ics').then(r => r.saved !== 'browser' && r.share()); window.__kova.lastIcs = makeICS(sch); toast('📅 Open the file to add the repeating reminder to your calendar'); };
// Reminders: SW notification now if due (on app open), Notification Triggers where supported, Periodic Background Sync fallback.
async function scheduleInjNotify() {
  const sch = store.get('injectSchedule', null), l = store.get('injections', []), nd = nextDue(sch, l);
  await idbSet('reta.injectNext', nd ? JSON.stringify({ at: nd.getTime(), text: describeSchedule(sch) }) : 'null');
  if (!nd || !('Notification' in window) || Notification.permission !== 'granted' || !navigator.serviceWorker) return;
  try {
    const reg = await navigator.serviceWorker.ready, opts = { body: `${INJ_DISCLAIMER} Tap to log it.`, tag: 'reta-inject', icon: 'icons/any-192.png', data: { url: './?tab=progress' } };
    if (nd <= new Date()) { const shownFor = store.get('injNotified', 0); if (shownFor !== nd.getTime()) { await reg.showNotification('💉 Injection reminder', opts); store.set('injNotified', nd.getTime()); } }
    else if ('showTrigger' in Notification.prototype && typeof TimestampTrigger !== 'undefined') await reg.showNotification('💉 Injection reminder', { ...opts, showTrigger: new TimestampTrigger(nd.getTime()) });
    if ('periodicSync' in reg) { try { await reg.periodicSync.register('reta-inject', { minInterval: 12 * 36e5 }); } catch {} }
  } catch {}
}
injReady = true; injResetForm(); renderInject(); renderWeightProgress(); scheduleInjNotify();
if (new URLSearchParams(location.search).get('tab') === 'progress') setTimeout(() => switchTab('progress'), 0);
window.__kova.renderInject = renderInject;

/* ---------- Weight-loss certificates ---------- */
let avatarImg = null;
function loadAvatar() { if (avatarImg) return Promise.resolve(avatarImg); return new Promise(res => { const i = new Image(); i.onload = () => res(avatarImg = i); i.onerror = () => res(null); i.src = 'icons/any-512.png'; }); }
async function certBlob(c) { const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350; drawCertificate(cv.getContext('2d'), c, { avatar: await loadAvatar() }); return new Promise(r => cv.toBlob(r, 'image/png')); }
const certName = c => `glp1life-certificate-${c.id}-${localDay(new Date(c.date))}.png`;
// Toast with an action button (e.g. "Saved to Downloads" + Share).
function actionToast(t, label, fn, ms = 7000) { const el = $('toast'); el.innerHTML = ''; el.append(Object.assign(document.createElement('span'), { textContent: t })); const b = Object.assign(document.createElement('button'), { type: 'button', className: 'toastbtn', textContent: label }); b.onclick = () => { el.hidden = true; fn(); }; el.append(b); el.classList.add('hasbtn'); el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, ms); }
async function downloadCert(c) {
  try { const b = await certBlob(c), meta = { title: c.label, text: `${c.label} with GLP1 Life!` }, r = await saveBlob(b, certName(c), meta); window.__kova.lastCertBytes = b.size; window.__kova.lastCertSave = r.saved;
    const msg = r.saved === 'Downloads' ? '✅ Saved to Downloads' : r.saved === 'Documents' ? '✅ Saved to Documents' : r.saved === 'browser' ? '✅ Certificate downloaded' : 'Couldn\'t save. Try Share instead';
    actionToast(msg, '📤 Share', () => shareBlob(b, certName(c), meta).catch(e => toast('Share failed: ' + e.message)));
  } catch (e) { toast('Save failed: ' + (e?.message || e)); } }
async function shareCert(c) { try { const r = await shareBlob(await certBlob(c), certName(c), { title: c.label, text: `${c.label} with GLP1 Life!` }); if (r === 'downloaded') toast('✅ Certificate downloaded'); } catch (e) { toast('Share failed: ' + (e?.message || e)); } }
function awardCerts() {
  const w = sortEntries(store.get('weights', [])); if (w.length < 2) return [];
  const old = store.get('certificates', []), certs = redateCerts(old, w, settings.goalKg), fresh = awardsFromHistory(certs, w, settings.goalKg, { name: settings.name });
  if (!fresh.length) { if (JSON.stringify(certs) !== JSON.stringify(old)) { store.set('certificates', certs); renderCerts(); } return []; }
  store.set('certificates', [...certs, ...fresh]); renderCerts(); celebrate(fresh[fresh.length - 1], fresh.length); return fresh;
}
async function celebrate(c, n) {
  $('celebTitle').textContent = `🎉 ${c.label}`; $('celebText').textContent = n > 1 ? `You earned ${n} new certificates! They're saved in Progress › My certificates.` : 'You earned a new certificate. It\'s saved in Progress › My certificates.';
  $('celebImg').src = URL.createObjectURL(await certBlob(c)); $('celebrate').hidden = false;
  $('celebDl').onclick = () => downloadCert(c); $('celebShare').onclick = () => shareCert(c);
}
$('celebClose').onclick = () => { $('celebrate').hidden = true; };
function renderCerts() {
  const l = store.get('certificates', []);
  $('certList').innerHTML = l.length ? l.slice().reverse().map(c => `<div class="cert"><b>🏆 ${esc(c.label)}</b><small class="muted">${new Date(c.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · ${c.startKg.toFixed(1)} → ${c.currentKg.toFixed(1)} kg</small><div class="row"><button type="button" data-certdl="${esc(c.id)}">⬇️ Download</button><button type="button" data-certsh="${esc(c.id)}">📤 Share</button></div></div>`).join('') : '<p class="small muted">Your first certificate comes at 2 lb (about 0.9 kg) lost. Keep logging weigh-ins!</p>';
}
$('certList').addEventListener('click', e => { const d = e.target.closest('[data-certdl]'), s2 = e.target.closest('[data-certsh]'), find = id => store.get('certificates', []).find(c => c.id === id); if (d) downloadCert(find(d.dataset.certdl)); if (s2) shareCert(find(s2.dataset.certsh)); });
renderCerts();
window.__kova.awardCerts = awardCerts;

/* ---------- Cooking guides + Cook mode ---------- */
function guideHTML(r) {
  const g = guideFor(r.id); if (!g) return '';
  return `<details class="guide"><summary>👩‍🍳 <b>Cooking guide</b> · ${g.prep} min prep${g.cook ? ` + ${g.cook} min cook` : ', no cooking'}</summary>
    <div class="gtimes"><span>⏱️ Prep ${g.prep} min</span><span>🔥 Cook ${g.cook} min</span><span>Total ${g.total} min</span></div>
    ${g.ovenText ? `<p class="oven">🔥 <b>Oven:</b> ${g.ovenText}</p>` : ''}
    <ol class="gsteps">${g.steps.map(st => `<li>${esc(st.t)}${stepText(st) ? `<br><small class="muted">${esc(stepText(st))}</small>` : ''}${st.timer ? ` <small class="tchip">⏲️ ${fmtTimer(st.timer)}</small>` : ''}</li>`).join('')}</ol>
    <p class="safe">🌡️ <b>Safe to eat:</b> ${esc(g.safe)}<br>♨️ ${esc(g.reheat)}</p>
    <p class="small muted">${esc(THERMO_TIP)}</p>
    <details><summary class="small"><b>🧊 Meal prep safety</b></summary><ul class="small">${COOK_SAFETY.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>
    <details><summary class="small"><b>💊 GLP-1-friendly cooking</b></summary><ul class="small">${GLP1_NOTES.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>
    <button type="button" class="primary big" data-cook="${esc(r.id)}">👩‍🍳 Start Cook mode</button></details>`;
}
const cook = { id: null, i: 0, lock: null, timer: null, left: 0, name: '' };
async function wake(on) { try { if (on && 'wakeLock' in navigator) { cook.lock = await navigator.wakeLock.request('screen'); window.__kova.wakeLock = true; } else if (!on && cook.lock) { await cook.lock.release(); cook.lock = null; window.__kova.wakeLock = false; } } catch { window.__kova.wakeLock = false; } }
document.addEventListener('visibilitychange', () => { if (cook.id && document.visibilityState === 'visible' && !cook.lock) wake(true); });
function openCook(id, name) { const prog = store.get('cookProgress', {}), g0 = guideFor(id); Object.assign(cook, { id, i: Math.min(prog[id]?.i || 0, (g0?.steps?.length || 1) - 1), name }); if (cook.i) toast(`Resuming at step ${cook.i + 1}`); $('cookMode').hidden = false; wake(true); renderCook(); }
function stopTimer() { clearInterval(cook.timer); cook.timer = null; }
function renderCook() {
  { const p = store.get('cookProgress', {}); if (p[cook.id]?.i !== cook.i) { p[cook.id] = { i: cook.i, at: new Date().toISOString() }; store.set('cookProgress', p); } }
  const g = guideFor(cook.id), st = g.steps[cook.i], last = cook.i === g.steps.length - 1;
  $('cookMode').innerHTML = `<div class="cookhead"><b>${esc(cook.name)}</b><button type="button" id="cookClose">✕ Close</button></div>
    <div class="cookprog">Step ${cook.i + 1} of ${g.steps.length}</div>
    <p class="cookstep">${esc(st.t)}</p>${stepText(st) ? `<p class="cookheat">${esc(stepText(st))}</p>` : ''}
    ${st.timer ? `<div class="cooktimer"><span id="cookTime">${fmtTimer(cook.timer ? cook.left : st.timer)}</span><button type="button" class="primary big" id="cookTimerBtn">${cook.timer ? '⏸ Stop timer' : '▶️ Start timer'}</button></div>` : ''}
    ${last ? `<p class="safe">🌡️ ${esc(g.safe)}</p>` : ''}
    <p class="small muted">${cook.lock ? '🔆 Screen will stay on while cooking' : 'Tip: your screen may dim; tap to wake it'}</p>
    <div class="cooknav"><button type="button" class="big" id="cookPrev" ${cook.i ? '' : 'disabled'}>◀ Back</button><button type="button" class="primary big" id="cookNext">${last ? '✅ Done' : 'Next ▶'}</button></div>`;
  $('cookClose').onclick = closeCook;
  $('cookPrev').onclick = () => { stopTimer(); cook.i--; renderCook(); };
  $('cookNext').onclick = () => { stopTimer(); if (last) { const p = store.get('cookProgress', {}); delete p[cook.id]; store.set('cookProgress', p); closeCook(); toast('🎉 Cooked! Cool, box and label it.'); } else { cook.i++; renderCook(); } };
  if (st.timer) $('cookTimerBtn').onclick = () => { if (cook.timer) { stopTimer(); renderCook(); return; } cook.left = st.timer; cook.timer = setInterval(() => { cook.left--; const el = $('cookTime'); if (el) el.textContent = fmtTimer(Math.max(0, cook.left)); if (cook.left <= 0) { stopTimer(); try { navigator.vibrate?.([300, 150, 300]); } catch {} beepDone(); toast('⏲️ Timer done!'); renderCook(); } }, 1000 / SPEED); renderCook(); };
}
function beepDone() { try { const a = new AudioContext(), o = a.createOscillator(), gn = a.createGain(); o.connect(gn); gn.connect(a.destination); o.frequency.value = 880; gn.gain.value = .2; o.start(); o.stop(a.currentTime + .6); } catch {} }
function closeCook() { stopTimer(); wake(false); cook.id = null; $('cookMode').hidden = true; }
document.addEventListener('click', e => { const b = e.target.closest('[data-cook]'); if (!b) return; const r = [...PREP_RECIPES, ...GLP1_RECIPES_ALL].find(x => x.id === b.dataset.cook); openCook(b.dataset.cook, r?.name || 'Cook mode'); });
window.__kova.openCook = openCook;

/* ================= GLP1 Life screens ================= */
const ICO = { breakfast: ['🥣', '#fde9d9'], lunch: ['🥗', '#e3f4e6'], dinner: ['🍲', '#f6e3d3'], snack: ['🍎', '#fbe4e4'] };
const KG_LB = 2.20462, stlb = kg => { const lb = Math.round(kg * KG_LB); return `${Math.floor(lb / 14)} st ${lb % 14} lb`; };
const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
function weekStartISO() { const d = new Date(todayKey() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); }
function ringSVG(pct) { const r = 50, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct)); return `<svg class="wring" viewBox="0 0 120 120" role="img" aria-label="${p}% to goal"><circle cx="60" cy="60" r="${r}" fill="none" stroke="#e6f5ec" stroke-width="12"/><circle cx="60" cy="60" r="${r}" fill="none" stroke="#2e9d5b" stroke-width="12" stroke-linecap="round" stroke-dasharray="${c * p / 100} ${c}" transform="rotate(-90 60 60)"/><text x="60" y="68" text-anchor="middle">${p}%</text></svg>`; }
function renderHome() {
  if (!$('homeDash')) return;
  const h = +new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hour12: false });
  $('greet').textContent = `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}, ${settings.name || 'there'} 🌿`;
  const w = sortEntries(store.get('weights', [])), cur = w.length ? w[w.length - 1].kg : null, start = w.length ? w[0].kg : null, goal = settings.goalKg || null;
  const pct = cur != null && goal && start > goal ? Math.round((start - cur) / (start - goal) * 100) : 0, lbsDown = cur != null ? Math.max(0, Math.round((start - cur) * KG_LB)) : 0;
  $('wCard').innerHTML = `<div class="wrow"><div><small>Current weight</small><b>${cur != null ? stlb(cur) : '–'}</b><small>${cur != null ? cur.toFixed(1) + ' kg' : 'Log a weigh-in'}</small></div><div style="text-align:right"><small>Goal</small><b>${goal ? stlb(goal) : '–'}</b><small>${goal ? goal.toFixed(1) + ' kg' : 'Set in Track'}</small></div></div>
    <div class="ringrow">${ringSVG(pct)}<div class="down"><b>${lbsDown} lbs</b><span>down</span><p class="small muted">${w.length ? `Since ${new Date(w[0].date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</p></div></div>`;
  $('wCard').onclick = () => switchTab('progress');
  const day = store.get('daily', {}), t = day[todayKey()] || {};
  { const ml = waterMl(t), goal = settings.waterGoalMl || DEFAULT_GOAL_ML, pct = Math.min(100, Math.round(ml / goal * 100));
    $('waterCard').innerHTML = `<div class="wtop"><i>💧</i><span><small>Hydration</small><b id="waterL">${litres(ml)} / ${litres(goal)} L</b><small id="waterImp">${imperial(ml)}</small></span></div><div class="bar"><i style="width:${pct}%"></i></div><div class="wbtns2"><button type="button" id="waterMinus" aria-label="Remove 500 ml" ${ml ? '' : 'disabled'}>−500 ml</button><button type="button" class="primary" id="waterPlus" aria-label="Add 500 ml">+500 ml</button></div>`;
    const bump = delta => { const d = store.get('daily', {}), x = d[todayKey()] ||= {}; const v = addWater(x, delta); store.set('daily', d); renderHome(); toast(delta > 0 ? `💧 +500 ml · ${litres(v)} L today` : `↩️ Removed 500 ml · ${litres(v)} L today`); };
    $('waterPlus').onclick = () => bump(STEP_ML); $('waterMinus').onclick = () => bump(-STEP_ML); }
  $('stepsCard').innerHTML = `<i>👣</i><span><small>Steps</small><b>${(t.steps || 0).toLocaleString('en-GB')}</b><small>of 10,000 · ${t.stepsSrc ? 'from ' + t.stepsSrc : 'tap to sync or add'}</small></span>`;
  $('stepsCard').onclick = () => openStepsSheet(); window._manualSteps = () => { const v = prompt('Steps today (from your phone\'s health app):', t.steps || ''); if (v == null) return; const n = parseInt(String(v).replace(/\D/g, ''), 10); if (isNaN(n)) return; const d = store.get('daily', {}); (d[todayKey()] ||= {}).steps = n; store.set('daily', d); renderHome(); };
  const sch = store.get('injectSchedule', null), l = store.get('injections', []), last = l.length ? sortInjL(l).at(-1) : null, nd = nextDue(sch, l);
  $('nextInjCard').innerHTML = `<div class="row between"><div><h3>💉 Next injection</h3><p style="margin:0"><b>${esc(last ? (last.med === 'Other' ? last.custom || 'Medication' : last.med) : 'No injections logged')}</b>${last?.dose ? `<br>${esc(last.dose)} ${esc(last.unit || '')} <small class="muted">(your last logged dose)</small>` : ''}</p>
    <p class="small" style="margin:6px 0 0">📅 ${nd ? nd.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'No reminder set'}</p></div>
    <button type="button" class="primary" id="setRemBtn">${sch ? 'Edit reminder' : 'Set reminder'}</button></div><p class="small muted" style="margin:6px 0 0">Log only. Follow your GP or prescriber's instructions.</p>`;
  $('setRemBtn').onclick = e => { e.stopPropagation(); switchTab('progress'); setTimeout(() => ($('injSchedule') || $('injCard'))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); };
  const ws = weekStartISO(), inWeek = iso => iso && iso.slice(0, 10) >= ws, wk = store.get('weekChecks', {})[ws] || {};
  const water = Object.entries(store.get('daily', {})).some(([d, v]) => d >= ws && waterMl(v) >= 1500);
  const checks = [['inject', 'Inject', l.some(e => inWeek(e.at))], ['weigh', 'Weigh', w.some(x => inWeek(x.date))], ['water', 'Water', water || !!wk.water], ['meals', 'Meals', !!glp.plan || !!wk.meals], ['mindset', 'Mindset', !!wk.mindset]];
  $('weekChecks').innerHTML = checks.map(([k, n, d]) => `<button type="button" class="wck ${d ? 'done' : ''}" data-wck="${k}" aria-pressed="${d}"><i>${d ? '✓' : ''}</i>${n}</button>`).join('');
  $('weekChecks').querySelectorAll('[data-wck]').forEach(b => b.onclick = () => { const k = b.dataset.wck; if (k === 'inject') return switchTab('progress'); if (k === 'weigh') return switchTab('progress'); const all = store.get('weekChecks', {}), x = all[ws] ||= {}; x[k] = !x[k]; store.set('weekChecks', all); renderHome(); });
  const F = [['💉', 'Injection Tracker', 'progress', 'injCard'], ['⚖️', 'Weigh In Tracker', 'progress', 'progSummary'], ['🎓', 'GLP1 Life Classes', 'classes'], ['🍱', 'Meal Plan Builder', 'prep'], ['📖', 'Recipes with Instructions', 'prep', 'prepSections'], ['⏱️', 'Cooking Time', 'prep', 'prepSections'], ['🛒', 'Compare Prices', 'prices'], ['🏷️', 'Search Offers & Save', 'aldi'], ['📈', 'Track Progress & Insights', 'progress'], ['👥', 'Support Community', 'classes', 'supportCards'], ['🏋️', 'Personal Trainers', 'trainers']];
  $('features').innerHTML = F.map(([i, n, t, sc]) => `<button type="button" class="feat" data-ftab="${t}" ${sc ? `data-fsc="${sc}"` : ''}><i>${i}</i>${n}</button>`).join('');
  $('features').querySelectorAll('[data-ftab]').forEach(b => b.onclick = () => { if (sess) return; switchTab(b.dataset.ftab); const sc = b.dataset.fsc; sc ? setTimeout(() => $(sc)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60) : scrollTo(0, 0); });
}
const sortInjL = l => l.slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
// Track: segment tabs + body site map
document.querySelectorAll('#trackSeg [data-seg]').forEach(b => b.onclick = () => { document.querySelectorAll('#trackSeg button').forEach(x => x.classList.toggle('on', x === b)); $(b.dataset.seg)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
function renderBodySites() {
  if (!$('bodyFig')) return;
  const since = Date.now() - 56 * 864e5, l = store.get('injections', []).filter(e => Date.parse(e.at) >= since), n = s => l.filter(e => e.site === s).length;
  const z = (s, path) => `<path d="${path}" fill="${n(s) ? `rgba(91,42,134,${Math.min(.85, .25 + n(s) * .15)})` : 'rgba(46,157,91,.12)'}" stroke="#5b2a86" stroke-width="1"><title>${s}: ${n(s)}</title></path>`;
  const body = '<path d="M50 8a10 10 0 1 1 0 20a10 10 0 1 1 0-20M34 32h32l8 40-8 4-4-26v40l4 50h-12l-4-46-4 46H34l4-50V50l-4 26-8-4z" fill="#f3eefa" stroke="#bfb2d3"/>';
  const fig = (title, inner) => `<div><svg viewBox="0 0 100 160">${body}${inner}</svg><small>${title}</small></div>`;
  $('bodyFig').innerHTML = `<div class="bodyfig">${fig('Stomach', z('Abdomen left', 'M51 56h12v18H51z') + z('Abdomen right', 'M37 56h12v18H37z'))}${fig('Arms', z('Arm right', 'M27 44l6-6 2 22-6 4z') + z('Arm left', 'M73 44l-6-6-2 22 6 4z'))}${fig('Thighs', z('Thigh right', 'M38 92h10v24H38z') + z('Thigh left', 'M52 92h10v24H52z'))}</div>
    <p class="small muted">${l.length ? `Last site: <b>${esc(sortInjL(l).at(-1).site || 'not recorded')}</b>. Shaded = logged in the last 8 weeks.` : 'No injections logged in the last 8 weeks.'}</p>`;
}
// Classes & support
const SUPPORT = [
  ['🧭', 'GLP-1 Basics for New Users', 'How GLP-1 medicines work, what to expect in the first weeks, and questions to ask your prescriber.', ['GLP-1 medicines (such as semaglutide, tirzepatide and, in trials, retatrutide) mimic gut hormones that reduce appetite and slow stomach emptying.', 'Early weeks: smaller appetite, feeling full quickly, sometimes nausea. These often ease as your body adjusts.', 'Your prescriber decides your dose and when it changes. This app never gives dosing advice.', 'Ask your GP or prescriber: what side effects should I report, and how should I store my pens?']],
  ['🩺', 'Managing Side Effects', 'Practical tips for nausea, constipation and low energy.', ['Eat slowly, stop at the first sign of fullness, and choose smaller meals.', 'Bland, lower-fat foods (toast, rice, chicken, yoghurt) are often easier when queasy.', 'Sip water through the day: aim for 6–8 glasses. Add fibre gradually for constipation.', 'Seek urgent help for severe tummy pain, persistent vomiting or signs of dehydration, and tell your GP or prescriber about anything that worries you.']],
  ['🥗', 'Nutrition for GLP-1', 'Protein first, high-fibre and balanced meals.', ['Aim for protein at every meal (around 25–40 g) to help protect muscle.', 'Fill half your plate with veg or salad; add a fist of carbs if you can manage it.', 'Use the Meal Plan Builder for high-protein, small-portion ideas with Aldi, Lidl and Asda prices.']],
  ['🧠', 'Mindset & Motivation', 'Build healthy habits that last.', ['Track small wins: weigh-ins, water, steps and workouts all count.', 'Expect plateaus; they are normal. Focus on the trend, not one day.', 'Tick "Mindset" on your Home screen each week you take time to reflect.']],
  ['👥', 'Member Community', 'Connect with others on the same journey.', ['A members\' community is coming soon. For now, share progress with friends using your milestone certificates.']]];
function renderSupport() {
  if (!$('supportCards')) return;
  $('supportCards').innerHTML = SUPPORT.map(([i, t, d], k) => `<div class="card scard"><div class="sic">${i}</div><div><h3>${t}</h3><p class="small muted">${d}</p></div><button type="button" class="primary" data-sup="${k}">${k === 4 ? 'Join' : 'Open'}</button></div>`).join('');
  $('supportCards').querySelectorAll('[data-sup]').forEach(b => b.onclick = () => { const [i, t, d, pts] = SUPPORT[+b.dataset.sup]; openSheet(`<div class="rhero" style="background:var(--lav)">${i}</div><div class="rbody"><h2>${t}</h2><p class="muted">${d}</p><ul>${pts.map(p => `<li>${esc(p)}</li>`).join('')}</ul>${+b.dataset.sup === 4 ? '<button type="button" class="primary big" disabled>Coming soon</button>' : ''}<p class="small muted">General information only, not medical advice. Check with your GP or prescriber.</p></div>`); });
}
function openSheet(html) { $('recipeBody').innerHTML = html; $('recipeModal').hidden = false; $('recipeModal').scrollTop = 0; }
$('recipeClose').onclick = () => { $('recipeModal').hidden = true; }; $('recipeModal').onclick = e => { if (e.target.id === 'recipeModal') $('recipeModal').hidden = true; };
// Meals: My Plan
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const mp = Object.assign({ min: 1200, max: 1800, focus: 'High protein', day: (new Date().getDay() + 6) % 7, seed: 1, added: [] }, store.get('myPlan', {}));
const saveMp = () => store.set('myPlan', mp);
const LOWCARB_OUT = /oats|rice|pasta|potato|lentil|chickpea|bread|wrap/;
function dayMeals(d) {
  const target = (mp.min + mp.max) / 2, slots = ['breakfast', 'lunch', 'dinner', 'snack'], share = { breakfast: .25, lunch: .3, dinner: .33, snack: .12 };
  return slots.map((slot, si) => { let pool = GLP1_RECIPES_ALL.filter(r => r.meal === slot); if (mp.focus === 'Low carb') { const p = pool.filter(r => !r.ing.some(([k]) => LOWCARB_OUT.test(k))); if (p.length) pool = p; }
    if (mp.focus === 'High protein') pool = pool.slice().sort((a, b) => STAPLE[b.core].protein - STAPLE[a.core].protein);
    const added = mp.added.map(id => GLP1_RECIPES_ALL.find(r => r.id === id)).filter(r => r?.meal === slot);
    const r = added.length && d % 2 === 0 ? added[(d / 2) % added.length | 0] : pool[(d + mp.seed + si) % pool.length];
    const f = fitPortion(r, slot === 'snack' ? 15 : mp.focus === 'High protein' ? 32 : 26); const scale = Math.max(.6, Math.min(1.4, target * share[slot] / Math.max(1, f.kcal)));
    return { slot, r, kcal: Math.round(f.kcal * scale / 10) * 10, protein: Math.round(f.protein * scale) }; });
}
function renderMyPlan() {
  if (!$('myPlan')) return;
  const ms = dayMeals(mp.day), tot = ms.reduce((s, m) => s + m.kcal, 0), pro = ms.reduce((s, m) => s + m.protein, 0);
  $('myPlan').innerHTML = `<div class="row between"><b>Calorie range</b><span class="muted small">daily guide</span></div><p class="kcal"><b id="kcalVal">${mp.min.toLocaleString('en-GB')} – ${mp.max.toLocaleString('en-GB')}</b> kcal</p>
    <div class="calrange"><label class="small">Min<input type="range" id="kMin" min="1000" max="2200" step="50" value="${mp.min}"></label><label class="small">Max<input type="range" id="kMax" min="1100" max="2600" step="50" value="${mp.max}"></label></div>
    <div class="focus" id="focusChips">${['High protein', 'Low carb', 'Balanced'].map(f => `<button type="button" class="${mp.focus === f ? 'on' : ''}" data-focus="${f}">${f}</button>`).join('')}</div>
    <h3>Your meal plan</h3><div class="dayt" id="dayTabs">${DAYS.map((d, i) => `<button type="button" class="${mp.day === i ? 'on' : ''}" data-day="${i}">${d}</button>`).join('')}</div>
    <div id="mealList">${ms.map(m => `<button type="button" class="meal" data-recipe="${m.r.id}" data-kcal="${m.kcal}" data-prot="${m.protein}"><span class="mimg" style="background:${ICO[m.slot][1]}">${ICO[m.slot][0]}</span><span><small style="text-transform:capitalize;font-weight:700;color:var(--txt)">${m.slot}</small><b>${esc(m.r.name)}</b><small>${m.kcal} kcal | ${m.protein}g protein</small></span></button>`).join('')}</div>
    <p class="small muted">Day total about ${tot} kcal, ${pro} g protein. Eat to appetite; smaller portions are fine on GLP-1 medicines.</p>
    <button type="button" class="greenbtn big" id="genPlan">Generate New Meal Plan</button>`;
  const upd = () => { let a = +$('kMin').value, b = +$('kMax').value; if (a > b - 100) { if (document.activeElement.id === 'kMin') a = b - 100; else b = a + 100; } mp.min = a; mp.max = b; saveMp(); renderMyPlan(); };
  $('kMin').onchange = upd; $('kMax').onchange = upd; $('kMin').oninput = $('kMax').oninput = () => { $('kcalVal').textContent = `${(+$('kMin').value).toLocaleString('en-GB')} – ${(+$('kMax').value).toLocaleString('en-GB')}`; };
  $('focusChips').querySelectorAll('[data-focus]').forEach(b => b.onclick = () => { mp.focus = b.dataset.focus; saveMp(); renderMyPlan(); });
  $('dayTabs').querySelectorAll('[data-day]').forEach(b => b.onclick = () => { mp.day = +b.dataset.day; saveMp(); renderMyPlan(); });
  $('mealList').querySelectorAll('[data-recipe]').forEach(b => b.onclick = () => glpRecipe(b.dataset.recipe, +b.dataset.kcal, +b.dataset.prot));
  $('genPlan').onclick = () => { mp.seed = (mp.seed + 3) % 97; saveMp(); renderMyPlan(); toast('✨ New meal plan ready'); };
}
document.querySelectorAll('#mealSeg [data-mseg]').forEach(b => b.onclick = () => { document.querySelectorAll('#mealSeg button').forEach(x => x.classList.toggle('on', x === b)); if (b.dataset.mseg === 'shop') return switchTab('shop'); $(b.dataset.mseg === 'myplan' ? 'myPlan' : b.dataset.mseg)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
function glpRecipe(id, kcal, prot) {
  const r = GLP1_RECIPES_ALL.find(x => x.id === id); if (!r) return; const f = fitPortion(r, r.meal === 'snack' ? 15 : 30);
  const fat = Math.round(Object.entries(f.grams).reduce((s, [k, g]) => s + (STAPLE[k]?.fat || 0) * g / 100, 0)) || null;
  const carbs = Math.max(0, Math.round(((kcal || f.kcal) - (prot || f.protein) * 4 - (fat || 0) * 9) / 4));
  const g = guideFor(id);
  openSheet(`<div class="rhero" style="background:${ICO[r.meal][1]}">${ICO[r.meal][0]}</div><div class="rbody"><h2>${esc(r.name)}</h2>
    <div class="macros"><div><b>${kcal || f.kcal}</b><small>kcal</small></div><div><b>${prot || f.protein}g</b><small>Protein</small></div><div><b>${r.fridgeDays}d</b><small>Fridge</small></div><div><b>${g ? g.total + ' min' : '–'}</b><small>Time</small></div></div>
    <div class="segtabs" id="rSeg"><button type="button" class="on" data-rs="ing">Ingredients</button><button type="button" data-rs="method">Method</button><button type="button" data-rs="nut">Nutrition</button></div>
    <div id="rs-ing" class="ingl">${Object.entries(f.grams).map(([k, gr]) => `<label><input type="checkbox"> ${gr} ${STAPLE[k]?.unit === 'ml' ? 'ml' : 'g'} ${esc((STAPLE[k]?.name || k).replace(/\s*\(.*?\)/g, ''))}</label>`).join('')}</div>
    <div id="rs-method" hidden><ol>${r.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>${g ? `<p class="small">${g.ovenText ? '🔥 ' + esc(g.ovenText) + '<br>' : ''}Keeps ${r.fridgeDays} days in the fridge.</p><button type="button" class="big" data-cook="${r.id}">👩‍🍳 Start Cook mode (timers &amp; temperatures)</button>` : ''}</div>
    <div id="rs-nut" hidden><p>Per portion (estimate): <b>${kcal || f.kcal} kcal</b>, <b>${prot || f.protein} g protein</b>, about ${carbs} g carbs.</p><p class="small muted">*Estimated from typical UK values. Check labels.</p></div>
    <button type="button" class="greenbtn big" id="addMyPlan">${mp.added.includes(id) ? '✓ In My Meal Plan' : 'Add to My Meal Plan'}</button></div>`);
  $('rSeg').querySelectorAll('[data-rs]').forEach(b => b.onclick = () => { $('rSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); ['ing', 'method', 'nut'].forEach(k => $('rs-' + k).hidden = k !== b.dataset.rs); });
  $('addMyPlan').onclick = () => { if (!mp.added.includes(id)) mp.added.push(id); saveMp(); $('addMyPlan').textContent = '✓ In My Meal Plan'; toast('✅ Added to My Meal Plan'); renderMyPlan(); };
}
// Price compare (food only) + weekly offers
const CMP_CATS = { All: null, Protein: /chicken|turkey|beef|salmon|tuna|egg|tofu|prawn|mince|cod/i, Dairy: /skyr|yog|milk|cheese|cottage|quark/i, 'Veg & fruit': /pepper|spinach|broccoli|veg|berr|banana|apple|carrot|onion|tomato|salad|pea/i, Cupboard: /oat|rice|pasta|lentil|chickpea|bean|bread|wrap|potato/i };
const cmpCat = { c: 'All' };
const _renderCompare = renderCompare;
renderCompare = function () {
  if (!$('cmpList')) return;
  $('cmpCats').innerHTML = Object.keys(CMP_CATS).map(c => `<button type="button" class="chip ${cmpCat.c === c ? 'on' : ''}" data-ccat="${c}">${c}</button>`).join('');
  $('cmpCats').querySelectorAll('[data-ccat]').forEach(b => b.onclick = () => { cmpCat.c = b.dataset.ccat; renderCompare(); });
  const q = cmpUI.q.trim().toLowerCase(), re = CMP_CATS[cmpCat.c], items = (pricesData?.items || []).filter(i => (!q || i.name.toLowerCase().includes(q)) && (!re || re.test(i.name + ' ' + i.key)));
  $('cmpStatus').textContent = `Aldi and Lidl update daily at 00:30 (last checked ${fmtUK(offersData?.stores?.aldi?.checked)}). Asda: typical price. Food only.`;
  $('cmpList').innerHTML = items.length ? items.map(i => { const pr = { aldi: i.offers?.aldi?.price != null && i.offers.aldi.grams ? i.offers.aldi.price / i.offers.aldi.grams * i.pack : i.prices.aldi, lidl: i.offers?.lidl?.price != null && i.offers.lidl.grams ? i.offers.lidl.price / i.offers.lidl.grams * i.pack : i.prices.lidl, asda: i.prices.asda };
    const ks = ['aldi', 'lidl', 'asda'].filter(k => pr[k] != null).map(k => [k, Math.round(pr[k] * 100) / 100]), min = Math.min(...ks.map(x => x[1])), max = Math.max(...ks.map(x => x[1])), best = ks.find(x => x[1] === min)?.[0];
    const tag = { aldi: i.full?.aldi ? 'live' : (i.offers?.aldi ? 'offer' : 'typical'), lidl: i.offers?.lidl ? 'offer' : 'typical', asda: 'Typical price' };
    return `<div class="card cmp"><b>${esc(i.name)}</b> <small class="muted">per ${i.pack >= 1000 ? i.pack / 1000 + ' kg' : i.pack + ' g'} · ${i.protein} g protein /100 g</small>
      <div class="pcmp">${ks.map(([k, v]) => `<div class="prow ${k === best ? 'best' : ''}"><span><span class="ostore ${k}">${STORE_NAMES[k]}</span> <small class="muted">${tag[k]}</small></span><b>${fmtGBP(v)}</b></div>`).join('')}</div>
      <div class="row between" style="margin-top:8px"><span class="bestbadge">✓ Best value: ${STORE_NAMES[best]}</span>${max > min ? `<span class="save">Save ${fmtGBP(Math.round((max - min) * 100) / 100)} vs ${STORE_NAMES[ks.find(x => x[1] === max)[0]]}</span>` : ''}</div></div>`; }).join('') : '<p class="empty">No matching foods.</p>';
  const ql = q.length > 1 ? (fullData?.stores?.aldi?.items || []).filter(i => i.name.toLowerCase().includes(q)).slice(0, 10) : [], lo = q.length > 1 ? (offersData?.stores?.lidl?.items || []).filter(i => i.name.toLowerCase().includes(q)).slice(0, 10) : [];
  $('cmpMore').innerHTML = q.length > 1 ? `<h3>Aldi shelf prices for "${esc(cmpUI.q.trim())}"</h3>${ql.length ? ql.map(priceRow).join('') : '<p class="empty">None found.</p>'}<h3>Lidl offers for "${esc(cmpUI.q.trim())}"</h3>${lo.length ? lo.map(offerCard).join('') : '<p class="empty">None on offer right now.</p>'}` : '';
  bindUseOffer($('cmpMore'));
  const top = ['aldi', 'lidl'].flatMap(k => offersFor(offersData || {}, { store: k, highProtein: true }).slice(0, 3));
  const asda = (pricesData?.items || []).filter(i => i.prices?.asda && i.protein >= 15).slice(0, 2).map(i => ({ store: 'asda', name: i.name, price: i.prices.asda, size: i.pack >= 1000 ? i.pack / 1000 + 'kg' : i.pack + 'g', typical: true }));
  $('weeklyOffers').innerHTML = [...top, ...asda].map(o => `<div class="prow"><span><span class="ostore ${o.store}">${STORE_NAMES[o.store]}</span> <b>${esc(o.name)}</b><br><small class="muted">${esc(o.size || '')}${o.typical ? ' · Typical price' : ''}</small></span><b>${fmtGBP(o.price)}</b></div>`).join('') || '<p class="empty">Offers couldn\'t load.</p>';
};
$('plusBtn').onclick = () => toast('⭐ All Plus features unlocked while in private testing. Paid plans: coming soon.');
const _switchTab = switchTab;
(window.__kova ||= {}).switchTab = t => switchTab(t);
switchTab = function (t) { _switchTab(t); if (t === 'community') community.load(); if (t === 'workout') renderHome(); if (t === 'progress') renderBodySites(); if (t === 'classes') renderSupport(); if (t === 'prep') renderMyPlan(); if (t === 'trainers') renderTrainers(); document.querySelectorAll('#dock [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === t)); $('orbBtn').classList.toggle('active', !['workout', 'progress', 'prep', 'classes'].includes(t)); };
settings.plan = 'plus'; // private testing: everyone gets Plus
renderHome(); renderSupport(); renderMyPlan(); renderBodySites();
setTimeout(renderHome, 1500);

/* ---------- Cloud sync UI ---------- */
function renderCloud() { const u = cloud.user; $('cloudForm').hidden = !!u; $('cloudOn').hidden = !u; const last = store.get('cloud.lastSync', null);
  { const el = $('cloudSaved'); if (el) { el.hidden = !u; el.classList.toggle('pending', !!cloudTimer && !last); el.textContent = !u ? '' : last ? `Saved to cloud ✓ ${new Date(last).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })}` : 'Saving to cloud…'; } }
  $('cloudStatus').textContent = u ? `Signed in to cloud as ${u.email}. ${last ? 'Last synced ' + new Date(last).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' UK.' : 'Not synced yet.'}` : 'Keep your weigh-ins, injection log, certificates, meal plans and check-ins safe and on all your phones. The app still works offline; changes sync when you\'re online.'; }
async function cloudFirst() { cloudPulling = true; let n; try { n = await cloud.pull(settings); store.set('settings', settings); try { store.set('cloud.certImgs', (await cloud.certImages()).map(o => o.name.replace(/\.png$/, ''))); } catch {} } finally { if (!n) cloudPulling = false; }
  // Restored data: reload straight away so every module starts from the restored store (no stale in-memory copy can overwrite or tombstone it).
  if (n) { clearTimeout(cloudTimer); toast(`☁️ ${n} item${n === 1 ? '' : 's'} restored from cloud`); store.set('cloud.justPulled', Date.now()); setTimeout(() => location.reload(), 600); return; }
  await cloud.push(settings, user); toast('☁️ Synced. Your phone data is backed up.'); renderCloud(); }
const cloudErr = m => { $('cloudErr').textContent = m || ''; $('cloudErr').hidden = !m; };
$('cloudForm').onsubmit = async e => { e.preventDefault(); cloudErr(); try { await cloud.signIn($('cloudEmail').value.trim(), $('cloudPass').value); $('cloudPass').value = ''; await cloudFirst(); } catch (err) { cloudErr(err.message); } };
$('cloudUp').onclick = async () => { cloudErr(); const p = $('cloudPass').value; if (p.length < 8) return cloudErr('Use a password of at least 8 characters.'); try { await cloud.signUp($('cloudEmail').value.trim(), p, settings.name); $('cloudPass').value = ''; await cloudFirst(); } catch (err) { cloudErr(err.message); } };
$('cloudSync').onclick = async () => { try { await cloudFirst(); } catch (e) { toast('Sync failed: ' + e.message); } };
$('cloudOut').onclick = async () => { await cloud.signOut(); renderCloud(); toast('Signed out of cloud. Your data stays on this phone.'); };
$('cloudExport').onclick = async () => { try { const d = await cloud.exportAll(), r = await saveBlob(new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' }), `glp1life-my-data-${todayKey()}.json`); if (r.saved !== 'browser') actionToast(r.saved ? `✅ Saved to ${r.saved}` : 'Saved', '📤 Share', r.share); } catch (e) { toast('Export failed: ' + e.message); } };
$('cloudDelete').onclick = async () => { if (!confirm('Delete your cloud account and ALL your cloud data? Data on this phone is kept.')) return; try { await cloud.deleteAll(); renderCloud(); toast('🗑️ Cloud account and data deleted'); } catch (e) { toast('Delete failed: ' + e.message); } };
renderCloud(); if (cloud.user && navigator.onLine) { cloudPulling = true; cloud.pull(settings).then(n => { cloudPulling = false; if (n) { renderProgress?.(); renderHome(); renderCerts?.(); renderInject?.(); } return cloud.push(settings, user); }).then(renderCloud).catch(e => { cloudPulling = false; console.warn('cloud', e.message); }); }
addEventListener('online', cloudPush);

/* ---------- Personal Trainers (Supabase: public read, admin write) ---------- */
import { SB_URL as TR_URL, SB_KEY as TR_KEY } from './cloud.js';
const trHead = () => { const s = JSON.parse(localStorage.getItem(PREFIX + 'cloud.session') || 'null'); return { apikey: TR_KEY, 'content-type': 'application/json', ...(s ? { authorization: 'Bearer ' + s.access_token } : {}) }; };
let trainers = [], trIsAdmin = false;
const waLink = t => `https://wa.me/${t.whatsapp}?text=${encodeURIComponent(`Hi ${t.name.split(' ')[0]}, I found you on GLP1 Life and I'd like to know your prices for personal training${t.virtual_pt ? ' (virtual is fine)' : ''}.`)}`;
async function renderTrainers() {
  try { const r = await fetch(`${TR_URL}/rest/v1/trainers?select=id,name,photo_url,specialties,glp1_support,area,whatsapp,virtual_pt,active,sort,status,business,bio&order=sort.asc,created_at.asc`, { headers: trHead() }); trainers = r.ok ? await r.json() : []; localStorage.setItem('glp1life.trainers', JSON.stringify(trainers)); }
  catch { trainers = JSON.parse(localStorage.getItem('glp1life.trainers') || '[]'); }
  try { trIsAdmin = cloud.user ? await (await fetch(`${TR_URL}/rest/v1/rpc/is_admin`, { method: 'POST', headers: trHead(), body: '{}' })).json() === true : false; } catch { trIsAdmin = false; }
  $('trainerAdmin').hidden = !trIsAdmin;
  $('trainerList').innerHTML = trainers.length ? trainers.map(t => `<div class="card trcard">
    <div class="trtop">${t.photo_url ? `<img src="${esc(t.photo_url)}" alt="" class="trphoto">` : '<div class="trphoto ph">🏋️</div>'}<div><h3>${esc(t.name)}</h3>${t.virtual_pt ? '<span class="vbadge">Virtual PT available</span>' : ''}${t.area ? `<p class="small muted">📍 ${esc(t.area)}</p>` : ''}${!t.active ? '<p class="small muted">Hidden from users</p>' : ''}</div></div>
    ${t.specialties?.length ? `<ul class="trtags" aria-label="Specialties">${t.specialties.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${t.glp1_support ? `<p class="small"><b>GLP-1 support:</b> ${esc(t.glp1_support)}</p>` : ''}
    <a class="wabtn" href="${waLink(t)}" target="_blank" rel="noopener">💬 Message on WhatsApp for prices</a></div>`).join('')
    : `<div class="card empty trempty"><div style="font-size:2.4rem">🏋️‍♀️</div><h3>Trainers coming soon</h3><p class="small muted">We're adding GLP-1-friendly personal trainers. Check back soon, or keep going with the 30-minute classes in the meantime.</p><button type="button" class="primary" data-gotab2="classes">Browse classes</button></div>`;
  $('trainerList').querySelectorAll('[data-gotab2]').forEach(b => b.onclick = () => switchTab(b.dataset.gotab2));
}

/* ---------- Promo / trainer codes (validated + redeemed server-side by redeem_promo RPC) ---------- */
const rpcF = async (f, b = {}) => { const r = await fetch(`${TR_URL}/rest/v1/rpc/${f}`, { method: 'POST', headers: trHead(), body: JSON.stringify(b) }), t = await r.text(), j = t ? JSON.parse(t) : null; if (!r.ok) throw new Error(j?.message || 'Could not reach GLP1 Life cloud'); return j; };
const SHARE = { weights: '⚖️ Weight & progress', workouts: '🏋️ Workouts & classes', meals: '🥗 Meal plans', injections: '💉 Injection log' };
function shareUI(p) {
  const on = p.plan === 'plus' && p.by_trainer; $('shareSetCard').hidden = !on; $('promoShare').hidden = !on; if (!on) return;
  document.querySelectorAll('.shareSet').forEach(box => { box.innerHTML = Object.entries(SHARE).map(([k, v]) => `<label class="sw"><input type="checkbox" data-share="${k}" ${p.share?.[k] ? 'checked' : ''}> ${esc(v)} <small class="muted">with ${esc(p.trainer)}</small></label>`).join('');
    box.querySelectorAll('[data-share]').forEach(cb => cb.onchange = async () => { const s = { ...p.share, [cb.dataset.share]: cb.checked };
      try { p.share = await rpcF('set_share', { s }); toast(cb.checked ? 'Sharing on' : 'Sharing off'); shareUI(p); } catch (x) { cb.checked = !cb.checked; toast(x.message); } }); });
}
async function renderPlan() {
  const st = $('promoStatus'); if (!st) return;
  if (!cloud.user) { st.textContent = 'Got a code from your personal trainer? Sign in to Cloud backup (Settings) first, then enter it here to get GLP1 Life Plus free.'; shareUI({}); return; }
  try { const p = await rpcF('my_plan'); store.set('cloud.plan', p);
    if (p.plan === 'plus') { const by = p.by_trainer ? `Included by ${esc(p.trainer)}` : `Plus included${p.trainer ? ` with ${esc(p.trainer)}` : ''}`;
      st.innerHTML = `<b>✓ ${by}</b> · £0 · code ${esc(p.code)}`; $('promoForm').hidden = true; document.querySelector('.plan2 .price').innerHTML = `£0<small> · ${by}</small>`; }
    else { $('promoForm').hidden = false; st.textContent = 'Got a code from your personal trainer? Enter it to get GLP1 Life Plus free.'; }
    shareUI(p); } catch {}
}
const consent = trainer => new Promise(res => { $('consentTxt').innerHTML = `<b>${esc(trainer || 'Your trainer')}</b> will see your weight, progress, workouts, meal plans and injection log.`; $('consentModal').hidden = false;
  $('consentYes').onclick = () => { $('consentModal').hidden = true; res(true); }; $('consentNo').onclick = () => { $('consentModal').hidden = true; res(false); }; });
$('promoForm').onsubmit = async e => { e.preventDefault(); const err = m => { $('promoErr').textContent = m || ''; $('promoErr').hidden = !m; }; err();
  if (!cloud.user) return err('Sign in to Cloud backup in Settings first.');
  try { const code = $('promoCode').value; let j = await rpcF('redeem_promo', { p_code: code });
    if (j.needs_consent) { if (!await consent(j.trainer)) return err('Not joined — joining with a trainer code needs your consent to share.'); j = await rpcF('redeem_promo', { p_code: code, p_consent: true }); }
    toast(`🎉 Plus included${j.trainer ? ' by ' + j.trainer : ''}`); $('promoCode').value = ''; renderPlan(); } catch (x) { err(x.message); } };
{ const sw0 = switchTab; switchTab = t => { sw0(t); if (t === 'member' || t === 'settings') renderPlan(); }; }

/* ---------- Video class library (archive.org CC BY-ND + official YouTube embeds) ---------- */
let sessionCastSrc = null;
function castMsg(r) {
  if (r === 'system') toast('📺 Pick your TV from the list, then come back to GLP1 Life and press play. Your phone screen shows on the TV.');
  else if (r === 'nocast') toast('Casting isn\'t available on this device. On a phone, use Android\'s Quick Settings ➜ Cast / Screen cast with your TV on the same Wi-Fi.');
}
function videoCast(videoEl, btn, v) {
  if (!btn) return;
  if (v.source === 'archive') setCastSource(() => ({ src: v.src, title: v.title, subtitle: v.credit }));
  // YouTube videos: the TV receiver can't play YouTube links, so on the web we leave it to the YouTube player's own Cast icon;
  // in the Android app the button mirrors the phone to the TV (plays everything).
  const upd = s => { btn.hidden = !(s.mode === 'system' || (s.mode === 'sdk' && v.source === 'archive')); btn.classList.toggle('on', !!s.connected); btn.textContent = s.connected ? '📺 Casting · stop' : '📺 Cast to TV'; };
  initCast(upd); btn.onclick = async () => castMsg(await castClick(videoEl));
}
const vClose = new MutationObserver(() => { const m = $('videoModal'); if (m?.hidden && sessionCastSrc) setCastSource(sessionCastSrc); });
document.addEventListener('click', e => { const b = e.target.closest('[data-video]'); if (!b) return; const r = openVideo(videoById(b.dataset.video), { onCastSource: videoCast }); const m = $('videoModal'); if (m) vClose.observe(m, { attributes: true, attributeFilter: ['hidden'] }); (window.__kova.videoOpens ||= []).push([b.dataset.video, r]); });
function renderVideoIdeas() { const el = $('videoIdeas'); if (!el) return; const ideas = pickIdeas(3); el.hidden = !ideas.length; el.innerHTML = ideas.length ? `<h3>🎬 Ideas for you</h3><div class="vgrid">${ideas.map(videoCard).join('')}</div><button type="button" class="linkbtn" data-gotab="classes">All video classes ›</button>` : ''; el.querySelectorAll('[data-gotab]').forEach(b => b.onclick = () => switchTab(b.dataset.gotab)); }
loadVideos().then(() => { if ($('videoLib')) renderVideoLib($('videoLib')); renderVideoIdeas(); window.__kova.videosReady = true; });

/* ---------- TV: Google Cast ---------- */
{ const v = $('trainerVid'), b = $('castBtn');
  setCastSource(sessionCastSrc = () => { const m = window.__kova?.classMedia, src = v.getAttribute('src') || m?.src; return src ? { src, title: m?.step || 'Workout', subtitle: $('trainerName')?.textContent || 'GLP1 Life' } : null; });
  new MutationObserver(() => castFollow()).observe(v, { attributes: true, attributeFilter: ['src'] });
  const upd = s => { b.hidden = !s.cast; b.classList.toggle('on', !!s.connected); b.textContent = s.connected ? '📺 Casting · stop' : '📺 Cast'; };
  b.hidden = true;
  // Load the Cast SDK only once a workout/class screen opens (keeps the rest of the app light).
  const ss = $('screen-session'), go = () => { if (ss.classList.contains('active') && !go.done) { go.done = true; initCast(upd); } };
  new MutationObserver(go).observe(ss, { attributes: true, attributeFilter: ['class'] }); go();
  b.onclick = async () => { navigator.vibrate?.(10); castMsg(await castClick(v)); };
}

/* ---------- Steps: Health Connect (Android app) / manual ---------- */
async function syncSteps(quiet) {
  let n = null, src = '';
  try { if (await healthConnectAvailable()) { n = await healthConnectSteps(); src = 'Health Connect'; } }
  catch (e) { if (!quiet) toast('Steps: ' + e.message); return; }
  if (n == null) return; const d = store.get('daily', {}); const t = (d[todayKey()] ||= {}); if (t.steps !== n) { t.steps = n; t.stepsSrc = src; store.set('daily', d); renderHome(); } if (!quiet) toast(`👣 ${n.toLocaleString('en-GB')} steps from ${src}`);
}
async function openStepsSheet() {
  const hc = await healthConnectAvailable(), native = !!window.Capacitor?.isNativePlatform?.();
  const box = document.createElement('div'); box.className = 'overlay stepsheet'; box.innerHTML = `<div class="card" style="max-width:460px;margin:auto"><h2>👣 Steps</h2>
    ${hc ? '<button class="primary" data-a="hc">Sync from Health Connect</button><p class="small muted">Reads today\'s steps only. Manage access in Health Connect settings.</p>' : native ? '<p class="small">Install <b>Health Connect</b> from the Play Store to sync steps from your phone, Samsung Health, Google Fit and more.</p>' : '<p class="small muted">Phone step syncing (Health Connect) works in the GLP1 Life Android app.</p>'}
    <button data-a="man">Enter steps by hand</button><button data-a="x">Close</button></div>`;
  document.body.appendChild(box); const close = () => box.remove();
  box.onclick = async e => { const a = e.target.dataset?.a; if (!a) return; if (a === 'x') return close();
    if (a === 'man') { close(); return window._manualSteps?.(); }
    close(); await syncSteps(false); };
}
syncSteps(true); addEventListener('visibilitychange', () => { if (!document.hidden) syncSteps(true); });

/* ---------- Community ---------- */
import { makeCommunity } from './community.js';
const weekDays = () => { const out = []; const d = new Date(); const dow = (d.getDay() + 6) % 7; for (let i = 0; i <= dow; i++) { const x = new Date(d); x.setDate(d.getDate() - dow + i); out.push(localDay(x)); } return out; };
const community = makeCommunity({ rpc: rpcF, toast: (m, ms) => toast(m, ms), root: $('communityRoot'), sbUrl: TR_URL, sbKey: TR_KEY,
  token: () => JSON.parse(localStorage.getItem(PREFIX + 'cloud.session') || 'null')?.access_token || '', uid: () => cloud.user?.id,
  certificates: () => store.get('certificates', []),
  stats: () => { const days = weekDays(), daily = store.get('daily', {}), goal = settings.waterGoalMl || DEFAULT_GOAL_ML, ses = new Set(store.get('sessions', []).map(s => String(s.date || s.at || '').slice(0, 10)));
    return { hydrationDays: days.filter(d => waterMl(daily[d]) >= goal).length, activeDays: days.filter(d => ses.has(d)).length }; } });
