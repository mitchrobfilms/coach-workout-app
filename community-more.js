// Accountability buddies, daily prompts, recipe cards, Q&A, profiles, scheduled posts,
// stickers, a disabled GIF picker, translation and the new-member welcome.
// Server copies are in supabase/011_community_more.sql. GIF and translate providers
// stay off until their secrets exist. No peptide shop or supplier features.
import { esc, classifyChat } from './community-chat-core.js';

export const GIF_SECRET = 'GIF_API_KEY';
export const TRANSLATE_LIMIT = 20;
export const WELCOME = 'Welcome to GLP1 Life Community. Be kind. No selling or sourcing medicines or peptides, no supplier links or numbers, no dosing instructions, and nothing here replaces your GP, prescriber or pharmacist.';
export const QA_NOTICE = 'This Q&A is general wellbeing support from members and admins. It is not medical advice. Ask your GP, prescriber or pharmacist about your treatment.';

export const STICKERS = [
  ['wave', 'Hello', '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#efe7f8"/><path d="M16 36c6 8 26 8 32 0" fill="none" stroke="#5b2a86" stroke-width="3" stroke-linecap="round"/><circle cx="22" cy="26" r="3" fill="#5b2a86"/><circle cx="42" cy="26" r="3" fill="#5b2a86"/></svg>'],
  ['water', 'Water', '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 8c10 14 18 22 18 32a18 18 0 1 1-36 0c0-10 8-18 18-32z" fill="#2e9d5b"/></svg>'],
  ['walk', 'Walk', '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="36" cy="14" r="6" fill="#5b2a86"/><path d="M34 22l-8 14 10 4 6 16M28 36l-10 6M40 28l10 8" fill="none" stroke="#5b2a86" stroke-width="3" stroke-linecap="round"/></svg>'],
  ['plate', 'Plate', '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="34" r="18" fill="none" stroke="#2e9d5b" stroke-width="4"/><circle cx="32" cy="34" r="8" fill="#5b2a86"/></svg>'],
  ['star', 'Star', '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 8l6 16h16l-12 10 5 16-15-10-15 10 5-16-12-10h16z" fill="#5b2a86"/></svg>'],
  ['cheer', 'Cheer', '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="28" width="18" height="12" rx="6" fill="#2e9d5b"/><rect x="36" y="28" width="18" height="12" rx="6" fill="#5b2a86"/></svg>'],
];

export function allowText(text) {
  const result = classifyChat(text || '');
  return result.action === 'ok' ? { ok: true, result } : { ok: false, result };
}

export function pairCard(pair, meId) {
  if (!pair || pair.status === 'ended') return null;
  const other = pair.user_lo === meId ? pair.hi : pair.lo;
  return { ...pair, other };
}

export function endPair(pair, meId) {
  if (!pair || (pair.user_lo !== meId && pair.user_hi !== meId)) return { ok: false, reason: 'That pairing is not yours.' };
  return { ok: true, pair: { ...pair, status: 'ended', ended_at: new Date().toISOString() } };
}

export function matchWaiting(queue, blocks = []) {
  const blocked = (a, b) => blocks.some(x => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
  const left = queue.filter(a => !queue.some(b => b.user_id !== a.user_id && blocked(a.user_id, b.user_id) && b.user_id < a.user_id));
  if (left.length < 2) return null;
  const [a, b] = left;
  if (blocked(a.user_id, b.user_id)) return null;
  return { user_lo: a.user_id < b.user_id ? a.user_id : b.user_id, user_hi: a.user_id < b.user_id ? b.user_id : a.user_id, goal: a.goal || b.goal || 'Check in once this week', status: 'active' };
}

export function londonClock(now) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = type => Number(parts.find(p => p.type === type)?.value || 0);
  return { hour: get('hour'), minute: get('minute') };
}

export function duePrompt(prompt, now, alreadyPosted) {
  if (!prompt?.enabled || alreadyPosted) return false;
  const clock = londonClock(now);
  return clock.hour > prompt.hour || (clock.hour === prompt.hour && clock.minute >= prompt.minute);
}

export function eventPhase(event, now) {
  const start = Date.parse(event.starts_at);
  const end = event.ends_at ? Date.parse(event.ends_at) : start + 60 * 60 * 1000;
  const t = now.getTime();
  if (t < start) return 'scheduled';
  if (t <= end) return 'live';
  return 'ended';
}

export function toggleUpvote(votes, questionId, userId) {
  const has = votes.some(v => v.question_id === questionId && v.user_id === userId);
  return has ? votes.filter(v => !(v.question_id === questionId && v.user_id === userId)) : [...votes, { question_id: questionId, user_id: userId }];
}

