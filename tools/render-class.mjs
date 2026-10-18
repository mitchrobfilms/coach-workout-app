// Renders a full 30:00 class to MP4: trainer clips sequenced by the class script, on-screen move names, timers,
// 8-count for dance classes, and the same generated music the app plays (offline-synthesised), mixed in.
// Usage: node tools/render-class.mjs <classId|all> [outDir]
import { buildLibrary } from '../classes.js';
import { patternEvents, styleFor } from '../music.js';
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.resolve(process.argv[3] || '/workspace/class-renders');
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', FONT2 = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const FPS = 30, W = 1280, H = 720, SR = 32000;
const MEDIA = { march: 'warmup', pushup: 'wall-pushups', squat: 'squats', knees: 'knee-lifts', bridge: 'glute-bridges', lunge: 'lunges', deadbug: 'dead-bug', cool: 'cooldown' };
const CLASSES = buildLibrary(JSON.parse(fs.readFileSync(path.join(ROOT, 'library.json'), 'utf8'))), classById = id => CLASSES.find(c => c.id === id);
const has = p => fs.existsSync(path.join(ROOT, p));
const manifest = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'media/classes/manifest.json'), 'utf8')); } catch { return null; } })();

// --- same clip choice as the app (exact slug -> alt -> distinctive-token match -> class base move) ---
const GENERIC = new Set(['and', 'the', 'with', 'left', 'right', 'round', 'again', 'low', 'impact', 'pose', 'slow', 'easy', 'side', 'basic', 'combo', 'full', 'arms', 'arm', 'then', 'hold', 'chair', 'small', 'big', 'speed', 'power', 'finisher', 'layered', 'routine']);
const toks = s => new Set(String(s || '').toLowerCase().split(/[^a-z0-9]+/).map(w => w.replace(/(es|s)$/, '')).filter(w => w.length > 2 && !GENERIC.has(w)));
function movesOnDisk(id) { // manifest moves, plus any clip files present even before the manifest lists them
  const m = (manifest?.classes?.[id]?.moves || []).filter(x => x.slug);
  const dir = path.join(ROOT, 'media/classes', id);
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) { const s = f.match(/^([\w-]+?)(-hd)?\.mp4$/)?.[1]; if (s && !m.find(x => x.slug === s)) m.push({ slug: s, name: '' }); }
  return m;
}
function moveFor(cls, step, moves) {
  if (!step?.slug || !moves.length) return null;
  for (const k of [step.slug, ...(step.alt || [])]) { const hit = moves.find(m => m.slug === k); if (hit) return hit; }
  const want = new Set([...toks(step.slug), ...toks(step.name), ...(step.alt || []).flatMap(a => [...toks(a)])]);
  let best = null, score = 0;
  for (const m of moves) { const n = [...new Set([...toks(m.slug), ...toks(m.name)])].filter(w => want.has(w)).length; if (n > score) { score = n; best = m; } }
  return best || (step.kind === 'cool' ? null : moves[0]);
}
function sourceFor(cls, step, moves) {
  const mv = moveFor(cls, step, moves), b = `media/classes/${cls.id}`;
  if (mv) for (const p of [`${b}/${mv.slug}-hd.mp4`, `${b}/${mv.slug}.mp4`]) if (has(p)) return { kind: 'class-clip', file: p, slug: mv.slug };
  if (mv && has(`${b}/${mv.slug}.jpg`)) return { kind: 'poster', file: `${b}/${mv.slug}.jpg`, slug: mv.slug };
  const fb = MEDIA[step.fb] || 'warmup';
  for (const p of [`media/${cls.lead}/${fb}-hd.mp4`, `media/${cls.lead}/${fb}.mp4`, `media/${fb}.mp4`]) if (has(p)) return { kind: 'fallback', file: p, slug: fb };
  return { kind: 'poster', file: 'hero.jpg', slug: 'hero' };
}

