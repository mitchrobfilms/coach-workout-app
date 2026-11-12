// Fitness studio logic. No DOM. Times are stored in UTC and shown in Europe/London.
export const SAFETY_FALLBACK = 'Stop if anything hurts, you feel dizzy, or you feel unwell. Check with your GP before you start a new exercise plan.';
export const MILESTONES = [1, 5, 10, 25, 50, 100];
export const FOCUS_LABEL = { full: 'Full body', cardio: 'Cardio', strength: 'Strength', core: 'Core', mobility: 'Mobility' };
export const LEVEL_LABEL = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
export const EQUIP_LABEL = { none: 'No equipment', basic: 'Basic equipment' };
export const DEMO_NOTICE = 'Sample preview. These classes, messages, streaks and totals are made-up. They are not a live class and they are not from a member.';
export const STREAM_SOON = 'Live video is coming soon. The timetable and class chat work without it.';
export const MUSIC_NOTE = 'GLP1 Life does not play music over your session and does not turn other audio down. Keep your own music app playing. A short beep marks the next move.';
export const HEALTH_WRITE_OFF = 'Writing a workout to Health Connect is off. The Android app still only reads steps. On the web, log the session by hand below.';

const LEVELS = new Set(['beginner', 'intermediate', 'advanced']);
const FOCUSES = new Set(Object.keys(FOCUS_LABEL));
const EQUIPS = new Set(['none', 'basic']);

export function kcalEstimate(met, kg, minutes) {
  const k = (Number(met) || 0) * 3.5 * (Number(kg) || 75) / 200 * (Number(minutes) || 0);
  return Math.max(0, Math.round(k));
}
export function activityLine(entry) {
  return `${entry.minutes} min · ${entry.kcal} kcal estimate`;
}

export function validateLibrary(lib, { videoIds = null } = {}) {
  const problems = [];
  const bad = (m) => problems.push(m);
  if (!lib?.safety || !/stop if anything hurts/i.test(lib.safety) || !/GP/i.test(lib.safety)) bad('safety note must say to stop if it hurts and to check with a GP');
  const ids = new Set();
  for (const w of lib?.workouts || []) {
    if (ids.has(w.id)) bad('duplicate workout ' + w.id);
    ids.add(w.id);
    if (w.kind !== 'follow') bad(w.id + ' kind');
    if (!LEVELS.has(w.level)) bad(w.id + ' level');
    if (!FOCUSES.has(w.focus)) bad(w.id + ' focus');
    if (!EQUIPS.has(w.equipment)) bad(w.id + ' equipment');
    if (w.intensity !== 'low') bad(w.id + ' must be low impact');
    if (!(w.minutes >= 5 && w.minutes <= 50)) bad(w.id + ' duration ' + w.minutes);
    if (!(w.met > 0)) bad(w.id + ' met');
    const phases = new Set((w.segments || []).map(s => s.phase));
    if (!phases.has('warmup') || !phases.has('cooldown') || !phases.has('work')) bad(w.id + ' needs warm-up, work and cool-down');
    let sum = 0;
    for (const s of w.segments || []) {
      sum += s.seconds || 0;
      if (!s.name || !s.tip || !s.swap || !(s.seconds > 0)) bad(w.id + ' segment ' + (s.id || s.name) + ' needs name, tip, swap and seconds');
      if (s.phase !== 'rest' && !s.harder) bad(w.id + ' ' + s.name + ' needs a harder option');
      if (/jump|burpee|sprint|plyo|nike/i.test(s.name || '')) bad(w.id + ' high-impact or branded move ' + s.name);
    }
    if (sum !== w.minutes * 60) bad(w.id + ' segments sum ' + sum + ' wanted ' + w.minutes * 60);
  }
  for (const v of lib?.videos || []) {
    if (v.kind !== 'video' || !v.videoId) bad('video entry ' + v.id);
    if (videoIds && !videoIds.has(v.videoId)) bad('missing Coach Ava video ' + v.videoId);
    if (v.intensity !== 'low' || !(v.minutes >= 5 && v.minutes <= 50)) bad('video filter fields ' + v.id);
  }
  for (const p of lib?.programmes || []) {
    if (!(p.weeks >= 4 && p.weeks <= 6)) bad(p.id + ' week count ' + p.weeks);
    if (p.weeksPlan?.length !== p.weeks) bad(p.id + ' week plan length');
    for (const [wi, week] of (p.weeksPlan || []).entries()) {
      if (week.days?.length !== 7) bad(p.id + ' week ' + (wi + 1) + ' is not 7 days');
      const rests = (week.days || []).filter(d => d.rest).length;
      if (rests < 1) bad(p.id + ' week ' + (wi + 1) + ' has no rest day');
      for (const d of week.days || []) if (!d.rest && !ids.has(d.workoutId)) bad(p.id + ' missing workout ' + d.workoutId);
    }
  }
  for (const t of lib?.tips || []) {
    if (!t.title || !t.body || !/GP/.test(t.body)) bad('tip ' + t.id + ' needs a GP line');
    if (/\b(mg|mcg|iu|peptide|reconstitut|supplier|vendor)\b/i.test(t.body)) bad('tip ' + t.id + ' has dosing or sourcing language');
  }
  return problems;
}

