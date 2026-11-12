// Pure helpers for GLP1 Life community chat. The server classifier in
// supabase/009_community.sql is the authority; this copy lets the UI explain a hold
// immediately and lets tests run without a database.
export const IMAGE_MAX = 2 * 1024 * 1024;
export const PAGE_SIZE = 40;
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
export const PINNED = 'Be kind. No selling or sourcing medicines or peptides, no supplier links or numbers, no dosing instructions, and no advice that replaces your GP or pharmacist.';
export const CHAT_GUIDELINES = [
  ['💜', 'Be kind', 'Encourage people. Don\'t judge bodies, food or how fast someone is progressing.'],
  ['🛑', 'No selling or sourcing', 'No offers, requests, supplier links or phone numbers for buying medicines or peptides. Use a regulated UK pharmacy or your prescriber.'],
  ['💊', 'No dosing instructions', 'You can say how you felt on the dose your prescriber chose. Don\'t tell anyone what to take or how to change it.'],
  ['🩺', 'Not a GP', 'This chat does not replace your GP, prescriber or pharmacist. In an emergency call 999 or NHS 111.'],
  ['🔒', 'Your display name only', 'Don\'t post someone else\'s personal details. Weights stay private unless you type them yourself.'],
  ['🚩', 'Report and block', 'Open a message menu to report it or block a member. Admins review reports and held messages.'],
];
const HOLD_TEXT = {
  selling: 'This is held for review and is not in the chat. GLP1 Life does not allow selling, sourcing, supplier links or contact numbers for medicines or peptides.',
  dosing: 'This is held for review and is not in the chat. Please share how you feel, not dosing instructions. Your prescriber decides your dose.',
  medical: 'This is held for review and is not in the chat. Members cannot give advice that replaces a GP, prescriber or pharmacist.',
};
const MEDS = /\b(peptides?|retatrutide|reta|tirzepatide|tirz|semaglutide|sema|mounjaro|wegovy|ozempic|zepbound|liraglutide|saxenda|pens?|vials?|meds?|medication|jabs?)\b|grey\s*market|gray\s*market|research\s*chem/i;
const SOURCE = /\b(buy(?:ing)?|bought|sell(?:ing)?|sold|for sale|order(?:ing)?|supplier|vendor|sourc(?:e|es|ing)|stockist|dm me|pm me|whatsapp me|telegram|text me)\b/i;
const PHONE = /(?:\+?\d[\d\s().-]{8,}\d)/;
const LINK = /https?:\/\/|www\./i;
const CONTACT_LINK = /\bwa\.me\b|\bt\.me\b|chat\.whatsapp\.com/i;

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function classifyChat(text) {
  const s = String(text || '');
  const meds = MEDS.test(s);
  const source = SOURCE.test(s);
  const phone = PHONE.test(s);
  let reason = null;
  if (CONTACT_LINK.test(s) || (source && meds) || (LINK.test(s) && meds) || (phone && (meds || source))) reason = 'selling';
  else if (isDosingInstruction(s)) reason = 'dosing';
  else if (isMedicalReplacement(s)) reason = 'medical';
  if (!reason) return { action: 'ok', reason: null, message: null };
  return { action: 'hold', reason, message: HOLD_TEXT[reason] };
}

function isDosingInstruction(s) {
  const other = /\byou should (take|inject|increase|decrease|double|skip|split|start|microdose|come off|stop)\b|\b(what dose|how much) should (i|you|u)\b|\bshould (i|you|u) (take|inject|increase|skip|split)\b|\bmicrodos|\bcounting clicks\b|\b(increase|double|split|skip) (it|yours|your dose|the dose)\b/i.test(s);
  const imperative = /(?:^|[.!?]\s+|\bplease\s+)(take|inject|start(?:\s+at|\s+on)?)\s+\d/i.test(s);
  const directed = /\b(take|inject|use|start(?:\s+at|\s+on)?)\s+\d+(\.\d+)?\s?(mg|mcg|µg|ml|iu|units?|clicks?)\b/i.test(s);
  const first = /\b(i|i'm|im|i've|ive)\b/i.test(s);
  if (other || imperative) return true;
  return directed && !first;
}

