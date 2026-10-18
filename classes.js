// Full-length follow-along classes: scripts + pure pose analysers (no DOM; importable in Node for tests).
import { LM, angle, allVisible, Smoother, RepCounter, makeAnalyser } from './logic.js';

// Class scripts live in library.json (site root) so new classes need no code change. This module turns a library entry
// into a timed step list and provides the pose analysers. Standard classes are 30:00 = 5:00 warm-up + 20:00 main + 5:00 cool-down.
export const WARM = 300, MAIN = 1200, COOL = 300, TOTAL = 1800;
const MET = { warm: 3.0, trans: 2.5, water: 1.8, cool: 2.0 };
const TRACKS = new Set(['punch', 'rhythm', 'hold', 'still', 'reps', 'plank', 'move', 'none']);

/** Build a class from a library.json entry. Transitions (default 15s) are inserted after every main block, with a water break
 *  every Nth (default 4th). Never throws for content problems: they're listed in cls.problems so one bad entry can't break the app. */
export function buildClass(e) {
  const sc = e.script || {}, TR = sc.transition ?? 15, every = sc.waterEvery ?? 4, problems = [];
  const warm = sc.warm || [], main = sc.main || [], cool = sc.cool || [];
  const mus = e.music || {}, bpm = mus.bpm || 120, style = mus.style || 'ambient', met = e.met || 4;
  const steps = [];
  const tr = t => (TRACKS.has(t) ? t : 'move');
  for (const s of warm) steps.push({ ...s, kind: 'warm', met: s.met ?? MET.warm, bpm: s.bpm ?? bpm, track: tr(s.track ?? e.warmTrack ?? 'move'), cues: s.cues || [] });
  main.forEach((s, i) => {
    if (!(s.dur >= 45 && s.dur <= 90)) problems.push(`block "${s.name}" is ${s.dur}s (45–90 expected)`);
    steps.push({ ...s, kind: 'main', met: s.met ?? met, bpm: s.bpm ?? bpm, track: tr(s.track ?? (s.rep ? 'reps' : e.track)), cues: s.cues || [] });
    const water = every > 0 && (i + 1) % every === 0, nxt = main[i + 1] || cool[0];
    if (TR > 0) steps.push({ kind: water ? 'water' : 'trans', name: water ? 'Water break' : 'Transition', dur: TR, slug: null, fb: null, cues: [],
      how: water ? 'Grab a sip of water and shake out your arms.' : `Get ready for ${nxt?.name || 'the cool-down'}.`, next: nxt?.name, met: water ? MET.water : MET.trans, bpm: nxt?.bpm ?? bpm, track: 'none' });
  });
  for (const s of cool) steps.push({ ...s, kind: 'cool', met: s.met ?? MET.cool, bpm: s.bpm ?? mus.coolBpm ?? bpm, track: tr(s.track ?? 'still'), music: 'ambient', cues: s.cues || [] });
  for (const s of steps) { s.name ||= 'Move'; s.how ||= ''; if (!(s.dur > 0)) { problems.push(`step "${s.name}" has no duration`); s.dur = 30; } }
  let at = 0; for (const s of steps) { s.at = at; at += s.dur; }
  const sum = k => steps.filter(s => k.includes(s.kind)).reduce((t, s) => t + s.dur, 0);
  const sections = { warm: sum(['warm']), main: sum(['main', 'trans', 'water']), cool: sum(['cool']) };
  if (e.duration && e.duration !== at) problems.push(`script sums to ${at}s but duration says ${e.duration}s`);
  const mainTracks = main.map(s => tr(s.track ?? (s.rep ? 'reps' : e.track)));
  const primary = ['punch', 'rhythm', 'hold', 'reps'].sort((a, b) => mainTracks.filter(x => x === b).length - mainTracks.filter(x => x === a).length)[0];
  return {
    id: String(e.id), name: e.title || e.id, title: e.title || e.id, category: e.category || 'Other', tags: e.tags || [], lead: e.trainer === 'm' ? 'm' : 'f',
    intensity: e.intensity || 'Moderate', blurb: e.blurb || '', poster: e.poster || '', music: style, bpm, coolBpm: mus.coolBpm, met,
    voice: e.voice || [], drive: e.drive_file_id || '', added: e.added || null, eightCount: e.eightCount ?? (style === 'dance' || style === 'latin'),
    primary, steps, total: at, sections, problems,
  };
}
/** Parse a library.json document into classes (entries without an id or script are skipped). */
export function buildLibrary(doc) { return (doc?.classes || []).filter(e => e && e.id && e.script).map(buildClass); }
export const isNewClass = (c, seen = [], now = Date.now()) => !seen.includes(c.id) || (c.added && now - new Date(c.added).getTime() < 14 * 864e5);
export const METRIC = { punch: 'punches', rhythm: 'on-beat moves', hold: 'seconds held', reps: 'reps' };

