// Pure logic: angles, rep counters, coaching engine. No DOM; importable in Node for tests.
export const LM = { LS:11, RS:12, LE:13, RE:14, LW:15, RW:16, LH:23, RH:24, LK:25, RK:26, LA:27, RA:28 };
export const VIS = 0.5;

export function angle(a, b, c) {
  const abx = a.x - b.x, aby = a.y - b.y, abz = (a.z || 0) - (b.z || 0);
  const cbx = c.x - b.x, cby = c.y - b.y, cbz = (c.z || 0) - (b.z || 0);
  const dot = abx * cbx + aby * cby + abz * cbz;
  const m = Math.hypot(abx, aby, abz) * Math.hypot(cbx, cby, cbz);
  if (!m) return 180;
  return Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180 / Math.PI;
}
const vis = (lm, i) => (lm[i] && (lm[i].visibility ?? 1)) || 0;
export const allVisible = (lm, ids) => ids.every(i => vis(lm, i) > VIS);

// Pick the better-visible side for a joint chain. Returns [ids] or null.
export function pickSide(lm, left, right) {
  const okL = allVisible(lm, left), okR = allVisible(lm, right);
  if (!okL && !okR) return null;
  if (okL && okR) {
    const s = ids => ids.reduce((t, i) => t + vis(lm, i), 0);
    return s(left) >= s(right) ? left : right;
  }
  return okL ? left : right;
}

export class Smoother { // exponential moving average
  constructor(a = 0.4) { this.a = a; this.v = null; }
  push(x) { this.v = this.v == null ? x : this.v + this.a * (x - this.v); return this.v; }
  reset() { this.v = null; }
}

/** Threshold rep counter with hysteresis.
 * mode 'dip': rest above `top`, rep when value drops below `bottom` and comes back above `top`.
 * mode 'rise': rest below `bottom`, rep when value rises above `top` and comes back below `bottom`... counted at the top.
 * Tracks extreme reached so the coach can flag shallow reps (`shallowBand`). */
export class RepCounter {
  constructor({ mode = 'dip', top, bottom, shallowBand = null, minRepMs = 400 }) {
    Object.assign(this, { mode, top, bottom, shallowBand, minRepMs });
    this.reset();
  }
  reset() { this.state = 'rest'; this.reps = 0; this.extreme = null; this.started = 0; this.lastRepAt = 0; }
  // returns event or null: {type:'rep', ms} | {type:'shallow', extreme}
  update(v, t) {
    if (this.mode === 'dip') {
      if (this.state === 'rest') {
        if (v < this.top - 12) { this.state = 'moving'; this.extreme = v; this.started = t; }
      } else if (this.state === 'moving') {
        this.extreme = Math.min(this.extreme, v);
        if (v < this.bottom) this.state = 'deep';
        else if (v > this.top) {
          this.state = 'rest';
          const [lo, hi] = this.shallowBand || [];
          if (this.shallowBand && this.extreme >= lo && this.extreme <= hi) return { type: 'shallow', extreme: this.extreme };
        }
      } else if (this.state === 'deep') {
        this.extreme = Math.min(this.extreme, v);
        if (v > this.top) return this._count(t);
      }
    } else { // rise
      if (this.state === 'rest') {
        if (v > this.bottom + 8) { this.state = 'moving'; this.extreme = v; this.started = t; }
        else if (v < this.bottom) this.started = t;
      } else if (this.state === 'moving') {
        this.extreme = Math.max(this.extreme, v);
        if (v > this.top) return this._count(t, 'peak');
        if (v < this.bottom) {
          this.state = 'rest';
          const [lo, hi] = this.shallowBand || [];
          if (this.shallowBand && this.extreme >= lo && this.extreme <= hi) return { type: 'shallow', extreme: this.extreme };
        }
      } else if (this.state === 'peak') {
        if (v < this.bottom) { this.state = 'rest'; this.started = t; }
      }
    }
    return null;
  }
  _count(t, next = 'rest') {
    const ms = t - this.started;
    this.state = next;
    if (t - this.lastRepAt < this.minRepMs) return null; // debounce
    this.reps++; this.lastRepAt = t;
    return { type: 'rep', ms, reps: this.reps };
  }
}