export function catalogue(lib) {
  return [...(lib?.workouts || []), ...(lib?.videos || [])];
}
export function sortWorkouts(list) {
  const rank = { beginner: 0, intermediate: 1, advanced: 2 };
  return [...list].sort((a, b) => (a.intensity === 'low' ? 0 : 1) - (b.intensity === 'low' ? 0 : 1) || (rank[a.level] ?? 9) - (rank[b.level] ?? 9) || a.minutes - b.minutes || a.title.localeCompare(b.title));
}
export function filterWorkouts(list, f = {}) {
  const min = f.minMinutes ?? 5, max = f.maxMinutes ?? 50;
  const q = (f.q || '').trim().toLowerCase();
  return sortWorkouts(list).filter(w => w.minutes >= min && w.minutes <= max
    && (!f.level || w.level === f.level)
    && (!f.focus || w.focus === f.focus)
    && (!f.equipment || w.equipment === f.equipment)
    && (!f.intensity || w.intensity === f.intensity)
    && (!q || `${w.title} ${w.blurb || ''} ${w.focus} ${w.level} ${w.coach || ''}`.toLowerCase().includes(q)));
}
export function workoutById(lib, id) {
  return catalogue(lib).find(w => w.id === id) || null;
}

export function programmeSlots(programme) {
  const out = [];
  (programme?.weeksPlan || []).forEach((week, wi) => (week.days || []).forEach((day, di) => out.push({ week: wi + 1, day: di + 1, weekday: di + 1, rest: !!day.rest, workoutId: day.workoutId || null })));
  return out;
}
export function nextSlot(programme, completed = 0) {
  const slots = programmeSlots(programme).filter(s => !s.rest);
  return slots[completed] || null;
}
export function applyFeedback(state, rating) {
  let bias = state?.bias || 0;
  if (rating === 'too-easy') bias = Math.min(1, bias + 1);
  else if (rating === 'too-hard') bias = Math.max(-1, bias - 1);
  else if (rating === 'just-right') bias = 0;
  else return state;
  return { ...state, bias, lastFeedback: rating };
}
export function feedbackNote(bias) {
  if (bias < 0) return 'Next session uses the easier option and a longer rest.';
  if (bias > 0) return 'Next session uses the slower, stronger option and a shorter rest.';
  return 'Next session stays as written.';
}
export function resolveSegments(workout, bias = 0) {
  return (workout?.segments || []).map(s => {
    const copy = { ...s };
    if (s.phase === 'rest') {
      if (bias < 0) copy.seconds = s.seconds + 10;
      if (bias > 0) copy.seconds = Math.max(10, s.seconds - 5);
    }
    copy.instruction = s.tip;
    copy.using = 'written';
    if (s.phase !== 'rest' && bias < 0) { copy.instruction = s.swap; copy.using = 'easier'; }
    if (s.phase !== 'rest' && bias > 0) { copy.instruction = s.harder; copy.using = 'harder'; }
    return copy;
  });
}