/** kcal for a stretch of time at a MET value: kcal/min = MET × 3.5 × kg / 200 (approx.). */
export const kcal = (met, kg, sec) => met * 3.5 * (kg || 75) / 200 * (sec / 60);
export const classKcal = (c, kg) => Math.round(c.steps.reduce((t, s) => t + kcal(s.met, kg, s.dur), 0));

/** "Recommended for you": gentle options on low-energy / GLP-1 days, otherwise the class done least recently. */
export function recommend(CLASSES, { history = [], lowEnergy = false, glp1 = false } = {}) {
  const last = id => { const h = history.filter(x => x.cls === id).map(x => +new Date(x.date)); return h.length ? Math.max(...h) : 0; };
  const gentle = CLASSES.filter(c => c.tags.includes('gentle') || /gentle/i.test(c.intensity)); const pool = lowEnergy && gentle.length ? gentle : CLASSES; if (!pool.length) return null;
  const pick = [...pool].sort((a, b) => last(a.id) - last(b.id))[0];
  const why = lowEnergy ? (glp1 ? 'Low-energy day: a gentle class that\'s kind to your appetite and energy on GLP-1 medication.' : 'Low-energy day: a gentle, slower class.')
    : last(pick.id) ? 'You haven\'t done this one for a while.' : 'You haven\'t tried this one yet.';
  return { cls: pick, why };
}

/* ================= pose analysers ================= */
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2 });

/** Boxing: counts punches per side (elbow snaps open fast from guard), hooks (wrist crosses the midline at shoulder height),
 *  and checks the guard is up between punches. Uses world landmarks for angles, image landmarks for positions. */
export class PunchCounter {
  constructor() { this.reset(); }
  reset() {
    this.left = 0; this.right = 0; this.hooks = 0; this.guardOk = 1; this.guardDownSince = null;
    this.s = { L: { sm: new Smoother(0.5), state: 'guard', since: 0, last: 0, crossed: false }, R: { sm: new Smoother(0.5), state: 'guard', since: 0, last: 0, crossed: false } };
  }
  get total() { return this.left + this.right; }
  frame(lm, w, t) {
    if (!allVisible(lm, [LM.LS, LM.RS, LM.LE, LM.RE, LM.LW, LM.RW])) return { ready: false, events: [], flags: [] };
    const events = [], flags = [];
    const torso = allVisible(lm, [LM.LH, LM.RH]) ? Math.abs(mid(lm[LM.LS], lm[LM.RS]).y - mid(lm[LM.LH], lm[LM.RH]).y) || 0.25 : 0.25;
    const midX = mid(lm[LM.LS], lm[LM.RS]).x, shY = mid(lm[LM.LS], lm[LM.RS]).y;
    let extended = false;
    for (const [side, S, E, Wr] of [['L', LM.LS, LM.LE, LM.LW], ['R', LM.RS, LM.RE, LM.RW]]) {
      const st = this.s[side], a = st.sm.push(angle(w[S], w[E], w[Wr]));
      // straight punch: elbow from bent (<110°) to nearly straight (>145°) within 450 ms
      if (st.state === 'guard' && a < 110) { st.since = t; }
      const forward = Math.abs(lm[Wr].y - shY) < 0.4 * torso; // punches go out at about shoulder height, not hanging down
      if (st.state === 'guard' && a > 145 && forward && t - st.since < 450 && t - st.last > 220) { st.state = 'out'; st.last = t; side === 'L' ? this.left++ : this.right++; events.push({ type: 'punch', side, kind: 'straight' }); }
      else if (st.state === 'out' && a < 115) { st.state = 'guard'; st.since = t; }
      if (st.state === 'out') extended = true;
      // hook: wrist swings across the body midline at about shoulder height
      const wx = lm[Wr].x, atShoulder = Math.abs(lm[Wr].y - shY) < 0.35 * torso;
      const across = side === 'L' ? wx < midX - 0.05 : wx > midX + 0.05; // image coords: person's left arm is on image right
      if (atShoulder && across && !st.crossed && t - st.last > 250 && a > 70 && a < 140) { st.crossed = true; st.last = t; side === 'L' ? this.left++ : this.right++; this.hooks++; events.push({ type: 'punch', side, kind: 'hook' }); }
      else if (!across) st.crossed = false;
    }
    // guard: both wrists at or above roughly chin level when not punching
    const guardUp = [LM.LW, LM.RW].every(i => lm[i].y < shY + 0.12 * torso);
    if (!extended && !guardUp) { this.guardDownSince ??= t; if (t - this.guardDownSince > 1200) flags.push('guard'); } else this.guardDownSince = null;
    this.guardOk = this.guardOk * 0.97 + (extended || guardUp ? 1 : 0) * 0.03;
    return { ready: true, events, flags };
  }
}

