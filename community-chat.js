// GLP1 Life community chat. Live data goes through Supabase RPCs in 009_community.sql.
// Until that migration is applied, open() shows a coming-soon card. ?chatdemo=1 renders
// local sample messages and never calls the server.
import {
  IMAGE_MAX, PINNED, REACTIONS, esc, classifyChat, chatUnavailable, validName, initials, chatTime,
  canPost, composerNote, rateOk, moveSection, toggleReaction, decorateSections, listHtml, chatHtml, threadHtml,
  adminHtml, queueHtml, menuHtml, signInHtml, soonHtml, guidelinesHtml, demoState, visibleMessages, pageMessages,
} from './community-chat-core.js';
import {
  VOICE_MAX_BYTES, VOICE_MAX_SECONDS, voiceClock, voiceOk, pickRecorderMime, mentionSuggestions, applyMention,
  searchMessages, pollView, pollHtml, castVote, validOptions, challengeHtml, pinBarHtml, settingsHtml, searchHtml, dmListHtml,
  mentionBoxHtml, recordBarHtml, enrichDemo, dmAllowed, waveform,
} from './community-chat-extra.js';
import {
  moreDemo, welcomeHtml, buddyHtml, promptHtml, qaHtml, profileHtml, scheduleHtml, stickerHtml, translateHtml,
  recipeButton, stickerInline, demoTranslate, allowText, QA_NOTICE,
} from './community-more.js';

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
    async pins(section) { return call('community_chat_pins', { p_section: section }); },
    async pin(id, on) { return call('community_chat_pin', { p_message: id, p_on: on }); },
    async polls(section) { return call('community_chat_polls', { p_section: section }); },
    async vote(poll, option) { return call('community_chat_poll_vote', { p_poll: poll, p_option: option }); },
    async closePoll(poll) { return call('community_chat_poll_close', { p_poll: poll }); },
    async createPoll(section, question, options) { return call('community_chat_poll_create', { p_section: section, p_question: question, p_options: options }); },
    async challenges(section) { return call('community_week_list', { p_section: section }); },
    async logChallenge(id, progress, show) { return call('community_week_log', { p_id: id, p_progress: progress, p_show: show }); },
    async members() { return call('community_chat_members'); },
    async search(query, section) { return call('community_chat_search', { p_query: query, p_section: section }); },
    async settings() { return call('community_chat_settings_get'); },
    async saveSettings(patch) { return call('community_chat_settings_set', patch); },
    async dmList() { return call('community_dm_list'); },
    async dmOpen(name) { return call('community_dm_open', { p_name: name }); },
    async dmHistory(id) { return call('community_dm_history', { p_thread: id }); },
    async dmSend(id, body) { return call('community_dm_send', { p_thread: id, p_body: body }); },
    async dmReport(id, reason) { return call('community_dm_report', { p_message: id, p_reason: reason }); },
    async dmQueue() { return call('community_dm_queue'); },
    async savePush(sub) { return call('community_push_save', sub); },
    async voice(section, path, seconds) { return call('community_chat_voice', { p_section: section, p_path: path, p_seconds: seconds }); },
    async uploadVoice(blob) {
      if (!blob || blob.size > VOICE_MAX_BYTES) throw new Error('That voice note is over 1 MB.');
      const ext = /ogg/.test(blob.type) ? 'ogg' : /mp4|m4a/.test(blob.type) ? 'm4a' : 'webm';
      const path = `${uid()}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const r = await fetch(`${sbUrl}/storage/v1/object/community-voice/${path}`, { method: 'POST', headers: { apikey: sbKey, authorization: 'Bearer ' + token(), 'content-type': blob.type || 'audio/webm', 'x-upsert': 'false' }, body: blob });
      if (!r.ok) throw new Error('Voice note upload failed');
      return path;
    },
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
    async pins(section) { return (state.pins || []).filter(p => p.section_id === section).map(p => state.messages.find(m => m.id === p.message_id)).filter(Boolean); },
    async pin(id, on) {
      if (!state.me.is_admin) throw new Error('admin only');
      const m = find(id); if (!m) return;
      m.pinned = !!on;
      state.pins = (state.pins || []).filter(p => p.message_id !== id);
      if (on) state.pins.push({ section_id: m.section_id, message_id: id });
    },
    async polls(section) { return (state.polls || []).filter(p => p.section_id === section).map(p => ({ ...pollView(p, state.votes), mine: p.user_id === state.me.user_id || state.me.is_admin })); },
    async vote(poll, option) { state.votes = castVote(state.votes, { pollId: poll, userId: state.me.user_id, optionId: option }); },
    async closePoll(poll) { const p = state.polls.find(x => x.id === poll); if (p) p.closed = true; },
    async createPoll(section, question, options) {
      const opts = validOptions(options); if (!opts) throw new Error('A poll needs 2 to 6 options.');
      const judged = classifyChat(question + ' ' + opts.join(' ')); if (judged.action === 'hold') return judged;
      const id = 'poll-' + Math.random().toString(36).slice(2, 6);
      state.polls.push({ id, section_id: section, question, closed: false, options: opts.map((label, i) => ({ id: id + i, label })) });
      state.messages.push({ id: 'm-' + id, section_id: section, user_id: state.me.user_id, author: state.me.display_name, mine: true, kind: 'poll', body: question, poll_id: id, status: 'visible', created_at: new Date().toISOString(), reactions: {}, my_reactions: [] });
      return { action: 'ok', id };
    },
    async challenges(section) { return (state.challenges || []).filter(c => c.section_id === section); },
    async logChallenge(id, progress, show) { const c = state.challenges.find(x => x.id === id); const e = c?.entries.find(x => x.user_id === state.me.user_id); if (e) { e.progress = progress; e.show_board = show; } else c?.entries.push({ user_id: state.me.user_id, name: state.me.display_name, progress, show_board: show }); },
    async members() { return state.members || []; },
    async search(query, section) { return searchMessages(state.messages, query, { sectionId: section }); },
    async settings() { return state.settings; },
    async saveSettings(patch) { Object.assign(state.settings, { read_receipts: patch.p_receipts ?? state.settings.read_receipts, dms_enabled: patch.p_dms ?? state.settings.dms_enabled, notify: patch.p_notify || state.settings.notify }); return state.settings; },
    async dmList() { return state.dms || []; },
    async dmOpen(name) { const person = (state.members || []).find(p => p.name.toLowerCase() === name.trim().toLowerCase()); if (!person) throw new Error('No member with that display name.'); const gate = dmAllowed({ self: person.id === state.me.user_id, blocked: state.blocks.includes(person.id), recipientDms: person.dms_enabled !== false }); if (!gate.ok) throw new Error(gate.reason); let row = state.dms.find(d => d.user_id === person.id); if (!row) { row = { id: 'dm-' + person.id, user_id: person.id, name: person.name, preview: '', at: 'Now', unread: 0 }; state.dms.unshift(row); state.dmMessages[row.id] = []; } return row.id; },
    async dmHistory(id) { return state.dmMessages[id] || []; },
    async dmSend(id, body) { const judged = classifyChat(body); const msg = { id: 'd' + Math.random().toString(36).slice(2, 6), user_id: state.me.user_id, author: state.me.display_name, mine: true, body, status: judged.action === 'hold' ? 'held' : 'visible', created_at: new Date().toISOString(), ticks: 0 }; (state.dmMessages[id] ||= []).push(msg); const row = state.dms.find(d => d.id === id); if (row) row.preview = 'You: ' + body; return { ...judged, id: msg.id }; },
    async dmReport(id, reason) { state.reports.push({ id: 'rdm-' + id, message_id: id, dm_id: id, reason, body: 'Reported direct message', author: 'Member', at: new Date().toISOString() }); },
    async dmQueue() { return state.reports.filter(r => r.dm_id); },
    async savePush() { state.push = true; },
    async uploadVoice(blob) { const err = voiceOk({ size: blob.size, seconds: blob.seconds }); if (err) throw new Error(err); return 'data:audio/webm;base64,demo'; },
    async upload(file) {
      if (!file) return null;
      if (file.size > IMAGE_MAX) throw new Error('Photo is over 2 MB');
      if (!/^image\/(jpeg|png|webp|svg\+xml)$/.test(file.type)) throw new Error('Use a JPEG, PNG or WebP photo');
      return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Photo could not be read')); reader.readAsDataURL(file); });
    },
  };
}

export function makeCommunityChat({ rpc, toast, root, sbUrl, sbKey, token, uid, openPosts, openSettings, search, progress, openRecipe }) {
  const mode = demoMode(search ?? (typeof location !== 'undefined' ? location.search : ''));
  const state = mode ? moreDemo(enrichDemo(demoState())) : null;
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
    S.recording = view === 'voice';
    S.celebrate = view === 'wins';
    S.mention = view === 'mention';
    S.focus = view === 'poll' ? '.wapoll' : '';
    if (view === 'admin') return renderAdmin();
    if (view === 'queue' || view === 'reports') return renderQueue();
    if (view === 'settings' || view === 'notify') return renderPrefs();
    if (view === 'search') return renderSearch(state ? 'chilli' : '');
    if (view === 'mention') { S.mention = true; return renderChat('food'); }
    if (view === 'dm') return renderDms();
    if (view === 'dmchat') return renderDm(state ? 'dm-priya' : null);
    if (view === 'voice') { S.recording = true; return renderChat(state ? 'gen' : S.sectionId); }
    if (view === 'pin') return renderChat('ann');
    if (view === 'poll' || view === 'typing') return renderChat('gen');
    if (view === 'challenge') return renderChat('fit');
    if (view === 'wins') { S.celebrate = true; return renderChat('wins'); }
    if (view === 'buddy') return showBuddy();
    if (view === 'prompt') { root.innerHTML = promptHtml(state?.prompts?.[0] || { hour: 8, minute: 0, body: 'How are you feeling today?' }); return; }
    if (view === 'recipe') { S.focus = '.warecipe'; return renderChat(state ? 'food' : S.sectionId); }
    if (view === 'qa') return showQa();
    if (view === 'profile') return showProfile(state ? 'ava' : null);
    if (view === 'schedule') { root.innerHTML = scheduleHtml(state?.scheduled?.[0]); return; }
    if (view === 'stickers') { root.innerHTML = stickerHtml(); return; }
    if (view === 'translate') return showTranslate(false);
    if (view === 'welcome') return renderList();
    if (view === 'chat') return renderChat(state ? 'food' : S.sectionId);
    return renderList();
  }

  async function soft(fn, fallback) {
    try { return await fn(); } catch (e) { if (chatUnavailable(e) !== 'error') return fallback; return fallback; }
  }
  function pollCard(p) {
    const view = p.options?.some(o => o.pct != null) ? p : pollView(p, state?.votes || []);
    const votes = p.my_option ? [{ poll_id: p.id, user_id: S.me?.user_id, option_id: p.my_option }] : (state?.votes || []);
    return pollHtml(view, { mine: !!(p.mine || admin()), meId: S.me?.user_id, votes });
  }
  async function decoratePage(section, messages) {
    const polls = await soft(() => be.polls(section), []);
    return (messages || []).map(m => {
      const poll = polls.find(p => p.message_id === m.id || p.id === m.poll_id);
      const mine = !!(m.mine || m.user_id === S.me?.user_id);
      const card = m.card?.type === 'sticker' ? stickerInline(m.card.id) : recipeButton(m.card);
      return { ...m, mine, poll_html: poll ? pollCard(poll) : (m.poll_html || ''), card_html: card, ticks: mine ? (m.ticks || state?.readers?.[section] || 0) : 0, pinned: !!(state?.pins || []).some(p => p.message_id === m.id) || !!m.pinned };
    });
  }
  async function renderList() {
    S.screen = 'list'; S.sectionId = null; S.reply = null; S.recording = false; S.mention = false; S.celebrate = false;
    try { S.rows = (await be.sections()).map(mapSection).filter(s => !s.archived); }
    catch (e) { await failOpen(e); return; }
    root.innerHTML = listHtml(S.rows, { pinned: S.me?.pinned || PINNED, admin: admin(), name: S.me?.display_name || '' });
    if (state?.welcome && !state.welcome.dismissed) root.querySelector('.wapin')?.insertAdjacentHTML('afterend', welcomeHtml(state.welcome));
    paintHome();
    listen();
  }

  async function renderChat(id, { keepScroll = false } = {}) {
    if (!id) return renderList();
    S.sectionId = id; S.screen = 'chat';
    let page;
    try { page = await be.history(id, null); await be.read(id); }
    catch (e) { say(e.message); return; }
    S.shown = await decoratePage(id, page.messages || []); S.hasMore = !!page.has_more;
    const section = (S.rows.find(s => s.id === id) || state?.sections.find(s => s.id === id) || { id, name: 'Chat', emoji: '💬' });
    const gate = canPost({ section, isAdmin: admin(), status: S.me?.status, mutedUntil: S.me?.muted_until, guidelines: !!S.me?.guidelines });
    const thread = root.querySelector('#waThread');
    const near = thread ? thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120 : true;
    const prevTop = thread?.scrollTop || 0;
    root.innerHTML = chatHtml(section, { note: gate.ok ? '' : composerNote(gate), reply: S.reply, admin: admin(), hasMore: S.hasMore });
    const pins = await soft(() => be.pins(id), []);
    const pin = pins[0];
    if (pin) $('#waThread').insertAdjacentHTML('beforebegin', pinBarHtml(pin));
    const challenges = await soft(() => be.challenges(id), []);
    if (challenges[0]) $('#waThread').insertAdjacentHTML('beforebegin', challengeHtml(challenges[0], S.me?.user_id));
    const typing = state?.typing?.[id];
    if (typing) $('#waThread').insertAdjacentHTML('afterend', `<p class="watyping" id="waTyping">${esc(typing)} is typing…</p>`);
    if (S.recording) $('#waForm')?.insertAdjacentHTML('afterbegin', recordBarHtml(8));
    if (section.kind === 'wins' || S.celebrate) root.querySelector('.waapp')?.insertAdjacentHTML('beforeend', '<div class="waceleb" aria-hidden="true">🎉 🏆 🎉 ✨ 🎊</div>');
    $('#waThread').innerHTML = (S.hasMore ? '<button type="button" class="walink" id="waOlder">Load earlier messages</button>' : '') + threadHtml(section, S.shown);
    if (S.mention) { const box = mentionBoxHtml(mentionSuggestions(state?.members || [], '@P')); if (box) $('#waForm')?.insertAdjacentHTML('afterbegin', box); const input = $('#waText'); if (input) input.value = '@P'; }
    const box = $('#waThread');
    const pinScroll = () => { box.scrollTop = keepScroll && !near ? prevTop : box.scrollHeight; };
    pinScroll(); requestAnimationFrame(() => { pinScroll(); const focus = S.focus && root.querySelector(S.focus); if (S.recording) root.querySelector('.wavoice')?.scrollIntoView({ block: 'center' }); else if (focus) focus.scrollIntoView({ block: 'center' }); });
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
    S.ws = ws;
    ws.onmessage = ev => { let msg; try { msg = JSON.parse(ev.data); } catch { return; } if (msg.event === 'postgres_changes') tick(); if (msg.event === 'broadcast' && msg.payload?.payload?.section === S.sectionId) { let bar = $('#waTyping'); if (!bar) { $('#waThread')?.insertAdjacentHTML('afterend', '<p class="watyping" id="waTyping"></p>'); bar = $('#waTyping'); } if (bar) bar.textContent = `${msg.payload.payload.name || 'Someone'} is typing…`; } };
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
    if (t.id === 'waBack') return S.dmId ? renderDms() : renderList();
    if (t.id === 'waWelcomeOk') { if (state?.welcome) state.welcome.dismissed = true; return renderList(); }
    if (t.id === 'waBuddyEnd') { if (state) state.pair = null; return showBuddy(); }
    if (t.id === 'waRemind' && state?.event) { state.event.reminded = true; say('We will remind you. This Q&A is not medical advice.'); return showQa(); }
    if (t.id === 'waDoTranslate') return showTranslate(true);
    if (t.dataset.recipe) { openRecipe?.(t.dataset.recipe); return; }
    if (t.dataset.profile) return showProfile(t.dataset.profile);
    if (t.dataset.sticker) { say('Sticker added to your next message'); return; }
    if (t.dataset.up && state?.event) { const q = state.event.questions.find(x => x.id === t.dataset.up); if (q) q.votes += 1; return showQa(); }
    if (t.dataset.answered && state?.event) { const q = state.event.questions.find(x => x.id === t.dataset.answered); if (q) q.answered = true; return showQa(); }
    if (t.id === 'waSearch') return renderSearch('');
    if (t.id === 'waDms') return renderDms();
    if (t.id === 'waPrefs') return renderPrefs();
    if (t.id === 'waPoll') return openPollForm();
    if (t.id === 'waPush') return enablePush();
    if (t.id === 'waRecCancel') { S.recording = false; stopRec(); return renderChat(S.sectionId); }
    if (t.id === 'waRecSend') return finishRec(true);
    if (t.dataset.jump && t.dataset.open) { await renderChat(t.dataset.open); document.getElementById('msg-' + t.dataset.jump)?.scrollIntoView({ block: 'center' }); return; }
    if (t.dataset.jump) { document.getElementById('msg-' + t.dataset.jump)?.scrollIntoView({ block: 'center' }); return; }
    if (t.dataset.vote) return vote(t.dataset.vote, t.dataset.opt);
    if (t.dataset.closePoll) { await soft(() => be.closePoll(t.dataset.closePoll), null); return renderChat(S.sectionId); }
    if (t.dataset.mention) { const input = $('#waText'); if (input) input.value = applyMention(input.value, t.dataset.mention); $('#waMentions')?.remove(); return; }
    if (t.dataset.dm) return renderDm(t.dataset.dm);
    if (t.dataset.play) return playVoice(t.dataset.play);
    if (t.dataset.sync) { const p = progress?.() || {}; const ch = (state?.challenges || []).find(c => c.id === t.dataset.sync); const value = ch?.metric === 'water' ? Math.round((p.waterMl || 0) / 500) : Math.min(ch?.target || 7, p.steps ? 1 : 0); await soft(() => be.logChallenge(t.dataset.sync, value, true), null); return renderChat(S.sectionId); }
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
    if (e.target.id === 'waSearchForm') { e.preventDefault(); return renderSearch($('#waQuery')?.value || ''); }
    if (e.target.id === 'waDmNew') { e.preventDefault(); return openDmName($('#waDmName')?.value || ''); }
    if (e.target.id === 'waDmForm') { e.preventDefault(); return sendDm(); }
    if (e.target.dataset.log) { e.preventDefault(); const show = root.querySelector(`[data-board="${e.target.dataset.log}"]`)?.checked !== false; const n = Number(e.target.n?.value || 0); await soft(() => be.logChallenge(e.target.dataset.log, n, show), null); return renderChat(S.sectionId); }
    if (e.target.id === 'waBuddyIn') { e.preventDefault(); const text = e.target.text?.value || ''; const gate = allowText(text); if (!gate.ok) return say(gate.result.message); if (state?.pair) state.pair.checkin = { author: state.me.display_name, body: text, at: new Date().toISOString() }; return showBuddy(); }
    if (e.target.id === 'waBuddyOpt' || e.target.id === 'waBuddyAsk') { e.preventDefault(); const goal = e.target.goal?.value || e.target.who?.value || ''; const gate = allowText(goal); if (!gate.ok) return say(gate.result.message); say(e.target.id === 'waBuddyAsk' ? 'Request sent' : 'You are on the opt-in list'); return; }
    if (e.target.id === 'waAsk') { e.preventDefault(); const q = e.target.q?.value || ''; const gate = allowText(q); if (!gate.ok) return say(gate.result.message); state?.event?.questions.push({ id: 'q' + Date.now(), author: state.me.display_name, body: q, votes: 0, answered: false, mine: true }); return showQa(); }
    if (e.target.id === 'waSched') { e.preventDefault(); const body = e.target.body?.value || ''; const gate = allowText(body); if (!gate.ok) return say(gate.result.message); say('Scheduled. It will send when the daily job runs.'); return; }
  });
  root.addEventListener('input', e => {
    if (e.target.id !== 'waText') return;
    $('#waMentions')?.remove();
    const people = mentionSuggestions(state?.members || S.members || [], e.target.value, S.me?.user_id);
    const box = mentionBoxHtml(people);
    if (box) e.target.closest('.wainput, form')?.insertAdjacentHTML('afterbegin', box);
    if (state) return;
    broadcastTyping();
  });
  root.addEventListener('pointerdown', e => {
    if (e.target.id === 'waMic' || e.target.closest?.('#waMic')) { e.preventDefault(); startRec(); }
  });
  root.addEventListener('pointerup', e => { if (S.rec && !e.target.closest?.('#waRecCancel')) finishRec(); });
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

  function showBuddy() { root.innerHTML = buddyHtml(state?.pair, state?.me?.user_id || 'me'); }
  function showQa() { root.innerHTML = qaHtml(state?.event || { title: 'Q&A', starts_at: '2026-11-11T18:00', questions: [], reminded: false }); }
  function showProfile(id) {
    const profile = state?.profiles?.[id] || state?.profiles?.ava;
    if (!profile) { say('Profile opens after the next database update.'); return; }
    root.innerHTML = profileHtml(profile);
  }
  function showTranslate(run) {
    const original = 'Clothes fit better this week. I kept the walks going.';
    root.innerHTML = translateHtml(original, run ? demoTranslate(original) : null);
  }
  async function renderPrefs() {
    S.screen = 'settings';
    const s = await soft(() => be.settings(), { read_receipts: true, dms_enabled: true, notify: 'all' });
    root.innerHTML = settingsHtml(s);
    const save = () => be.saveSettings({ p_receipts: $('#waReceipts').checked, p_dms: $('#waDmsOn').checked, p_notify: $('#waNotify').value }).catch(e => say(e.message));
    $('#waReceipts').onchange = save; $('#waDmsOn').onchange = save; $('#waNotify').onchange = save;
  }
  async function renderSearch(query) {
    S.screen = 'search';
    const hits = query ? await soft(() => be.search(query, null), []) : [];
    root.innerHTML = searchHtml(query || '', hits, state?.sections || S.rows || []);
  }
  async function renderDms() {
    S.screen = 'dms'; S.dmId = null;
    root.innerHTML = dmListHtml(await soft(() => be.dmList(), []));
  }
  async function renderDm(id) {
    if (!id) return renderDms();
    S.screen = 'dm'; S.dmId = id;
    const msgs = await soft(() => be.dmHistory(id), []);
    const name = (await soft(() => be.dmList(), [])).find(d => d.id === id)?.name || 'Message';
    root.innerHTML = `<div class="waapp wachat" data-wa-view="dmchat"><header class="wahead"><button type="button" class="waback" id="waBack" aria-label="Back to messages">‹</button><div><p class="wakicker">Direct message</p><h2>${esc(name)}</h2></div></header><div class="wathread" id="waThread">${threadHtml(null, msgs)}</div><form class="wacompose" id="waDmForm"><label class="sr" for="waDmText">Message</label><input id="waDmText" maxlength="2000" placeholder="Message"><button class="primary">Send</button></form></div>`;
  }
  async function openDmName(name) {
    try { const id = await be.dmOpen(name); await renderDm(id); } catch (e) { say(e.message); }
  }
  async function sendDm() {
    const body = $('#waDmText')?.value?.trim(); if (!body) return;
    try { const v = await be.dmSend(S.dmId, body); if (v?.action === 'hold') say(v.message); await renderDm(S.dmId); } catch (e) { say(e.message); }
  }
  async function vote(poll, opt) { await soft(() => be.vote(poll, opt), null); return renderChat(S.sectionId); }
  function openPollForm() {
    const question = prompt('Poll question'); if (!question) return;
    const raw = prompt('Options, separated by commas (2 to 6)'); if (!raw) return;
    be.createPoll(S.sectionId, question, raw.split(',')).then(v => { if (v?.action === 'hold') say(v.message); return renderChat(S.sectionId); }).catch(e => say(e.message));
  }
  async function enablePush() {
    const note = $('#waPushNote');
    const pending = 'Web push is ready in the app. It sends after VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT are set on the server. Those values are not in the app. Android FCM is not configured yet.';
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { if (note) note.textContent = pending; return; }
    if (note) note.textContent = pending;
  }
  function playVoice(id) {
    const btn = root.querySelector(`[data-play="${id}"]`);
    if (!btn) return;
    btn.classList.toggle('playing');
    const wave = btn.querySelector('.wawave');
    if (wave) wave.style.setProperty('--play', btn.classList.contains('playing') ? '100%' : '0%');
  }
  function broadcastTyping() {
    const ws = S.ws; if (!ws || ws.readyState !== 1 || !S.sectionId) return;
    ws.send(JSON.stringify({ topic: 'realtime:chat', event: 'broadcast', payload: { type: 'broadcast', event: 'typing', payload: { section: S.sectionId, name: S.me?.display_name || 'Someone' } }, ref: String(Date.now()) }));
  }
  function stopRec() {
    clearTimeout(S.recTimer); clearInterval(S.recTick);
    try { S.rec?.stop(); } catch {}
    S.recStream?.getTracks()?.forEach(track => track.stop());
    S.rec = null; S.recStream = null;
  }
  async function startRec() {
    if (S.rec) return;
    const mime = pickRecorderMime();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      S.chunks = [];
      rec.ondataavailable = ev => { if (ev.data?.size) S.chunks.push(ev.data); };
      rec.start();
      S.rec = rec; S.recStream = stream; S.recStart = Date.now();
      S.recTimer = setTimeout(() => finishRec(true), VOICE_MAX_SECONDS * 1000);
      if (!$('#waRec')) $('#waForm')?.insertAdjacentHTML('afterbegin', recordBarHtml(0));
      S.recTick = setInterval(() => { const el = $('#waRecTime'); if (el) el.textContent = voiceClock((Date.now() - S.recStart) / 1000); }, 250);
    } catch {
      if (!$('#waRec')) $('#waForm')?.insertAdjacentHTML('afterbegin', recordBarHtml(8));
    }
  }
  async function finishRec() {
    const seconds = Math.max(1, Math.min(VOICE_MAX_SECONDS, S.recStart ? Math.round((Date.now() - S.recStart) / 1000) : 8));
    const chunks = S.chunks || [];
    stopRec();
    if (state) {
      state.messages.push({ id: 'voice-' + Date.now(), section_id: S.sectionId, user_id: state.me.user_id, author: state.me.display_name, mine: true, kind: 'voice', audio_seconds: seconds, body: '', status: 'visible', created_at: new Date().toISOString(), reactions: {}, my_reactions: [], ticks: 0 });
      S.recording = false; return renderChat(S.sectionId);
    }
    const blob = chunks.length ? new Blob(chunks, { type: 'audio/webm' }) : null;
    if (!blob) return;
    if (blob.size > VOICE_MAX_BYTES) return say('That voice note is over 1 MB. Try a shorter one.');
    try { const path = await be.uploadVoice(blob); await be.voice(S.sectionId, path, seconds); } catch (e) { say(e.message); }
    S.recording = false; return renderChat(S.sectionId);
  }
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
      if (t.dataset.act === 'pin') { await be.pin(id, !message.pinned); return renderChat(S.sectionId); }
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