export function createPlayer(workout, { bias = 0 } = {}) {
  const segments = resolveSegments(workout, bias);
  return { workoutId: workout.id, title: workout.title, met: workout.met, minutes: workout.minutes, segments, index: 0, elapsed: 0, paused: false, done: false, bias };
}
export function previewPlayer(workout, bias = 0) {
  const p = createPlayer(workout, { bias });
  const i = p.segments.findIndex(s => s.phase === 'work');
  p.index = i < 0 ? 0 : i;
  p.elapsed = Math.min(12, Math.max(1, p.segments[p.index].seconds - 1));
  p.paused = true;
  return p;
}
export function elapsedSeconds(player) {
  if (!player?.segments?.length) return 0;
  if (player.done) return player.segments.reduce((a, s) => a + s.seconds, 0);
  const seg = player.segments[player.index];
  return player.segments.slice(0, player.index).reduce((a, s) => a + s.seconds, 0) + Math.min(player.elapsed, seg.seconds);
}
export function playerView(player) {
  const seg = player.segments[player.index];
  const total = player.segments.reduce((a, s) => a + s.seconds, 0) || 1;
  const left = Math.max(0, seg.seconds - player.elapsed);
  return {
    seg, next: player.segments[player.index + 1] || null, progress: Math.min(1, elapsedSeconds(player) / total),
    left, leftLabel: formatClock(left), paused: player.paused, done: player.done,
    index: player.index, count: player.segments.length, phase: seg.phase,
    primary: player.done ? 'Finish' : seg.phase === 'rest' ? 'Skip rest' : 'Done / next',
    pauseLabel: player.paused || player.done ? 'Resume' : 'Pause',
  };
}
export function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function tickPlayer(player, dt) {
  if (!player || player.paused || player.done) return { changed: false, beep: false, finished: false };
  player.elapsed += dt;
  const seg = player.segments[player.index];
  if (player.elapsed < seg.seconds) return { changed: false, beep: false, finished: false };
  if (player.index >= player.segments.length - 1) {
    player.elapsed = seg.seconds; player.done = true;
    return { changed: true, beep: true, finished: true };
  }
  const extra = player.elapsed - seg.seconds;
  player.index += 1;
  player.elapsed = extra;
  return { changed: true, beep: true, finished: false };
}
export function skipSegment(player) {
  if (!player || player.done) return { beep: false, finished: !!player?.done };
  if (player.index >= player.segments.length - 1) { player.elapsed = player.segments[player.index].seconds; player.done = true; return { beep: true, finished: true }; }
  player.index += 1; player.elapsed = 0;
  return { beep: true, finished: false };
}
export function togglePause(player) { if (player && !player.done) player.paused = !player.paused; return player; }
export function useEasier(player) {
  const seg = player?.segments?.[player.index];
  if (!seg || seg.phase === 'rest' || seg.using === 'easier') return false;
  seg.instruction = seg.swap; seg.using = 'easier';
  return true;
}
export function completionFromPlayer(player, { at = new Date(), kg = 75, programmeId = null, demo = false } = {}) {
  const seconds = elapsedSeconds(player);
  const minutes = Math.max(1, Math.round(seconds / 60));
  return { id: 'fit-' + at.getTime(), at: at.toISOString(), minutes, kcal: kcalEstimate(player.met, kg, minutes), title: player.title, workoutId: player.workoutId, programmeId, source: 'player', demo: !!demo, estimate: true };
}