/** Dance/Latin: movement energy, on-beat score ("stay in rhythm"), and step-direction matching. */
export class RhythmMeter {
  constructor() { this.reset(); }
  reset() { this.prev = null; this.energy = 0; this.rhythm = 0.5; this.dirScore = 0.5; this.points = 0; this.speeds = []; this.cx = []; this.lastPeak = 0; }
  // beat: { period (ms), phase(t) -> 0..1 within the current beat, count(t) -> 1..8 }, dir: 'RRLL...' (8 chars; R/L/N) or ''
  frame(lm, t, beat, dir = '') {
    if (!allVisible(lm, [LM.LS, LM.RS, LM.LH, LM.RH])) return { ready: false, events: [], flags: [] };
    const pts = [LM.LS, LM.RS, LM.LH, LM.RH, LM.LW, LM.RW, LM.LA, LM.RA, LM.LK, LM.RK].map(i => lm[i]);
    const body = Math.abs(mid(lm[LM.LS], lm[LM.RS]).y - mid(lm[LM.LH], lm[LM.RH]).y) || 0.25;
    const cx = mid(lm[LM.LH], lm[LM.RH]).x;
    let speed = 0;
    if (this.prev) { const dt = Math.max(1, t - this.prev.t); speed = pts.reduce((s, p, k) => s + ((p.visibility ?? 1) > 0.5 ? dist2(p, this.prev.p[k]) : 0), 0) / body / dt * 1000; }
    this.prev = { t, p: pts.map(p => ({ x: p.x, y: p.y })) };
    this.energy = this.energy * 0.95 + Math.min(1, speed / 6) * 0.05;
    // peak detection on speed: a local maximum above a floor counts as a "hit"; score its distance to the nearest beat
    this.speeds.push({ t, s: speed }); if (this.speeds.length > 3) this.speeds.shift();
    const events = [];
    if (this.speeds.length === 3 && beat?.period) {
      const [a, b, c] = this.speeds;
      if (b.s > a.s && b.s >= c.s && b.s > 1.2 && b.t - this.lastPeak > beat.period * 0.45) {
        this.lastPeak = b.t; const ph = beat.phase(b.t); const err = Math.min(ph, 1 - ph); // 0 = on the beat, 0.5 = off
        const hit = 1 - 2 * err; this.rhythm = this.rhythm * 0.85 + hit * 0.15;
        if (hit > 0.6) { this.points += 1; events.push({ type: 'onbeat' }); }
      }
    }
    // direction: hips moving towards the expected side over the last ~half second
    this.cx.push({ t, x: cx }); while (this.cx.length && t - this.cx[0].t > 500) this.cx.shift();
    if (dir && beat?.count && this.cx.length > 3) {
      const want = dir[(beat.count(t) - 1) % dir.length];
      const dx = this.cx[this.cx.length - 1].x - this.cx[0].x; // image x grows to the person's LEFT (raw, unmirrored)
      if ((want === 'R' || want === 'L') && Math.abs(dx) > 0.01) { const ok = want === 'R' ? dx < 0 : dx > 0; this.dirScore = this.dirScore * 0.9 + (ok ? 1 : 0) * 0.1; }
    }
    const score = Math.round(100 * Math.min(1, 0.5 * Math.min(1, this.energy * 2.5) + 0.3 * Math.max(0, this.rhythm) + 0.2 * (dir ? this.dirScore : 0.7)));
    return { ready: true, events, flags: this.energy < 0.05 ? ['still'] : [], score, energy: this.energy, rhythm: Math.max(0, this.rhythm) };
  }
}

