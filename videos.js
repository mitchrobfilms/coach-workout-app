// Video class library (library-videos.json, fetched fresh each launch so the list updates without an app release).
// Archive.org (Yoga With Melissa, CC BY-ND 4.0) plays unedited in a <video> and is Google-Cast-able;
// YouTube plays only in the official embed player (youtube-nocookie) - its own Cast button casts it. No download/re-host.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let LIB = null;
export async function loadVideos() {
  try { const r = await fetch(`library-videos.json?v=${Date.now()}`, { cache: 'no-store' }); if (r.ok) { LIB = await r.json(); localStorage.setItem('glp1life.videos', JSON.stringify(LIB)); } } catch {}
  if (!LIB) try { LIB = JSON.parse(localStorage.getItem('glp1life.videos') || 'null'); } catch {}
  return LIB;
}
export const videoById = id => LIB?.videos?.find(v => v.id === id);
export function videoCard(v) {
  if (!v.embeddable) return `<a class="vcard" href="${esc(v.page)}" target="_blank" rel="noopener" data-vext="${esc(v.id)}"><span class="vthumb" style="background-image:url('${esc(v.poster)}')"><span class="vmins">${v.mins} min</span><span class="vext">YouTube ↗</span></span><span class="vtxt"><b>${esc(v.title)}</b><small>${esc(v.credit)} · opens on YouTube</small></span></a>`;
  return `<button type="button" class="vcard" data-video="${esc(v.id)}"><span class="vthumb" style="background-image:url('${esc(v.poster)}')"><span class="vmins">${v.mins} min</span>${v.embeddable ? '' : '<span class="vext">YouTube ↗</span>'}</span><span class="vtxt"><b>${esc(v.title)}</b><small>${esc(v.credit)}</small></span></button>`;
}
export function renderVideoLib(el, { filter = 'all', q = '' } = {}) {
  if (!LIB) { el.innerHTML = '<p class="small muted">Video classes load when you\'re online.</p>'; return; }
  const cats = LIB.categories, vids = LIB.videos.filter(v => (filter === 'all' || v.cat === filter) && (!q || (v.title + ' ' + v.credit).toLowerCase().includes(q.toLowerCase())));
  el.innerHTML = `<div class="chips vchips">${[['all', 'All'], ...Object.entries(cats)].map(([k, n]) => `<button type="button" class="chip ${k === filter ? 'like' : ''}" data-vcat="${k}">${esc(n)}</button>`).join('')}</div>
    <div class="vgrid">${vids.map(videoCard).join('') || '<p class="small muted">No videos match.</p>'}</div>`;
  el.querySelectorAll('[data-vcat]').forEach(b => b.onclick = () => renderVideoLib(el, { filter: b.dataset.vcat, q }));
}
// Player sheet
export function openVideo(v, { onCastSource } = {}) {
  if (!v) return;
  if (!v.embeddable) { window.open(v.page, '_blank', 'noopener'); return 'external'; }
  let m = document.getElementById('videoModal');
  if (!m) { m = document.createElement('div'); m.id = 'videoModal'; m.className = 'overlay recipe'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); document.body.append(m); }
  const player = v.source === 'youtube'
    ? `<iframe class="vplayer" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.youtubeId)}?rel=0&modestbranding=1&playsinline=1" title="${esc(v.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`
    : `<video class="vplayer" id="videoPlayer" src="${esc(v.src)}" poster="${esc(v.poster)}" controls playsinline preload="metadata"></video>`;
  m.innerHTML = `<div class="rsheet vsheet"><button type="button" class="rclose" id="videoClose" aria-label="Close">✕</button>${player}
    <div class="vbody"><h2>${esc(v.title)}</h2><p class="small muted">${v.mins} min · ${esc(v.level || 'Beginner')} · ${esc(LIB?.categories?.[v.cat] || '')}</p>
    <p class="small vcredit">${v.source === 'archive' ? `Video: <a href="${esc(v.page)}" target="_blank" rel="noopener">${esc(v.credit)}</a> (<a href="${esc(v.licenceUrl)}" target="_blank" rel="noopener">licence</a>). Shown unedited.` : `Video by <a href="${esc(v.page)}" target="_blank" rel="noopener">${esc(v.channel || v.credit)}</a> on YouTube.`}</p>
    <div class="row">${v.source === 'archive' ? '<button type="button" id="videoCast" class="primary">📺 Cast</button>' : '<p class="small muted">To watch on TV, tap the Cast icon in the YouTube player.</p>'}</div>
    <p class="small muted">Go at your own pace and stop if anything hurts or you feel dizzy. Check with your GP before starting new exercise.</p></div></div>`;
  m.hidden = false; document.body.classList.add('modal-open');
  const close = () => { m.hidden = true; m.innerHTML = ''; document.body.classList.remove('modal-open'); };
  m.querySelector('#videoClose').onclick = close; m.onclick = e => { if (e.target === m) close(); };
  if (v.source === 'archive') onCastSource?.(m.querySelector('#videoPlayer'), m.querySelector('#videoCast'), v);
  return 'opened';
}
export function pickIdeas(n = 3, seed = new Date().toDateString()) {
  const vs = (LIB?.videos || []).filter(v => v.embeddable); if (!vs.length) return [];
  let h = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7), out = [];
  while (out.length < Math.min(n, vs.length)) { h = (h * 1103515245 + 12345) >>> 0; const v = vs[h % vs.length]; if (!out.includes(v)) out.push(v); }
  return out;
}
