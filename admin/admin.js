// GLP1 Life admin. All writes are checked by Postgres RLS (public.is_admin()); the UI only mirrors that.
import { SB_URL, SB_KEY } from '../cloud.js';
const $ = id => document.getElementById(id), esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const toast = m => { $('toast').textContent = m; $('toast').hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => $('toast').hidden = true, 2500); };
let ses = JSON.parse(sessionStorage.getItem('glp1admin') || 'null'), list = [];
const H = (extra = {}) => ({ apikey: SB_KEY, 'content-type': 'application/json', ...(ses ? { authorization: 'Bearer ' + ses.access_token } : {}), ...extra });
async function api(path, o = {}) { const r = await fetch(SB_URL + path, { ...o, headers: H(o.headers) }); const t = await r.text(); const j = t ? JSON.parse(t) : null; if (!r.ok) throw new Error(j?.message || j?.msg || j?.error_description || 'HTTP ' + r.status); return j; }
import { normWa } from './admin-util.js'; export { normWa };
const waLink = t => `https://wa.me/${t.whatsapp}?text=${encodeURIComponent(`Hi ${String(t.name || '').split(' ')[0]}, I found you on GLP1 Life and I'd like to know your prices for personal training${t.virtual_pt ? ' (virtual is fine)' : ''}.`)}`;
const card = t => `<div class="tr"><div class="top">${t.photo_url ? `<img src="${esc(t.photo_url)}" alt="">` : '<div class="ph">🏋️</div>'}<div><h3>${esc(t.name || 'Trainer name')}</h3>${t.virtual_pt ? '<span class="vb">Virtual PT available</span>' : ''}${t.area ? `<div class="small muted">📍 ${esc(t.area)}</div>` : ''}</div></div>${(t.specialties || []).map(s => `<span class="chip">${esc(s)}</span>`).join('')}${t.glp1_support ? `<p class="small"><b>GLP-1 support:</b> ${esc(t.glp1_support)}</p>` : ''}${t.whatsapp ? `<a class="wa" href="${waLink(t)}" target="_blank" rel="noopener">💬 Message on WhatsApp for prices</a>` : '<p class="small err">Add a WhatsApp number</p>'}</div>`;
async function start() {
  if (!ses) { $('login').hidden = false; $('app').hidden = $('denied').hidden = $('out').hidden = true; return; }
  $('out').hidden = false; $('login').hidden = true;
  const admin = await api('/rest/v1/rpc/is_admin', { method: 'POST', body: '{}' }).catch(() => false);
  if (admin !== true) { $('denied').hidden = false; $('who').textContent = ses.user.email; return; }
  $('app').hidden = false; await load(); fill();
}
$('lf').onsubmit = async e => { e.preventDefault(); $('lerr').hidden = true; try { const j = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: $('le').value.trim(), password: $('lp').value }) }); ses = { access_token: j.access_token, user: { email: j.user.email } }; sessionStorage.setItem('glp1admin', JSON.stringify(ses)); start(); } catch (x) { $('lerr').textContent = x.message; $('lerr').hidden = false; } };
$('out').onclick = () => { sessionStorage.removeItem('glp1admin'); ses = null; location.reload(); };
async function load() { list = await api('/rest/v1/rpc/admin_trainers', { method: 'POST', body: '{}' }); render(); }
function render() {
  $('list').innerHTML = list.length ? list.map((t, i) => `<li class="${t.active ? '' : 'off'} ${t.id === $('id').value ? 'sel' : ''}">${t.photo_url ? `<img src="${esc(t.photo_url)}" alt="">` : '<span class="ph">🏋️</span>'}<span class="grow"><b>${esc(t.name)}</b> ${t.status === 'pending' ? '<span class="pend">Pending approval</span>' : ''}<br><small class="muted">${t.status === 'pending' ? esc(t.email || '') + ' · ' + esc(t.business || '') : (t.active ? 'Visible' : 'Hidden')} · +${esc(t.whatsapp)}${t.client_code ? ' · code <b>' + esc(t.client_code) + '</b>' : ''}</small></span>${t.status === 'pending' ? `<button class="primary" data-appr="${t.id}">Approve</button>` : ''}
    <button data-up="${i}" ${i ? '' : 'disabled'} aria-label="Move up">↑</button><button data-down="${i}" ${i < list.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button><button data-vis="${i}">${t.active ? 'Hide' : 'Show'}</button><button data-edit="${i}">Edit</button></li>`).join('') : '<li class="muted">No trainers yet. Add the first one.</li>';
  $('list').querySelectorAll('[data-appr]').forEach(b => b.onclick = async () => { const c = await api('/rest/v1/rpc/approve_trainer', { method: 'POST', body: JSON.stringify({ t: b.dataset.appr }) }); toast('✅ Approved · client code ' + c); load(); });
  $('list').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => fill(list[+b.dataset.edit]));
  $('list').querySelectorAll('[data-vis]').forEach(b => b.onclick = async () => { const t = list[+b.dataset.vis]; await api(`/rest/v1/trainers?id=eq.${t.id}`, { method: 'PATCH', body: JSON.stringify({ active: !t.active }) }); await load(); toast(t.active ? 'Hidden' : 'Visible'); });
  const move = async (i, d) => { const a = list[i], c = list[i + d]; [list[i], list[i + d]] = [c, a]; await Promise.all(list.map((t, k) => api(`/rest/v1/trainers?id=eq.${t.id}`, { method: 'PATCH', body: JSON.stringify({ sort: k }) }))); await load(); };
  $('list').querySelectorAll('[data-up]').forEach(b => b.onclick = () => move(+b.dataset.up, -1)); $('list').querySelectorAll('[data-down]').forEach(b => b.onclick = () => move(+b.dataset.down, 1));
}
const form = () => ({ name: $('name').value.trim(), specialties: $('spec').value.split(',').map(s => s.trim()).filter(Boolean), glp1_support: $('glp').value.trim() || null, area: $('area').value.trim() || null, whatsapp: normWa($('wa').value), virtual_pt: $('virtual').checked, active: $('active').checked, photo_url: fill.photo || null });
function preview() { const w = $('wa').value.trim(), n = normWa(w); $('wahint').textContent = !w ? 'Include country code or start with 0 for UK.' : n ? `✓ Will open wa.me/${n}` : '✗ Not a valid number (8–15 digits incl. country code)'; $('wahint').style.color = !w ? '' : n ? '#2e9d5b' : '#c33'; $('preview').innerHTML = card({ ...form(), whatsapp: n }); }
function fill(t = {}) { $('id').value = t.id || ''; $('name').value = t.name || ''; $('spec').value = (t.specialties || []).join(', '); $('glp').value = t.glp1_support || ''; $('area').value = t.area || ''; $('wa').value = t.whatsapp ? '+' + t.whatsapp : ''; $('virtual').checked = t.virtual_pt ?? true; $('active').checked = t.active ?? true; $('photo').value = ''; fill.photo = t.photo_url || null; $('del').hidden = !t.id; $('etitle').textContent = t.id ? 'Edit trainer' : 'Add trainer'; $('ferr').hidden = true; preview(); render(); }
['name', 'spec', 'glp', 'area', 'wa', 'virtual', 'active'].forEach(id => $(id).addEventListener('input', preview));
$('photo').onchange = () => { const f = $('photo').files[0]; if (!f) return; if (f.size > 5e6) { $('photo').value = ''; return toast('Photo is over 5 MB'); } fill.photo = URL.createObjectURL(f); preview(); };
$('new').onclick = () => fill();
$('f').onsubmit = async e => { e.preventDefault(); const err = m => { $('ferr').textContent = m; $('ferr').hidden = false; }; const row = form();
  if (!row.name) return err('Name is required.'); if (!row.whatsapp) return err('Enter a valid WhatsApp number.');
  try { const f = $('photo').files[0];
    if (f) { const path = `${Date.now()}-${f.name.replace(/[^\w.]/g, '_')}`; const r = await fetch(`${SB_URL}/storage/v1/object/trainers/${path}`, { method: 'POST', headers: { apikey: SB_KEY, authorization: 'Bearer ' + ses.access_token, 'content-type': f.type, 'x-upsert': 'true' }, body: f }); if (!r.ok) throw new Error('Photo upload failed (' + r.status + ')'); row.photo_url = `${SB_URL}/storage/v1/object/public/trainers/${path}`; }
    const id = $('id').value; row.updated_at = new Date().toISOString(); if (!id) row.sort = list.length;
    await api(`/rest/v1/trainers${id ? '?id=eq.' + id : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(row), headers: { prefer: 'return=minimal' } });
    toast('✅ Saved'); await load(); fill();
  } catch (x) { err(x.message); } };
$('del').onclick = async () => { if (!confirm('Delete this trainer?')) return; await api(`/rest/v1/trainers?id=eq.${$('id').value}`, { method: 'DELETE' }); await load(); fill(); toast('Deleted'); };
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b)); $('v-trainers').hidden = b.dataset.v !== 'trainers'; $('v-classes').hidden = b.dataset.v !== 'classes'; $('v-aidrafts').hidden = b.dataset.v !== 'aidrafts'; if (b.dataset.v === 'aidrafts') loadAiDrafts(); $('v-mod').hidden = b.dataset.v !== 'mod'; if (b.dataset.v === 'mod') loadMod(); $('v-promos').hidden = b.dataset.v !== 'promos'; $('v-comm').hidden = b.dataset.v !== 'comm'; if (b.dataset.v === 'comm') loadComm(); if (b.dataset.v === 'classes') loadClasses(); if (b.dataset.v === 'promos') loadPromos(); });
async function loadClasses() { try { const l = await (await fetch('../library.json?v=' + Date.now())).json(); $('classes').innerHTML = `<p>${l.classes.length} classes in the library:</p><ul>${l.classes.map(c => `<li><b>${esc(c.title)}</b> <span class="muted">${esc(c.category)} · ${Math.round(c.duration / 60)} min</span></li>`).join('')}</ul>`; } catch { $('classes').textContent = 'Could not load library.json'; } }
let promos = [], usage = [], selPromo = null;
async function loadPromos() {
  [promos, usage] = await Promise.all([api('/rest/v1/promo_codes?select=*&order=created_at.desc'), api('/rest/v1/rpc/promo_usage', { method: 'POST', body: '{}' })]);
  $('ptrainer').innerHTML = '<option value="">(no trainer)</option>' + list.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  const tn = id => list.find(t => t.id === id)?.name || '—', used = id => usage.filter(u => u.code_id === id && !u.revoked).length;
  $('plist').innerHTML = promos.length ? promos.map(p => { const exp = p.expires_at && Date.parse(p.expires_at) < Date.now(); return `<li class="${p.active && !exp ? '' : 'off'} ${selPromo === p.id ? 'sel' : ''}"><span class="grow"><span class="code">${esc(p.code)}</span><br><small class="muted">${esc(tn(p.trainer_id))} · used ${used(p.id)}${p.max_uses ? '/' + p.max_uses : ''}${p.expires_at ? ' · expires ' + new Date(p.expires_at).toLocaleDateString('en-GB') : ''}${exp ? ' (expired)' : ''}</small></span>
    <button data-pact="${p.id}">${p.active ? 'Deactivate' : 'Activate'}</button><button data-psel="${p.id}">Users</button><button class="danger" data-pdel="${p.id}">Delete</button></li>`; }).join('') : '<li class="muted">No promo codes yet.</li>';
  $('plist').querySelectorAll('[data-pact]').forEach(b => b.onclick = async () => { const p = promos.find(x => x.id === b.dataset.pact); await api(`/rest/v1/promo_codes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ active: !p.active }) }); loadPromos(); });
  $('plist').querySelectorAll('[data-pdel]').forEach(b => b.onclick = async () => { if (!confirm('Delete this code? Users who redeemed it lose Plus.')) return; await api(`/rest/v1/promo_codes?id=eq.${b.dataset.pdel}`, { method: 'DELETE' }); loadPromos(); });
  $('plist').querySelectorAll('[data-psel]').forEach(b => b.onclick = () => { selPromo = b.dataset.psel; showUsers(); loadPromos(); });
  showUsers();
}
function showUsers() { if (!selPromo) return; const u = usage.filter(x => x.code_id === selPromo);
  $('pusers').innerHTML = u.length ? `<ul class="list">${u.map(x => `<li class="${x.revoked ? 'off' : ''}"><span class="grow">${esc(x.email)}<br><small class="muted">${new Date(x.redeemed_at).toLocaleString('en-GB')}${x.revoked ? ' · revoked' : ''}</small></span>${x.revoked ? '' : `<button class="danger" data-rev="${x.user_id}">Revoke</button>`}</li>`).join('')}</ul>` : 'Nobody has used this code yet.';
  $('pusers').querySelectorAll('[data-rev]').forEach(b => b.onclick = async () => { await api(`/rest/v1/promo_redemptions?user_id=eq.${b.dataset.rev}`, { method: 'PATCH', body: JSON.stringify({ revoked: true }) }); toast('Revoked'); loadPromos(); }); }