/** Knee lifts: count each side when knee rises above hip height (image y is down). */
export class KneeLiftCounter {
  constructor() { this.reset(); }
  reset() { this.reps = 0; this.up = { L: false, R: false }; this.lastRepAt = 0; this.last = null; }
  update(lm, t) {
    let ev = null;
    for (const [s, hip, knee] of [['L', LM.LH, LM.LK], ['R', LM.RH, LM.RK]]) {
      if (!allVisible(lm, [hip, knee])) continue;
      const torso = Math.abs(lm[s === 'L' ? LM.LS : LM.RS].y - lm[hip].y) || 0.25;
      const d = lm[knee].y - lm[hip].y; // negative = above hip
      if (!this.up[s] && d < 0.05 * torso) { // knee at/above hip line (small tolerance)
        this.up[s] = true;
        if (t - this.lastRepAt > 250) { this.reps++; this.lastRepAt = t; ev = { type: 'rep', side: s, reps: this.reps, ms: this.last ? t - this.last : 1500 }; this.last = t; }
      } else if (this.up[s] && d > 0.25 * torso) this.up[s] = false;
    }
    return ev;
  }
}

/** Per-move analysers. Each returns {ready, value, events:[], flags:[]} for a frame. */
export function makeAnalyser(id) {
  const sm = new Smoother(0.45);
  const form = new Smoother(0.3);
  switch (id) {
    case 'pushup': {
      const rc = new RepCounter({ mode: 'dip', top: 150, bottom: 110, shallowBand: [110, 132] });
      return { rc, frame(lm, w, t) {
        const side = pickSide(lm, [LM.LS, LM.LE, LM.LW], [LM.RS, LM.RE, LM.RW]);
        if (!side) return { ready: false };
        const a = sm.push(angle(w[side[0]], w[side[1]], w[side[2]]));
        const ev = rc.update(a, t); const flags = [];
        const body = side[0] === LM.LS ? [LM.LS, LM.LH, LM.LA] : [LM.RS, LM.RH, LM.RA];
        if (allVisible(lm, body)) { const b = form.push(angle(w[body[0]], w[body[1]], w[body[2]])); if (b < 160) flags.push('straight'); }
        return { ready: true, value: a, events: ev ? [ev] : [], flags };
      } };
    }
    case 'squat': {
      const rc = new RepCounter({ mode: 'dip', top: 160, bottom: 100, shallowBand: [100, 120] });
      return { rc, frame(lm, w, t) {
        const side = pickSide(lm, [LM.LH, LM.LK, LM.LA], [LM.RH, LM.RK, LM.RA]);
        if (!side) return { ready: false };
        const a = sm.push(angle(w[side[0]], w[side[1]], w[side[2]]));
        const ev = rc.update(a, t);
        return { ready: true, value: a, events: ev ? [ev] : [], flags: [] };
      } };
    }
    case 'knees': {
      const rc = new KneeLiftCounter();
      return { rc, frame(lm, w, t) {
        if (!allVisible(lm, [LM.LH, LM.RH, LM.LK, LM.RK])) return { ready: false };
        const ev = rc.update(lm, t);
        return { ready: true, events: ev ? [ev] : [], flags: [] };
      } };
    }
    case 'bridge': {
      const rc = new RepCounter({ mode: 'rise', top: 165, bottom: 140, shallowBand: [148, 165] });
      return { rc, frame(lm, w, t) {
        const side = pickSide(lm, [LM.LS, LM.LH, LM.LK], [LM.RS, LM.RH, LM.RK]);
        if (!side) return { ready: false };
        const a = sm.push(angle(w[side[0]], w[side[1]], w[side[2]]));
        const ev = rc.update(a, t);
        return { ready: true, value: a, events: ev ? [ev] : [], flags: [] };
      } };
    }
    case 'lunge': {
      const rc = new RepCounter({ mode: 'dip', top: 155, bottom: 110, shallowBand: [110, 130] });
      return { rc, frame(lm, w, t) {
        const L = allVisible(lm, [LM.LH, LM.LK, LM.LA]), R = allVisible(lm, [LM.RH, LM.RK, LM.RA]);
        if (!L && !R) return { ready: false };
        const aL = L ? angle(w[LM.LH], w[LM.LK], w[LM.LA]) : 180, aR = R ? angle(w[LM.RH], w[LM.RK], w[LM.RA]) : 180;
        const a = sm.push(Math.min(aL, aR)); // front knee bends most
        const ev = rc.update(a, t);
        return { ready: true, value: a, events: ev ? [ev] : [], flags: [] };
      } };
    }
    case 'deadbug': { // heel-tap dead bug: hip angle (shoulder-hip-knee) opens as a heel taps down, closes as it returns
      const L = new RepCounter({ mode: 'rise', top: 125, bottom: 105, minRepMs: 350 }), R = new RepCounter({ mode: 'rise', top: 125, bottom: 105, minRepMs: 350 });
      const sL = new Smoother(0.45), sR = new Smoother(0.45);
      const rc = { reps: 0, reset() { L.reset(); R.reset(); this.reps = 0; } };
      return { rc, frame(lm, w, t) {
        const okL = allVisible(lm, [LM.LS, LM.LH, LM.LK]), okR = allVisible(lm, [LM.RS, LM.RH, LM.RK]);
        if (!okL && !okR) return { ready: false };
        const events = [];
        for (const [ok, c, sm, ids] of [[okL, L, sL, [LM.LS, LM.LH, LM.LK]], [okR, R, sR, [LM.RS, LM.RH, LM.RK]]]) {
          if (!ok) continue; const ev = c.update(sm.push(angle(w[ids[0]], w[ids[1]], w[ids[2]])), t);
          if (ev?.type === 'rep') { rc.reps++; events.push({ ...ev, reps: rc.reps }); }
        }
        return { ready: true, events: events.slice(0, 1), flags: [] };
      } };
    }
    default: // timed moves (march, deadbug, stretches): just need to be in frame
      return { rc: { reps: 0, reset() {} }, frame(lm) {
        return { ready: allVisible(lm, [LM.LS, LM.RS, LM.LH, LM.RH]), events: [], flags: [] };
      } };
  }
}

