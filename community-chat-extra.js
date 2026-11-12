// Extra community chat behaviour: voice notes, pins, polls, weekly challenges, wins,
// read receipts, notification rules, mentions, search and direct messages.
// The server copies of the rules live in supabase/010_community_extras.sql.
import { esc, classifyChat } from './community-chat-core.js';

export const VOICE_MAX_SECONDS = 60;
export const VOICE_MAX_BYTES = 1024 * 1024;
export const POLL_MIN = 2;
export const POLL_MAX = 6;

export function voiceClock(seconds) {
  const s = Math.max(0, Math.min(VOICE_MAX_SECONDS, Math.round(Number(seconds) || 0)));
  return `0:${String(s).padStart(2, '0')}`;
}

export function voiceOk(blob) {
  if (!blob) return 'Hold the microphone to record a voice note.';
  if (blob.size > VOICE_MAX_BYTES) return 'That voice note is over 1 MB. Try a shorter one.';
  if ((blob.seconds || 0) > VOICE_MAX_SECONDS) return 'Voice notes stop at 60 seconds.';
  return '';
}

export function waveform(seed = 1, n = 18) {
  let x = (Math.abs(Number(seed)) % 997) + 1;
  const bars = [];
  for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) % 2147483647; bars.push(18 + (x % 82)); }
  return bars;
}

export function pickRecorderMime() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
  if (typeof MediaRecorder === 'undefined') return '';
  return types.find(t => MediaRecorder.isTypeSupported?.(t)) || '';
}

export function highlightBody(body, names = []) {
  let html = esc(body);
  const list = [...names].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const name of list) {
    const safe = esc(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(`@${safe}`, 'g'), `<span class="wamention">@${esc(name)}</span>`);
  }
  return html;
}

export function mentionQuery(text) {
  const m = /@([^\n@]{0,30})$/.exec(String(text || ''));
  return m ? m[1] : null;
}

export function mentionSuggestions(members, text, meId = 'me') {
  const q = mentionQuery(text);
  if (q == null) return [];
  const needle = q.trim().toLowerCase();
  return members.filter(p => p.id !== meId && p.name.toLowerCase().includes(needle)).slice(0, 6);
}

export function applyMention(text, name) {
  return String(text || '').replace(/@([^\n@]{0,30})$/, `@${name} `);
}

export function searchMessages(messages, query, { sectionId = null } = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  return messages.filter(m => m.status === 'visible' && (!sectionId || m.section_id === sectionId) && `${m.body || ''} ${m.author || ''}`.toLowerCase().includes(q)).slice(0, 30);
}

export function pollView(poll, votes = []) {
  const counts = {};
  for (const v of votes) counts[v.option_id] = (counts[v.option_id] || 0) + 1;
  const total = votes.length;
  return {
    ...poll,
    total,
    options: (poll.options || []).map(o => ({ ...o, n: counts[o.id] || 0, pct: total ? Math.round(((counts[o.id] || 0) / total) * 100) : 0 })),
  };
}

export function castVote(votes, { pollId, userId, optionId }) {
  const next = votes.filter(v => !(v.poll_id === pollId && v.user_id === userId));
  next.push({ poll_id: pollId, user_id: userId, option_id: optionId });
  return next;
}

export function validOptions(options) {
  const clean = (options || []).map(s => String(s || '').trim()).filter(Boolean);
  if (clean.length < POLL_MIN || clean.length > POLL_MAX) return null;
  if (clean.some(s => s.length > 80)) return null;
  return clean;
}

export function leaderboard(entries, meId) {
  return entries
    .filter(e => e.show_board !== false || e.user_id === meId)
    .slice()
    .sort((a, b) => b.progress - a.progress || String(a.name).localeCompare(String(b.name)))
    .map(e => ({ ...e, hidden: e.show_board === false, label: e.user_id === meId ? `${e.name} (you)` : e.name }));
}

export function shouldNotify({ settings, sectionMode, mentioned = false, reply = false, announcement = false } = {}) {
  if (!settings || settings.notify === 'off') return false;
  if (sectionMode === 'mute' && !mentioned && !reply) return false;
  const mentionsOnly = settings.notify === 'mentions' || sectionMode === 'mentions';
  if (mentionsOnly) return !!(mentioned || reply);
  return !!(mentioned || reply || announcement);
}

