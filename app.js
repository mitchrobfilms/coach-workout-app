import { getAuth } from './auth.js';
import { makeAnalyser, CoachEngine, allVisible, LM } from './logic.js';
import { findWake, nextDelay } from './voice.js';
import { parseWeight as parseWeightText, fmtWeight } from './weight.js';
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
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(PREFIX + k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem(PREFIX + k, JSON.stringify(v)),
};
const settings = Object.assign({ name: user?.name || 'Mitchell', trainer: 'm', onboarded: false, speech: true, beeps: true, llm: false, llmUrl: '', llmModel: '', llmKey: '', glp1: false, fussy: false, likes: [], dislikes: [], country: 'auto' }, store.get('settings', {}));

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
const TRAINERS = { m: { label: 'Reta (male)', voice: /\b(male|daniel|ryan|george|arthur|oliver|thomas|james|alfie)\b/i }, f: { label: 'Reta (female)', voice: /\b(female|woman|serena|kate|libby|sonia|hazel|susan|fiona|martha|amy|emma|maisie)\b/i } };
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
let actx = null, voice = null;
function pickVoice() { if (!('speechSynthesis' in window)) return; const v = speechSynthesis.getVoices(), gb = v.filter(x => /en[-_]GB/i.test(x.lang)), re = TRAINERS[settings.trainer]?.voice; voice = (re && gb.find(x => re.test(x.name))) || gb[0] || (re && v.find(x => /^en/i.test(x.lang) && re.test(x.name))) || v.find(x => /^en/i.test(x.lang)) || null; }
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function say(text, { kind = 'coach' } = {}) {
  bubble(text);
  if (!settings.speech || !('speechSynthesis' in window)) return;
  if (kind === 'high') speechSynthesis.cancel();
  else if (speechSynthesis.pending) return; // don't pile up
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice; u.lang = voice?.lang || 'en-GB'; u.rate = kind === 'count' ? 1.15 : 1.0;
  u.onstart = () => ttsStart(kind, text); u.onend = u.onerror = () => setTimeout(ttsEnd, 50);
  speechSynthesis.speak(u);
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
function toast(t, ms = 2500) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, ms); }