/** Rule-based coach. Turns pose/timer events into short lines, rotates phrases, throttles output. */
export const PHRASES = {
  greet: n => [`Hi ${n}, I'm Kova, your coach. Let's ease into week one.`, `Hey ${n}, Kova here. Great to see you, let's get moving.`, `Welcome back, ${n}. Kova here, nice and steady today.`],
  slow: ['Nice and slow.', 'Slow it down, control the move.', 'Easy tempo, no rush.', 'Take your time on each one.'],
  shallowSquat: ['Sit back a bit lower.', 'A bit lower if it feels OK.', 'Reach back for the chair.'],
  shallowPush: ['Bend the elbows a bit more.', 'A bit lower towards the wall.'],
  shallowBridge: ['Squeeze and lift higher.', 'Squeeze your glutes, lift a touch higher.'],
  shallowLunge: ['A bit lower if it feels OK.', 'Bend both knees a little more.'],
  straight: ['Keep your body straight.', 'Straight line from head to heels.', 'Tighten your tummy, body straight.'],
  five: ['Five! Great work.', "That's five, lovely.", 'Five down, looking strong.'],
  ten: ["Ten! You're flying.", 'Ten reps, brilliant.', "That's ten, superb."],
  ten_s: ['10 seconds, finish strong!', 'Last 10 seconds, you can do it!', '10 seconds left, keep going!'],
  idle: ["You've got this, keep moving.", 'Keep it going, nice and easy.', "Let's go again, you've got this."],
  frame: ['Step back so I can see your whole body.', "I can't see all of you, step back a little."],
  deadbug: ['Keep your back flat.', 'Arms up, tap one heel down.', 'Slow taps, back pressed into the floor.', 'Breathe out as the heel taps.'],
  lungeTip: ['Small step, keep hold of the chair.'],
  good: ['Lovely form.', 'Nice, that looks great.', 'Good, smooth rep.', 'Perfect, just like that.'],
  rest: ['Great set. Breathe.', 'Nice work. Shake it out.', 'Well done. Grab some water.'],
};