export function receiptState({ mine, seen = 0, delivered = true } = {}) {
  if (!mine) return '';
  if (seen > 0) return 'seen';
  if (delivered) return 'delivered';
  return 'sent';
}

export function dmAllowed({ self = false, blocked = false, recipientDms = true } = {}) {
  if (self) return { ok: false, reason: 'That is you.' };
  if (blocked) return { ok: false, reason: 'You cannot message someone you have blocked, or who has blocked you.' };
  if (recipientDms === false) return { ok: false, reason: 'This member is not accepting direct messages.' };
  return { ok: true, reason: '' };
}

export function defaultSettings() {
  return { read_receipts: true, dms_enabled: true, notify: 'all', sections: {} };
}

export function enrichDemo(state) {
  if (state.extras) return state;
  state.extras = true;
  const wins = state.sections.find(s => s.id === 'wins');
  if (wins) { wins.kind = 'wins'; wins.members_can_poll = false; }
  const gen = state.sections.find(s => s.id === 'gen');
  if (gen) gen.members_can_poll = true;
  state.members = [
    { id: 'ava', name: 'Ava' }, { id: 'jon', name: 'Jon' }, { id: 'priya', name: 'Priya' },
    { id: 'sam', name: 'Sam' }, { id: 'lee', name: 'Lee' }, { id: 'me', name: state.me.display_name || 'Mitchell' },
  ];
  state.pins = [{ section_id: 'ann', message_id: 'a1' }];
  const a1 = state.messages.find(m => m.id === 'a1');
  if (a1) a1.pinned = true;
  state.messages.push({
    id: 'gvoice', section_id: 'gen', user_id: 'sam', author: 'Sam', kind: 'voice', body: '', audio_seconds: 12,
    status: 'visible', created_at: '2026-11-11T08:22:00Z', reactions: {}, my_reactions: [], reply: null, image: null,
  });
  state.messages.push({
    id: 'gme', section_id: 'gen', user_id: 'me', author: 'Mitchell', mine: true, body: 'I can do Wednesday.',
    status: 'visible', created_at: '2026-11-11T09:00:00Z', reactions: {}, my_reactions: [], reply: null, image: null, ticks: 2,
  });
  state.messages.push({
    id: 'gpoll', section_id: 'gen', user_id: 'ava', author: 'Ava', kind: 'poll', body: 'Which evening works for a park walk?',
    status: 'visible', created_at: '2026-11-11T08:55:00Z', reactions: {}, my_reactions: [], reply: null, image: null,
    poll_id: 'p1',
  });
  const f2 = state.messages.find(m => m.id === 'f2');
  if (f2) { f2.ticks = 3; f2.body = 'That sounds perfect for the week, @Priya. I used turkey mince last time and it was lovely.'; }
  const w1 = state.messages.find(m => m.id === 'w1');
  if (w1) w1.kind = 'win';
  state.polls = [{
    id: 'p1', message_id: 'gpoll', section_id: 'gen', question: 'Which evening works for a park walk?', closed: false,
    options: [{ id: 'o1', label: 'Monday' }, { id: 'o2', label: 'Wednesday' }, { id: 'o3', label: 'Saturday' }],
  }];
  state.votes = [
    { poll_id: 'p1', user_id: 'jon', option_id: 'o2' },
    { poll_id: 'p1', user_id: 'sam', option_id: 'o3' },
    { poll_id: 'p1', user_id: 'priya', option_id: 'o3' },
    { poll_id: 'p1', user_id: 'me', option_id: 'o2' },
  ];
  state.challenges = [{
    id: 'c1', section_id: 'fit', title: '7,000 steps, 5 days', metric: 'steps', target: 5, unit: 'days',
    starts: '2026-11-09', ends: '2026-11-15',
    entries: [
      { user_id: 'ava', name: 'Ava', progress: 4, show_board: true },
      { user_id: 'jon', name: 'Jon', progress: 3, show_board: true },
      { user_id: 'me', name: 'Mitchell', progress: 2, show_board: true },
      { user_id: 'priya', name: 'Priya', progress: 5, show_board: false },
    ],
  }];
  state.settings = defaultSettings();
  state.typing = { gen: 'Ava', food: '' };
  state.readers = { food: 3, gen: 2, ann: 4 };
  state.dms = [
    { id: 'dm-priya', user_id: 'priya', name: 'Priya', preview: 'The chilli froze really well.', at: '09:48', unread: 1 },
    { id: 'dm-jon', user_id: 'jon', name: 'Jon', preview: 'You: See you on the Wednesday walk.', at: 'Yesterday', unread: 0 },
  ];
  state.dmMessages = {
    'dm-priya': [
      { id: 'd1', user_id: 'me', author: 'Mitchell', mine: true, body: 'Did the turkey mince version work for you?', created_at: '2026-11-11T09:30:00Z', status: 'visible', ticks: 1 },
      { id: 'd2', user_id: 'priya', author: 'Priya', mine: false, body: 'The chilli froze really well.', created_at: '2026-11-11T09:48:00Z', status: 'visible' },
    ],
    'dm-jon': [
      { id: 'd3', user_id: 'me', author: 'Mitchell', mine: true, body: 'See you on the Wednesday walk.', created_at: '2026-11-10T18:12:00Z', status: 'visible', ticks: 1 },
    ],
  };
  state.reports.push({ id: 'rdm', dm_id: 'd-hidden', user_id: 'lee', author: 'Lee', reason: 'Reported direct message', body: 'WhatsApp me on 07700 900123 for cheaper pens.', at: '2026-11-11T11:55:00Z' });
  state.messages.forEach(m => { m.initials = (m.author || '?').slice(0, 1).toUpperCase(); });
  return state;
}

