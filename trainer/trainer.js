// GLP1 Life trainer portal. Every read/write goes through Supabase RPCs that check auth.uid() server-side;
// trainers only see clients who joined with their code, and only the health items each client chose to share.
import { SB_URL, SB_KEY } from '../cloud.js';
import { normWa } from '../admin/admin-util.js';
const $ = id => document.getElementById(id), esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const toast = m => { $('toast').textContent = m; $('toast').hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => $('toast').hidden = true, 2500); };
let ses = JSON.parse(sessionStorage.getItem('glp1trainer') || 'null'), clients = [];
const H = (x = {}) => ({ apikey: SB_KEY, 'content-type': 'application/json', ...(ses ? { authorization: 'Bearer ' + ses.access_token } : {}), ...x });
async function api(path, o = {}) { const r = await fetch(SB_URL + path, { ...o, headers: H(o.headers) }); const t = await r.text(); const j = t ? JSON.parse(t) : null; if (!r.ok) throw new Error(j?.message || j?.msg || j?.error_description || 'HTTP ' + r.status); return j; }
const rpc = (f, b = {}) => api('/rest/v1/rpc/' + f, { method: 'POST', body: JSON.stringify(b) });
const keep = j => { ses = { access_token: j.access_token, user: { id: j.user.id, email: j.user.email } }; sessionStorage.setItem('glp1trainer', JSON.stringify(ses)); };
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b)); $('rf').hidden = b.dataset.m !== 'reg'; $('lf').hidden = b.dataset.m !== 'in'; });
$('rwa').oninput = () => { const n = normWa($('rwa').value); $('rwahint').textContent = $('rwa').value ? (n ? '✓ wa.me/' + n : 'Not a valid number') : ''; };
$('rf').onsubmit = async e => { e.preventDefault(); const err = m => { $('rerr').textContent = m || ''; $('rerr').hidden = !m; }; err();
  const wa = normWa($('rwa').value), f = $('rphoto').files[0];
  if ($('rname').value.trim().length < 2) return err('Please enter your name.'); if (!/^\S+@\S+\.\S+$/.test($('remail').value.trim())) return err('Please enter a valid email.');
  if ($('rpw').value.length < 8) return err('Password needs 8+ characters.'); if (!wa) return err('Please enter a valid WhatsApp number.');
  if ($('rbio').value.trim().length < 10) return err('Please add a short bio.'); if (f && f.size > 5e6) return err('Photo must be under 5 MB.'); if (!$('rterms').checked) return err('Please agree to the trainer terms.');
  $('rgo').disabled = true;
  try {
    const j = await api('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email: $('remail').value.trim(), password: $('rpw').value, data: { name: $('rname').value.trim(), role: 'trainer' } }) });
    if (!j.access_token) throw new Error('Check your email to confirm your account, then sign in.'); keep(j);
    let photo_url = null;
    if (f) { const path = `pending/${ses.user.id}/${Date.now()}-${f.name.replace(/[^\w.]/g, '_')}`; const r = await fetch(`${SB_URL}/storage/v1/object/trainers/${path}`, { method: 'POST', headers: { apikey: SB_KEY, authorization: 'Bearer ' + ses.access_token, 'content-type': f.type }, body: f }); if (r.ok) photo_url = `${SB_URL}/storage/v1/object/public/trainers/${path}`; }
    await rpc('register_trainer', { p: { name: $('rname').value.trim(), business: $('rbiz').value.trim(), whatsapp: wa, specialties: $('rspec').value.split(',').map(s => s.trim()).filter(Boolean), area: $('rarea').value.trim(), bio: $('rbio').value.trim(), glp1_support: $('rglp').value.trim(), virtual_pt: $('rvirt').checked, terms: true, photo_url } });
    start();
  } catch (x) { err(/already registered/i.test(x.message) ? 'That email already has an account — use Trainer sign in.' : x.message); } finally { $('rgo').disabled = false; } };
$('lf').onsubmit = async e => { e.preventDefault(); $('lerr').hidden = true; try { keep(await api('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: $('le').value.trim(), password: $('lp').value }) })); start(); } catch (x) { $('lerr').textContent = x.message; $('lerr').hidden = false; } };
$('out').onclick = () => { sessionStorage.removeItem('glp1trainer'); location.reload(); };
async function start() {
  if (!ses) return; $('out').hidden = false; $('auth').hidden = true;
  const me = (await rpc('my_trainer'))[0];
  if (!me) { $('auth').hidden = false; $('rf').hidden = true; $('lf').hidden = false; $('lerr').textContent = 'No trainer registration on this account.'; $('lerr').hidden = false; return; }
  if (me.status !== 'approved') { $('pending').hidden = false; return; }
  $('dash').hidden = false; $('mycode').textContent = me.client_code; $('copy').onclick = () => navigator.clipboard?.writeText(me.client_code).then(() => toast('Copied'));
  await loadClients();
}
const anniv = d => { const s = new Date(d), n = new Date(); return s.getMonth() === n.getMonth(); };
async function loadClients() {
  clients = await rpc('trainer_clients'); const m = clients.filter(c => c.billing === 'monthly').length, y = clients.length - m;
  $('sc').textContent = clients.length; $('sm').textContent = m; $('sy').textContent = y; $('sowe').textContent = '£' + (2 * m + 20 * clients.filter(c => c.billing === 'yearly' && anniv(c.billing_start)).length);
  const shared = s => Object.entries({ weights: 'Weight', workouts: 'Workouts', meals: 'Meals', injections: 'Injections' }).filter(([k]) => s?.[k]).map(([, v]) => v).join(' · ') || 'Not sharing';
  $('clients').innerHTML = clients.length ? clients.map((c, i) => `<li><span class="grow"><b>${esc(c.name || c.email.split('@')[0])}</b><br><small class="muted">${esc(c.email)} · joined ${new Date(c.redeemed_at).toLocaleDateString('en-GB')}</small><br><span class="shr">Shares: ${esc(shared(c.share))}</span></span>
    <span class="bill" role="group" aria-label="Billing"><button data-b="monthly" data-i="${i}" class="${c.billing === 'monthly' ? 'on' : ''}">£2/month</button><button data-b="yearly" data-i="${i}" class="${c.billing === 'yearly' ? 'on' : ''}">£20/year</button></span><button data-view="${i}">View progress</button></li>`).join('') : '<li class="muted">No clients yet — share your code above.</li>';
  $('clients').querySelectorAll('[data-b]').forEach(b => b.onclick = async () => { await rpc('set_client_billing', { c: clients[+b.dataset.i].user_id, b: b.dataset.b }); toast('Billing updated'); loadClients(); });
  $('clients').querySelectorAll('[data-view]').forEach(b => b.onclick = () => view(clients[+b.dataset.view]));
}
function graph(ws) { if (ws.length < 2) return '<p class="muted small">Not enough weigh-ins for a graph yet.</p>'; const pts = ws.map(w => [Date.parse(w.date), +w.kg]).sort((a, b) => a[0] - b[0]), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs) || x0 + 1, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
  const P = pts.map(([x, y]) => `${(20 + 560 * (x - x0) / (x1 - x0 || 1)).toFixed(1)},${(150 - 130 * (y - y0) / (y1 - y0)).toFixed(1)}`).join(' ');
  return `<svg class="graph" viewBox="0 0 600 160"><polyline points="${P}" fill="none" stroke="#5b2a86" stroke-width="3"/>${P.split(' ').map(p => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="4" fill="#2e9d5b"/>`).join('')}<text x="20" y="14" font-size="12" fill="#6b5b7b">${ys[0]} kg → ${ys.at(-1)} kg</text></svg>`; }
async function view(c) {
  const d = $('cdetail'); d.hidden = false; d.innerHTML = '<p class="muted">Loading…</p>';
  try { const p = await rpc('client_progress', { c: c.user_id }), off = t => `<p class="muted small">🔒 ${t} not shared by this client.</p>`;
    const ses2 = p.workouts?.sessions?.v || [], cls = p.workouts?.classes?.v || [], plan = p.meals?.myPlan?.v;
    d.innerHTML = `<h2>${esc(c.name || c.email)} <small class="muted">read-only</small></h2>
      <h3>⚖️ Weight & progress</h3>${p.weights ? graph(p.weights) : off('Weight/progress')}
      <h3>🏋️ Workouts</h3>${p.workouts ? `<p>${ses2.length} sessions · ${Array.isArray(cls) ? cls.length : Object.keys(cls || {}).length} classes done</p><table class="tbl">${ses2.slice(-8).reverse().map(s => `<tr><td>${new Date(s.date).toLocaleDateString('en-GB')}</td><td>${esc(Object.entries(s.totals || {}).map(([k, v]) => k + ' ' + v).join(', '))}</td></tr>`).join('')}</table>` : off('Workouts')}
      <h3>🥗 Meals</h3>${p.meals ? (plan ? `<p>Meal plan ${esc(plan.min)}–${esc(plan.max)} kcal · ${esc(plan.focus || '')} · ${(plan.added || []).length} recipes added</p>` : '<p class="muted small">No meal plan yet.</p>') : off('Meals')}
      <h3>💉 Injection log</h3>${p.injections ? `<p class="small muted">As entered by the client. Don't give dosing advice — refer to their GP/prescriber.</p><table class="tbl">${p.injections.sort((a, b) => String(b.at).localeCompare(a.at)).slice(0, 10).map(i => `<tr><td>${new Date(i.at).toLocaleDateString('en-GB')}</td><td>${esc(i.med)}</td><td>${esc(i.dose)} ${esc(i.unit)}</td><td>${esc(i.site || '')}</td></tr>`).join('')}</table>` : off('Injection log')}`;
    d.scrollIntoView({ behavior: 'smooth' });
  } catch (x) { d.innerHTML = `<p class="err">${esc(x.message)}</p>`; } }
start();
