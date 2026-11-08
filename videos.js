// Video class library (library-videos.json, fetched fresh each launch so the list updates without an app release).
// Member classes are GLP1 Life Coach Ava videos after a person has checked them. Unpublished drafts stay out of this file.
// Player/Cast code is kept: <video> sources (e.g. Bunny Stream / archive) are Google-Cast-able;
// YouTube would play only in the official embed player (youtube-nocookie). No download/re-host.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let LIB = null;
export async function loadVideos() {
  try { const r = await fetch(`library-videos.json?v=${Date.now()}`, { cache: 'no-store' }); if (r.ok) { LIB = await r.json(); localStorage.setItem('glp1life.videos', JSON.stringify(LIB)); } } catch {}
  if (!LIB) try { LIB = JSON.parse(localStorage.getItem('glp1life.videos') || 'null'); } catch {}
  return LIB;
}
export const videoById = id => LIB?.videos?.find(v => v.id === id);
let isDone = () => false; export const setDoneLookup = f => { isDone = f; };
const fmtT = x => `${Math.floor(x / 60)}:${String(Math.round(x % 60)).padStart(2, '0')}`;
export function videoCard(v) {
  return `<button type="button" class="vcard" data-video="${esc(v.id)}"><span class="vthumb"><img src="${esc(v.poster)}" alt="" loading="lazy" decoding="async"><span class="vmins">${v.mins} min</span></span><span class="vtxt"><b>${esc(v.title)}</b><small>${esc(v.credit)}</small></span></button>`;
}
const ORDER = ['warmup', 'cooldown', 'walking', 'chair', 'fullbody', 'cardio', 'strength', 'band', 'dumbbell', 'core', 'dance', 'yoga', 'pilates', 'stretch', 'recovery', 'breathing'];
// Warm-up and cool-down stay as their own categories. They are not inserted into a class, and they have no video until one is published.
const STRUCTURAL = {
  warmup: 'Warm-up is its own category. It is not built into a class, and there is no published warm-up video yet.',
  cooldown: 'Cool-down is its own category. It is not added onto a class, and there is no published cool-down video yet.',
};
// Filters use fields that already exist on a published class. They never invent a class.
const FACETS = [
  { id: 'all', label: 'All' },
  { id: 'beginner', label: 'Beginner', test: v => v.level === 'Beginner' },
  { id: 'intermediate', label: 'Intermediate', test: v => v.level === 'Intermediate' },
  { id: 'chair', label: 'Chair', test: v => v.chair === true },
  { id: 'equipment-none', label: 'No equipment', test: v => !v.equipment || v.equipment === 'None' },
  { id: 'low', label: 'Low intensity', test: v => v.intensity === 'Low' },
  { id: 'moderate', label: 'Moderate', test: v => v.intensity === 'Moderate' },
  { id: '10', label: '10 min', test: v => Number(v.mins) === 10 },
  { id: '15', label: '15 min', test: v => Number(v.mins) === 15 },
];
let facet = 'all', query = '';
const facetOk = v => { const f = FACETS.find(x => x.id === facet); return !f?.test || f.test(v); };
const queryOk = v => {
  const q = query.trim().toLowerCase(); if (!q) return true;
  const cat = LIB?.categories?.[v.cat] || '';
  return [v.title, v.level, v.intensity, v.equipment, v.description, cat, `${v.mins} min`].join(' ').toLowerCase().includes(q);
};
const published = () => (LIB?.videos || []).filter(v => v.embeddable);
export const publishedVideos = published;
const matchedVideos = () => published().filter(v => facetOk(v) && queryOk(v));
const metaLine = v => [v.level || 'Beginner', v.intensity, v.chair ? 'Chair' : (v.equipment && v.equipment !== 'None' ? v.equipment : 'No equipment')].filter(Boolean).map(esc).join(' · ');
const mini = v => `<button type="button" class="vmini" data-video="${esc(v.id)}"><span class="vthumb"><img src="${esc(v.poster)}" alt="" loading="lazy" decoding="async"><span class="vmins">${v.mins} min</span>${isDone(v.id) ? '<span class="vdone">✓ Done</span>' : ''}</span><span class="vmeta"><b>${esc(v.title)}</b><small class="vby">${esc(v.channel || '')}</small><small>${metaLine(v)}</small></span></button>`;
const COMING_SOON = `<div class="card vsoon" id="vSoon"><span class="vsicon" aria-hidden="true">🎬</span><h3>New Coach Ava classes coming soon</h3><p>We're creating brand-new GLP1 Life follow-along classes with Coach Ava, our AI-generated instructor, from gentle seated sessions to easy walks. Each one is checked by a person before it appears here.</p><p class="small muted">In the meantime, keep moving with a gentle walk and check out the GLP1 Life Course above.</p></div>`;
const facetBar = () => `<div class="vchips" id="vFacets" role="toolbar" aria-label="Filter classes">${FACETS.map(f => `<button type="button" class="chip${facet === f.id ? ' on' : ''}" data-facet="${esc(f.id)}" aria-pressed="${facet === f.id}">${esc(f.label)}</button>`).join('')}</div><label class="vsearch">Search classes<input type="search" id="vSearch" value="${esc(query)}" placeholder="Title, level or equipment" aria-label="Search classes" enterkeyhint="search" autocomplete="off"></label>`;
function bindStudio(el) {
  el.querySelectorAll('[data-facet]').forEach(b => b.onclick = () => { facet = b.dataset.facet; renderVideoLib(el, { filter: el.dataset.vfilter || '' }); });
  const s = el.querySelector('#vSearch');
  if (s) s.oninput = () => { query = s.value; const pos = s.selectionStart; renderVideoLib(el, { filter: el.dataset.vfilter || '' }); const n = el.querySelector('#vSearch'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch {} } };
}
function emptyNote(title, text) { return `<div class="card vemptycat"><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`; }
// Category picture tiles open the classes in that category. Empty catalogue categories stay hidden.
export function renderVideoLib(el, { filter = '' } = {}) {
  if (!LIB) { el.innerHTML = '<p class="small muted">Video classes load when you\'re online.</p>'; return; }
  const cats = LIB.categories || {}, vids = published();
  if (!vids.length) { el.innerHTML = COMING_SOON; return; }
  el.dataset.vfilter = filter || '';
  const matched = matchedVideos();
  const filtering = facet !== 'all' || !!query.trim();
  if (filter) {
    const list = matched.filter(v => v.cat === filter);
    const bare = STRUCTURAL[filter] && !vids.some(v => v.cat === filter);
    const body = bare ? emptyNote('No video in this category', STRUCTURAL[filter])
      : list.length ? `<div class="vgrid2">${list.map(mini).join('')}</div>`
        : emptyNote('No matching class', `Nothing published in ${cats[filter] || 'this category'} matches these filters.`);
    el.innerHTML = `${facetBar()}<div class="vrowhead"><button type="button" class="chip" id="vBack">← All categories</button></div><h3 class="vcathead">${esc(cats[filter] || filter)} <span class="small muted">${list.length} ${list.length === 1 ? 'class' : 'classes'}</span></h3>${body}`;
    el.querySelector('#vBack').onclick = () => { renderVideoLib(el); el.scrollIntoView({ block: 'start' }); };
    bindStudio(el);
    return;
  }
  const keys = [...ORDER.filter(k => cats[k]), ...Object.keys(cats).filter(k => !ORDER.includes(k))];
  const withClasses = keys.filter(k => vids.some(v => v.cat === k));
  const structural = ['warmup', 'cooldown'].filter(k => cats[k] && !vids.some(v => v.cat === k));
  const tiles = [...withClasses, ...structural].map(k => {
    if (STRUCTURAL[k] && !vids.some(v => v.cat === k)) {
      if (facet !== 'all') return '';
      const q = query.trim().toLowerCase();
      const name = (cats[k] || k).toLowerCase();
      if (q && !name.includes(q) && !k.includes(q)) return '';
      return `<button type="button" class="vtile vempty" data-vcat="${esc(k)}"><span class="vtname">${esc(cats[k])}</span><span class="vtcount">No class video yet</span></button>`;
    }
    const list = matched.filter(v => v.cat === k);
    if (!list.length) return '';
    return `<button type="button" class="vtile" data-vcat="${esc(k)}"><img src="${esc(list[0].poster)}" alt="" loading="lazy" decoding="async"><span class="vtname">${esc(cats[k])}</span><span class="vtcount">${list.length} ${list.length === 1 ? 'class' : 'classes'}</span></button>`;
  }).join('');
  el.innerHTML = `${facetBar()}${tiles ? `<div class="vtiles">${tiles}</div>` : emptyNote('No matching class', 'No published class matches these filters.')}`;
  el.querySelectorAll('[data-vcat]').forEach(b => b.onclick = () => { renderVideoLib(el, { filter: b.dataset.vcat }); el.scrollIntoView({ block: 'start' }); });
  bindStudio(el);
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
function playVideo(v, { onCastSource, onComplete } = {}) {
  if (!v.embeddable) return 'unavailable'; // never leave the app for YouTube
  let m = document.getElementById('videoModal');
  if (!m) { m = document.createElement('div'); m.id = 'videoModal'; m.className = 'overlay recipe'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); document.body.append(m); }
  const bunny = v.source === 'bunny';
  const player = bunny
    ? `<iframe class="vplayer vbunny" id="videoFrame" src="https://iframe.mediadelivery.net/embed/${encodeURIComponent(v.bunnyLibrary)}/${encodeURIComponent(v.bunnyId)}?autoplay=true&preload=true&responsive=true" title="${esc(v.title)}" loading="eager" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`
    : v.source === 'youtube'
    ? `<iframe class="vplayer" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.youtubeId)}?rel=0&modestbranding=1&playsinline=1&fs=1&iv_load_policy=3&origin=${encodeURIComponent(location.origin)}" title="${esc(v.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`
    : `<video class="vplayer" id="videoPlayer" src="${esc(v.src)}" poster="${esc(v.poster)}" controls playsinline preload="metadata"></video>`;
  m.innerHTML = `<div class="rsheet vsheet${bunny ? ' vb' : ''}">${bunny ? '<div class="vbar"><span class="small muted">GLP1 Life class</span><button type="button" class="rclose" id="videoClose" aria-label="Close">✕</button></div>' : '<button type="button" class="rclose" id="videoClose" aria-label="Close">✕</button>'}${player}
    <div class="vbody"><h2>${esc(v.title)}</h2><p class="small muted">${v.mins} min · ${esc(v.level || 'Beginner')} · ${esc(LIB?.categories?.[v.cat] || '')}</p>
    ${bunny ? avaInfo(v) : ''}
    <p class="small vcredit"${bunny ? ' hidden' : ''}>${v.source === 'archive' ? `Video: <a href="${esc(v.page)}" target="_blank" rel="noopener">${esc(v.credit)}</a> (<a href="${esc(v.licenceUrl)}" target="_blank" rel="noopener">licence</a>). Shown unedited.` : `Video by ${esc(v.channel || v.credit)}, played in the official YouTube player.`}</p>
    <div class="row">${v.source === 'archive' ? '<button type="button" id="videoCast" class="primary">📺 Cast</button>' : '<button type="button" id="videoCast" class="primary" hidden>📺 Cast</button>'}</div>
    <p class="small muted">Go at your own pace and stop if anything hurts or you feel dizzy. Check with your GP before starting new exercise.</p></div></div>`;
  m.hidden = false; document.body.classList.add('modal-open');
  const close = () => { m.hidden = true; m.innerHTML = ''; document.body.classList.remove('modal-open'); };
  m.querySelector('#videoClose').onclick = close; m.onclick = e => { if (e.target === m) close(); };
  onCastSource?.(m.querySelector('#videoPlayer'), m.querySelector('#videoCast'), v);
  if (bunny) trackBunny(m, v, onComplete);
  return 'opened';
}
// Coach Ava class info (AI label lives here, never over the video) + exercise list.
function avaInfo(v) {
  const ins = LIB?.instructors?.[v.instructor] || {};
  return `<div class="avainfo"><p class="avaby"><img src="${esc(ins.photo || v.poster)}" alt=""><span><b>${esc(ins.name || v.channel)}</b> <span class="aibadge">${esc(ins.label || 'AI-generated instructor')}</span><br><small class="muted">${esc(ins.bio || '')}</small></span></p>
    <p>${esc(v.description || '')}</p><p class="small"><b>Equipment:</b> ${esc(v.equipment || 'None')} · <b>Intensity:</b> ${esc(v.intensity || 'Low')}</p>
    <details class="avaex"><summary>What's in this class (${(v.exercises || []).length} parts)</summary><ol>${(v.exercises || []).map(x => `<li><b>${esc(x.name)}</b> <small class="muted">${fmtT(x.start)}–${fmtT(x.end)}</small>${x.easier ? `<br><small>Easier: ${esc(x.easier)}</small>` : ''}</li>`).join('')}</ol></details>
    <div class="row"><button type="button" id="videoDoneBtn">${isDone(v.id) ? '✓ Completed · do it again any time' : '✓ Mark as done'}</button></div></div>`;
}
// Completion: Bunny's embed speaks player.js over postMessage ("ready", "timeupdate", "ended"); 90 % watched or "ended" = done.
function trackBunny(m, v, onComplete) {
  const fr = m.querySelector('#videoFrame'), btn = m.querySelector('#videoDoneBtn'); let done = false; if (window.__kova) window.__kova.videoTime = 0;
  const finish = how => { if (done) return; done = true; onComplete?.(v, how); if (btn) { btn.textContent = '✓ Completed · well done!'; btn.disabled = true; } };
  if (btn) btn.onclick = () => finish('manual');
  const send = (method, value) => fr?.contentWindow?.postMessage(JSON.stringify({ context: 'player.js', version: '0.0.11', method, value, listener: value }), '*');
  const onMsg = e => {
    if (!m.isConnected || m.hidden) return removeEventListener('message', onMsg);
    if (e.source !== fr?.contentWindow) return; let d = e.data; try { if (typeof d === 'string') d = JSON.parse(d); } catch { return; }
    if (d?.context !== 'player.js') return;
    if (d.event === 'ready') { window.__kova && (window.__kova.videoPjs = 'ready'); send('addEventListener', 'timeupdate'); send('addEventListener', 'ended'); }
    else if (d.event === 'ended') finish('ended');
    else if (d.event === 'timeupdate' && d.value?.duration > 0) { window.__kova && (window.__kova.videoTime = d.value.seconds); if (d.value.seconds / d.value.duration >= 0.9) finish('watched'); }
  };
  addEventListener('message', onMsg);
}
export function pickIdeas(n = 3, seed = new Date().toDateString()) {
  const vs = (LIB?.videos || []).filter(v => v.embeddable); if (!vs.length) return [];
  let h = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7), out = [];
  while (out.length < Math.min(n, vs.length)) { h = (h * 1103515245 + 12345) >>> 0; const v = vs[h % vs.length]; if (!out.includes(v)) out.push(v); }
  return out;
}
