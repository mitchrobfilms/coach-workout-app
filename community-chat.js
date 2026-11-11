// GLP1 Life community chat. Live data goes through Supabase RPCs in 009_community.sql.
// Until that migration is applied, open() shows a coming-soon card. ?chatdemo=1 renders
// local sample messages and never calls the server.
import {
  IMAGE_MAX, PINNED, REACTIONS, esc, classifyChat, chatUnavailable, validName, initials, chatTime,
  canPost, composerNote, rateOk, moveSection, toggleReaction, decorateSections, listHtml, chatHtml, threadHtml,
  adminHtml, queueHtml, menuHtml, signInHtml, soonHtml, guidelinesHtml, demoState, visibleMessages, pageMessages,
} from './community-chat-core.js';

export function demoMode(search = '') {
  const q = new URLSearchParams(String(search).replace(/^\?/, ''));
  if (!q.has('chatdemo')) return null;
  const v = q.get('chatdemo');
  if (v === 'admin' || v === 'reports' || v === 'chat' || v === 'queue') return v;
  return 'member';
}

function mapSection(s) {
  if (s.preview != null && s.time != null && s.unread != null) return { ...s, archived: !!s.archived };
  return {
    ...s,
    archived: !!s.archived,
    unread: Number(s.unread) || 0,
    time: s.last_at ? chatTime(s.last_at) : '',
    preview: s.last_at ? `${s.last_author || 'Member'}: ${s.last_body || 'Photo'}`.slice(0, 120) : (s.description || ''),
  };
}

function liveBackend({ rpc, sbUrl, sbKey, token, uid }) {
  const call = (name, args) => rpc(name, args);
  return {
    demo: false,
    async me() { return call('community_chat_me'); },
    async join(name) { return call('community_chat_join', { p_name: name }); },
    async sections() { return (await call('community_chat_sections')).map(mapSection); },
    async history(section, before) { return call('community_chat_history', { p_section: section, p_before: before, p_limit: 40 }); },
    async send({ section, body, image, reply }) { return call('community_chat_send', { p_section: section, p_body: body, p_image: image, p_reply: reply }); },
    async react(id, emoji) { return call('community_chat_react', { p_message: id, p_emoji: emoji }); },
    async read(section) { return call('community_chat_read', { p_section: section }); },
    async report(id, reason) { return call('community_chat_report', { p_message: id, p_reason: reason }); },
    async block(user, on) { return call('community_chat_block', { p_user: user, p_on: on }); },
    async remove(id) { return call('community_chat_delete', { p_message: id }); },
    async saveSection(input) { return call('community_chat_section_save', { p_id: input.id, p_name: input.name, p_description: input.description, p_emoji: input.emoji, p_announce: input.announce }); },
    async archive(id, on) { return call('community_chat_section_archive', { p_id: id, p_on: on }); },
    async deleteSection(id) { return call('community_chat_section_delete', { p_id: id }); },
    async reorder(ids) { return call('community_chat_reorder', { p_ids: ids }); },
    async queue() { return call('community_chat_queue'); },
    async moderate(kind, id, action) { return call('community_chat_moderate', { p_kind: kind, p_id: id, p_action: action }); },
    async upload(file) {
      if (!file) return null;
      if (file.size > IMAGE_MAX) throw new Error('Photo is over 2 MB');
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Use a JPEG, PNG or WebP photo');
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${uid()}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const r = await fetch(`${sbUrl}/storage/v1/object/community-chat/${path}`, { method: 'POST', headers: { apikey: sbKey, authorization: 'Bearer ' + token(), 'content-type': file.type, 'x-upsert': 'false' }, body: file });
      if (!r.ok) throw new Error('Photo upload failed');
      return path;
    },
  };
}