// --- offline music synthesis (mirrors the WebAudio voices in music.js) ---
function synth(cls) {
  const N = cls.total * SR, buf = new Float32Array(N);
  let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32) * 2 - 1;
  const add = (t0, len, fn) => { const s0 = Math.floor(t0 * SR), n = Math.floor(len * SR); for (let i = 0; i < n && s0 + i < N; i++) if (s0 + i >= 0) buf[s0 + i] += fn(i / SR); };
  const dec = (t, att, rel) => t < att ? t / att : Math.exp(-(t - att) / (rel / 4));
  for (const s of cls.steps) {
    const style = styleFor(cls, s), bpm = s.bpm, spb = 60 / bpm, beats = s.dur / spb;
    const gainSec = s.kind === 'water' || s.kind === 'trans' ? 0.7 : 1;
    for (const e of patternEvents(style, 0, Math.ceil(beats))) {
      const t0 = s.at + e.b * spb; if (e.b * spb >= s.dur) continue;
      const d = e.d * spb, v = e.v * gainSec;
      let hp = 0, lp = 0;
      switch (e.type) {
        case 'kick': add(t0, 0.35, t => { const f = 55 + 95 * Math.exp(-t / 0.03); return v * Math.sin(2 * Math.PI * (55 * t + 95 * 0.03 * (1 - Math.exp(-t / 0.03)))) * Math.exp(-t / 0.09) * (f > 0 ? 1 : 1); }); break;
        case 'snare': case 'clap': add(t0, 0.25, t => { const x = rnd(); const y = x - hp; hp = x; return v * 0.35 * y * Math.exp(-t / (e.type === 'clap' ? 0.04 : 0.06)); }); break;
        case 'hat': case 'ohat': case 'shaker': add(t0, e.type === 'ohat' ? 0.25 : 0.08, t => { const x = rnd(); const y = x - hp; hp = x; return v * 0.18 * y * Math.exp(-t / (e.type === 'ohat' ? 0.06 : 0.015)); }); break;
        case 'clave': add(t0, 0.08, t => v * 0.3 * Math.sin(2 * Math.PI * e.f * t) * Math.exp(-t / 0.015)); break;
        case 'conga': add(t0, 0.25, t => v * 0.45 * Math.sin(2 * Math.PI * (e.f * t + e.f * 0.4 * 0.012 * (1 - Math.exp(-t / 0.012)))) * Math.exp(-t / 0.05)); break;
        case 'bass': add(t0, d + 0.05, t => { const ph = (e.f * t) % 1; const tri = 4 * Math.abs(ph - 0.5) - 1; lp += 0.2 * (tri - lp); return v * 0.5 * lp * dec(t, 0.01, d); }); break;
        case 'stab': add(t0, 0.25, t => v * 0.12 * (((e.f * t) % 1) < 0.5 ? 1 : -1) * Math.exp(-t / 0.05)); break;
        case 'pad': add(t0, d, t => v * 0.5 * (Math.sin(2 * Math.PI * e.f * t) + Math.sin(2 * Math.PI * e.f * 1.005 * t)) * Math.min(1, t / 2, (d - t) / 2)); break;
        case 'bell': add(t0, 3, t => v * Math.sin(2 * Math.PI * e.f * t) * Math.exp(-t / 0.7)); break;
      }
    }
    for (const k of [3, 2, 1]) add(s.at + s.dur - k, 0.12, t => 0.25 * Math.sin(2 * Math.PI * 660 * t) * Math.exp(-t / 0.05)); // countdown beeps
  }
  let peak = 0; for (let i = 0; i < N; i++) { buf[i] = Math.tanh(buf[i] * 0.9); peak = Math.max(peak, Math.abs(buf[i])); }
  const g = 0.85 / (peak || 1), wav = Buffer.alloc(44 + N * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + N * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(N * 2, 40);
  for (let i = 0; i < N; i++) wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i] * g)) * 32767), 44 + i * 2);
  return wav;
}