export function badgeList({ streak = 0, wins = 0, challenges = 0 } = {}) {
  const out = [];
  if (streak >= 7) out.push({ id: 'streak7', label: '7-day streak' });
  if (streak >= 30) out.push({ id: 'streak30', label: '30-day streak' });
  if (wins > 0) out.push({ id: 'first_win', label: 'First win' });
  if (challenges > 0) out.push({ id: 'challenge', label: 'Challenge completed' });
  return out;
}

export function dueScheduled(rows, now) {
  return rows.filter(r => !r.sent_at && Date.parse(r.send_at) <= now.getTime());
}

export function gifPicker({ apiKey = '' } = {}) {
  return { enabled: !!apiKey, secret: GIF_SECRET, results: [] };
}

export function demoTranslate(text, lang = 'French') {
  return { demo: true, lang, text: `[Demo ${lang}] ${text}`, note: 'Demo only. Live translation uses the server Groq key and is not deployed.' };
}

export function translateAllowed(used, limit = TRANSLATE_LIMIT) {
  return used < limit;
}

export function stickerById(id) {
  return STICKERS.find(s => s[0] === id) || null;
}

export function moreDemo(state) {
  if (state.more) return state;
  state.more = true;
  state.welcome = { body: WELCOME, dismissed: false };
  state.pair = {
    id: 'pair1', status: 'active', user_lo: 'me', user_hi: 'ava',
    lo: { id: 'me', name: 'Mitchell' }, hi: { id: 'ava', name: 'Ava' },
    goal: 'Walk on 4 days this week',
    checkin: { author: 'Ava', body: 'Evening walk done. Knees felt fine.', at: '2026-11-11T18:10:00Z' },
  };
  state.prompts = [{ id: 'pr1', section_id: 'gen', body: 'How are you feeling today?', hour: 8, minute: 0, enabled: true }];
  state.messages.push({
    id: 'grecipe', section_id: 'food', user_id: 'priya', author: 'Priya', body: 'Sharing the breakfast I keep coming back to.',
    status: 'visible', created_at: '2026-11-11T09:10:00Z', reactions: {}, my_reactions: [], reply: null, image: null,
    card: { type: 'recipe', id: 'o-skyrberry', title: 'Skyr berry crunch pots', detail: 'About 290 kcal · 28 g protein' },
  });
  state.messages.push({
    id: 'gsticker', section_id: 'gen', user_id: 'jon', author: 'Jon', body: '', kind: 'sticker',
    status: 'visible', created_at: '2026-11-11T08:05:00Z', reactions: {}, my_reactions: [], reply: null, image: null,
    card: { type: 'sticker', id: 'wave' },
  });
  state.event = {
    id: 'ev1', section_id: 'gen', title: 'Wednesday wellbeing questions',
    starts_at: '2026-11-11T18:00:00Z', ends_at: '2026-11-11T19:00:00Z', reminded: true,
    questions: [
      { id: 'q1', author: 'Sam', body: 'What helps on a low-energy evening?', votes: 3, answered: false, mine: false },
      { id: 'q2', author: 'Mitchell', body: 'Any gentle walks that are kind on knees?', votes: 1, answered: true, mine: true },
    ],
  };
  state.profiles = {
    ava: { id: 'ava', name: 'Ava', bio: 'Walking most evenings and cooking on Sundays.', joined: '2026-09-02', badges: badgeList({ streak: 12, wins: 1, challenges: 1 }) },
    me: { id: 'me', name: 'Mitchell', bio: 'New here. Taking the walks one day at a time.', joined: '2026-10-20', badges: badgeList({ streak: 7, wins: 0, challenges: 0 }) },
  };
  state.scheduled = [{ id: 'sch1', section_id: 'ann', body: 'Friday reminder: the wellbeing Q&A is at 6pm UK. It is not medical advice.', send_at: '2026-11-13T18:00:00Z', sent_at: null }];
  state.gif = gifPicker({ apiKey: '' });
  state.translations = {};
  return state;
}

function head(title, kicker = 'Community') {
  return `<header class="wahead"><button type="button" class="waback" id="waBack" aria-label="Back">‹</button><div><p class="wakicker">${esc(kicker)}</p><h2>${esc(title)}</h2></div></header>`;
}

export function welcomeHtml(welcome) {
  if (!welcome || welcome.dismissed) return '';
  return `<section class="wawelcome" data-wa-view="welcome"><b>Welcome</b><p>${esc(welcome.body)}</p><button type="button" id="waWelcomeOk">Got it</button></section>`;
}