function isMedicalReplacement(s) {
  return /\b(don't|do not|dont)\s+(bother\s+)?(ask|see|call)(?:ing)?\s+(your|a|the)\s+(gp|doctor|prescriber|pharmacist)\b|\binstead of (seeing |asking )?(your|a) (gp|doctor|prescriber|pharmacist)\b|\b(no need to|you don't need to|you dont need to) (see|ask) (a |your )?(gp|doctor|prescriber|pharmacist)\b|\byou (don't|dont) need a (prescription|gp|doctor|prescriber)\b|\bignore your (gp|doctor|prescriber|pharmacist)\b/i.test(s);
}

export function chatUnavailable(err) {
  const m = String(err?.message || err || '');
  if (/PGRST202|schema cache|Could not find the function public\.community_chat/i.test(m)) return 'soon';
  if (/community_(sections|messages|chat_)/i.test(m) && /does not exist/i.test(m)) return 'soon';
  return 'error';
}

export function validName(name) {
  const n = String(name || '').trim().replace(/\s+/g, ' ');
  if (n.length < 2 || n.length > 30 || n.includes('@')) return '';
  return n;
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const out = parts.map(p => p[0].toUpperCase()).join('');
  return out || '?';
}

export function chatTime(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, now)) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (same(d, y)) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function dayLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function withDayFlags(messages) {
  let prev = '';
  return messages.map(m => {
    const day = dayLabel(m.created_at);
    const show = day !== prev;
    prev = day;
    return { ...m, day: show ? day : '' };
  });
}

export function unreadCount(messages, lastRead, meId) {
  const cut = lastRead ? Date.parse(lastRead) : 0;
  return messages.filter(m => m.status === 'visible' && m.user_id !== meId && Date.parse(m.created_at) > cut).length;
}

export function pageMessages(messages, { before = null, limit = PAGE_SIZE } = {}) {
  const sorted = messages.filter(m => m.status !== 'deleted').slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const pool = before ? sorted.filter(m => m.created_at < before) : sorted;
  const start = Math.max(0, pool.length - limit);
  return { messages: pool.slice(start), hasMore: start > 0 };
}

export function canPost({ section, isAdmin = false, status = 'active', mutedUntil = null, guidelines = true, now = Date.now() } = {}) {
  if (!guidelines) return { ok: false, reason: 'guidelines' };
  if (status === 'banned' || status === 'suspended') return { ok: false, reason: status };
  if (mutedUntil && Date.parse(mutedUntil) > now) return { ok: false, reason: 'muted' };
  if (section?.archived) return { ok: false, reason: 'archived' };
  if (section?.announce_only && !isAdmin) return { ok: false, reason: 'announce' };
  return { ok: true, reason: null };
}

export function composerNote(gate) {
  return {
    guidelines: 'Accept the guidelines to post.',
    banned: 'Your community account is banned. Email support@glp1life.co.uk if you think this is a mistake.',
    suspended: 'Your community account is suspended pending review.',
    muted: 'You are muted and cannot post yet.',
    archived: 'This section is archived.',
    announce: 'Only admins can post in this section.',
  }[gate?.reason] || '';
}

export function rateOk(stamps, now, { perMinute = 8, perHour = 40 } = {}) {
  const recent = stamps.filter(t => now - t >= 0);
  return recent.filter(t => now - t < 60_000).length < perMinute && recent.filter(t => now - t < 3_600_000).length < perHour;
}