/* ---------- optional LLM hook (text only, off by default) ---------- */
async function llm(prompt) {
  if (!settings.llm || !settings.llmKey || !settings.llmUrl) return null;
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(settings.llmUrl, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.llmKey}` },
      body: JSON.stringify({ model: settings.llmModel || 'gpt-4o-mini', max_tokens: 180, messages: [
        { role: 'system', content: `You are Reta, a warm, upbeat British home-fitness coach for ${settings.name}, a total beginner using bodyweight only (no equipment to buy). Be brief, kind, specific and non-judgemental. Never suggest extreme or very-low-calorie diets. Not medical advice.` },
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
  stream?.getTracks().forEach(t => t.stop());
  stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } } });
  video.srcObject = stream; await video.play().catch(() => {});
  $('mirror').classList.toggle('flip', facing === 'user');
}
$('flipBtn').onclick = async () => { facing = facing === 'user' ? 'environment' : 'user'; try { await startCamera(); } catch (e) { toast('Could not switch camera'); facing = 'user'; } };
function draw(res) {
  if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const lm = res?.landmarks?.[0]; if (!lm) return;
  const W = canvas.width, H = canvas.height;
  ctx.lineWidth = Math.max(3, W / 200);
  const bad = sess && sess.badJoints && performance.now() < (sess.badUntil || 0) ? sess.badJoints : null; // "You vs Reta": red = fix this, green = good
  const RED = '#ff4d4d', GOOD = bad ? '#3ddc84' : 'rgba(22,212,192,.9)';
  for (const { start, end } of landmarker.CONN) { const a = lm[start], b = lm[end]; if ((a.visibility ?? 1) < .5 || (b.visibility ?? 1) < .5) continue; ctx.strokeStyle = bad && (bad.has(start) || bad.has(end)) ? RED : GOOD; ctx.beginPath(); ctx.moveTo(a.x * W, a.y * H); ctx.lineTo(b.x * W, b.y * H); ctx.stroke(); }
  for (let i = 11; i < 33; i++) { const p = lm[i]; if ((p.visibility ?? 1) < .5) continue; const r = bad?.has(i); ctx.fillStyle = r ? RED : '#fff'; ctx.beginPath(); ctx.arc(p.x * W, p.y * H, ctx.lineWidth * (r ? 2.2 : 1.3), 0, 7); ctx.fill(); }
}
function poseLoop() {
  if (!sess) return;
  if (landmarker && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    try { const res = landmarker.detectForVideo(video, performance.now()); lastPose = res; draw(res); onPose(res); } catch (e) { console.warn(e); }
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
  try { await startCamera(); } catch (e) { setCue('Camera blocked. Allow camera access and reload.', true); console.warn(e); }
  initPose().then(() => setCue('')).catch(e => { console.error('pose init failed', e); setCue('Pose model failed to load. Check your connection.', true); });
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

function pause(p = !sess?.paused) { if (!sess) return; sess.paused = p; $('pauseBtn').textContent = p ? 'Resume' : 'Pause'; say(p ? 'Paused. Say resume when you\'re ready.' : 'And we\'re back.', { kind: 'high' }); }
$('pauseBtn').onclick = () => pause();
$('skipBtn').onclick = () => sess && next();
$('endBtn').onclick = () => sess && finish(false);
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
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  if (t === 'progress') renderProgress(); if (t === 'food') renderFoodStats(); if (t === 'shop') renderShop(); if (t === 'prep') renderPrep();
}
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { if (sess) return toast('Finish or end the workout first'); switchTab(b.dataset.tab); });

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
  if (extra && $('llmFood')) $('llmFood').innerHTML = `<div class="res"><h4>Reta's extra thoughts</h4><p>${extra.replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p></div>`;
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

/* ---------- progress + weigh-ins ---------- */
// Weigh-ins: free-text parsing (decimal comma, st+lb, lb) with inline errors. See weight.js.
function saveWeightKg(kg) { const w = store.get('weights', []); w.push({ date: new Date().toISOString(), kg }); store.set('weights', w); renderProgress(); }
function saveWeight(text, unit = settings.weightUnit || 'kg') { const r = parseWeightText(text, unit); if (r.kg) saveWeightKg(r.kg); return r; }
function bindWeightForm(form, { onSaved } = {}) {
  const input = form.querySelector('input'), err = form.querySelector('.error'), segs = form.querySelectorAll('.seg button');
  const setUnit = u => { settings.weightUnit = u; store.set('settings', settings); segs.forEach(b => b.classList.toggle('on', b.dataset.unit === u)); input.placeholder = u === 'st' ? 'e.g. 13st 4lb' : u === 'lb' ? 'e.g. 190' : 'e.g. 85.5'; };
  segs.forEach(b => b.onclick = () => { setUnit(b.dataset.unit); input.focus(); });
  setUnit(settings.weightUnit || 'kg');
  input.addEventListener('focus', () => setTimeout(() => form.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)); // keep Save above the iOS keyboard
  input.addEventListener('input', () => { err.hidden = true; });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const r = saveWeight(input.value, settings.weightUnit || 'kg');
    if (r.error) { err.textContent = r.error; err.hidden = false; input.focus(); return; }
    err.hidden = true; input.value = ''; input.blur();
    toast(`✅ Weigh-in saved: ${fmtWeight(r.kg, settings.weightUnit)}`); onSaved?.(r.kg);
  });
}
bindWeightForm($('weightForm'));
function renderProgress() {
  const d = iso => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const s = store.get('sessions', []);
  $('sessionList').innerHTML = s.length ? s.slice().reverse().map(x => `<li><span>${d(x.date)}${x.completed ? '' : ' <small class="muted">(ended early)</small>'}</span><span>${Object.values(x.totals).reduce((a, b) => a + b, 0)} reps · ${x.minutes} min</span></li>`).join('') : '<li class="muted">No workouts yet. Your first one is waiting!</li>';
  const f = foodHist();
  $('foodList').innerHTML = Object.keys(f).length ? Object.keys(f).sort().reverse().map(k => `<li><span>${d(k + 'T12:00')}</span><span>${f[k].score}/10</span></li>`).join('') : '<li class="muted">No check-ins yet.</li>';
  const w = store.get('weights', []);
  $('weightList').innerHTML = w.length ? w.slice().reverse().map((x, i, a) => { const p = a[i + 1]; const dd = p ? (x.kg - p.kg).toFixed(1) : null; return `<li><span>${d(x.date)}</span><span>${fmtWeight(x.kg, settings.weightUnit || 'kg')}${dd !== null ? ` <small class="muted">(${dd > 0 ? '+' : ''}${dd} kg)</small>` : ''}</span></li>`; }).join('') : '<li class="muted">No weigh-ins yet (optional).</li>';
}
renderProgress();