// --- video ---
const SECTION = { warm: 'WARM-UP', main: 'MAIN SET', trans: 'TRANSITION', water: 'WATER BREAK', cool: 'COOL-DOWN' };
const q = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\u2019"); // textfiles avoid filter escaping; just normalise quotes
function segment(cls, s, i, moves, tmp) {
  const rest = s.kind === 'trans' || s.kind === 'water';
  const nxt = cls.steps[i + 1];
  const src = sourceFor(cls, rest && nxt ? nxt : s, moves);
  const tf = (name, text) => { const p = path.join(tmp, `${i}-${name}.txt`); fs.writeFileSync(p, q(text)); return p.replace(/:/g, '\\:'); };
  const D = s.dur, REM = cls.total - s.at, frames = D * FPS;
  const dance = cls.eightCount && !rest && s.kind !== 'cool';
  const f = [];
  f.push(`[0:v]fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1${rest ? ',eq=brightness=-0.18:saturation=0.55' : ''}[b0]`);
  const dt = [];
  dt.push(`drawbox=x=0:y=0:w=iw:h=70:color=black@0.5:t=fill`);
  dt.push(`drawtext=fontfile=${FONT}:textfile='${tf('title', `RETA COACH  ·  ${cls.name.toUpperCase()}`)}':fontsize=26:fontcolor=white:x=26:y=22`);
  dt.push(`drawtext=fontfile=${FONT}:text='%{eif\\:floor(ceil(${REM}-t)/60)\\:d}\\:%{eif\\:mod(ceil(${REM}-t),60)\\:d\\:2} left':fontsize=26:fontcolor=0x16d4c0:x=w-tw-26:y=22`);
  // class progress bar
  dt.push(`drawbox=x=0:y=70:w=iw:h=6:color=white@0.25:t=fill`);
  dt.push(`drawbox=x=0:y=70:w=${Math.round(W * s.at / cls.total)}:h=6:color=0x16d4c0@0.9:t=fill`);
  if (rest) {
    dt.push(`drawtext=fontfile=${FONT}:textfile='${tf('sec', SECTION[s.kind])}':fontsize=40:fontcolor=0x16d4c0:x=(w-tw)/2:y=h/2-150`);
    dt.push(`drawtext=fontfile=${FONT2}:textfile='${tf('nu', 'NEXT UP')}':fontsize=30:fontcolor=white@0.8:x=(w-tw)/2:y=h/2-80`);
    dt.push(`drawtext=fontfile=${FONT}:textfile='${tf('nn', nxt ? nxt.name : 'Finish')}':fontsize=58:fontcolor=white:x=(w-tw)/2:y=h/2-30:box=1:boxcolor=black@0.45:boxborderw=14`);
    dt.push(`drawtext=fontfile=${FONT2}:textfile='${tf('nh', s.kind === 'water' ? 'Grab a sip of water.' : (nxt?.how || '').split('. ')[0])}':fontsize=26:fontcolor=white:x=(w-tw)/2:y=h/2+60`);
    dt.push(`drawtext=fontfile=${FONT}:text='%{eif\\:ceil(${D}-t)\\:d}':fontsize=120:fontcolor=white:x=(w-tw)/2:y=h-200`);
  } else {
    dt.push(`drawbox=x=0:y=ih-170:w=iw:h=170:color=black@0.45:t=fill`);
    dt.push(`drawtext=fontfile=${FONT}:textfile='${tf('sec', SECTION[s.kind])}':fontsize=24:fontcolor=0x16d4c0:x=36:y=h-158`);
    dt.push(`drawtext=fontfile=${FONT}:textfile='${tf('name', s.name)}':fontsize=50:fontcolor=white:x=36:y=h-124`);
    const cues = s.counts?.length ? s.counts.map((c, k) => [k * 16, k === s.counts.length - 1 ? D : (k + 1) * 16, k ? `Layer it up: ${c}` : c]) : [[0, D, s.combo ? `Combo: ${s.combo}  ·  ${s.how.split('. ').slice(-1)[0]}` : s.how]];
    cues.forEach(([a, b, c], k) => { if (a < D) dt.push(`drawtext=fontfile=${FONT2}:textfile='${tf('cue' + k, c.length > 78 ? c.slice(0, 76) + '…' : c)}':fontsize=25:fontcolor=white@0.92:x=36:y=h-58:enable='between(t,${a},${Math.min(b, D)})'`); });
    dt.push(`drawtext=fontfile=${FONT}:text='%{eif\\:floor(ceil(${D}-t)/60)\\:d}\\:%{eif\\:mod(ceil(${D}-t),60)\\:d\\:2}':fontsize=74:fontcolor=white:x=w-tw-36:y=h-140`);
    if (s.fix) dt.push(`drawtext=fontfile=${FONT}:textfile='${tf('fix', '⚠ ' + s.fix)}':fontsize=28:fontcolor=0x2a1a00:box=1:boxcolor=0xffb547@0.95:boxborderw=14:x=(w-tw)/2:y=110`);
    if (s.kind === 'main' && D >= 10) dt.push(`drawtext=fontfile=${FONT}:text='10 SECONDS!':fontsize=34:fontcolor=0xffb547:x=w-tw-36:y=h-196:enable='gte(t,${D - 10})'`);
    if (dance) {
      dt.push(`drawbox=x=iw-190:y=96:w=164:h=170:color=black@0.5:t=fill`);
      dt.push(`drawtext=fontfile=${FONT2}:text='COUNT':fontsize=22:fontcolor=white@0.8:x=w-108-tw/2:y=106`);
      dt.push(`drawtext=fontfile=${FONT}:text='%{eif\\:mod(floor(t*${s.bpm}/60),8)+1\\:d}':fontsize=104:fontcolor=0x16d4c0:x=w-108-tw/2:y=136`);
      dt.push(`drawtext=fontfile=${FONT2}:text='${s.bpm} BPM':fontsize=18:fontcolor=white@0.7:x=w-108-tw/2:y=244`);
    }
  }
  f.push(`[b0]${dt.join(',')}[v]`);
  const fg = path.join(tmp, `${i}.fg`); fs.writeFileSync(fg, f.join(';\n'));
  const out = path.join(tmp, `seg${String(i).padStart(3, '0')}.mp4`);
  const input = src.file.endsWith('.jpg') ? ['-loop', '1', '-framerate', String(FPS), '-i', path.join(ROOT, src.file)] : ['-stream_loop', '-1', '-i', path.join(ROOT, src.file)];
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...input, '-/filter_complex', fg, '-map', '[v]', '-frames:v', String(frames), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-maxrate', '1500k', '-bufsize', '3000k', '-pix_fmt', 'yuv420p', '-g', '60', '-threads', '6', '-an', out], { stdio: 'inherit' });
  return { out, src };
}
async function render(id) {
  const cls = classById(id); if (!cls) throw new Error('unknown class ' + id);
  const tmp = path.join(OUT, `.tmp-${id}`); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  const moves = movesOnDisk(id), t0 = Date.now(), used = [];
  fs.writeFileSync(path.join(tmp, 'music.wav'), synth(cls));
  const list = cls.steps.map((s, i) => { const r = segment(cls, s, i, moves, tmp); used.push(`${s.name} -> ${r.src.kind}:${r.src.slug}`); return `file '${r.out}'`; });
  fs.writeFileSync(path.join(tmp, 'list.txt'), list.join('\n'));
  const out = path.join(OUT, `${id}.mp4`);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'), '-i', path.join(tmp, 'music.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-t', String(cls.total), '-movflags', '+faststart', out], { stdio: 'inherit' });
  fs.writeFileSync(path.join(OUT, `${id}.sources.txt`), used.join('\n') + '\n');
  fs.rmSync(tmp, { recursive: true, force: true });
  const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim();
  console.log(`${id}: ${out} ${(fs.statSync(out).size / 1e6).toFixed(1)} MB, ${dur}s, ${((Date.now() - t0) / 60000).toFixed(1)} min; class clips: ${used.filter(u => u.includes('class-clip')).length}/${used.length}`);
}
const ids = process.argv[2] === 'all' ? CLASSES.map(c => c.id) : [process.argv[2] || 'boxing'];
for (const id of ids) await render(id);