function demoBackend(state) {
  const find = id => state.messages.find(m => m.id === id);
  return {
    demo: true,
    state,
    async me() { return { ...state.me, pinned: PINNED, signed_in: true }; },
    async join(name) { const n = validName(name); if (!n) throw new Error('Choose a display name of 2-30 characters, and do not use your email.'); state.me.display_name = n; state.me.guidelines = true; state.me.member = true; return this.me(); },
    async sections() {
      const visible = state.messages.filter(m => m.status === 'visible' && !state.blocks.includes(m.user_id));
      return decorateSections(state.sections, visible, state.reads, state.me.user_id, { includeArchived: !!state.me.is_admin });
    },
    async history(section, before) {
      const page = pageMessages(visibleMessages(state, section), { before, limit: 40 });
      return { messages: page.messages.map(m => ({ ...m, mine: m.user_id === state.me.user_id })), has_more: page.hasMore };
    },
    async send({ section, body, image, reply }) {
      const sec = state.sections.find(s => s.id === section);
      const gate = canPost({ section: sec, isAdmin: state.me.is_admin, status: state.me.status, mutedUntil: state.me.muted_until, guidelines: state.me.guidelines });
      if (!gate.ok) throw new Error(composerNote(gate) || 'You cannot post in this section.');
      if (!rateOk(state.stamps, Date.now())) throw new Error('You are sending messages very quickly. Please wait a minute.');
      const text = String(body || '').trim();
      if (!text && !image) throw new Error('Write a message or add a photo.');
      state.stamps.push(Date.now());
      const judged = classifyChat(text);
      const parent = reply ? find(reply) : null;
      const msg = {
        id: 'local-' + Math.random().toString(36).slice(2, 8), section_id: section, user_id: state.me.user_id,
        author: state.me.display_name, mine: true, body: text, image: image || null,
        reply: parent ? { id: parent.id, author: parent.author, body: parent.status === 'deleted' ? '' : (parent.body || 'Photo'), gone: parent.status === 'deleted' } : null,
        status: judged.action === 'hold' ? 'held' : 'visible', reason: judged.reason, created_at: new Date().toISOString(),
        reactions: {}, my_reactions: [], initials: initials(state.me.display_name),
      };
      state.messages.push(msg);
      return { action: judged.action, message: judged.message, id: msg.id };
    },
    async react(id, emoji) { const m = find(id); if (!m || !REACTIONS.includes(emoji)) return false; const next = toggleReaction(m, emoji); Object.assign(m, next); return m.my_reactions.includes(emoji); },
    async read(section) { state.reads[section] = new Date().toISOString(); },
    async report(id, reason) { const m = find(id); state.reports.push({ id: 'r-' + id + state.reports.length, message_id: id, user_id: m?.user_id, author: m?.author, reason: reason || 'reported', body: m?.body || '', at: new Date().toISOString() }); },
    async block(user) { if (!state.blocks.includes(user)) state.blocks.push(user); },
    async remove(id) { const m = find(id); if (m && (m.user_id === state.me.user_id || state.me.is_admin)) m.status = 'deleted'; },
    async saveSection(input) {
      if (!state.me.is_admin) throw new Error('admin only');
      const name = String(input.name || '').trim();
      if (!input.id) {
        if (!name) throw new Error('Name the section.');
        const id = 's' + Math.random().toString(36).slice(2, 6);
        state.sections.push({ id, slug: name.toLowerCase(), name: name.slice(0, 40), description: String(input.description || '').slice(0, 200), emoji: input.emoji || '💬', sort: Math.max(0, ...state.sections.map(s => s.sort)) + 10, announce_only: !!input.announce, archived: false });
        return id;
      }
      const s = state.sections.find(x => x.id === input.id);
      if (!s) throw new Error('Section not found');
      if (name) s.name = name.slice(0, 40);
      if (input.description != null) s.description = String(input.description).slice(0, 200);
      if (input.emoji) s.emoji = input.emoji;
      if (input.announce != null) s.announce_only = !!input.announce;
      return s.id;
    },
    async archive(id, on) { const s = state.sections.find(x => x.id === id); if (s) s.archived = !!on; },
    async deleteSection(id) { state.sections = state.sections.filter(s => s.id !== id); state.messages = state.messages.filter(m => m.section_id !== id); },
    async reorder(ids) { ids.forEach((id, i) => { const s = state.sections.find(x => x.id === id); if (s) s.sort = (i + 1) * 10; }); },
    async queue() {
      const held = state.messages.filter(m => m.status === 'held').map(m => ({ id: m.id, body: m.body, reason: m.reason || 'held', author: m.author, user_id: m.user_id, at: m.created_at }));
      const reports = state.reports.filter(r => !r.resolved);
      const members = Object.entries(state.mutes || {}).map(([user_id, muted_until]) => ({ user_id, name: state.names?.[user_id] || 'Member', status: 'active', muted_until }));
      for (const id of state.banned || []) members.push({ user_id: id, name: state.names?.[id] || 'Member', status: 'banned', muted_until: null });
      return { held, reports, members };
    },
    async moderate(kind, id, action) {
      if (!state.me.is_admin) throw new Error('admin only');
      if (kind === 'message' && action === 'approve') { const m = find(id); if (m) { m.status = 'visible'; m.reason = null; } }
      else if (kind === 'message' && action === 'delete') { const m = find(id); if (m) m.status = 'deleted'; state.reports.forEach(r => { if (r.message_id === id) r.resolved = true; }); }
      else if (kind === 'report' && action === 'dismiss') { const r = state.reports.find(x => x.id === id); if (r) r.resolved = true; }
      else if (kind === 'user' && action === 'mute') { state.mutes[id] = new Date(Date.now() + 86400000).toISOString(); }
      else if (kind === 'user' && action === 'ban') { state.banned = [...new Set([...(state.banned || []), id])]; }
      else if (kind === 'user' && action === 'restore') { delete state.mutes[id]; state.banned = (state.banned || []).filter(x => x !== id); }
    },
    async upload(file) {
      if (!file) return null;
      if (file.size > IMAGE_MAX) throw new Error('Photo is over 2 MB');
      if (!/^image\/(jpeg|png|webp|svg\+xml)$/.test(file.type)) throw new Error('Use a JPEG, PNG or WebP photo');
      return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Photo could not be read')); reader.readAsDataURL(file); });
    },
  };
}