/** Yoga: approximate pose matching from key joint angles + stillness; the hold timer only counts while matched and steady. */
export function matchPose(pose, lm, w) {
  const need = [LM.LS, LM.RS, LM.LH, LM.RH, LM.LK, LM.RK, LM.LA, LM.RA];
  if (!allVisible(lm, need)) return { ready: false };
  const kL = angle(w[LM.LH], w[LM.LK], w[LM.LA]), kR = angle(w[LM.RH], w[LM.RK], w[LM.RA]);
  const torso = Math.abs(mid(lm[LM.LS], lm[LM.RS]).y - mid(lm[LM.LH], lm[LM.RH]).y) || 0.25;
  if (pose === 'chair') {
    const k = (kL + kR) / 2;
    if (k > 155) return { ready: true, ok: false, tip: 'Sink a bit lower into the chair pose', joints: [LM.LK, LM.RK] };
    if (k < 85) return { ready: true, ok: false, tip: 'Come up a little, knees no lower than the chair', joints: [LM.LK, LM.RK] };
    return { ready: true, ok: true, tip: 'Lovely chair pose. Breathe' };
  }
  if (pose === 'warrior2') {
    const bent = Math.min(kL, kR), straight = Math.max(kL, kR);
    const wide = Math.abs(lm[LM.LA].x - lm[LM.RA].x) > 1.3 * Math.abs(lm[LM.LS].x - lm[LM.RS].x);
    const armsOk = allVisible(lm, [LM.LW, LM.RW]) ? [LM.LW, LM.RW].every((i, k) => Math.abs(lm[i].y - lm[k ? LM.RS : LM.LS].y) < 0.3 * torso) : true;
    if (!wide) return { ready: true, ok: false, tip: 'Step your feet wider apart', joints: [LM.LA, LM.RA] };
    if (bent > 150) return { ready: true, ok: false, tip: 'Bend your front knee over your ankle', joints: [LM.LK, LM.RK] };
    if (straight < 150) return { ready: true, ok: false, tip: 'Straighten your back leg', joints: [LM.LK, LM.RK] };
    if (!armsOk) return { ready: true, ok: false, tip: 'Arms out at shoulder height', joints: [LM.LW, LM.RW] };
    return { ready: true, ok: true, tip: 'Strong warrior. Breathe' };
  }
  if (pose === 'tree') {
    const lift = Math.abs(lm[LM.LA].y - lm[LM.RA].y);
    const standing = lm[LM.LA].y > lm[LM.RA].y ? kL : kR;
    if (lift < 0.08 * torso) return { ready: true, ok: false, tip: 'Lift one foot onto your ankle or calf, hold the chair if you need', joints: [LM.LA, LM.RA] };
    if (standing < 155) return { ready: true, ok: false, tip: 'Stand tall on the supporting leg', joints: [LM.LK, LM.RK] };
    return { ready: true, ok: true, tip: 'Beautiful tree. Steady breath' };
  }
  return { ready: true, ok: true };
}
export class HoldTracker {
  constructor(pose = null) { this.pose = pose; this.reset(); }
  reset() { this.held = 0; this.prev = null; this.motion = 0; this.lastT = null; this.inPose = false; }
  frame(lm, w, t) {
    const m = this.pose ? matchPose(this.pose, lm, w) : { ready: allVisible(lm, [LM.LS, LM.RS, LM.LH, LM.RH]), ok: true };
    if (!m.ready) { this.lastT = t; return { ready: false, events: [], flags: [] }; }
    const pts = [LM.LS, LM.RS, LM.LH, LM.RH, LM.LW, LM.RW].map(i => ({ x: lm[i].x, y: lm[i].y }));
    if (this.prev) this.motion = this.motion * 0.85 + pts.reduce((s, p, k) => s + dist2(p, this.prev[k]), 0) * 0.15;
    this.prev = pts;
    const still = this.motion < 0.012;
    this.inPose = !!m.ok && still;
    if (this.inPose && this.lastT != null) this.held += Math.min(250, t - this.lastT) / 1000;
    this.lastT = t;
    return { ready: true, events: [], flags: m.ok ? (still ? [] : ['wobble']) : ['pose'], ok: m.ok, still, tip: m.tip, joints: m.joints, held: this.held };
  }
}