export function moveSection(sections, id, dir) {
  const list = sections.slice().sort((a, b) => a.sort - b.sort || String(a.name).localeCompare(String(b.name)));
  const i = list.findIndex(s => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const [row] = list.splice(i, 1);
  list.splice(j, 0, row);
  return list.map((s, k) => ({ ...s, sort: (k + 1) * 10 }));
}

export function toggleReaction(message, emoji) {
  if (!REACTIONS.includes(emoji)) return message;
  const on = (message.my_reactions || []).includes(emoji);
  const reactions = { ...(message.reactions || {}) };
  const my = new Set(message.my_reactions || []);
  if (on) {
    my.delete(emoji);
    reactions[emoji] = (reactions[emoji] || 1) - 1;
    if (reactions[emoji] <= 0) delete reactions[emoji];
  } else {
    my.add(emoji);
    reactions[emoji] = (reactions[emoji] || 0) + 1;
  }
  return { ...message, reactions, my_reactions: [...my] };
}

export function previewLine(message, meId) {
  if (!message) return '';
  const who = message.user_id === meId ? 'You' : (message.author || 'Member');
  const body = message.kind === 'voice' ? 'Voice note' : (String(message.body || '').trim() || (message.image ? 'Photo' : ''));
  return `${who}: ${body}`.slice(0, 120);
}

export function decorateSections(sections, messages, reads, meId, { includeArchived = false } = {}) {
  return sections
    .filter(s => includeArchived || !s.archived)
    .slice()
    .sort((a, b) => a.sort - b.sort || String(a.name).localeCompare(String(b.name)))
    .map(s => {
      const rows = messages.filter(m => m.section_id === s.id && m.status === 'visible');
      const last = rows.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).at(-1) || null;
      return { ...s, preview: last ? previewLine(last, meId) : (s.description || ''), time: last ? chatTime(last.created_at) : '', unread: unreadCount(rows, reads[s.id] || null, meId), last_at: last?.created_at || null };
    });
}

function quoteHtml(reply) {
  if (!reply) return '';
  const body = reply.gone ? 'Original message removed' : (reply.body || 'Photo');
  return `<blockquote class="waquote"><b>${esc(reply.author || 'Member')}</b><span>${esc(body)}</span></blockquote>`;
}

function reactionsHtml(m) {
  const keys = Object.keys(m.reactions || {}).filter(e => m.reactions[e] > 0);
  if (!keys.length) return '';
  return `<div class="wareacts">${keys.map(e => `<button type="button" data-react="${esc(e)}" data-mid="${esc(m.id)}" class="${(m.my_reactions || []).includes(e) ? 'on' : ''}" aria-pressed="${(m.my_reactions || []).includes(e)}">${e} ${m.reactions[e]}</button>`).join('')}</div>`;
}