/* ---------- settings ---------- */
const S = { setFussy: 'fussy', setCountry: 'country', setName: 'name', setSpeech: 'speech', setBeeps: 'beeps', setLlm: 'llm', setLlmUrl: 'llmUrl', setLlmModel: 'llmModel', setLlmKey: 'llmKey' };
for (const [id, k] of Object.entries(S)) { const el = $(id); if (el.type === 'checkbox') el.checked = !!settings[k]; else el.value = settings[k] || (k === 'country' ? 'auto' : ''); }
$('saveSettings').onclick = () => { for (const [id, k] of Object.entries(S)) { const el = $(id); settings[k] = el.type === 'checkbox' ? el.checked : el.value.trim(); } settings.name ||= 'Mitchell'; settings.country ||= 'auto'; store.set('settings', settings); greetText(); renderFoodProfile(); toast('Saved'); };
$('clearData').onclick = () => { if (confirm('Delete all workouts, food check-ins, weigh-ins and settings on this phone?')) { Object.keys(localStorage).filter(k => k.startsWith('kova.')).forEach(k => localStorage.removeItem(k)); location.reload(); } };
function greetText() { const h = new Date().getHours(); $('startGreeting').textContent = `${h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening'}, ${settings.name}! I'm Reta. I'll watch your form through the camera, count your reps and cheer you on.`; }
greetText();