export function makeCommunityChat({ rpc, toast, root, sbUrl, sbKey, token, uid, openPosts, openSettings, search }) {
  const mode = demoMode(search ?? (typeof location !== 'undefined' ? location.search : ''));
  const state = mode ? demoState() : null;
  if (state) {
    state.me.is_admin = mode === 'admin' || mode === 'reports' || mode === 'queue';
    state.mutes = { casey: '2026-11-12T12:00:00.000Z' };
    state.names = { casey: 'Casey', lee: 'Lee' };
    state.banned = [];
  }
  const be = state ? demoBackend(state) : liveBackend({ rpc, sbUrl, sbKey, token, uid });
  const S = { me: null, rows: [], shown: [], sectionId: null, reply: null, hasMore: false, screen: '', file: null, stick: true, press: 0 };
  const $ = sel => root.querySelector(sel);
  const admin = () => !!S.me?.is_admin;
  const say = m => toast?.(m);

  function paintHome() {
    const el = document.getElementById('commHomePreview');
    if (!el || !S.rows?.length) return;
    const top = S.rows.find(r => r.unread) || S.rows[0];
    el.textContent = top?.unread ? `${top.unread} new in ${top.name}` : (top?.preview || 'Food, fitness, wins and announcements');
  }

  function messageById(id) {
    return S.shown.find(m => m.id === id) || state?.messages.find(m => m.id === id);
  }

  async function failOpen(e) {
    if (chatUnavailable(e) === 'soon') { root.innerHTML = soonHtml(); return; }
    root.innerHTML = `<div class="waapp">${soonHtml().match(/<header[\s\S]*?<\/header>/)?.[0] || ''}<div class="card"><h3>Community chat is offline</h3><p>${esc(e.message || 'Try again in a moment.')}</p><button type="button" class="primary" id="waPosts">Member posts</button></div></div>`;
  }

  async function open(view) {
    S.screen = view || 'list';
    if (state && (view === 'admin' || view === 'queue' || view === 'reports')) state.me.is_admin = true;
    if (state && (view === 'list' || view === 'member' || view == null)) state.me.is_admin = mode === 'admin' || mode === 'reports' || mode === 'queue';
    if (!state && !uid?.()) { root.innerHTML = signInHtml(); return; }
    try { S.me = await be.me(); }
    catch (e) { await failOpen(e); return; }
    if (S.me && S.me.signed_in === false) { root.innerHTML = signInHtml(); return; }
    if (!S.me?.guidelines) { root.innerHTML = guidelinesHtml(); return; }
    if (view === 'admin') return renderAdmin();
    if (view === 'queue' || view === 'reports') return renderQueue();
    if (view === 'chat') return renderChat(state ? 'food' : S.sectionId);
    return renderList();
  }

  async function renderList() {
    S.screen = 'list'; S.sectionId = null; S.reply = null;
    try { S.rows = (await be.sections()).map(mapSection).filter(s => !s.archived); }
    catch (e) { await failOpen(e); return; }
    root.innerHTML = listHtml(S.rows, { pinned: S.me?.pinned || PINNED, admin: admin(), name: S.me?.display_name || '' });
    paintHome();
    listen();
  }

  async function renderChat(id, { keepScroll = false } = {}) {
    if (!id) return renderList();
    S.sectionId = id; S.screen = 'chat';
    let page;
    try { page = await be.history(id, null); await be.read(id); }
    catch (e) { say(e.message); return; }
    S.shown = page.messages || []; S.hasMore = !!page.has_more;
    const section = (S.rows.find(s => s.id === id) || state?.sections.find(s => s.id === id) || { id, name: 'Chat', emoji: '💬' });
    const gate = canPost({ section, isAdmin: admin(), status: S.me?.status, mutedUntil: S.me?.muted_until, guidelines: !!S.me?.guidelines });
    const thread = root.querySelector('#waThread');
    const near = thread ? thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120 : true;
    const prevTop = thread?.scrollTop || 0;
    root.innerHTML = chatHtml(section, { note: gate.ok ? '' : composerNote(gate), reply: S.reply, admin: admin(), hasMore: S.hasMore });
    $('#waThread').innerHTML = (S.hasMore ? '<button type="button" class="walink" id="waOlder">Load earlier messages</button>' : '') + threadHtml(section, S.shown);
    const box = $('#waThread');
    const pin = () => { box.scrollTop = keepScroll && !near ? prevTop : box.scrollHeight; };
    pin(); requestAnimationFrame(pin);
    if (S.file) showFile();
    hydrate(box);
    listen();
  }

  async function older() {
    const first = S.shown[0]; if (!first || !S.hasMore) return;
    const box = $('#waThread'); const prev = box?.scrollHeight || 0;
    const page = await be.history(S.sectionId, first.created_at);
    const ids = new Set(S.shown.map(m => m.id));
    S.shown = [...(page.messages || []).filter(m => !ids.has(m.id)), ...S.shown];
    S.hasMore = !!page.has_more;
    box.innerHTML = (S.hasMore ? '<button type="button" class="walink" id="waOlder">Load earlier messages</button>' : '') + threadHtml(null, S.shown);
    box.scrollTop = box.scrollHeight - prev;
    hydrate(box);
  }

  async function renderAdmin() {
    if (!admin()) return renderList();
    S.screen = 'admin';
    try { S.all = state ? state.sections.slice() : (await be.sections()).map(mapSection); }
    catch (e) { say(e.message); return; }
    root.innerHTML = adminHtml(S.all);
  }

  async function renderQueue() {
    if (!admin()) return renderList();
    S.screen = 'queue';
    let q; try { q = await be.queue(); } catch (e) { say(e.message); return; }
    root.innerHTML = queueHtml(q);
  }

  function showFile() {
    const el = $('#waPhotoName'); if (!el) return;
    el.hidden = !S.file; el.textContent = S.file ? `Photo ready: ${S.file.name}` : '';
  }

  function openMenu(id) {
    const message = messageById(id); if (!message) return;
    $('#waSheet')?.remove();
    root.insertAdjacentHTML('beforeend', menuHtml({ ...message, mine: message.mine || message.user_id === S.me?.user_id }, { admin: admin() }));
  }

  async function hydrate(scope) {
    if (state || !scope) return;
    for (const img of scope.querySelectorAll('img[data-path]')) {
      try {
        const path = img.dataset.path.split('/').map(encodeURIComponent).join('/');
        const r = await fetch(`${sbUrl}/storage/v1/object/authenticated/community-chat/${path}`, { headers: { apikey: sbKey, authorization: 'Bearer ' + token() } });
        if (!r.ok) continue;
        img.src = URL.createObjectURL(await r.blob());
      } catch { /* leave the empty frame */ }
    }
  }

  let poll = 0; let socket = null;
  function listen() {
    if (state || socket || poll) return;
    const access = token?.();
    if (!access || !sbUrl) { poll = setInterval(tick, 8000); return; }
    let ws;
    try { ws = new WebSocket(sbUrl.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(sbKey) + '&vsn=1.0.0'); }
    catch { poll = setInterval(tick, 8000); return; }
    let ref = 1;
    ws.onopen = () => ws.send(JSON.stringify({
      topic: 'realtime:chat', event: 'phx_join', ref: '1', join_ref: '1',
      payload: { access_token: access, config: { broadcast: { ack: false, self: false }, presence: { key: '' }, postgres_changes: [
        { event: '*', schema: 'public', table: 'community_messages' },
        { event: '*', schema: 'public', table: 'community_msg_reactions' },
      ] } },
    }));
    ws.onmessage = ev => { let msg; try { msg = JSON.parse(ev.data); } catch { return; } if (msg.event === 'postgres_changes') tick(); };
    ws.onerror = () => { if (!poll) poll = setInterval(tick, 8000); };
    const beat = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) })); }, 25000);
    socket = { stop() { clearInterval(beat); try { ws.close(); } catch {} socket = null; } };
  }
  let tickTimer = 0;
  function tick() {
    clearTimeout(tickTimer);
    tickTimer = setTimeout(() => {
      if (document.getElementById('waText') === document.activeElement) return;
      if (S.screen === 'list') renderList();
      else if (S.screen === 'chat') renderChat(S.sectionId, { keepScroll: true });
    }, 300);
  }
  function pause() {
    clearInterval(poll); poll = 0; socket?.stop();
  }

  root.addEventListener('click', async e => {
    const t = e.target.closest('button, a'); if (!t || !root.contains(t)) return;
    if (t.id === 'waPosts') { pause(); openPosts?.(); return; }
    if (t.id === 'waSettings') { openSettings?.(); return; }
    if (t.id === 'waBack') return renderList();
    if (t.id === 'waAdmin') return renderAdmin();
    if (t.id === 'waQueue') return renderQueue();
    if (t.id === 'waOlder') return older().catch(err => say(err.message));
    if (t.dataset.open) return renderChat(t.dataset.open);
    if (t.id === 'waPhoto') { $('#waFile')?.click(); return; }
    if (t.id === 'waReplyClear') { S.reply = null; const bar = $('#waReply'); if (bar) bar.hidden = true; return; }
    if (t.dataset.menu) return openMenu(t.dataset.menu);
    if (t.dataset.react) return react(t.dataset.mid, t.dataset.react);
    if (t.dataset.up || t.dataset.down) return shift(t.dataset.up || t.dataset.down, t.dataset.up ? -1 : 1);
    if (t.dataset.arch) return toggleArchive(t.dataset.arch);
    if (t.dataset.del) return removeSection(t.dataset.del);
    if (t.dataset.edit) return editSection(t.dataset.edit);
    if (t.dataset.mod) return moderate(t.dataset.mod, t.dataset.id, t.dataset.act);
    if (t.dataset.act) return menuAct(t);
  });
  root.addEventListener('submit', async e => {
    if (e.target.id === 'waForm') { e.preventDefault(); return send(); }
    if (e.target.id === 'waSecForm') { e.preventDefault(); return saveSection(); }
  });
  root.addEventListener('change', e => { if (e.target.id === 'waFile') { S.file = e.target.files?.[0] || null; showFile(); } });
  root.addEventListener('pointerdown', e => {
    const bubble = e.target.closest?.('.wabubble');
    if (!bubble || e.target.closest('button')) return;
    clearTimeout(S.press);
    S.press = setTimeout(() => openMenu(bubble.dataset.mid), 480);
  });
  root.addEventListener('pointerup', () => clearTimeout(S.press));
  root.addEventListener('pointerleave', () => clearTimeout(S.press));
  root.addEventListener('contextmenu', e => {
    const bubble = e.target.closest?.('.wabubble');
    if (!bubble) return;
    e.preventDefault();
    openMenu(bubble.dataset.mid);
  });

  async function react(id, emoji) {
    try { await be.react(id, emoji); $('#waSheet')?.remove(); if (S.screen === 'chat') await renderChat(S.sectionId, { keepScroll: true }); }
    catch (err) { say(err.message); }
  }
  async function send() {
    const input = $('#waText'); const body = input?.value || ''; const btn = $('#waSend'); if (btn) btn.disabled = true;
    try {
      const image = S.file ? await be.upload(S.file) : null;
      const v = await be.send({ section: S.sectionId, body, image, reply: S.reply?.id || null });
      S.reply = null; S.file = null;
      if (v?.action === 'hold') say(v.message || 'Held for review. It is not in the chat for other members.');
      await renderChat(S.sectionId);
    } catch (err) { say(err.message); if (btn) btn.disabled = false; }
  }
  async function menuAct(t) {
    const id = t.dataset.mid; const message = id ? messageById(id) : null;
    $('#waSheet')?.remove();
    try {
      if (t.dataset.act === 'close') return;
      if (t.dataset.act === 'reply' && message) {
        S.reply = { id: message.id, author: message.author || 'Member' };
        const bar = $('#waReply');
        if (bar) { bar.hidden = false; bar.innerHTML = `<span>Replying to <b>${esc(message.author || 'Member')}</b></span><button type="button" id="waReplyClear" aria-label="Cancel reply">✕</button>`; }
        $('#waText')?.focus(); return;
      }
      if (t.dataset.act === 'copy') { await navigator.clipboard?.writeText(message?.body || ''); say('Copied'); return; }
      if (t.dataset.act === 'react') return react(id, t.dataset.emoji);
      if (t.dataset.act === 'report') {
        const why = prompt('What is wrong with this message?'); if (why === null) return;
        await be.report(id, why || 'reported'); say('Thanks. An admin will review that report.'); return;
      }
      if (t.dataset.act === 'block') { if (!confirm('Block this member? You will not see each other in the chat.')) return; await be.block(t.dataset.user, true); say('Blocked'); return renderChat(S.sectionId); }
      if (t.dataset.act === 'delete') { if (!confirm('Delete this message?')) return; await be.remove(id); return renderChat(S.sectionId); }
      if (t.dataset.act === 'mute') { await be.moderate('user', t.dataset.user, 'mute'); say('Muted for 24 hours'); return; }
      if (t.dataset.act === 'ban') { if (!confirm('Ban this member from the community?')) return; await be.moderate('user', t.dataset.user, 'ban'); say('Member banned'); return renderChat(S.sectionId); }
    } catch (err) { say(err.message); }
  }
  async function currentSections() {
    if (state) return state.sections.slice().sort((a, b) => a.sort - b.sort);
    return (await be.sections()).map(mapSection).sort((a, b) => a.sort - b.sort);
  }
  async function shift(id, dir) {
    try {
      const next = moveSection(await currentSections(), id, dir);
      await be.reorder(next.map(s => s.id));
      if (state) state.sections = next;
      await renderAdmin();
    } catch (err) { say(err.message); }
  }
  async function toggleArchive(id) {
    const s = (state ? state.sections : await currentSections()).find(x => x.id === id);
    try { await be.archive(id, !s?.archived); await renderAdmin(); } catch (err) { say(err.message); }
  }
  async function removeSection(id) {
    if (!confirm('Delete this section and its messages? This cannot be undone.')) return;
    try { await be.deleteSection(id); await renderAdmin(); } catch (err) { say(err.message); }
  }
  function editSection(id) {
    const s = (state?.sections || S.all || S.rows).find(x => x.id === id);
    if (!s || !$('#waSecId')) return;
    $('#waSecId').value = s.id; $('#waEmoji').value = s.emoji || '💬'; $('#waSecName').value = s.name; $('#waSecDesc').value = s.description || ''; $('#waAnnounce').checked = !!s.announce_only; $('#waSecTitle').textContent = 'Edit section';
  }
  async function saveSection() {
    try {
      await be.saveSection({ id: $('#waSecId').value || null, name: $('#waSecName').value, description: $('#waSecDesc').value, emoji: $('#waEmoji').value || '💬', announce: $('#waAnnounce').checked });
      say('Section saved'); await renderAdmin();
    } catch (err) { say(err.message); }
  }
  async function moderate(kind, id, action) {
    if (['delete', 'ban'].includes(action) && !confirm(`${action} — are you sure?`)) return;
    try { await be.moderate(kind, id, action); say('Done'); await renderQueue(); } catch (err) { say(err.message); }
  }
  async function join() {
    const err = $('#waJoinErr'); if (err) err.hidden = true;
    if (!$('#waAgree')?.checked) { if (err) { err.textContent = 'Please tick to agree to the guidelines.'; err.hidden = false; } return; }
    const name = validName($('#waName')?.value);
    if (!name) { if (err) { err.textContent = 'Choose a display name of 2-30 characters, and do not use your email.'; err.hidden = false; } return; }
    try { S.me = await be.join(name); say('Welcome to the community'); await renderList(); }
    catch (e) { if (err) { err.textContent = e.message; err.hidden = false; } }
  }
  root.addEventListener('click', e => { if (e.target.id === 'waJoin') join(); });

  return {
    open, pause,
    preview: paintHome,
    demo: !!state,
  };
}