export function voiceHtml(m) {
  const bars = waveform(m.audio_seconds || 12).map(h => `<i style="height:${h}%"></i>`).join('');
  return `<button type="button" class="wavoice" data-play="${esc(m.id)}" aria-label="Play voice note, ${voiceClock(m.audio_seconds)}"><span class="waplay">▶</span><span class="wawave">${bars}</span><small>${voiceClock(m.audio_seconds)}</small></button>`;
}

export function pollHtml(view, { mine = false, meId = 'me', votes = [] } = {}) {
  const my = votes.find(v => v.poll_id === view.id && v.user_id === meId);
  const opts = view.options.map(o => `<button type="button" class="wapollopt${my?.option_id === o.id ? ' on' : ''}" data-vote="${esc(view.id)}" data-opt="${esc(o.id)}" ${view.closed ? 'disabled' : ''}><span>${esc(o.label)}</span><b>${o.pct}%</b><i style="width:${o.pct}%"></i></button>`).join('');
  return `<div class="wapoll" data-poll="${esc(view.id)}"><b>${esc(view.question)}</b>${opts}<small>${view.total} vote${view.total === 1 ? '' : 's'}${view.closed ? ' · closed' : ''}${mine && !view.closed ? ' · <button type="button" data-close-poll="' + esc(view.id) + '">Close poll</button>' : ''}</small></div>`;
}

export function challengeHtml(ch, meId) {
  const rows = leaderboard(ch.entries, meId);
  const mine = ch.entries.find(e => e.user_id === meId);
  return `<section class="wachal" data-challenge="${esc(ch.id)}"><h3>🏁 ${esc(ch.title)}</h3><p class="small">${esc(ch.starts)} – ${esc(ch.ends)} · target ${esc(ch.target)} ${esc(ch.unit)} · ${esc(ch.metric)}</p>
    <ol class="waboard">${rows.map(e => `<li class="${e.user_id === meId ? 'me' : ''}"><span>${esc(e.label)}${e.hidden ? ' · hidden from others' : ''}</span><b>${e.progress}</b></li>`).join('')}</ol>
    <form class="walog" data-log="${esc(ch.id)}"><label class="check"><input type="checkbox" data-board="${esc(ch.id)}" ${mine?.show_board === false ? '' : 'checked'}> Show me on the leaderboard</label>
    <div class="row"><input name="n" inputmode="numeric" value="${mine?.progress ?? 0}" aria-label="Your progress"><button class="primary" type="submit">Log</button><button type="button" data-sync="${esc(ch.id)}">Use my steps or water</button></div></form></section>`;
}

