// GLP1 Life Community (members only). All writes go through Supabase RPCs that apply the safety filter server-side;
// this file is only the UI. Display names only, never emails. No live sessions.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const RULE = 'No questions or advice on mixing, reconstituting or dosing medication or peptides. No buying, selling or sourcing medication.';
export const DOSE_BANNER = 'Share experiences, not dosing advice. Your prescriber decides your dose.';
export const GUIDELINES = [
  ['💜', 'Be kind', 'Everyone is at a different stage. Encourage, don\'t judge bodies, food or progress.'],
  ['🚫', 'No mixing or dosing advice', RULE.split('. ')[0] + '. You can share your own experience, e.g. "I\'m on my prescribed dose and felt…".'],
  ['🛑', 'No buying, selling or sourcing', 'No offers, requests, links or "DM me" for medication or peptides. Only use a regulated UK pharmacy or your prescriber.'],
  ['🩺', 'Not medical advice', 'Posts are members\' experiences. Ask your GP, prescriber or pharmacist about your treatment. In an emergency call 999 or 111.'],
  ['🔒', 'Privacy', 'Only your display name is shown. Don\'t share anyone\'s personal details. Weights are never shown unless you post them yourself.'],
  ['🚩', 'Report and block', 'Tap ⋯ on any post to report it or block someone. Our team reviews reports. Posts that break the rules are blocked, and repeated attempts suspend your account pending review.'],
];
const ago = iso => { const s = (Date.now() - Date.parse(iso)) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
const DOSE_RE = /\b\d+(\.\d+)?\s?(mg|mcg|ml|iu|units?|clicks?)\b|\b(dose|dosage|dosing|titrat\w*)\b/i;
export function makeCommunity({ rpc, toast, root, sbUrl, sbKey, token, uid, certificates = () => [], stats = () => ({}) }) {
  const S = { me: null, groups: [], view: 'feed', group: null, kind: null };
  const $ = sel => root.querySelector(sel);
  const photoUrl = p => p ? `${sbUrl}/storage/v1/object/public/community/${p.split('/').map(encodeURIComponent).join('/')}` : '';
  const say = v => { if (v?.action === 'block') { showRule(v.message); return false; } if (v?.action === 'hold') toast('⏳ ' + v.message, 5000); if (v?.suspended) toast('Your community account is suspended pending review.', 6000); return true; };
  function showRule(msg) { const m = $('#cmRuleMsg'); m.innerHTML = `<b>🚫 This can't be posted</b><p>${esc(msg)}</p><p class="small">Questions about your medicine? Your prescriber or pharmacist can help. NHS 111 is there 24/7.</p><button type="button" class="primary" id="cmRuleOk">OK, got it</button>`; m.hidden = false; $('#cmRuleOk').onclick = () => m.hidden = true; }
  async function load() {
    if (!uid()) { root.innerHTML = `${header()}<div class="card"><h3>Join the GLP1 Life Community</h3><p>Sign in to your GLP1 Life account (Settings › Cloud backup) to join.</p></div>`; return; }
    try { S.me = await rpc('community_me'); } catch (e) { root.innerHTML = `${header()}<div class="card"><p>Community is offline. ${esc(e.message)}</p></div>`; return; }
    if (!S.me.guidelines) return renderJoin();
    if (!S.groups.length) try { const r = await fetch(`${sbUrl}/rest/v1/community_groups?select=id,name,description,slug&order=sort`, { headers: { apikey: sbKey, authorization: 'Bearer ' + token() } }); S.groups = r.ok ? await r.json() : []; } catch {}
    render();
  }
  const header = () => `<div class="cmhead"><h2 class="pagehead">💬 Community</h2><p class="small muted">Support, wins and recipes from members on the same journey. No live sessions.</p><div class="cmrule" role="note">🛡️ <b>Community rule:</b> ${esc(RULE)}</div></div><div class="cmrulemsg" id="cmRuleMsg" role="alertdialog" hidden></div>`;
  function renderJoin() {
    root.innerHTML = `${header()}<div class="card cmguide"><h3>Community guidelines</h3><p class="small muted">Please read these before your first post.</p><ul class="cmglist">${GUIDELINES.map(([i, t, d]) => `<li><span>${i}</span><div><b>${esc(t)}</b><p class="small">${esc(d)}</p></div></li>`).join('')}</ul>
      <label>Display name (shown instead of your email)<input id="cmName" maxlength="30" autocomplete="nickname" placeholder="e.g. Sia from Leeds"></label>
      <label class="check"><input type="checkbox" id="cmAgree"> I agree to the community guidelines, including: ${esc(RULE)}</label>
      <p class="error" id="cmJoinErr" hidden></p><button type="button" class="primary big" id="cmJoin">Join the community</button></div>`;
    $('#cmJoin').onclick = async () => { const err = $('#cmJoinErr'); err.hidden = true; if (!$('#cmAgree').checked) { err.textContent = 'Please tick to agree to the guidelines.'; err.hidden = false; return; }
      try { S.me = await rpc('community_join', { p_name: $('#cmName').value }); toast('Welcome to the community 💜'); load(); } catch (e) { err.textContent = e.message; err.hidden = false; } };
  }
  function render() {
    const tabs = [['feed', '📰 Feed'], ['groups', '👥 Groups'], ['challenges', '🏁 Challenges'], ['recipes', '🥗 Recipe swaps'], ['buddy', '🤝 Buddy']];
    root.innerHTML = `${header()}<p class="small cmme">Posting as <b>${esc(S.me.display_name)}</b>${S.me.status !== 'active' ? ` · <span class="error">account ${esc(S.me.status)}</span>` : ''}</p>
      <div class="chips cmtabs" role="tablist">${tabs.map(([k, n]) => `<button type="button" class="chip ${S.view === k ? 'like' : ''}" data-cmv="${k}" role="tab" aria-selected="${S.view === k}">${n}</button>`).join('')}</div><div id="cmBody"></div>`;
    root.querySelectorAll('[data-cmv]').forEach(b => b.onclick = () => { S.view = b.dataset.cmv; S.group = null; render(); });
    ({ feed: () => feed(), groups: groups, challenges: challenges, recipes: () => feed({ kind: 'recipe' }), buddy: buddy })[S.view]();
  }
  function composer({ kind = 'post', group = null } = {}) {
    const rec = kind === 'recipe';
    return `<form class="card cmcompose" id="cmForm"><label class="sr" for="cmText">${rec ? 'Recipe' : 'Post'}</label>
      ${rec ? '<input id="cmRTitle" placeholder="Recipe name" maxlength="80" required><textarea id="cmRIng" rows="3" placeholder="Ingredients (one per line)"></textarea><div class="cmcost"><label>Est. cost at Aldi £<input id="cmRAldi" inputmode="decimal" placeholder="3.50"></label><label>at Lidl £<input id="cmRLidl" inputmode="decimal" placeholder="3.40"></label></div>' : ''}
      <textarea id="cmText" rows="3" maxlength="2000" placeholder="${rec ? 'Method / tips' : 'Share a win, a struggle or a tip…'}" required></textarea>
      ${!rec && !group ? `<select id="cmGroup" aria-label="Group"><option value="">Everyone (main feed)</option>${S.groups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select>` : ''}
      <div class="row cmactions"><label class="cmphoto">📷 Photo<input type="file" id="cmPhoto" accept="image/*" hidden></label><span class="small muted" id="cmPhotoName"></span><button class="primary" id="cmSend">Post</button></div>
      ${!rec ? '<button type="button" class="linkbtn" id="cmShout">🏆 Share a certificate</button>' : ''}<p class="small muted">${esc(DOSE_BANNER)}</p></form>`;
  }
  async function upload(file) {
    if (!file) return null; if (file.size > 5e6) throw new Error('Photo is over 5 MB');
    const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg'), path = `${uid()}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const r = await fetch(`${sbUrl}/storage/v1/object/community/${path}`, { method: 'POST', headers: { apikey: sbKey, authorization: 'Bearer ' + token(), 'content-type': file.type, 'x-upsert': 'false' }, body: file });
    if (!r.ok) throw new Error('Photo upload failed'); return path;
  }
  function bindComposer(opts, reload) {
    const f = $('#cmForm'); if (!f) return;
    $('#cmPhoto').onchange = () => $('#cmPhotoName').textContent = $('#cmPhoto').files[0]?.name || '';
    f.onsubmit = async e => { e.preventDefault(); const btn = $('#cmSend'); btn.disabled = true;
      try { const rec = opts.kind === 'recipe' ? { title: $('#cmRTitle').value.trim(), ingredients: $('#cmRIng').value.split('\n').map(s => s.trim()).filter(Boolean), aldi: +$('#cmRAldi').value || null, lidl: +$('#cmRLidl').value || null } : null;
        const body = rec ? `${rec.title}\n${$('#cmText').value.trim()}` : $('#cmText').value.trim(); if (!body.trim()) return;
        const v = await rpc('community_post', { p_body: body, p_group: opts.group || $('#cmGroup')?.value || null, p_kind: opts.kind || 'post', p_photo: await upload($('#cmPhoto').files[0]), p_recipe: rec });
        if (say(v)) { if (v.action === 'ok') toast('✅ Posted'); reload(); } } catch (x) { toast(x.message); } finally { btn.disabled = false; } };
    const sh = $('#cmShout'); if (sh) sh.onclick = () => shoutout(reload);
  }
  async function shoutout(reload) {
    const cs = certificates(); if (!cs.length) return toast('Your certificates appear in Track › My certificates once you reach a milestone.');
    const c = cs[cs.length - 1]; const v = await rpc('community_post', { p_body: `🏆 I just earned my "${c.label}" certificate on GLP1 Life! 🎉`, p_kind: 'shoutout' });
    if (say(v)) { toast('🎉 Shared to the feed'); reload(); }
  }
  async function feed(opts = {}) {
    const body = opts.el || $('#cmBody'), group = opts.group || null; body.innerHTML = `${composer({ kind: opts.kind, group })}<div id="cmFeed" class="cmfeed"><p class="small muted">Loading…</p></div>`;
    const reload = () => feed(opts); bindComposer({ ...opts, group }, reload);
    let posts = []; try { posts = await rpc('community_feed', { p_group: group, p_kind: opts.kind || null }); } catch (e) { $('#cmFeed').innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
    $('#cmFeed').innerHTML = posts.length ? posts.map(post).join('') : '<div class="card"><p class="small muted">No posts yet. Be the first to say hello 👋</p></div>';
    bindPosts(reload);
  }
  function post(p) {
    const doseThread = p.dose_topic || DOSE_RE.test(p.body) || p.comments.some(c => DOSE_RE.test(c.body)), r = p.recipe;
    return `<article class="card cmpost" data-post="${p.id}">${p.status === 'held' ? '<p class="cmheld">⏳ Waiting for review. Only you can see this.</p>' : ''}
      ${doseThread ? `<p class="cmdose" role="note">💊 ${esc(DOSE_BANNER)}</p>` : ''}
      <header><b>${esc(p.author)}</b><small class="muted"> · ${ago(p.created_at)}${p.group_id ? ' · ' + esc(S.groups.find(g => g.id === p.group_id)?.name || '') : ''}${p.kind === 'shoutout' ? ' · 🏆 shout-out' : ''}</small>
        <button type="button" class="cmmore" data-more="${p.id}" aria-label="More options">⋯</button></header>
      ${r ? `<h3>🥗 ${esc(r.title)}</h3>${r.ingredients?.length ? `<ul class="small">${r.ingredients.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}${r.aldi || r.lidl ? `<p class="small cmcostline">💷 Est. ${r.aldi ? `Aldi £${(+r.aldi).toFixed(2)}` : ''}${r.aldi && r.lidl ? ' · ' : ''}${r.lidl ? `Lidl £${(+r.lidl).toFixed(2)}` : ''}</p>` : ''}<p>${esc(p.body.split('\n').slice(1).join('\n'))}</p>` : `<p class="cmtext">${esc(p.body)}</p>`}
      ${p.photo ? `<img class="cmimg" src="${photoUrl(p.photo)}" alt="" loading="lazy">` : ''}
      <div class="cmreact">${['👏', '❤️', '💪', '🎉'].map(e => `<button type="button" class="${p.my_reactions.includes(e) ? 'on' : ''}" data-react="${e}" aria-pressed="${p.my_reactions.includes(e)}">${e} <span>${p.reactions[e] || ''}</span></button>`).join('')}</div>
      <div class="cmcomments">${p.comments.map(c => `<div class="cmc"><b>${esc(c.author)}</b> ${esc(c.body)}${c.status === 'held' ? ' <small class="muted">(waiting for review)</small>' : ''}</div>`).join('')}
        <form class="cmcform" data-cpost="${p.id}"><input name="c" maxlength="1000" placeholder="Write a kind reply…" aria-label="Reply"><button class="small">Reply</button></form></div>
      <div class="cmmenu" id="menu-${p.id}" hidden><button type="button" data-report="${p.id}">🚩 Report post</button>${p.author_id ? `<button type="button" data-block="${p.author_id}">🚫 Block ${esc(p.author)}</button>` : ''}</div></article>`;
  }
  function bindPosts(reload) {
    root.querySelectorAll('[data-react]').forEach(b => b.onclick = async () => { const id = b.closest('[data-post]').dataset.post; try { await rpc('community_react', { p_post: id, p_emoji: b.dataset.react }); reload(); } catch (e) { toast(e.message); } });
    root.querySelectorAll('[data-more]').forEach(b => b.onclick = () => { const m = $(`#menu-${b.dataset.more}`); m.hidden = !m.hidden; });
    root.querySelectorAll('[data-report]').forEach(b => b.onclick = async () => { const why = prompt('What\'s wrong with this post? (e.g. selling, dosing advice, unkind)'); if (why === null) return; await rpc('community_report', { p_post: b.dataset.report, p_reason: why || 'reported' }); toast('🚩 Thanks, our team will review it.'); });
    root.querySelectorAll('[data-block]').forEach(b => b.onclick = async () => { if (!confirm('Block this member? You won\'t see each other\'s posts.')) return; await rpc('community_block', { p_user: b.dataset.block, p_on: true }); toast('Blocked'); reload(); });
    root.querySelectorAll('[data-cpost]').forEach(f => f.onsubmit = async e => { e.preventDefault(); const t = f.c.value.trim(); if (!t) return;
      try { const v = await rpc('community_comment', { p_post: f.dataset.cpost, p_body: t }); if (say(v)) reload(); } catch (x) { toast(x.message); } });
  }
  function groups() {
    const body = $('#cmBody');
    if (S.group) { const g = S.groups.find(x => x.id === S.group); body.innerHTML = `<button type="button" class="linkbtn" id="cmBack">‹ All groups</button><h3>${esc(g.name)}</h3><p class="small muted">${esc(g.description)}</p><div id="cmGroupFeed"></div>`; $('#cmBack').onclick = () => { S.group = null; groups(); };
      feed({ group: g.id, el: $('#cmGroupFeed') }); return; }
    body.innerHTML = `<div class="linkcards">${S.groups.map(g => `<button type="button" class="linkcard" data-group="${g.id}"><span class="lcicon">👥</span><span class="lctext"><b>${esc(g.name)}</b><small>${esc(g.description)}</small></span><span class="lcgo">›</span></button>`).join('')}</div>`;
    body.querySelectorAll('[data-group]').forEach(b => b.onclick = () => { S.group = b.dataset.group; groups(); });
  }
  async function challenges() {
    const body = $('#cmBody'); body.innerHTML = '<p class="small muted">Loading…</p>'; let list = [];
    try { list = await rpc('community_challenges_list'); } catch (e) { body.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
    const st = stats();
    body.innerHTML = list.map(c => { const mine = c.title.includes('hydration') ? st.hydrationDays : st.activeDays;
      return `<div class="card cmchal"><h3>🏁 ${esc(c.title)}</h3><p class="small">${esc(c.description)}</p><p class="small muted">${new Date(c.starts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date(c.ends).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${c.members} joined</p>
      ${c.joined ? `<p><b>Your progress: ${c.my_progress ?? 0} ${c.metric === 'pct' ? '%' : 'days'}</b></p><button type="button" data-sync="${c.id}" data-val="${mine ?? 0}">↻ Update from my app (${mine ?? 0})</button>` : `<label class="check"><input type="checkbox" data-show="${c.id}" checked> Show my progress on the leaderboard</label><button type="button" class="primary" data-join="${c.id}">Join challenge</button>`}
      ${c.leaderboard.length ? `<ol class="cmboard">${c.leaderboard.map(l => `<li class="${l.me ? 'me' : ''}"><span>${esc(l.name)}</span><b>${l.progress} ${c.metric === 'pct' ? '%' : 'days'}</b></li>`).join('')}</ol><p class="small muted">Leaderboards show activity or % only, never weights.</p>` : ''}</div>`; }).join('') || '<div class="card"><p class="small muted">No challenges right now.</p></div>';
    body.querySelectorAll('[data-join]').forEach(b => b.onclick = async () => { await rpc('community_challenge_join', { p_id: b.dataset.join, p_show: body.querySelector(`[data-show="${b.dataset.join}"]`)?.checked !== false }); toast('🏁 Joined!'); challenges(); });
    body.querySelectorAll('[data-sync]').forEach(b => b.onclick = async () => { await rpc('community_challenge_progress', { p_id: b.dataset.sync, p_value: +b.dataset.val }); challenges(); });
  }
  async function buddy() {
    const body = $('#cmBody'); let list = []; try { list = await rpc('community_buddies_list'); } catch (e) { body.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
    body.innerHTML = `<div class="card"><h3>🤝 Find a buddy</h3><p class="small muted">Pair with another member for simple daily check-ins. They'll see your display name only.</p><form id="cmBuddyF" class="row"><input id="cmBuddyName" placeholder="Their display name" aria-label="Display name" maxlength="30"><button class="primary">Send request</button></form></div>
      ${list.map(b => `<div class="card cmbuddy"><h3>${esc(b.name)}</h3>${b.status === 'pending' ? (b.incoming ? `<p>${esc(b.name)} would like to be your buddy.</p><div class="row"><button type="button" class="primary" data-acc="${b.id}">Accept</button><button type="button" data-dec="${b.id}">Decline</button></div>` : '<p class="small muted">Request sent, waiting for them to accept.</p>')
        : `<form class="cmcheck" data-buddy="${b.id}"><div class="row cmmoods">${['😀', '🙂', '😐', '😣'].map(m => `<label><input type="radio" name="mood" value="${m}"> ${m}</label>`).join('')}</div><input name="t" maxlength="500" placeholder="Today's check-in: how are you doing?"><button class="primary">Check in</button></form>
          <ul class="cmchecks">${b.checkins.map(c => `<li><b>${c.mine ? 'You' : esc(b.name)}</b> ${esc(c.mood || '')} ${esc(c.body)} <small class="muted">${ago(c.at)}</small></li>`).join('')}</ul>`}</div>`).join('')}`;
    $('#cmBuddyF').onsubmit = async e => { e.preventDefault(); try { await rpc('community_buddy_request', { p_name: $('#cmBuddyName').value }); toast('🤝 Request sent'); buddy(); } catch (x) { toast(x.message); } };
    body.querySelectorAll('[data-acc]').forEach(b => b.onclick = async () => { await rpc('community_buddy_answer', { p_id: b.dataset.acc, p_accept: true }); buddy(); });
    body.querySelectorAll('[data-dec]').forEach(b => b.onclick = async () => { await rpc('community_buddy_answer', { p_id: b.dataset.dec, p_accept: false }); buddy(); });
    body.querySelectorAll('[data-buddy]').forEach(f => f.onsubmit = async e => { e.preventDefault(); const t = f.t.value.trim(); if (!t) return; try { const v = await rpc('community_checkin', { p_buddy: f.dataset.buddy, p_body: t, p_mood: f.mood?.value || null }); if (say(v)) buddy(); } catch (x) { toast(x.message); } });
  }
  return { load };
}