function richText(body) {
  return esc(body).replace(/@([A-Za-z][\w'.-]{0,28})/g, '<span class="wamention">@$1</span>');
}
function tickHtml(m) {
  if (!m.mine || !m.ticks) return '';
  const n = Number(m.ticks) || 0;
  return `<i class="watick${n > 0 ? ' seen' : ''}" aria-label="${n > 0 ? `Seen by ${n}` : 'Delivered'}">✓✓</i>`;
}
export function bubbleHtml(m) {
  const mine = !!m.mine;
  const held = m.status === 'held';
  const voice = m.kind === 'voice' ? `<button type="button" class="wavoice" data-play="${esc(m.id)}" aria-label="Play voice note"><span class="waplay">▶</span><span class="wawave">${Array.from({ length: 14 }, (_, i) => `<i style="height:${30 + ((i * 17) % 60)}%"></i>`).join('')}</span><small>0:${String(m.audio_seconds || 0).padStart(2, '0')}</small></button>` : '';
  return `<article class="wabubble ${mine ? 'out' : 'in'}${held ? ' held' : ''}${m.kind === 'win' ? ' win' : ''}" data-mid="${esc(m.id)}" id="msg-${esc(m.id)}">
    ${mine ? '' : `<span class="waav" aria-hidden="true">${esc(m.initials || initials(m.author))}</span>`}
    <div class="wabub">
      ${mine ? '' : `<b class="waname">${esc(m.author || 'Member')}</b>`}
      ${m.kind === 'win' ? '<p class="wawin">Milestone</p>' : ''}
      ${held ? '<p class="waheld">Held for review. Only you can see this.</p>' : ''}
      ${quoteHtml(m.reply)}
      ${voice}
      ${m.body && m.kind !== 'poll' ? `<p class="watext">${richText(m.body)}</p>` : ''}
      ${m.poll_html || ''}
      ${m.image ? `<img class="waimg" alt="Photo attached to this message" ${m.image.startsWith('data:image/') || m.image.startsWith('blob:') ? `src="${esc(m.image)}"` : `data-path="${esc(m.image)}"`}>` : ''}
      ${reactionsHtml(m)}
      <time datetime="${esc(m.created_at)}">${esc(m.clock || chatTime(m.created_at))}${tickHtml(m)}</time>
    </div>
    <button type="button" class="wamore" data-menu="${esc(m.id)}" aria-label="Message actions">⋯</button>
  </article>`;
}

export function threadHtml(section, messages) {
  const flagged = withDayFlags(messages);
  const bits = flagged.map(m => `${m.day ? `<div class="waday">${esc(m.day)}</div>` : ''}${bubbleHtml(m)}`).join('');
  return bits || '<p class="wamute empty">No messages yet. Say hello.</p>';
}

export function listHtml(rows, { pinned = PINNED, admin = false, name = '' } = {}) {
  const items = rows.map(s => `<li><button type="button" class="warow" data-open="${esc(s.id)}">
      <span class="waemoji" aria-hidden="true">${esc(s.emoji || '💬')}</span>
      <span class="wamid"><span class="watop"><b>${esc(s.name)}</b>${s.announce_only ? '<i class="watag">Admins</i>' : ''}<time>${esc(s.time || '')}</time></span>
      <span class="wapreview">${esc(s.preview || s.description || '')}</span></span>
      ${s.unread ? `<span class="wabadge">${s.unread > 99 ? '99+' : s.unread}</span>` : ''}
    </button></li>`).join('');
  return `<div class="waapp" data-wa-view="list">
    <header class="wahead"><div><p class="wakicker">Community</p><h2>GLP1 Life</h2>${name ? `<p class="wame">Posting as ${esc(name)}</p>` : ''}</div>
      <div class="waheadacts">${admin ? '<button type="button" id="waAdmin">Manage</button><button type="button" id="waQueue">Reports</button>' : ''}<button type="button" id="waSearch">Search</button><button type="button" id="waDms">Messages</button><button type="button" id="waPrefs">Settings</button><button type="button" id="waPosts">Posts</button></div></header>
    <div class="wapin" role="note"><b>Guidelines.</b> ${esc(pinned)}</div>
    <ul class="walist">${items}</ul>
  </div>`;
}

export function shellHead(title, sub) {
  return `<header class="wahead"><button type="button" class="waback" id="waBack" aria-label="Back to sections">‹</button><div><p class="wakicker">${esc(sub || 'Community')}</p><h2>${esc(title)}</h2></div></header>`;
}

export function signInHtml() {
  return `<div class="waapp" data-wa-view="signin">${shellHead('GLP1 Life', 'Community')}<div class="card wasoon"><h3>Sign in to join the chat</h3><p>Use your GLP1 Life account (Settings, Cloud backup). The community chat is part of the app for every signed-in member.</p><button type="button" class="primary" id="waSettings">Open Settings</button><button type="button" id="waPosts">Member posts</button></div></div>`;
}

export function soonHtml() {
  return `<div class="waapp" data-wa-view="soon">${shellHead('GLP1 Life', 'Community')}<div class="card wasoon"><h3>Community chat is coming soon</h3><p>The section chat is not on this server yet. When it opens, the same rules apply: no selling or sourcing medicines or peptides, no supplier links or numbers, no dosing instructions, and no advice that replaces your GP or pharmacist.</p><button type="button" class="primary" id="waPosts">Member posts</button></div></div>`;
}

export function guidelinesHtml() {
  return `<div class="waapp" data-wa-view="join">${shellHead('GLP1 Life', 'Community')}<div class="card cmguide"><h3>Community guidelines</h3><p class="small muted">Please read these before your first message. They stay pinned at the top of the community.</p><ul class="cmglist">${CHAT_GUIDELINES.map(([i, t, d]) => `<li><span>${i}</span><div><b>${esc(t)}</b><p class="small">${esc(d)}</p></div></li>`).join('')}</ul>
    <label>Display name<input id="waName" maxlength="30" autocomplete="nickname" placeholder="e.g. Sia from Leeds"></label>
    <label class="check"><input type="checkbox" id="waAgree"> I agree to the community guidelines</label>
    <p class="error" id="waJoinErr" hidden></p><button type="button" class="primary big" id="waJoin">Join the community</button><button type="button" id="waPosts">Member posts</button></div></div>`;
}

export function chatHtml(section, { note = '', reply = null, admin = false, hasMore = false } = {}) {
  return `<div class="waapp wachat" data-wa-view="chat">
    <header class="wahead"><button type="button" class="waback" id="waBack" aria-label="Back to sections">‹</button>
      <span class="waemoji" aria-hidden="true">${esc(section.emoji || '💬')}</span>
      <div class="waheadtext"><b>${esc(section.name)}</b><small>${esc(section.description || '')}</small></div>
      ${admin ? '<button type="button" id="waQueue">Reports</button>' : ''}<button type="button" id="waPrefs">Settings</button></header>
    ${section.announce_only ? '<p class="wapin">Only admins can post in this section. Everyone can read.</p>' : ''}
    <div class="wathread" id="waThread">${hasMore ? '<button type="button" class="walink" id="waOlder">Load earlier messages</button>' : ''}</div>
    <form class="wacompose" id="waForm">
      <div class="wareply" id="waReply" ${reply ? '' : 'hidden'}>${reply ? `<span>Replying to <b>${esc(reply.author || 'message')}</b></span><button type="button" id="waReplyClear" aria-label="Cancel reply">✕</button>` : ''}</div>
      <div class="waphoto" id="waPhotoName" hidden></div>
      ${note ? `<p class="wanote">${esc(note)}</p>` : `<div class="wainput"><button type="button" id="waPhoto" aria-label="Add a photo">📷</button><input id="waFile" type="file" accept="image/jpeg,image/png,image/webp" hidden><button type="button" id="waMic" aria-label="Hold to record a voice note">🎤</button><button type="button" id="waPoll" aria-label="Create a poll">📊</button><label class="sr" for="waText">Message</label><input id="waText" maxlength="2000" autocomplete="off" placeholder="Message" enterkeyhint="send"><button class="primary" id="waSend" aria-label="Send">Send</button></div>`}
    </form>
  </div>`;
}

export function adminHtml(sections) {
  const rows = sections.slice().sort((a, b) => a.sort - b.sort).map(s => `<li class="wasec${s.archived ? ' arch' : ''}" data-sec="${esc(s.id)}">
    <span class="waemoji">${esc(s.emoji || '💬')}</span>
    <span><b>${esc(s.name)}</b><small>${esc(s.description || '')}${s.announce_only ? ' · announcement-only' : ''}${s.archived ? ' · archived' : ''}</small></span>
    <span class="wasectools"><button type="button" data-up="${esc(s.id)}" aria-label="Move ${esc(s.name)} up">↑</button><button type="button" data-down="${esc(s.id)}" aria-label="Move ${esc(s.name)} down">↓</button><button type="button" data-arch="${esc(s.id)}">${s.archived ? 'Restore' : 'Archive'}</button><button type="button" data-del="${esc(s.id)}">Delete</button><button type="button" data-edit="${esc(s.id)}">Edit</button></span>
  </li>`).join('');
  return `<div class="waapp" data-wa-view="admin">${shellHead('Sections', 'Admin')}<form class="card" id="waSecForm">
    <h3 id="waSecTitle">New section</h3>
    <input type="hidden" id="waSecId" value="">
    <label>Emoji<input id="waEmoji" maxlength="8" value="💬"></label>
    <label>Name<input id="waSecName" maxlength="40" required></label>
    <label>Description<input id="waSecDesc" maxlength="200"></label>
    <label class="check"><input type="checkbox" id="waAnnounce"> Announcement-only. Only admins can post.</label>
    <button class="primary" type="submit">Save section</button>
  </form><ul class="wasecs">${rows}</ul></div>`;
}

export function queueHtml({ held = [], reports = [], members = [] } = {}) {
  const card = (title, body, buttons) => `<li class="card"><p><b>${esc(title)}</b></p><p>${esc(body || '')}</p><div class="row">${buttons}</div></li>`;
  const heldHtml = held.map(m => card(`${m.author || 'Member'} · ${m.reason || 'held'}`, m.body, `<button type="button" data-mod="message" data-id="${esc(m.id)}" data-act="approve">Approve</button><button type="button" data-mod="message" data-id="${esc(m.id)}" data-act="delete">Delete</button><button type="button" data-mod="user" data-id="${esc(m.user_id)}" data-act="mute">Mute 24h</button><button type="button" data-mod="user" data-id="${esc(m.user_id)}" data-act="ban">Ban</button>`)).join('') || '<li class="muted">Nothing held.</li>';
  const repHtml = reports.map(r => card(`${r.author || 'Member'} · reported`, `${r.reason || ''}\n${r.body || ''}`, `<button type="button" data-mod="report" data-id="${esc(r.id)}" data-act="dismiss">Dismiss</button><button type="button" data-mod="message" data-id="${esc(r.message_id)}" data-act="delete">Delete message</button><button type="button" data-mod="user" data-id="${esc(r.user_id)}" data-act="mute">Mute 24h</button><button type="button" data-mod="user" data-id="${esc(r.user_id)}" data-act="ban">Ban</button>`)).join('') || '<li class="muted">No open reports.</li>';
  const memHtml = members.map(m => card(`${m.name} · ${m.status}${m.muted_until ? ' · muted' : ''}`, '', `<button type="button" data-mod="user" data-id="${esc(m.user_id)}" data-act="restore">Restore</button>`)).join('') || '<li class="muted">No muted or banned members.</li>';
  return `<div class="waapp" data-wa-view="queue">${shellHead('Reports', 'Admin')}<div class="waqueue"><h3>Held for review</h3><ul class="walist plain">${heldHtml}</ul><h3>Member reports</h3><ul class="walist plain">${repHtml}</ul><h3>Muted or banned</h3><ul class="walist plain">${memHtml}</ul></div></div>`;
}

export function menuHtml(message, { admin = false } = {}) {
  const block = message.mine || !message.user_id ? '' : `<button type="button" data-act="block" data-user="${esc(message.user_id)}">Block ${esc(message.author || 'member')}</button>`;
  const del = message.mine || admin ? `<button type="button" data-act="delete" data-mid="${esc(message.id)}">Delete message</button>` : '';
  return `<div class="washeet" id="waSheet" role="dialog" aria-label="Message actions"><div class="washeetbox">
    <div class="wareactpick">${REACTIONS.map(e => `<button type="button" data-act="react" data-emoji="${e}" data-mid="${esc(message.id)}" aria-label="React ${e}">${e}</button>`).join('')}</div>
    <button type="button" data-act="reply" data-mid="${esc(message.id)}">Reply</button>
    <button type="button" data-act="copy" data-mid="${esc(message.id)}">Copy</button>
    <button type="button" data-act="report" data-mid="${esc(message.id)}">Report</button>
    ${block}${del}
    ${admin ? `<button type="button" data-act="pin" data-mid="${esc(message.id)}">${message.pinned ? 'Unpin' : 'Pin in this section'}</button>` : ''}
    ${admin && message.user_id && !message.mine ? `<button type="button" data-act="mute" data-user="${esc(message.user_id)}">Mute 24h</button><button type="button" data-act="ban" data-user="${esc(message.user_id)}">Ban member</button>` : ''}
    <button type="button" data-act="close">Close</button>
  </div></div>`;
}

const PLATE = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" rx="18" fill="#e6f5ec"/><circle cx="160" cy="90" r="48" fill="#2e9d5b"/><text x="160" y="98" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="16">salad</text></svg>');

export function demoState(now = new Date('2026-11-11T12:00:00Z')) {
  const sections = [
    { id: 'ann', slug: 'announcements', name: 'Announcements', description: 'News from GLP1 Life. Only admins can post.', emoji: '📣', sort: 10, announce_only: true, archived: false },
    { id: 'gen', slug: 'general', name: 'General', description: 'Say hello and talk about the week.', emoji: '💬', sort: 20, announce_only: false, archived: false },
    { id: 'food', slug: 'food', name: 'Food & Recipes', description: 'High-protein ideas, batch cooking and shop finds.', emoji: '🥗', sort: 30, announce_only: false, archived: false },
    { id: 'fit', slug: 'fitness', name: 'Fitness', description: 'Walks, classes and gentle strength.', emoji: '💪', sort: 40, announce_only: false, archived: false },
    { id: 'wins', slug: 'wins', name: 'Weight-loss Wins', description: 'Non-scale victories and kind encouragement.', emoji: '🏆', sort: 50, announce_only: false, archived: false },
    { id: 'old', slug: 'old-checkins', name: 'Old check-ins', description: 'Archived. Hidden from members.', emoji: '🗂️', sort: 60, announce_only: false, archived: true },
  ];
  const M = (partial) => ({ reactions: {}, my_reactions: [], image: null, reply: null, status: 'visible', ...partial });
  const messages = [
    M({ id: 'a1', section_id: 'ann', user_id: 'team', author: 'GLP1 Life', body: 'Welcome to the GLP1 Life community. Read the guidelines at the top before you post. Ask your GP or pharmacist about your medicine.', created_at: '2026-11-11T07:14:00Z' }),
    M({ id: 'g1', section_id: 'gen', user_id: 'jon', author: 'Jon', body: 'Morning everyone. Short walk done before work, then porridge.', created_at: '2026-11-10T18:05:00Z' }),
    M({ id: 'g2', section_id: 'gen', user_id: 'ava', author: 'Ava', body: 'Welcome in. How is everyone finding the evening classes?', created_at: '2026-11-11T08:12:00Z' }),
    M({ id: 'g3', section_id: 'gen', user_id: 'sam', author: 'Sam', body: 'I did the 15 minute chair class. Knees felt fine afterwards.', created_at: '2026-11-11T08:40:00Z' }),
    M({ id: 'f1', section_id: 'food', user_id: 'priya', author: 'Priya', body: 'Batch-cooked chilli last night. Four portions, lots of beans, and it freezes well.', created_at: '2026-11-11T09:02:00Z', reactions: { '❤️': 2, '👍': 1 }, my_reactions: ['❤️'] }),
    M({ id: 'f2', section_id: 'food', user_id: 'me', author: 'Mitchell', mine: true, body: 'That sounds perfect for the week. I used turkey mince last time and it was lovely.', created_at: '2026-11-11T09:18:00Z', reply: { id: 'f1', author: 'Priya', body: 'Batch-cooked chilli last night. Four portions, lots of beans, and it freezes well.', gone: false } }),
    M({ id: 'f3', section_id: 'food', user_id: 'sam', author: 'Sam', body: 'Served it with a big salad from Lidl.', image: PLATE, created_at: '2026-11-11T09:41:00Z', reactions: { '💪': 1, '🙏': 1 }, my_reactions: [] }),
    M({ id: 't1', section_id: 'fit', user_id: 'ava', author: 'Ava', body: 'Who is walking this evening? I am doing 20 minutes around the park.', created_at: '2026-11-11T10:05:00Z' }),
    M({ id: 'w1', section_id: 'wins', user_id: 'jon', author: 'Jon', body: 'Clothes fit better this week. I am not posting a number, just pleased I kept the walks going.', created_at: '2026-11-11T11:20:00Z', reactions: { '🎉': 3 } }),
    M({ id: 'h1', section_id: 'gen', user_id: 'lee', author: 'Lee', body: 'WhatsApp me on 07700 900123 for cheaper pens.', created_at: '2026-11-11T11:48:00Z', status: 'held', reason: 'selling' }),
  ];
  messages.forEach(m => { m.initials = initials(m.author); m.clock = chatTime(m.created_at, now); if (m.user_id === 'me') m.mine = true; });
  return {
    now,
    me: { signed_in: true, member: true, display_name: 'Mitchell', guidelines: true, status: 'active', is_admin: false, muted_until: null, user_id: 'me' },
    sections,
    messages,
    reads: { ann: '2026-11-11T07:14:00Z', gen: '2026-11-11T08:12:00Z', food: '2026-11-11T09:41:00Z', fit: '2026-11-10T00:00:00Z', wins: '2026-11-10T00:00:00Z' },
    blocks: [],
    reports: [{ id: 'r1', message_id: 'h1', user_id: 'lee', author: 'Lee', reason: 'Selling pens', body: 'WhatsApp me on 07700 900123 for cheaper pens.', at: '2026-11-11T11:50:00Z' }],
    stamps: [],
  };
}

export function visibleMessages(state, sectionId, { admin = false } = {}) {
  return state.messages.filter(m => {
    if (m.section_id !== sectionId || m.status === 'deleted') return false;
    if (state.blocks.includes(m.user_id)) return false;
    if (m.status === 'held') return admin || m.user_id === state.me.user_id;
    return true;
  });
}