$('pf').onsubmit = async e => { e.preventDefault(); const code = $('pcode').value.trim().toUpperCase(), err = m => { $('perr').textContent = m; $('perr').hidden = !m; }; err('');
  if (!/^[A-Z0-9-]{4,24}$/.test(code)) return err('Code: 4–24 letters, numbers or dashes.');
  try { await api('/rest/v1/promo_codes', { method: 'POST', body: JSON.stringify({ code, trainer_id: $('ptrainer').value || null, max_uses: +$('pmax').value || null, expires_at: $('pexp').value ? $('pexp').value + 'T23:59:59Z' : null }), headers: { prefer: 'return=minimal' } }); $('pf').reset(); toast('✅ Code created'); loadPromos(); }
  catch (x) { err(/duplicate/.test(x.message) ? 'That code already exists.' : x.message); } };
let comm = [];
const gbp = p => '£' + (p / 100).toFixed(2), monthStart = () => ($('cmonth').value || new Date().toISOString().slice(0, 7)) + '-01';
async function loadComm() { if (!$('cmonth').value) $('cmonth').value = new Date().toISOString().slice(0, 7);
  comm = await api('/rest/v1/rpc/commission', { method: 'POST', body: JSON.stringify({ m: monthStart() }) });
  $('cbody').innerHTML = comm.map(c => `<tr><td><b>${esc(c.name)}</b></td><td>${c.monthly}</td><td>${c.yearly}</td><td>${c.yearly_due}</td><td><b>${gbp(c.owed_pence)}</b></td><td class="small">${esc(c.renewals || '—')}</td><td>${c.paid_at ? `<span class="paid">✓ Paid ${new Date(c.paid_at).toLocaleDateString('en-GB')}</span> <button data-unpaid="${c.trainer_id}">Undo</button>` : `<button class="primary" data-paid="${c.trainer_id}" data-amt="${c.owed_pence}" ${c.owed_pence ? '' : 'disabled'}>Mark paid</button>`}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No approved trainers yet.</td></tr>';
  const sum = k => comm.reduce((a, c) => a + c[k], 0); $('tm').textContent = sum('monthly'); $('ty').textContent = sum('yearly'); $('tyd').textContent = sum('yearly_due'); $('towed').textContent = gbp(sum('owed_pence'));
  $('cbody').querySelectorAll('[data-paid]').forEach(b => b.onclick = async () => { await api('/rest/v1/trainer_invoices?on_conflict=trainer_id,month', { method: 'POST', body: JSON.stringify({ trainer_id: b.dataset.paid, month: monthStart(), amount_pence: +b.dataset.amt, paid_at: new Date().toISOString() }), headers: { prefer: 'resolution=merge-duplicates,return=minimal' } }); toast('Marked paid'); loadComm(); });
  $('cbody').querySelectorAll('[data-unpaid]').forEach(b => b.onclick = async () => { await api(`/rest/v1/trainer_invoices?trainer_id=eq.${b.dataset.unpaid}&month=eq.${monthStart()}`, { method: 'DELETE' }); loadComm(); }); }
$('cmonth').onchange = loadComm;
$('csv').onclick = () => { const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`, rows = [['Month', 'Trainer', 'Monthly clients', 'Yearly clients', 'Yearly due this month', 'Owed GBP', 'Yearly renewals', 'Paid at'], ...comm.map(c => [monthStart().slice(0, 7), c.name, c.monthly, c.yearly, c.yearly_due, (c.owed_pence / 100).toFixed(2), c.renewals || '', c.paid_at || ''])];
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv' })); a.download = `glp1life-commission-${monthStart().slice(0, 7)}.csv`; a.click(); };
start();

/* ---------- Community moderation ---------- */
const rpc = (f, b = {}) => api(`/rest/v1/rpc/${f}`, { method: 'POST', body: JSON.stringify(b) });
const when = t => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
async function loadMod() {
  let q; try { q = await rpc('community_mod_queue'); } catch (e) { return toast(e.message); }
  $('modCount').textContent = (q.held.length + q.reports.length) ? `(${q.held.length + q.reports.length})` : '';
  const item = (x, btns) => `<li class="card"><p><b>${esc(x.author || 'unknown')}</b> <small class="muted">${when(x.at)}${x.reason ? ' · ' + esc(x.reason) : ''}</small></p><p>${esc(x.body || x.excerpt || '')}</p><div class="row">${btns}</div></li>`;
  const B = (k, id, a, label) => `<button data-mk="${k}" data-mid="${id}" data-ma="${a}">${label}</button>`;
  $('modHeld').innerHTML = q.held.map(x => item(x, B(x.kind, x.id, 'approve', '✓ Approve') + B(x.kind, x.id, 'hide', 'Hide') + B(x.kind, x.id, 'delete', '🗑 Delete') + B('user', x.user_id, 'ban', '⛔ Ban author'))).join('') || '<li class="muted">Nothing held.</li>';
  $('modReports').innerHTML = q.reports.map(x => item(x, (x.post_id ? B('post', x.post_id, 'hide', 'Hide post') + B('post', x.post_id, 'delete', '🗑 Delete post') : B('comment', x.comment_id, 'delete', '🗑 Delete comment')) + B('report', x.id, 'dismiss', 'Dismiss') + (x.user_id ? B('user', x.user_id, 'ban', '⛔ Ban author') : ''))).join('') || '<li class="muted">No open reports.</li>';
  $('modUsers').innerHTML = q.suspended.map(u => `<li class="card row between"><span><b>${esc(u.name)}</b> · ${esc(u.status)} · ${u.strikes} strikes</span><span>${B('user', u.user_id, 'restore', 'Restore')}${u.status !== 'banned' ? B('user', u.user_id, 'ban', '⛔ Ban') : ''}</span></li>`).join('') || '<li class="muted">None.</li>';
  $('modGroups').innerHTML = q.groups.map(g => `<li>${esc(g.name)} <small class="muted">${esc(g.description || '')}</small></li>`).join('');
  $('modBlocked').innerHTML = q.blocked.map(x => `<li><b>${esc(x.author || '?')}</b> <small class="muted">${when(x.at)} · ${esc(x.kind)} · ${esc(x.reason)}</small><br>${esc(x.excerpt)}</li>`).join('') || '<li class="muted">None.</li>';
  document.querySelectorAll('[data-mk]').forEach(b => b.onclick = async () => { if (['delete', 'ban'].includes(b.dataset.ma) && !confirm(`${b.dataset.ma} — are you sure?`)) return;
    try { await rpc('community_mod', { p_kind: b.dataset.mk, p_id: b.dataset.mid, p_action: b.dataset.ma }); toast('Done'); loadMod(); } catch (e) { toast(e.message); } });
}
$('modGroupF').onsubmit = async e => { e.preventDefault(); try { await rpc('community_add_group', { p_name: $('modGName').value, p_desc: $('modGDesc').value }); $('modGroupF').reset(); toast('Group added'); loadMod(); } catch (x) { toast(x.message); } };

async function loadAiDrafts() { const el = $('aiDraftList'); el.textContent = 'Loading…';
  try { const d = await (await fetch('ai-class-drafts.json?' + Date.now())).json(); const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    el.innerHTML = d.classes.map(c => `<div class="card" style="display:flex;gap:16px;align-items:flex-start;margin:12px 0"><img src="${esc(c.thumb)}" alt="" style="width:220px;border-radius:12px"><div><h3 style="margin:0">${esc(c.title)} · ${c.minutes} min</h3><p class="small">${esc(c.difficulty)} · ${esc(c.category)} · ${esc(c.equipment)} · ${c.access === 'premium' ? 'Premium' : 'Free'}</p><p>${esc(c.description)}</p><p class="small"><b>Instructor:</b> ${esc(d.instructor.name)} <span style="background:#ede4ff;color:#5b2bb5;border-radius:6px;padding:1px 6px">${esc(d.instructor.label)}</span></p><p class="small"><b>Status:</b> <span style="color:#b45309">${esc(c.status)}</span> · not published · ${c.timeline.length} timeline steps</p><p class="small muted">${esc(c.videoNote)}</p></div></div>`).join('');
  } catch (e) { el.textContent = 'Could not load drafts: ' + e.message; } }