export class CoachEngine {
  constructor({ name = 'Mitchell', say = () => {}, now = () => Date.now(), throttleMs = 4000 } = {}) {
    Object.assign(this, { name, say, now, throttleMs });
    this.last = -1e9; this.used = {}; this.lastRepAt = now(); this.cueTimes = {};
  }
  pick(key) {
    let list = PHRASES[key]; if (typeof list === 'function') list = list(this.name);
    const u = this.used[key] || (this.used[key] = []);
    if (u.length >= list.length) u.length = 0;
    const pool = list.map((_, i) => i).filter(i => !u.includes(i) && i !== this._lastIdx?.[key]);
    const i = (pool.length ? pool : list.map((_, i) => i))[Math.floor(Math.random() * (pool.length || list.length))];
    u.push(i); (this._lastIdx ||= {})[key] = i;
    return list[i];
  }
  // force=true for transitions; otherwise throttled. perKeyMs avoids nagging with the same cue.
  line(key, { force = false, perKeyMs = 8000 } = {}) {
    const t = this.now();
    if (!force && (t - this.last < this.throttleMs || t - (this.cueTimes[key] || -1e9) < perKeyMs)) return null;
    const text = this.pick(key); this.last = t; this.cueTimes[key] = t;
    this.say(text, { kind: force ? 'high' : 'coach', key });
    return text;
  }
  startWork() { this.lastRepAt = this.now(); this.tenSaid = false; }
  // Called per frame during a work interval.
  onFrame({ move, result, timeLeft, counted }) {
    const t = this.now();
    if (timeLeft <= 10 && timeLeft > 8 && !this.tenSaid) { this.tenSaid = true; return this.line('ten_s', { force: true }); }
    if (!result.ready) return this.line('frame', { perKeyMs: 7000 });
    for (const f of result.flags || []) if (f === 'straight') { const r = this.line('straight'); if (r) return r; }
    for (const ev of result.events || []) {
      if (ev.type === 'rep') {
        this.lastRepAt = t;
        if (ev.reps === 5) return this.line('five', { force: true });
        if (ev.reps === 10) return this.line('ten', { force: true });
        if (move !== 'knees' && ev.ms < 1000) { const r = this.line('slow'); if (r) return r; }
        this.say(String(ev.reps), { kind: 'count' });
        if (Math.random() < 0.15) return this.line('good', { perKeyMs: 12000 });
        return null;
      }
      if (ev.type === 'shallow') {
        const key = { squat: 'shallowSquat', pushup: 'shallowPush', bridge: 'shallowBridge', lunge: 'shallowLunge' }[move];
        if (key) return this.line(key, { perKeyMs: 5000 });
      }
    }
    if (move === 'deadbug') return this.line('deadbug', { perKeyMs: 12000 });
    if (counted && t - this.lastRepAt > 8000) { this.lastRepAt = t; return this.line('idle'); }
    return null;
  }
  summary(totals, prev, labels = {}) {
    const sum = o => Object.values(o || {}).reduce((a, b) => a + b, 0);
    const now = sum(totals);
    let s = `Brilliant work, ${this.name}! You did ${now} reps today.`;
    if (prev) {
      const d = now - sum(prev.totals);
      s += d > 0 ? ` That's ${d} more than last time. ` : d === 0 ? ' Same as last time, nice and consistent. ' : ` That's ${-d} fewer than last time, which is completely fine. Rest well. `;
      let best = null, bd = 0;
      for (const k of Object.keys(totals)) { const dd = totals[k] - (prev.totals[k] || 0); if (dd > bd) { bd = dd; best = k; } }
      if (best) s += `Biggest jump: ${labels[best] || best}, up ${bd}.`;
    } else s += ' First session logged. Next time we compare!';
    return s.trim();
  }
}