export function pinBarHtml(message) {
  if (!message) return '';
  const text = message.kind === 'voice' ? 'Voice note' : (message.body || 'Pinned message');
  return `<button type="button" class="wapinbar" data-jump="${esc(message.id)}"><b>Pinned</b><span>${esc(text).slice(0, 90)}</span></button>`;
}

export function settingsHtml(s) {
  const mode = s.notify || 'all';
  return `<div class="waapp" data-wa-view="settings">${'<header class="wahead"><button type="button" class="waback" id="waBack" aria-label="Back">‹</button><div><p class="wakicker">Community</p><h2>Chat settings</h2></div></header>'}
    <div class="card"><label class="check"><input type="checkbox" id="waReceipts" ${s.read_receipts ? 'checked' : ''}> Send read receipts. Other members can see when you have read a section.</label>
    <label class="check"><input type="checkbox" id="waDmsOn" ${s.dms_enabled ? 'checked' : ''}> Allow direct messages from other members.</label>
    <label>Notifications<select id="waNotify"><option value="all" ${mode === 'all' ? 'selected' : ''}>Replies, mentions and announcements</option><option value="mentions" ${mode === 'mentions' ? 'selected' : ''}>Mentions and replies only</option><option value="off" ${mode === 'off' ? 'selected' : ''}>Off</option></select></label>
    <p class="small muted">Mute a section from its chat menu. Web push is stored on this phone once the server has VAPID keys. Android push waits for Firebase setup.</p>
    <button type="button" class="primary" id="waPush">Turn on this phone</button><p class="small" id="waPushNote"></p></div></div>`;
}

export function searchHtml(query, hits, sections) {
  const name = id => sections.find(s => s.id === id)?.name || 'Community';
  return `<div class="waapp" data-wa-view="search"><header class="wahead"><button type="button" class="waback" id="waBack">‹</button><div><p class="wakicker">Community</p><h2>Search</h2></div></header>
    <form class="wacompose" id="waSearchForm"><input id="waQuery" value="${esc(query)}" placeholder="Search messages" aria-label="Search messages"><button class="primary">Search</button></form>
    <ul class="walist">${hits.map(h => `<li><button type="button" class="warow" data-open="${esc(h.section_id)}" data-jump="${esc(h.id)}"><span class="wamid"><b>${esc(h.author)} · ${esc(name(h.section_id))}</b><span class="wapreview">${esc(h.body)}</span></span></button></li>`).join('') || '<li class="muted">Type at least 2 letters.</li>'}</ul></div>`;
}

export function dmListHtml(threads) {
  return `<div class="waapp" data-wa-view="dms"><header class="wahead"><button type="button" class="waback" id="waBack">‹</button><div><p class="wakicker">Community</p><h2>Messages</h2></div></header>
    <form class="wacompose" id="waDmNew"><input id="waDmName" placeholder="Message a display name" aria-label="Display name" maxlength="30"><button class="primary">Chat</button></form>
    <ul class="walist">${threads.map(t => `<li><button type="button" class="warow" data-dm="${esc(t.id)}"><span class="waemoji">${esc(t.name.slice(0, 1))}</span><span class="wamid"><span class="watop"><b>${esc(t.name)}</b><time>${esc(t.at || '')}</time></span><span class="wapreview">${esc(t.preview || '')}</span></span>${t.unread ? `<span class="wabadge">${t.unread}</span>` : ''}</button></li>`).join('')}</ul></div>`;
}

export function mentionBoxHtml(people) {
  if (!people.length) return '';
  return `<div class="wamentions" id="waMentions">${people.map(p => `<button type="button" data-mention="${esc(p.name)}">${esc(p.name)}</button>`).join('')}</div>`;
}

export function recordBarHtml(seconds = 8) {
  const bars = waveform(seconds).map(h => `<i style="height:${h}%"></i>`).join('');
  return `<div class="warec" id="waRec"><span class="wadot"></span><b id="waRecTime">${voiceClock(seconds)}</b><span class="wawave">${bars}</span><button type="button" id="waRecCancel">Cancel</button><button type="button" class="primary" id="waRecSend">Send</button></div>`;
}

export function judgeText(text) {
  return classifyChat(text || '');
}