export function londonToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
export function mondayOf(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() - day + 1);
  return dt.toISOString().slice(0, 10);
}
export function weekKey(ymd) { return mondayOf(ymd); }
export function formatLondon(iso) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}
export function londonToUtc(dateTimeLocal, timeZone = 'Europe/London') {
  const [date, time] = String(dateTimeLocal).split('T');
  const [Y, M, D] = date.split('-').map(Number);
  const [h, m] = time.split(':').map(Number);
  const utcGuess = new Date(Date.UTC(Y, M - 1, D, h, m));
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const parts = Object.fromEntries(fmt.formatToParts(utcGuess).map(p => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  const target = Date.UTC(Y, M - 1, D, h, m);
  return new Date(utcGuess.getTime() - (asUtc - target)).toISOString();
}
export function countdown(startsAt, now = new Date()) {
  const ms = new Date(startsAt) - now;
  if (ms <= 0) return { live: true, label: 'Live now', ms: 0 };
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = n => String(n).padStart(2, '0');
  return { live: false, label: h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`, ms };
}
export function sessionPhase(session, now = new Date()) {
  if (!session || session.status === 'cancelled') return 'cancelled';
  const start = new Date(session.startsAt).getTime();
  const end = start + (session.durationMin || 0) * 60000;
  const t = now.getTime();
  if (t < start) return 'upcoming';
  if (t < end) return 'live';
  return 'ended';
}

export function streakEnding(keys, current, previous) {
  let cursor = keys.has(current) ? current : (keys.has(previous) ? previous : null);
  if (!cursor) return 0;
  let n = 0;
  while (keys.has(cursor)) { n++; cursor = stepKey(cursor); }
  return n;
}
function stepKey(ymd) {
  return ymd.length === 7 ? addMonths(ymd, -1) : addDays(ymd, -7);
}
function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}
export function summariseActivity(entries, now = new Date(), birthday = '') {
  const list = [...(entries || [])].map(e => ({ ...e, ymd: londonToday(new Date(e.at)), kcal: e.kcal ?? kcalEstimate(e.met || 3, 75, e.minutes), estimate: true }));
  const weeks = new Set(list.map(e => weekKey(e.ymd)));
  const months = new Set(list.map(e => e.ymd.slice(0, 7)));
  const today = londonToday(now);
  const weekly = streakEnding(weeks, weekKey(today), weekKey(addDays(today, -7)));
  const monthly = streakEnding(months, today.slice(0, 7), addMonths(today.slice(0, 7), -1));
  const count = list.length;
  const milestones = MILESTONES.map(n => ({ id: 'workouts-' + n, n, title: n === 1 ? 'First workout' : n + ' workouts', unlocked: count >= n }));
  const ymds = list.map(e => e.ymd);
  const badges = [
    { id: 'new-year', title: 'New Year', detail: 'A workout in the first week of January', unlocked: ymds.some(d => d.slice(5) >= '01-01' && d.slice(5) <= '01-07') },
    { id: 'halloween', title: 'Halloween', detail: 'A workout on 31 October', unlocked: ymds.some(d => d.slice(5) === '10-31') },
    { id: 'birthday', title: 'Birthday', detail: birthday ? 'A workout on your birthday' : 'Add a birthday to unlock this badge', unlocked: !!(birthday && ymds.some(d => d.slice(5) === birthday)) },
  ];
  const history = list.sort((a, b) => new Date(b.at) - new Date(a.at));
  return { weekly, monthly, count, milestones, badges, history, minutes: history.reduce((a, e) => a + (e.minutes || 0), 0) };
}

export function upcomingQueue(programme, completed = 0) {
  if (!programme) return [];
  return programmeSlots(programme).filter(s => !s.rest).slice(completed).map(s => s.workoutId);
}
export function planWeek({ weekStart, trainingDays = [], queue = [] }) {
  const days = [];
  let qi = 0;
  const monday = mondayOf(weekStart);
  for (let i = 1; i <= 7; i++) {
    const date = addDays(monday, i - 1);
    if (trainingDays.includes(i) && queue[qi]) days.push({ weekday: i, date, rest: false, workoutId: queue[qi++] });
    else days.push({ weekday: i, date, rest: true, workoutId: null });
  }
  return days;
}
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function resolveStream(session, config = {}) {
  const soon = (message) => ({ enabled: false, kind: 'none', reason: 'coming-soon', message });
  const libraryId = String(config.bunnyLiveLibraryId || '').trim();
  const streamId = String(session?.bunnyStreamId || '').trim();
  if (session?.provider === 'bunny-live') {
    if (!libraryId || !streamId) return soon('Bunny Stream live is not configured. Add the live library id when you have one. No key is stored in the app.');
    return { enabled: true, kind: 'bunny-live', embedUrl: `https://iframe.mediadelivery.net/embed/${encodeURIComponent(libraryId)}/${encodeURIComponent(streamId)}?autoplay=true&preload=true` };
  }
  const url = String(session?.hlsUrl || '');
  if (session?.provider === 'hls') {
    if (!/^https:\/\/\S+\.m3u8(\?\S*)?$/.test(url)) return soon('Add an https address ending in .m3u8, or leave live video off.');
    return { enabled: true, kind: 'hls', hlsUrl: url };
  }
  return soon(STREAM_SOON + ' An admin can add Bunny Stream live or an HLS address once it is ready.');
}
export function reminderPlan(session, now = new Date()) {
  const start = new Date(session.startsAt);
  return { sessionId: session.id, title: 'GLP1 Life class', body: `${session.title} with ${session.coach} starts in 10 minutes (UK time).`, at: new Date(start.getTime() - 10 * 60 * 1000).toISOString(), startsAt: start.toISOString(), local: true, webPush: 'not-configured' };
}
export function pushAvailability(vapidPublicKey) {
  if (!vapidPublicKey) return { ok: false, reason: 'vapid-not-configured', message: 'Web push is not configured. Remind me still saves a reminder on this phone, alerts you while GLP1 Life is open, and uses the Android app notification when that app is installed.' };
  return { ok: true, reason: 'ready' };
}
export function classifyChat(text) {
  const s = String(text || '').toLowerCase();
  if (/(reconstitut|bacteriostatic|bac\s*water|mix(?:ing|ed)?\s+(?:the\s+|my\s+)?(?:vial|powder|peptide))/.test(s)) return { action: 'block', reason: 'mixing', message: 'Class chat cannot include mixing or reconstitution. Ask your prescriber or pharmacist.' };
  if (/(supplier|vendor|for sale|sourcing|where (?:can|do) (?:i|you|u) (?:get|buy|order))/.test(s) && /(peptide|reta|tirz|sema|mounjaro|wegovy|ozempic|pen|vial)/.test(s)) return { action: 'block', reason: 'selling', message: 'Class chat cannot include buying, selling or sourcing medication.' };
  if (/(\d+(?:\.\d+)?\s?(?:mg|mcg|µg|ml|iu|units?)|what dose|you should (?:take|inject)|microdos)/.test(s)) return { action: 'block', reason: 'dosing', message: 'Class chat cannot include doses or dosing advice. Your prescriber decides that. Check with your GP.' };
  if (/https?:\/\//.test(s)) return { action: 'block', reason: 'link', message: 'Links are not posted in class chat.' };
  if (!String(text || '').trim()) return { action: 'block', reason: 'empty', message: 'Write a message first.' };
  if (String(text).trim().length > 500) return { action: 'block', reason: 'length', message: 'Keep the message under 500 characters.' };
  return { action: 'ok', message: '' };
}

export function healthWritePlan({ enabled = false, native = false, canSaveWorkout = false, canSaveSample = false } = {}) {
  if (!enabled) return { call: null, ok: false, reason: 'flag-off', message: HEALTH_WRITE_OFF };
  if (!native) return { call: null, ok: false, reason: 'web', message: 'Health Connect is part of the GLP1 Life Android app. On the web, log the workout by hand.' };
  if (canSaveWorkout) return { call: 'saveWorkout', ok: true, reason: 'saveWorkout', message: 'The health plugin can store an exercise session.' };
  if (canSaveSample) return { call: 'saveSample', ok: true, reason: 'saveSample', message: 'This plugin version can store a calorie sample. It cannot insert a Health Connect exercise session. The Android shell also has to allow that write. See the fitness studio setup note.' };
  return { call: null, ok: false, reason: 'unsupported', message: 'This Android build cannot write a workout yet.' };
}

const CUE = { frequency: 880, seconds: 0.14, gain: 0.08, ducksOtherAudio: false };
export function cueSpec() { return { ...CUE }; }
export function playCue(ctx) {
  if (!ctx?.createOscillator) return false;
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
  o.frequency.value = CUE.frequency; o.type = 'sine';
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(CUE.gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + CUE.seconds);
  o.connect(g); g.connect(ctx.destination);
  o.start(t); o.stop(t + CUE.seconds);
  return true;
}

function pastStamp(now, month, day) {
  const y = Number(londonToday(now).slice(0, 4));
  let iso = new Date(Date.UTC(y, month - 1, day, 12, 0, 0)).toISOString();
  if (new Date(iso) > now) iso = new Date(Date.UTC(y - 1, month - 1, day, 12, 0, 0)).toISOString();
  return iso;
}
export function demoBundle(now = new Date()) {
  const t = now.getTime();
  const today = londonToday(now);
  const session = (id, title, offsetMs, durationMin, extra = {}) => ({ id, demo: true, title, coach: 'Demo Coach', startsAt: new Date(t + offsetMs).toISOString(), level: 'beginner', durationMin, focus: 'full', provider: 'none', status: 'scheduled', ...extra });
  const sessions = [
    session('demo-next', 'Evening Ease', 125000, 20, { focus: 'mobility' }),
    session('demo-live', 'Lunchtime March', -4 * 60000, 20, { focus: 'cardio' }),
    session('demo-replay', 'Morning Mobility', -26 * 3600000, 15, { focus: 'mobility', replayVideoId: 'ai-walk-15' }),
  ];
  const histAt = [0, -3, -7, -10, -14].map(n => new Date(addDays(today, n) + 'T12:00:00.000Z').toISOString());
  histAt.push(pastStamp(now, 1, 2), pastStamp(now, 10, 31));
  const history = histAt.map((at, i) => ({ id: 'demo-h' + i, at, minutes: 12 + (i % 3) * 4, kcal: kcalEstimate(3.2, 75, 12 + (i % 3) * 4), title: 'Sample session ' + (i + 1), workoutId: 'gentle-start-8', source: 'sample', demo: true, estimate: true }));
  return {
    demo: true,
    notice: DEMO_NOTICE,
    programmeId: 'start-up',
    programmeDone: 0,
    bias: 0,
    lastFeedback: null,
    trainingDays: [1, 3, 5],
    birthday: today.slice(5),
    keepAwake: true,
    history,
    reminders: [],
    sessions,
    chat: { 'demo-live': [
      { id: 'demo-c1', author: 'Sample Member', body: 'Taking the smaller steps today. Knees feel happier.', demo: true, at: new Date(t - 60000).toISOString() },
      { id: 'demo-c2', author: 'Demo Coach', body: 'Lovely. Stay with the easy march and rest whenever you need.', demo: true, at: new Date(t - 30000).toISOString() },
    ] },
  };
}

export const REQUIRED_SECRETS = [
  { name: 'BUNNY_STREAM_API_KEY', where: 'Supabase secret or the Bunny dashboard. Server only.', purpose: 'Create a Bunny Stream live input. Never put this in the app or in git.' },
  { name: 'BUNNY_LIVE_LIBRARY_ID', where: 'Public fitness config, only after a live library exists.', purpose: 'Library id used in the embed. It is not a secret, and this repo does not invent one. The published video library id is for on-demand classes, not live.' },
  { name: 'VAPID_PUBLIC_KEY', where: 'Supabase secret, then a public config value.', purpose: 'Web push for Remind me. No value is stored in this repo.' },
  { name: 'VAPID_PRIVATE_KEY', where: 'Supabase secret. Server only.', purpose: 'Signs web push messages. Never ship this in the app.' },
  { name: 'VAPID_SUBJECT', where: 'Supabase secret.', purpose: 'Contact for the push service, for example mailto:support@glp1life.co.uk. Set the real mailbox yourself.' },
];