export function buddyHtml(pair, meId) {
  const card = pairCard(pair, meId);
  if (!card) return `<div class="waapp" data-wa-view="buddy">${head('Buddy')}<div class="card"><h3>Find an accountability buddy</h3><p>Opt in and we will pair you with another member who is waiting, or ask someone by their display name. Either of you can end it. Blocked members are never paired.</p><form id="waBuddyOpt"><input name="goal" maxlength="80" placeholder="Shared weekly goal" aria-label="Shared goal"><button class="primary">Opt in</button></form><form id="waBuddyAsk"><input name="who" maxlength="30" placeholder="Their display name" aria-label="Display name"><button>Request</button></form></div></div>`;
  return `<div class="waapp" data-wa-view="buddy">${head('Buddy')}<article class="card wabuddy"><h3>${esc(card.other.name)}</h3><p>Shared goal: <b>${esc(card.goal)}</b></p><p class="small">${esc(card.checkin?.author)} · ${esc(card.checkin?.body || 'No check-in yet')}</p><form id="waBuddyIn"><input name="text" maxlength="200" placeholder="Today's check-in" aria-label="Check-in"><button class="primary">Check in</button></form><button type="button" id="waBuddyEnd">End pairing</button></article></div>`;
}

export function promptHtml(prompt) {
  const when = `${String(prompt.hour).padStart(2, '0')}:${String(prompt.minute).padStart(2, '0')} UK`;
  return `<div class="waapp" data-wa-view="prompt">${head('Daily prompt', 'Admin')}<article class="card"><p class="small">Posted in General at ${esc(when)} (Europe/London). The scheduler is documented and not deployed.</p><blockquote class="waquote"><b>Today's prompt</b><span>${esc(prompt.body)}</span></blockquote></article></div>`;
}

export function qaHtml(event, now = new Date('2026-11-11T18:30:00Z')) {
  const phase = eventPhase(event, now);
  const qs = event.questions.map(q => `<li class="waq"><p><b>${esc(q.author)}</b> ${esc(q.body)}</p><button type="button" data-up="${esc(q.id)}">▲ ${q.votes}</button>${q.answered ? '<span class="watag">Answered</span>' : '<button type="button" data-answered="' + esc(q.id) + '">Mark answered</button>'}</li>`).join('');
  return `<div class="waapp" data-wa-view="qa">${head(event.title, phase === 'live' ? 'Live' : 'Q&A')}<p class="wapin">${esc(QA_NOTICE)}</p><div class="card"><p>${phase === 'live' ? 'Live now' : phase === 'scheduled' ? 'Scheduled' : 'Finished'} · ${esc(event.starts_at.slice(0, 16).replace('T', ' '))} UK</p><button type="button" id="waRemind" ${event.reminded ? 'disabled' : ''}>${event.reminded ? 'Reminder on' : 'Remind me'}</button><ul class="waqs">${qs}</ul><form id="waAsk"><input name="q" maxlength="200" placeholder="Ask a wellbeing question" aria-label="Question"><button class="primary">Add question</button></form></div></div>`;
}

export function profileHtml(profile) {
  const badges = (profile.badges || []).map(b => `<li>${esc(b.label)}</li>`).join('') || '<li>No badges yet</li>';
  return `<div class="waapp" data-wa-view="profile">${head(profile.name, 'Profile')}<article class="card"><p class="waav big">${esc(profile.name.slice(0, 1))}</p><p>${esc(profile.bio)}</p><p class="small">Joined ${esc(profile.joined)}</p><ul class="wabadges">${badges}</ul></article></div>`;
}

export function scheduleHtml(row) {
  return `<div class="waapp" data-wa-view="schedule">${head('Schedule', 'Admin')}<form class="card" id="waSched"><label>Announcement<textarea name="body" maxlength="500">${esc(row?.body || '')}</textarea></label><label>Send time (UK)<input name="when" value="${esc((row?.send_at || '').slice(0, 16))}"></label><button class="primary">Save scheduled post</button><p class="small">Sends when the documented daily job runs. Not deployed.</p></form></div>`;
}

export function stickerHtml(pack = STICKERS) {
  const buttons = pack.map(([id, name, svg]) => `<button type="button" class="wasticker" data-sticker="${esc(id)}" aria-label="${esc(name)}">${svg}</button>`).join('');
  return `<div class="waapp" data-wa-view="stickers">${head('Stickers')}<div class="wastickers">${buttons}</div><div class="card"><h3>GIFs</h3><p>GIF search stays off until the server secret <b>${GIF_SECRET}</b> is set. No key is stored in the app.</p><button type="button" disabled>GIF picker off</button></div></div>`;
}

export function translateHtml(original, translated) {
  return `<div class="waapp" data-wa-view="translate">${head('Translate')}<article class="card"><p>${esc(original)}</p><button type="button" id="waDoTranslate">Translate</button>${translated ? `<p class="watrans">${esc(translated.text)}</p><p class="small">${esc(translated.note)}</p>` : ''}</article></div>`;
}

export function recipeButton(card) {
  if (!card || card.type !== 'recipe') return '';
  return `<button type="button" class="warecipe" data-recipe="${esc(card.id)}"><b>${esc(card.title)}</b><small>${esc(card.detail || 'Open recipe')}</small></button>`;
}

export function stickerInline(id) {
  const sticker = stickerById(id);
  if (!sticker) return '';
  return `<span class="wasticker show">${sticker[2]}</span>`;
}
