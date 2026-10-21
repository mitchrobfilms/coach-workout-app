// Food Photo Diary UI: snap/upload a meal -> compressed (~200 KB) -> private Supabase Storage -> Edge Function "food-photo"
// (vision AI, key stays server-side) -> editable estimate -> saved to the user's food_diary rows (RLS). Totals feed Home.
import { SB_URL, SB_KEY } from './cloud.js';
import { scaleItem, scaleAll, totals, scoreFor, SCORE_NOTE, dayTotals, mealFor, cleanItem } from './photo-core.js';
const FN = SB_URL + '/functions/v1/food-photo';
const MEALS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['snack', 'Snack']];
const SCORE_ICON = { 'Protein star': '⭐', 'Nice balance': '⚖️', 'Fibre boost': '🌾', 'Light bite': '🍃', 'Could add protein': '💪', 'Could add veg': '🥦', 'Enjoy it': '😊' };
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ukDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const ukHour = () => +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(new Date()) % 24;
const shift = (day, n) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const g1 = n => (Math.round((+n || 0) * 10) / 10).toLocaleString('en-GB');

// Resize + re-encode to JPEG <= ~200 KB (max 1024 px long edge). Returns a Blob.
export async function compressImage(src, { maxEdge = 1024, target = 200 * 1024 } = {}) {
  const bmp = await (async () => { try { return await createImageBitmap(src, { imageOrientation: 'from-image' }); } catch { const u = URL.createObjectURL(src); const im = new Image(); im.src = u; await im.decode(); URL.revokeObjectURL(u); return im; } })();
  let w = bmp.width, h = bmp.height; const s = Math.min(1, maxEdge / Math.max(w, h)); w = Math.round(w * s); h = Math.round(h * s);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(bmp, 0, 0, w, h);
  let q = .82, b;
  for (let i = 0; i < 7; i++) { b = await new Promise(r => c.toBlob(r, 'image/jpeg', q)); if (b.size <= target || q < .4) break; q -= .08; }
  if (b.size > target * 1.6) { c.width = Math.round(w * .75); c.height = Math.round(h * .75); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); b = await new Promise(r => c.toBlob(r, 'image/jpeg', .7)); }
  return b;
}