/** Pilates reps: bridge (from logic.js), side-lying leg lift, clam, bird dog; plank = straight-line hold. */
export function makePilates(kind) {
  if (kind === 'bridge') return makeAnalyser('bridge');
  if (kind === 'legLift' || kind === 'clam') {
    const [A, B, top, bottom] = kind === 'legLift' ? [LM.LA, LM.RA, 30, 14] : [LM.LK, LM.RK, 32, 15];
    const rc = new RepCounter({ mode: 'rise', top, bottom, minRepMs: 800 }), sm = new Smoother(0.4);
    return { rc, frame(lm, w, t) {
      if (!allVisible(lm, [A, B, LM.LH, LM.RH])) return { ready: false };
      const v = sm.push(angle(w[A], mid(w[LM.LH], w[LM.RH]), w[B])); const ev = rc.update(v, t);
      return { ready: true, value: v, events: ev ? [ev] : [], flags: [] };
    } };
  }
  if (kind === 'birddog') {
    const rc = new RepCounter({ mode: 'rise', top: 150, bottom: 120, minRepMs: 900 }), sm = new Smoother(0.4);
    return { rc, frame(lm, w, t) {
      const sides = [[LM.LH, LM.LS, LM.LW, LM.RS, LM.RH, LM.RA], [LM.RH, LM.RS, LM.RW, LM.LS, LM.LH, LM.LA]];
      let best = null;
      for (const [h, s, wr, s2, h2, an] of sides) if (allVisible(lm, [h, s, wr, s2, h2, an])) { const v = Math.min(angle(w[h], w[s], w[wr]), angle(w[s2], w[h2], w[an])); best = Math.max(best ?? 0, v); }
      if (best == null) return { ready: false };
      const v = sm.push(best), ev = rc.update(v, t); return { ready: true, value: v, events: ev ? [ev] : [], flags: [] };
    } };
  }
  if (kind === 'plank') {
    const h = { held: 0, lastT: null };
    return { rc: { reps: 0, reset() {} }, hold: h, frame(lm, w, t) {
      const side = [[LM.LS, LM.LH, LM.LK], [LM.RS, LM.RH, LM.RK]].find(ids => allVisible(lm, ids));
      if (!side) { h.lastT = t; return { ready: false }; }
      const a = angle(w[side[0]], w[side[1]], w[side[2]]);
      const horiz = Math.abs(lm[side[0]].y - lm[side[1]].y) < 0.6 * Math.abs(lm[side[0]].x - lm[side[1]].x);
      const ok = a > 150 && horiz;
      if (ok && h.lastT != null) h.held += Math.min(250, t - h.lastT) / 1000; h.lastT = t;
      return { ready: true, ok, held: h.held, tip: ok ? 'Solid plank. Breathe' : a <= 150 ? 'Make a straight line from head to knees' : 'Forearms and knees down, body long', events: [], flags: ok ? [] : ['line'] };
    } };
  }
  return makeAnalyser('timed');
}
