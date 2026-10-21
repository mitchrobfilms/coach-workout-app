// Video class library (library-videos.json, fetched fresh each launch so the list updates without an app release).
// The member list is currently empty (third-party videos removed 2026-10-21); GLP1 Life Coach Ava classes are added here after
// human safety review. Player/Cast code is kept: <video> sources (e.g. Bunny Stream / archive) are Google-Cast-able;
// YouTube would play only in the official embed player (youtube-nocookie). No download/re-host.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let LIB = null;
export async function loadVideos() {
  try { const r = await fetch(`library-videos.json?v=${Date.now()}`, { cache: 'no-store' }); if (r.ok) { LIB = await r.json(); localStorage.setItem('glp1life.videos', JSON.stringify(LIB)); } } catch {}
  if (!LIB) try { LIB = JSON.parse(localStorage.getItem('glp1life.videos') || 'null'); } catch {}
  return LIB;
}
export const videoById = id => LIB?.videos?.find(v => v.id === id);
export function videoCard(v) {
  return `<button type="button" class="vcard" data-video="${esc(v.id)}"><span class="vthumb"><img src="${esc(v.poster)}" alt="" loading="lazy" decoding="async"><span class="vmins">${v.mins} min</span></span><span class="vtxt"><b>${esc(v.title)}</b><small>${esc(v.credit)}</small></span></button>`;
}
const ORDER = ['warmup', 'cooldown', 'walking', 'chair', 'cardio', 'strength', 'band', 'dumbbell', 'core', 'dance', 'yoga', 'pilates', 'stretch', 'recovery', 'breathing'];
const mini = v => `<button type="button" class="vmini" data-video="${esc(v.id)}"><span class="vthumb"><img src="${esc(v.poster)}" alt="" loading="lazy" decoding="async"><span class="vmins">${v.mins} min</span></span><b>${esc(v.title)}</b><small class="vby">${esc(v.channel || v.credit?.split(',')[0] || '')}</small><small>${esc(v.level || 'Beginner')}${v.chair ? ' · 🪑 Chair-friendly' : v.equipment && v.equipment !== 'None' ? ' · ' + esc(v.equipment) : ''}</small></button>`;
const COMING_SOON = `<div class="card vsoon" id="vSoon"><span class="vsicon" aria-hidden="true">🎬</span><h3>New Coach Ava classes coming soon</h3><p>We're filming brand-new GLP1 Life follow-along classes, from gentle seated sessions to easy walks. They'll appear here as soon as they're ready.</p><p class="small muted">In the meantime, keep moving with a gentle walk and check out the GLP1 Life Course above.</p></div>`;
// Netflix-style rows per category; "See all" opens that category as a grid.
export function renderVideoLib(el, { filter = '' } = {}) {
  if (!LIB) { el.innerHTML = '<p class="small muted">Video classes load when you\'re online.</p>'; return; }
  const cats = LIB.categories || {}, vids = (LIB.videos || []).filter(v => v.embeddable);
  if (!vids.length) { el.innerHTML = COMING_SOON; return; }
  const keys = [...ORDER.filter(k => cats[k]), ...Object.keys(cats).filter(k => !ORDER.includes(k))];
  if (filter) {
    const list = vids.filter(v => v.cat === filter);
    el.innerHTML = `<div class="vrowhead"><button type="button" class="chip" id="vBack">← All workouts</button></div><h3>${esc(cats[filter])} <span class="small muted">${list.length}</span></h3><div class="vgrid2">${list.map(mini).join('')}</div>`;
    el.querySelector('#vBack').onclick = () => { renderVideoLib(el); el.scrollIntoView({ block: 'start' }); };
    return;
  }
  // Netflix-style category tiles (image + name + count); tap opens that category's grid.
  el.innerHTML = `<div class="vtiles">${keys.map(k => { const list = vids.filter(v => v.cat === k); if (!list.length) return '';
    return `<button type="button" class="vtile" data-vcat="${k}"><img src="${esc(list.find(v => v.source === 'youtube')?.poster || list[0].poster)}" alt="" loading="lazy" decoding="async"><span class="vtname">${esc(cats[k])}</span><span class="vtcount">${list.length} ${list.length === 1 ? 'class' : 'classes'}</span></button>`; }).join('')}</div>`;
  el.querySelectorAll('[data-vcat]').forEach(b => b.onclick = () => { renderVideoLib(el, { filter: b.dataset.vcat }); el.scrollIntoView({ block: 'start' }); });
}
// Player sheet
const WARM = { chair: ['Seated marching', 'Arm circles', 'Shoulder rolls', 'Seated side reaches', 'Ankle circles'], def: ['March on the spot', 'Arm circles', 'Shoulder rolls', 'Hip circles', 'Side steps'] };
const COOL = ['Slow march, slowing down', 'Calf stretch (each side)', 'Chest opener', 'Side stretch (each side)', 'Deep breaths'];
// Optional warm-up before a class (30 s per move, then auto-continues); cool-down card after.
function moveTimer(m, moves, title, done, { skipLabel = 'Skip to class' } = {}) {
  let i = 0, left = 30, t = null;
  const draw = () => { m.querySelector('.wbody').innerHTML = `<h2>${title}</h2><p class="wmove"><b>${esc(moves[i])}</b></p><p class="wclock">${left}s</p><p class="small muted">Move ${i + 1} of ${moves.length} · go gently</p><div class="row"><button type="button" id="wSkip">${skipLabel}</button></div>`; m.querySelector('#wSkip').onclick = () => { clearInterval(t); done(); }; };
  t = setInterval(() => { if (!m.isConnected || m.hidden) return clearInterval(t); if (--left <= 0) { i++; left = 30; if (i >= moves.length) { clearInterval(t); return done(); } navigator.vibrate?.(40); } draw(); }, 1000);
  draw();
}
export function openVideo(v, opts = {}) {
  if (!v) return;
  return playVideo(v, opts); // classes play straight away; warm-up/cool-down are their own categories
}
// Dormant: old timed warm-up card (kept, not used).
export function openWarmupCard(v, opts = {}) {
  let m = document.getElementById('videoModal');
  if (!m) { m = document.createElement('div'); m.id = 'videoModal'; m.className = 'overlay recipe'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); document.body.append(m); }
  const moves = WARM[v.cat] || WARM.def;
  m.innerHTML = `<div class="rsheet vsheet warm"><button type="button" class="rclose" id="videoClose" aria-label="Close">✕</button><div class="wbody"><h2>🔥 Warm up first?</h2><p>A 2½-minute warm-up before <b>${esc(v.title)}</b>:</p><ul>${moves.map(x => `<li>${esc(x)} · 30s</li>`).join('')}</ul>
    <div class="row"><button type="button" class="primary" id="wStart">Start warm-up</button><button type="button" id="wSkip">Skip to class</button></div></div></div>`;
  m.hidden = false; document.body.classList.add('modal-open');
  const close = () => { m.hidden = true; m.innerHTML = ''; document.body.classList.remove('modal-open'); };
  m.querySelector('#videoClose').onclick = close; m.onclick = e => { if (e.target === m) close(); };
  const go = () => playVideo(v, opts);
  m.querySelector('#wSkip').onclick = go; m.querySelector('#wStart').onclick = () => moveTimer(m, moves, '🔥 Warm-up', go);
  return 'warmup';
}
export function coolDown() {
  const m = document.getElementById('videoModal'); if (!m) return;
  m.innerHTML = `<div class="rsheet vsheet warm"><button type="button" class="rclose" id="videoClose" aria-label="Close">✕</button><div class="wbody"></div></div>`;
  const close = () => { m.hidden = true; m.innerHTML = ''; document.body.classList.remove('modal-open'); };
  m.querySelector('#videoClose').onclick = close;
  moveTimer(m, COOL, '🧘 Cool-down', () => { m.querySelector('.wbody').innerHTML = '<h2>🎉 Well done!</h2><p>Have a drink of water.</p><button type="button" class="primary" id="wDone">Done</button>'; m.querySelector('#wDone').onclick = close; }, { skipLabel: 'Finish' });
}
function playVideo(v, { onCastSource } = {}) {
  if (!v.embeddable) return 'unavailable'; // never leave the app for YouTube
  let m = document.getElementById('videoModal');
  if (!m) { m = document.createElement('div'); m.id = 'videoModal'; m.className = 'overlay recipe'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); document.body.append(m); }
  const player = v.source === 'youtube'
    ? `<iframe class="vplayer" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.youtubeId)}?rel=0&modestbranding=1&playsinline=1&fs=1&iv_load_policy=3&origin=${encodeURIComponent(location.origin)}" title="${esc(v.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`
    : `<video class="vplayer" id="videoPlayer" src="${esc(v.src)}" poster="${esc(v.poster)}" controls playsinline preload="metadata"></video>`;
  m.innerHTML = `<div class="rsheet vsheet"><button type="button" class="rclose" id="videoClose" aria-label="Close">✕</button>${player}
    <div class="vbody"><h2>${esc(v.title)}</h2><p class="small muted">${v.mins} min · ${esc(v.level || 'Beginner')} · ${esc(LIB?.categories?.[v.cat] || '')}</p>
    <p class="small vcredit">${v.source === 'archive' ? `Video: <a href="${esc(v.page)}" target="_blank" rel="noopener">${esc(v.credit)}</a> (<a href="${esc(v.licenceUrl)}" target="_blank" rel="noopener">licence</a>). Shown unedited.` : `Video by ${esc(v.channel || v.credit)}, played in the official YouTube player.`}</p>
    <div class="row">${v.source === 'archive' ? '<button type="button" id="videoCast" class="primary">📺 Cast</button>' : '<button type="button" id="videoCast" class="primary" hidden>📺 Cast</button>'}</div>
    <p class="small muted">Go at your own pace and stop if anything hurts or you feel dizzy. Check with your GP before starting new exercise.</p></div></div>`;
  m.hidden = false; document.body.classList.add('modal-open');
  const close = () => { m.hidden = true; m.innerHTML = ''; document.body.classList.remove('modal-open'); };
  m.querySelector('#videoClose').onclick = close; m.onclick = e => { if (e.target === m) close(); };
  onCastSource?.(m.querySelector('#videoPlayer'), m.querySelector('#videoCast'), v);
  return 'opened';
}
export function pickIdeas(n = 3, seed = new Date().toDateString()) {
  const vs = (LIB?.videos || []).filter(v => v.embeddable); if (!vs.length) return [];
  let h = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7), out = [];
  while (out.length < Math.min(n, vs.length)) { h = (h * 1103515245 + 12345) >>> 0; const v = vs[h % vs.length]; if (!out.includes(v)) out.push(v); }
  return out;
}