export function makeFoodDiary({ cloud, store, toast, onChange = () => {} }) {
  const root = () => document.getElementById('photoDiaryRoot');
  let day = ukDay(), rows = [], status = null, busy = false; const thumbs = new Map();
  const H = async () => ({ apikey: SB_KEY, authorization: 'Bearer ' + await cloud.token() });
  const cacheDay = (d, list) => { const c = store.get('cloud.foodDays', {}); const t = dayTotals(list); if (t.n) c[d] = { kcal: t.kcal, protein_g: t.protein_g, n: t.n }; else delete c[d]; store.set('cloud.foodDays', c); onChange(); };
  async function getStatus(force) {
    if (!cloud.user) return status = { ready: false, signin: true };
    if (status && !force && Date.now() - status.at < 5 * 60e3) return status;
    try { const r = await fetch(FN, { headers: await H() }); const j = await r.json(); status = { ...j, ready: !!j.ready, at: Date.now() }; }
    catch { status = { ready: false, offline: !navigator.onLine, at: Date.now() - 4 * 60e3 }; }
    return status;
  }
  async function fetchDay(d) { const l = await cloud.api(`/rest/v1/food_diary?select=*&day=eq.${d}&order=created_at.asc`); cacheDay(d, l); return l; }
  async function load() { rows = cloud.user ? await fetchDay(day) : []; }
  async function thumb(path) {
    if (!path) return ''; if (thumbs.has(path)) return thumbs.get(path);
    const r = await fetch(`${SB_URL}/storage/v1/object/authenticated/food-photos/${path}`, { headers: await H() }); if (!r.ok) return '';
    const u = URL.createObjectURL(await r.blob()); thumbs.set(path, u); return u;
  }
  function head() {
    const t = dayTotals(rows), today = day === ukDay();
    const label = today ? 'Today' : day === shift(ukDay(), -1) ? 'Yesterday' : new Date(day + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    return `<div class="fdnav"><button type="button" data-fdday="-1" aria-label="Previous day">‹</button><b>${label}</b><button type="button" data-fdday="1" aria-label="Next day" ${today ? 'disabled' : ''}>›</button></div>
      <div class="fdtot" aria-label="Day totals (estimates)"><div><b>${t.kcal.toLocaleString('en-GB')}</b><small>kcal</small></div><div class="p"><b>${g1(t.protein_g)} g</b><small>protein</small></div><div><b>${g1(t.carbs_g)} g</b><small>carbs</small></div><div><b>${g1(t.fat_g)} g</b><small>fat</small></div><div><b>${g1(t.fibre_g)} g</b><small>fibre</small></div></div>
      <p class="small muted fdest">All figures are estimates from photos. Edit anything that looks off.</p>`;
  }
  async function render() {
    const el = root(); if (!el) return;
    const s = await getStatus();
    const intro = `<div class="fdhero"><span class="fdicon">📸</span><div><h2>Food photo diary</h2><p class="small">Snap your meal for an instant estimate of calories, protein, carbs, fat and fibre, with friendly tips.</p></div></div>`;
    if (s.signin) { el.innerHTML = intro + `<div class="card"><p>Sign in to your GLP1 Life account to use the photo diary. Your photos are stored privately in your account.</p><button type="button" class="primary" data-gotab2="settings">Go to account</button></div>`; return; }
    if (!s.ready) { el.innerHTML = intro + `<div class="card fdsoon"><span class="pill">Coming soon</span><p>${s.offline ? "You're offline. Connect to the internet to check a meal photo." : 'Photo checks are being switched on. You can keep using the food check-in in the meantime.'}</p><button type="button" class="primary" disabled>📷 Snap a meal</button></div>`; return; }
    try { await load(); } catch (e) { el.innerHTML = intro + `<div class="card"><p>Couldn't load your diary: ${esc(e.message)}</p></div>`; return; }
    el.innerHTML = intro + `<div class="card fdcard">${head()}
      <div class="fdbtns"><label class="primary fdsnap" for="fdCamera">📷 Snap a meal</label><label class="fdup" for="fdUpload">🖼️ Gallery</label></div>
      <input type="file" id="fdCamera" accept="image/*" capture="environment" hidden><input type="file" id="fdUpload" accept="image/*" hidden>
      <p class="small muted" id="fdLeft">${s.remaining ?? s.limit} of ${s.limit} photo checks left today</p></div>
      <div id="fdList">${rows.length ? '' : `<div class="card empty"><p>No meals logged ${day === ukDay() ? 'yet today' : 'on this day'}.</p></div>`}</div>
      <p class="small muted">Estimates only, not medical or nutritional advice. Your photo is sent to Google's Gemini API on a paid plan to estimate what's on the plate. Under Google's paid-service terms, Google doesn't use it to improve its products or train its models, but may keep it briefly for abuse monitoring. Please avoid including people or personal details in your photos. We store your photo privately in your account and you can delete it any time.</p>`;
    const list = el.querySelector('#fdList');
    for (const r of rows) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'fdrow'; b.dataset.id = r.id;
      const time = new Date(r.created_at).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
      b.innerHTML = `<span class="fdthumb">${r.photo_path ? '' : '🍽️'}</span><span class="fdinfo"><b>${esc((MEALS.find(m => m[0] === r.meal) || [, 'Meal'])[1])} <small>${time}</small></b><small>${esc((r.items || []).map(i => i.name).slice(0, 4).join(', '))}</small><span class="fdmac">≈${r.kcal} kcal · ${g1(r.protein_g)} g protein</span></span>${r.score ? `<span class="fdscore">${SCORE_ICON[r.score] || ''} ${esc(r.score)}</span>` : ''}`;
      b.onclick = () => openEditor({ entry: r }); list.append(b);
      if (r.photo_path) thumb(r.photo_path).then(u => { if (u) b.querySelector('.fdthumb').innerHTML = `<img src="${u}" alt="">`; });
    }
    el.querySelectorAll('[data-fdday]').forEach(x => x.onclick = () => { day = shift(day, +x.dataset.fdday); if (day > ukDay()) day = ukDay(); render(); });
    const C = window.Capacitor, cam = C?.isNativePlatform?.() && C.Plugins?.Camera;
    for (const id of ['fdCamera', 'fdUpload']) {
      const inp = el.querySelector('#' + id);
      inp.onchange = () => { const f = inp.files?.[0]; inp.value = ''; if (f) analyse(f); };
      if (cam) el.querySelector(`label[for=${id}]`).onclick = async e => { e.preventDefault(); try { const p = await cam.getPhoto({ quality: 80, width: 1280, correctOrientation: true, resultType: 'dataUrl', source: id === 'fdCamera' ? 'CAMERA' : 'PHOTOS' }); analyse(await (await fetch(p.dataUrl)).blob()); } catch (err) { if (!/cancel/i.test(err?.message || '')) toast('Camera: ' + (err?.message || 'not available')); } };
    }
  }
  async function analyse(file) {
    if (busy) return; busy = true;
    const sheet = openSheet(`<div class="fdwait"><div class="spin" aria-hidden="true"></div><h3>Checking your meal…</h3><p class="small muted">This takes a few seconds.</p></div>`);
    let path = null;
    try {
      if (!/^image\//.test(file.type || 'image/')) throw new Error('Please choose a photo.');
      const blob = await compressImage(file), preview = URL.createObjectURL(blob);
      sheet.querySelector('.fdwait').insertAdjacentHTML('afterbegin', `<img class="fdprev" src="${preview}" alt="Your meal">`);
      path = `${cloud.user.id}/${crypto.randomUUID()}.jpg`;
      const up = await fetch(`${SB_URL}/storage/v1/object/food-photos/${path}`, { method: 'POST', headers: { ...await H(), 'content-type': 'image/jpeg' }, body: blob });
      if (!up.ok) throw new Error('Upload failed. Check your connection and try again.');
      const r = await fetch(FN, { method: 'POST', headers: { ...await H(), 'content-type': 'application/json' }, body: JSON.stringify({ path }) });
      const j = await r.json().catch(() => ({}));
      if (status && j.remaining != null) status.remaining = j.remaining;
      if (!r.ok || !j.is_food) { await delPhoto(path); path = null; closeSheet();
        openSheet(`<div class="fdwait"><div style="font-size:2.4rem">${j.is_food === false ? '🤔' : '⏳'}</div><h3>${j.is_food === false ? "Hmm, we couldn't spot a meal" : 'Not this time'}</h3><p>${esc(j.message || 'Something went wrong. Please try again.')}</p><button type="button" class="primary" data-fdclose>OK</button></div>`); return; }
      thumbs.set(path, preview); closeSheet();
      openEditor({ analysis: j, path, preview });
    } catch (e) { if (path) delPhoto(path); closeSheet(); toast(e.message || 'Something went wrong'); }
    finally { busy = false; }
  }
  async function delPhoto(path) { try { await fetch(`${SB_URL}/storage/v1/object/food-photos`, { method: 'DELETE', headers: { ...await H(), 'content-type': 'application/json' }, body: JSON.stringify({ prefixes: [path] }) }); } catch {} }
  function openSheet(html) { closeSheet(); const o = document.createElement('div'); o.className = 'overlay fdsheet'; o.id = 'fdSheet'; o.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Food photo">${html}</div>`; document.body.append(o); o.addEventListener('click', e => { if (e.target.closest('[data-fdclose]')) closeSheet(); }); return o; }
  function closeSheet() { document.getElementById('fdSheet')?.remove(); }
  function openEditor({ analysis, path, preview, entry }) {
    let items = (entry ? entry.items : analysis.items).map(cleanItem), meal = entry ? entry.meal : mealFor(ukHour()), edited = !!entry?.edited;
    const tips = entry ? entry.tips || [] : analysis.tips || [], photo = entry ? entry.photo_path : path;
    const o = openSheet(`<div class="fded"><div class="fdedtop"><span class="fdedimg"></span><div><span class="pill est">Estimate</span><p class="small" style="margin:.3rem 0 0">${esc(entry ? '' : analysis.message || '')}</p></div></div>
      <div class="fdscorebig" id="fdScore"></div>
      <label class="fdmeal">Meal <select id="fdMeal">${MEALS.map(([v, l]) => `<option value="${v}" ${v === meal ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="fdportion" role="group" aria-label="How much did you eat?"><span class="small">I ate:</span>${[[.5, '½'], [.75, '¾'], [1, 'All'], [1.25, '1¼']].map(([f, l]) => `<button type="button" data-fdpor="${f}">${l}</button>`).join('')}</div>
      <div id="fdItems"></div><button type="button" class="linkbtn" id="fdAdd">＋ Add an item</button>
      <div class="fdtot small" id="fdTot"></div>
      ${tips.length ? `<div class="fdtips"><b>💜 Tips</b><ul>${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
      <p class="small muted">Values are estimates from a photo, not exact. Edit names, grams or numbers to match what you ate. Not medical advice.</p>
      <div class="fdact"><button type="button" class="primary" id="fdSave">${entry ? 'Save changes' : 'Save to diary'}</button><button type="button" id="fdCancel">${entry ? 'Close' : 'Discard'}</button>${entry ? '<button type="button" class="danger" id="fdDel">Delete</button>' : ''}</div></div>`);
    const img = o.querySelector('.fdedimg'); const put = u => { if (u) img.innerHTML = `<img src="${u}" alt="Your meal">`; }; preview ? put(preview) : photo && thumb(photo).then(put);
    let ai = !entry && !edited;
    const draw = () => {
      const t = totals(items), sc = ai && analysis?.score ? analysis.score : (items.length ? scoreFor(t, items) : null);
      o.querySelector('#fdScore').innerHTML = sc ? `<b>${SCORE_ICON[sc] || ''} ${esc(sc)}</b><small>${esc(SCORE_NOTE[sc] || '')}</small>` : '';
      o.querySelector('#fdTot').innerHTML = `<b>Total (estimate):</b> ≈${t.kcal} kcal · ${g1(t.protein_g)} g protein · ${g1(t.carbs_g)} g carbs · ${g1(t.fat_g)} g fat · ${g1(t.fibre_g)} g fibre`;
      o.querySelector('#fdItems').innerHTML = items.map((i, k) => `<div class="fditem" data-k="${k}"><div class="fdirow"><input class="fdname" value="${esc(i.name)}" aria-label="Food name" maxlength="60"><button type="button" class="fdx" data-del="${k}" aria-label="Remove ${esc(i.name)}">✕</button></div>
        <div class="fdnums"><label>g/ml<input inputmode="decimal" data-f="grams" value="${i.grams}"></label><label>kcal<input inputmode="decimal" data-f="kcal" value="${i.kcal}"></label><label>protein<input inputmode="decimal" data-f="protein_g" value="${i.protein_g}"></label><label>carbs<input inputmode="decimal" data-f="carbs_g" value="${i.carbs_g}"></label><label>fat<input inputmode="decimal" data-f="fat_g" value="${i.fat_g}"></label><label>fibre<input inputmode="decimal" data-f="fibre_g" value="${i.fibre_g}"></label></div>
        <small class="muted">${esc(i.state)}${i.confidence === 'low' ? ' · not sure, please check' : ''}</small></div>`).join('') || '<p class="small muted">No items. Add one below.</p>';
      o.querySelectorAll('.fditem').forEach(row => { const k = +row.dataset.k;
        row.querySelector('.fdname').onchange = e => { items[k].name = e.target.value.trim().slice(0, 60) || 'Food'; edited = true; };
        row.querySelectorAll('[data-f]').forEach(inp => inp.onchange = () => { const v = Math.max(0, parseFloat(inp.value.replace(',', '.')) || 0); edited = true; ai = false;
          items[k] = inp.dataset.f === 'grams' ? scaleItem(items[k], v) : cleanItem({ ...items[k], [inp.dataset.f]: v }); draw(); }); });
      o.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { items.splice(+b.dataset.del, 1); edited = true; ai = false; draw(); });
    };
    draw();
    o.querySelectorAll('[data-fdpor]').forEach(b => b.onclick = () => { items = scaleAll(items, +b.dataset.fdpor); edited = true; ai = false; draw(); toast(`Scaled to ${b.textContent} of the plate`); });
    o.querySelector('#fdAdd').onclick = () => { items.push(cleanItem({ name: 'New item', state: 'prepared', grams: 100 })); edited = true; ai = false; draw(); o.querySelector('.fditem:last-child .fdname')?.select(); };
    o.querySelector('#fdMeal').onchange = e => meal = e.target.value;
    o.querySelector('#fdCancel').onclick = async () => { closeSheet(); if (!entry && path) await delPhoto(path); };
    if (entry) o.querySelector('#fdDel').onclick = async () => { if (!confirm('Delete this meal and its photo?')) return; await cloud.api(`/rest/v1/food_diary?id=eq.${entry.id}`, { method: 'DELETE' }); if (entry.photo_path) await delPhoto(entry.photo_path); closeSheet(); toast('🗑️ Meal deleted'); render(); };
    o.querySelector('#fdSave').onclick = async e => {
      e.target.disabled = true; const t = totals(items);
      const row = { meal, items, kcal: t.kcal, protein_g: t.protein_g, carbs_g: t.carbs_g, fat_g: t.fat_g, fibre_g: t.fibre_g, score: items.length ? (ai && analysis?.score ? analysis.score : scoreFor(t, items)) : null, edited, updated_at: new Date().toISOString() };
      try {
        if (entry) await cloud.api(`/rest/v1/food_diary?id=eq.${entry.id}`, { method: 'PATCH', body: row, prefer: 'return=minimal' });
        else await cloud.api('/rest/v1/food_diary', { method: 'POST', body: { ...row, day: ukDay(), photo_path: path, tips, source: 'photo' }, prefer: 'return=minimal' });
        closeSheet(); toast(entry ? '✅ Meal updated' : `✅ Saved: ≈${t.kcal} kcal, ${g1(t.protein_g)} g protein`); if (!entry) day = ukDay(); render();
      } catch (err) { e.target.disabled = false; toast('Save failed: ' + err.message); }
    };
  }
  return { render, getStatus, refreshToday: async () => { if (cloud.user) try { await fetchDay(ukDay()); } catch {} } };
}
