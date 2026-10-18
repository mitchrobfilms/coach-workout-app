// Royalty-free generated music. patternEvents() is pure (shared by the WebAudio player and the offline MP4 renderer).
// Event: { b (beat offset from the start of the segment), type, f (Hz), d (beats), v (0..1) }
const N = m => 440 * 2 ** ((m - 69) / 12); // MIDI -> Hz
const PROG = { boxing: [45, 45, 48, 43], dance: [45, 41, 48, 43], latin: [50, 43, 45, 45], ambient: [57, 53, 60, 55] }; // A min / F / C / G-ish
const chord = (root, minor = true) => [root, root + (minor ? 3 : 4), root + 7];

export function patternEvents(style, fromBeat, toBeat) {
  const ev = [], push = (b, type, f, d, v) => { if (b >= fromBeat && b < toBeat) ev.push({ b, type, f, d, v }); };
  for (let bar = Math.floor(fromBeat / 4); bar * 4 < toBeat; bar++) {
    const b0 = bar * 4, root = PROG[style === 'boxing' || style === 'dance' || style === 'latin' ? style : 'ambient'][Math.floor(bar / 2) % 4];
    if (style === 'boxing') {
      for (let k = 0; k < 4; k++) { push(b0 + k, 'kick', 55, 0.5, 1); push(b0 + k + 0.5, 'hat', 0, 0.1, 0.35); }
      push(b0 + 1, 'snare', 0, 0.3, 0.7); push(b0 + 3, 'snare', 0, 0.3, 0.7);
      for (const o of [0, 0.75, 1.5, 2.5, 3, 3.5]) push(b0 + o, 'bass', N(root - 12), 0.4, 0.55);
    } else if (style === 'dance') {
      for (let k = 0; k < 4; k++) { push(b0 + k, 'kick', 52, 0.5, 1); push(b0 + k + 0.5, 'ohat', 0, 0.25, 0.3); push(b0 + k + 0.25, 'hat', 0, 0.05, 0.15); push(b0 + k + 0.75, 'hat', 0, 0.05, 0.15); }
      push(b0 + 1, 'clap', 0, 0.3, 0.6); push(b0 + 3, 'clap', 0, 0.3, 0.6);
      for (const o of [0.5, 1.5, 2.5, 3.25, 3.5]) push(b0 + o, 'bass', N(root - 12), 0.3, 0.5);
      if (bar % 2 === 0) for (const m of chord(root + 12)) { push(b0 + 0.5, 'stab', N(m), 0.4, 0.18); push(b0 + 2.5, 'stab', N(m), 0.4, 0.14); }
    } else if (style === 'latin') {
      // 2-bar son clave (3-2), kick on 1 and 3, shaker 16ths, conga tumbao, anticipated bass, simple montuno
      const clave = bar % 2 === 0 ? [0, 1.5, 3] : [1, 2];
      for (const o of clave) push(b0 + o, 'clave', 2500, 0.1, 0.5);
      push(b0, 'kick', 60, 0.4, 0.8); push(b0 + 2, 'kick', 60, 0.4, 0.8);
      for (let k = 0; k < 16; k++) push(b0 + k / 4, 'shaker', 0, 0.05, k % 2 ? 0.12 : 0.2);
      push(b0 + 3, 'conga', 330, 0.2, 0.5); push(b0 + 3.5, 'conga', 330, 0.2, 0.5); push(b0 + 1, 'conga', 220, 0.2, 0.4);
      push(b0 + 1.5, 'bass', N(root - 12), 0.5, 0.55); push(b0 + 3, 'bass', N(root - 5), 0.9, 0.55);
      const c = chord(root + 12, root % 12 !== 7 && root % 12 !== 2);
      [0, 0.5, 1.5, 2, 3, 3.5].forEach((o, k) => push(b0 + o, 'stab', N(c[k % 3] + (k % 2 ? 12 : 0)), 0.25, 0.12));
    } else { // ambient pads: one chord per 2 bars, soft bell
      if (bar % 2 === 0) for (const m of chord(root)) push(b0, 'pad', N(m), 8, 0.12);
      if (bar % 2 === 1) push(b0 + 2, 'bell', N(root + 24), 3, 0.06);
    }
  }
  return ev;
}
export function styleFor(cls, step) { return step?.music || (step?.kind === 'cool' ? 'ambient' : cls.music); }