/* ---------- voice: "Hey Reta" wake word + commands + dictation ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const REC_LANG = /^en\b/i.test(navigator.language || '') ? navigator.language : 'en-GB';
const voiceState = { on: false, mode: 'idle', armedUntil: 0, armedIdx: -1, dictate: null, rec: null, failures: 0, ttsBusy: false, wakeIdx: new Set(), restarts: 0 };
window.__kova = { voiceState, PLAN };
$('voiceSupport').textContent = !SR ? 'Voice recognition isn\'t supported in this browser. Use the on-screen buttons, or your keyboard\'s mic for food dictation.' : isIOS ? 'On iPhone/iPad, continuous listening is limited, so use the "Tap to talk" button.' : 'Supported. Tap the mic in the top bar to start listening for "Hey Reta".';
function micUI() {
  const b = $('micBtn'); b.classList.toggle('on', voiceState.on); b.classList.toggle('off', !voiceState.on); b.classList.toggle('armed', voiceState.mode !== 'idle');
  $('micLabel').textContent = !voiceState.on ? 'Mic off' : voiceState.mode === 'dictate' ? 'Dictating…' : voiceState.mode === 'armed' ? 'Listening…' : voiceState.ttsBusy ? 'Reta speaking…' : 'Listening for "Hey Reta"';
  $('listenBadge').hidden = voiceState.mode === 'idle'; $('listenBadge').textContent = voiceState.mode === 'dictate' ? '🎙️ Dictating…' : '🎙️ Listening…';
  b.setAttribute('aria-pressed', voiceState.on);
  const sm = $('sessMic'); sm.className = b.className.replace('mic', 'iconbtn mic'); $('sessMicLabel').textContent = !voiceState.on ? 'Mic off' : voiceState.mode !== 'idle' ? 'Listening…' : 'Hey Reta';
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
  // Reta's own short rep counts may leak into the mic: only a wake phrase gets through while speaking.
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
// Pause listening while Reta talks (longer lines) so the phone doesn't hear itself; resume right after.
function ttsStart(kind, text = '') { if (!voiceState.on || kind === 'count') return; voiceState.ttsBusy = true; stopRec(); micUI();
  clearTimeout(ttsStart.t); ttsStart.t = setTimeout(() => { if (voiceState.ttsBusy) { voiceState.ttsBusy = false; micUI(); startRec(); } }, 2500 + text.length * 90); } // safety: Chrome Android sometimes never fires onend
function ttsEnd() { if (!voiceState.ttsBusy) return; if (speechSynthesis.speaking || speechSynthesis.pending) return; voiceState.ttsBusy = false; micUI(); setTimeout(startRec, 250); }
document.addEventListener('visibilitychange', () => { if (document.hidden) stopRec(); else setTimeout(startRec, 300); });
function oneShot() { const r = new SR(); r.lang = REC_LANG; r.continuous = false; r.interimResults = true;
  let n = 0; r.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) onTranscript(e.results[i][0].transcript, e.results[i].isFinal, `os${n}:${i}`); };
  r.onend = () => { n++; if (voiceState.mode === 'armed') { voiceState.mode = 'idle'; micUI(); } }; try { r.start(); } catch {} return r; }
function setMic(on) {
  if (!SR) return toast('Voice isn\'t supported in this browser');
  if (isIOS) return toast('On iPhone, use the Tap to talk button');
  unlockAudio(); voiceState.on = on; voiceState.failures = 0;
  if (on) { startRec(); toast('Listening for "Hey Reta"'); } else { stopRec(); voiceState.mode = 'idle'; voiceState.ttsBusy = false; }
  micUI();
}
$('micBtn').onclick = () => setMic(!voiceState.on);
$('sessMic').onclick = () => setMic(!voiceState.on);
// Tap-to-talk: iOS (partial SR support) gets a one-shot recogniser; browsers without SR get a typed command box.
if (isIOS || !SR) { $('talkBtn').hidden = false; }
$('talkBtn').onclick = () => {
  unlockAudio();
  if (!SR) { const c = prompt('Type a command for Reta (start workout, pause, resume, next, end, log food, how many reps, weigh-in, what\'s next):'); if (c) runCommand(c.toLowerCase()); return; }
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
  if (/\b(start|begin)\b.*\b(workout|session|training)\b|^(start|let's go|lets go)$/.test(t)) { if (sess) return say('We\'re already going!', { kind: 'high' }); switchTab('workout'); show('screen-start'); return startWorkout(); }
  if (/\b(pause|hold on|wait|stop for a sec)\b/.test(t)) return sess ? pause(true) : say('Nothing to pause right now.', { kind: 'high' });
  if (/\b(resume|continue|carry on|unpause|go again)\b/.test(t)) return sess ? pause(false) : say('Say "start workout" to begin.', { kind: 'high' });
  if (/\b(next|skip)\b/.test(t) && !/what'?s next/.test(t)) return sess ? (say('Skipping ahead.', { kind: 'high' }), next()) : say('Nothing to skip.', { kind: 'high' });
  if (/\b(end|finish|stop) (the )?(workout|session)\b|^(end|finish|stop)$/.test(t)) return sess ? finish(false) : say('No workout running.', { kind: 'high' });
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
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

/* ---------- accounts (phone-only, see auth.js) + onboarding + trainer picker ---------- */
function showErr(id, msg) { const e = $(id); e.textContent = msg || ''; e.hidden = !msg; }
function authView(which) { $('loginForm').hidden = which !== 'login'; $('registerForm').hidden = which !== 'register'; $('toLogin').hidden = !auth.listAccounts().length; }
function renderAccounts() {
  const list = auth.listAccounts();
  $('authAccounts').innerHTML = list.length ? `<p class="small muted">Accounts on this phone</p>${list.map(a => `<button type="button" class="acct" data-email="${a.email}"><b>${a.name.replace(/</g, '&lt;')}</b><span>${a.email}</span></button>`).join('')}` : '';
  $('authAccounts').querySelectorAll('.acct').forEach(b => b.onclick = () => { authView('login'); $('loginEmail').value = b.dataset.email; $('loginSecret').focus(); });
}
function openAuth() { renderAccounts(); authView(auth.listAccounts().length ? 'login' : 'register'); $('authScreen').hidden = false; }
$('toRegister').onclick = () => authView('register');
$('toLogin').onclick = () => authView('login');
$('registerForm').addEventListener('submit', async e => {
  e.preventDefault(); showErr('regError'); $('regBtn').disabled = true;
  try { const u = await auth.signUp({ name: $('regName').value, email: $('regEmail').value, secret: $('regSecret').value }); localStorage.setItem(auth.dataPrefix(u) + 'settings', JSON.stringify({ ...JSON.parse(localStorage.getItem(auth.dataPrefix(u) + 'settings') || '{}'), name: u.name })); location.reload(); }
  catch (err) { showErr('regError', err.message); } finally { $('regBtn').disabled = false; }
});
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault(); showErr('loginError'); $('loginBtn').disabled = true;
  try { await auth.signIn({ email: $('loginEmail').value, secret: $('loginSecret').value }); location.reload(); }
  catch (err) { showErr('loginError', err.message); } finally { $('loginBtn').disabled = false; }
});
$('forgotBtn').onclick = () => {
  const email = $('loginEmail').value.trim().toLowerCase(), acc = auth.listAccounts().find(a => a.email === email);
  if (!acc) return showErr('loginError', 'Type the email of the account first (or tap it above).');
  if (!confirm(`Reset "${acc.name}" (${acc.email})?\n\nYour account lives only on this phone, so there's no way to recover the PIN. Resetting permanently deletes this account and ALL its workouts, weigh-ins and food logs on this phone. You can then create it again.`)) return;
  auth.resetAccount(acc.id); renderAccounts(); authView('register'); $('regName').value = acc.name; $('regEmail').value = acc.email; $('regSecret').focus();
  showErr('regError', 'Account reset. Choose a new PIN to start fresh.');
};
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
  const text = 'Reta shopping list\n' + AISLES.filter(a => list[a]?.length).map(a => `\n${a}\n` + list[a].map(e => `${shop.ticks[e.key] ? '[x]' : '[ ]'} ${e.item}${e.pack ? ` (${e.pack})` : ''}`).join('\n')).join('\n');
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
    <details><summary class="small">Method</summary><ol>${r.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol></details></div>`;
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
  $('prepStorePick').innerHTML = Object.entries(STORES).map(([k, v]) => `<button type="button" class="chip ${shop.store === k ? 'on' : ''}" data-pstore="${k}">${v.name}</button>`).join('');
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
  root.querySelectorAll('[data-pstore]').forEach(b => b.onclick = () => { shop.store = b.dataset.pstore; saveShop(); renderPrep(); });
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