/** Browser player: schedules patternEvents a little ahead of time; exposes the beat clock for the 8-count and rhythm meter. */
export class MusicPlayer {
  constructor(actx) { this.actx = actx; this.master = actx.createGain(); this.master.gain.value = 0.5; this.master.connect(actx.destination); this.vol = 0.5; this.on = false; this.scheduled = 0; this.noise = null; }
  setVolume(v) { this.vol = Math.max(0, Math.min(1, v)); this.master.gain.setTargetAtTime(this.paused ? 0 : this.vol, this.actx.currentTime, 0.05); }
  start(style, bpm) { // re-anchor at "now" so the count starts at 1 on each new section
    this.style = style; this.bpm = bpm; this.t0 = this.actx.currentTime + 0.06; this.p0 = performance.now() + 60; this.nextBeat = 0; this.on = true;
    if (!this.timer) this.timer = setInterval(() => this._pump(), 50);
    this._pump();
  }
  setPaused(p) { this.paused = p; this.master.gain.setTargetAtTime(p ? 0 : this.vol, this.actx.currentTime, 0.05); if (!p && this.on) this.start(this.style, this.bpm); }
  stop() { this.on = false; clearInterval(this.timer); this.timer = null; this.master.gain.setTargetAtTime(0, this.actx.currentTime, 0.1); setTimeout(() => { try { this.master.disconnect(); } catch {} }, 400); }
  get period() { return 60000 / this.bpm; }
  beatFloat(now = this.actx.currentTime) { return (now - this.t0) * this.bpm / 60; }
  // Display/rhythm clock runs on performance.now() (same real-time base as the audio clock, but it also ticks where audio is suspended).
  beatAt(perfT = performance.now()) { return (perfT - this.p0) * this.bpm / 60000; }
  phase(perfT) { const b = this.beatAt(perfT); return ((b % 1) + 1) % 1; }
  count(perfT) { const b = Math.floor(this.beatAt(perfT)); return ((b % 8) + 8) % 8 + 1; }
  _pump() {
    if (!this.on || this.paused) return;
    const ahead = this.beatFloat(this.actx.currentTime + 0.25);
    if (ahead <= this.nextBeat) return;
    const to = Math.ceil(ahead * 4) / 4;
    for (const e of patternEvents(this.style, this.nextBeat, to)) { this._play(e, this.t0 + e.b * 60 / this.bpm); this.scheduled++; }
    this.nextBeat = to;
  }
  _noiseBuf() { if (this.noise) return this.noise; const a = this.actx, b = a.createBuffer(1, a.sampleRate, a.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return this.noise = b; }
  _play(e, t) {
    const a = this.actx, g = a.createGain(), dur = e.d * 60 / this.bpm; g.connect(this.master);
    const env = (peak, att, rel) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + att + rel); };
    const osc = (type, f) => { const o = a.createOscillator(); o.type = type; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + dur + 1.2); return o; };
    const noise = (hp) => { const s = a.createBufferSource(); s.buffer = this._noiseBuf(); const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; s.connect(f).connect(g); s.start(t); s.stop(t + 0.5); };
    switch (e.type) {
      case 'kick': { const o = osc('sine', 150); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(e.f, t + 0.12); env(e.v, 0.003, 0.3); break; }
      case 'snare': case 'clap': noise(1200); env(e.v * 0.5, 0.002, e.type === 'clap' ? 0.15 : 0.2); break;
      case 'hat': noise(7000); env(e.v * 0.4, 0.001, 0.05); break;
      case 'ohat': noise(6000); env(e.v * 0.35, 0.002, 0.2); break;
      case 'shaker': noise(5000); env(e.v * 0.3, 0.005, 0.05); break;
      case 'clave': osc('sine', e.f); env(e.v * 0.4, 0.001, 0.06); break;
      case 'conga': { const o = osc('sine', e.f * 1.4); o.frequency.exponentialRampToValueAtTime(e.f, t + 0.05); env(e.v * 0.6, 0.002, 0.18); break; }
      case 'bass': osc('triangle', e.f); env(e.v, 0.01, dur); break;
      case 'stab': osc('square', e.f); env(e.v * 0.35, 0.005, 0.18); break;
      case 'pad': { osc('sine', e.f); osc('sine', e.f * 1.005); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(e.v, t + 2); g.gain.linearRampToValueAtTime(0.0001, t + dur); break; }
      case 'bell': osc('sine', e.f); env(e.v, 0.01, 2.5); break;
    }
  }
}
