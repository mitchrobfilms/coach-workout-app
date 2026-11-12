// Fitness tab: live timetable, follow-along player, programmes, planner, trophies, tips.
// Coach Ava videos stay in #videoLib. This module does not gate anything behind a payment.
import { writeWorkoutSample } from './health.js';
import {
  DEMO_NOTICE, FOCUS_LABEL, LEVEL_LABEL, EQUIP_LABEL, MUSIC_NOTE, STREAM_SOON, WEEKDAYS, activityLine, applyFeedback,
  catalogue, classifyChat, completionFromPlayer, countdown, createPlayer, demoBundle, feedbackNote, filterWorkouts,
  formatLondon, kcalEstimate, nextSlot, playCue, playerView, previewPlayer, programmeSlots, pushAvailability,
  reminderPlan, resolveStream, sessionPhase, skipSegment, sortWorkouts, summariseActivity, tickPlayer, togglePause,
  upcomingQueue, useEasier, workoutById, planWeek, londonToday, mondayOf,
} from './fitness-core.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const blank = () => ({ demo: false, programmeId: 'start-up', programmeDone: 0, bias: 0, lastFeedback: null, trainingDays: [1, 3, 5], birthday: '', keepAwake: true, history: [], reminders: [], sessions: [], chat: {}, filters: { minMinutes: 5, maxMinutes: 50, level: '', focus: '', equipment: '', intensity: '', q: '' } });
const RANGES = [{ id: 'all', label: '5–50 min', min: 5, max: 50 }, { id: '10', label: '5–10', min: 5, max: 10 }, { id: '20', label: '10–20', min: 10, max: 20 }, { id: '30', label: '20–30', min: 20, max: 30 }, { id: '50', label: '30–50', min: 30, max: 50 }];
const chip = (on, fx, id, label, extra = '') => `<button type="button" class="${on ? 'on' : ''}" data-fx="${fx}" data-id="${esc(id)}" ${extra}>${esc(label)}</button>`;

export function mountFitness(opts) {
  const hub = opts.hub;
  if (!hub) return null;
  const key = opts.demo ? 'fitnessDemo' : 'fitness';
  let lib = null, view = 'home', roomId = null, tipId = null, progId = null, state = load(), player = null, overlay = null, timer = null, audioCtx = null, wake = null, booted = false;
  function load() {
    let saved = null; try { saved = opts.store.get(key, null); } catch { saved = null; }
    if (opts.demo) return saved?.demo ? { ...blank(), ...saved } : demoBundle(new Date());
    return { ...blank(), ...(saved || {}) };
  }
  function save() { try { opts.store.set(key, state); } catch {} }
  const sessions = () => (state.sessions || []).map(s => ({ ...s, phase: sessionPhase(s) })).filter(s => s.phase !== 'cancelled');
  const activeProg = () => lib?.programmes?.find(p => p.id === state.programmeId) || null;
  const viewedProg = () => lib?.programmes?.find(p => p.id === (progId || state.programmeId)) || null;

  function render() {
    if (opts.studio) opts.studio.hidden = view !== 'home';
    hub.innerHTML = shell();
    const search = hub.querySelector('#fxSearch');
    if (search) search.oninput = () => { const pos = search.selectionStart; state.filters.q = search.value; render(); const n = hub.querySelector('#fxSearch'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch {} } };
    const bday = hub.querySelector('#fxBday');
    if (bday) bday.onchange = () => { const m = /^(\d{1,2})\/(\d{1,2})$/.exec(bday.value.trim()); if (!m) { opts.toast('Use DD/MM, for example 12/11.'); return; } state.birthday = `${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; save(); render(); };
    const form = hub.querySelector('#fxManual');
    if (form) form.onsubmit = e => { e.preventDefault(); const title = form.title.value.trim(), minutes = Math.round(+form.minutes.value); if (!title || !(minutes > 0)) return; logEntry({ title, minutes, kcal: kcalEstimate(3.5, opts.weightKg?.() || 75, minutes), source: 'manual', workoutId: null }); opts.toast('Saved on this phone. ' + activityLine({ minutes, kcal: kcalEstimate(3.5, opts.weightKg?.() || 75, minutes) })); form.reset(); };
    const chat = hub.querySelector('#fxChatForm');
    if (chat) chat.onsubmit = e => { e.preventDefault(); const session = sessions().find(s => s.id === roomId); const text = chat.message.value; chat.message.value = ''; if (session) sendChat(session, text); };
  }
  function shell() {
    const banner = state.demo ? `<div class="fxbanner" id="fitDemoBanner"><b>Sample preview</b>${esc(state.notice || DEMO_NOTICE)}</div>` : '';
    if (view === 'home') return `<div class="fx" data-fitview="home">${banner}<h2 class="pagehead">Fitness</h2><p class="studioled">Low-impact sessions you can follow on your own, plus Coach Ava's published classes underneath.</p>${liveHome()}${nextCard()}${links()}</div>`;
    if (view === 'live') return `<div class="fx" data-fitview="live">${banner}${back()}${liveList()}</div>`;
    if (view === 'room') return `<div class="fx" data-fitview="room">${banner}${back('live')}${room()}</div>`;
    if (view === 'browse') return `<div class="fx" data-fitview="browse">${banner}${back()}${browse()}</div>`;
    if (view === 'programmes') return `<div class="fx" data-fitview="programmes">${banner}${back()}${programmeList()}</div>`;
    if (view === 'programme') return `<div class="fx" data-fitview="programme">${banner}${back('programmes')}${programmeDetail()}</div>`;
    if (view === 'plan') return `<div class="fx" data-fitview="plan">${banner}${back()}${planner()}</div>`;
    if (view === 'trophies') return `<div class="fx" data-fitview="trophies">${banner}${back()}${trophies()}</div>`;
    if (view === 'tips') return `<div class="fx" data-fitview="tips">${banner}${back()}${tipList()}</div>`;
    if (view === 'tip') return `<div class="fx" data-fitview="tip">${banner}${back('tips')}${article()}</div>`;
    if (view === 'health') return `<div class="fx" data-fitview="health">${banner}${back()}${health()}</div>`;
    return `<div class="fx" data-fitview="home">${banner}</div>`;
  }
  const back = (to = 'home') => `<button type="button" class="fxback" data-fx="goto" data-id="${to}">← Fitness</button>`;
  const links = () => `<div class="fxlinks">${[['live', 'Live classes', 'Timetable and replays'], ['browse', 'Workouts', '5–50 min, low impact'], ['programmes', 'Programmes', '4–6 week plans'], ['plan', 'Planner', 'Your training days'], ['trophies', 'Trophies', 'Streaks and badges'], ['tips', 'Expert tips', 'Recovery, sleep, eating'], ['health', 'Connected', 'Steps and workouts']].map(([id, t, s]) => `<button type="button" data-fx="goto" data-id="${id}">${t}<small>${s}</small></button>`).join('')}</div>`;

  function nextCard() {
    if (!lib) return '<div class="fxcard">Loading workouts…</div>';
    const slot = nextSlot(activeProg(), state.programmeDone || 0);
    const w = (slot && workoutById(lib, slot.workoutId)) || sortWorkouts(lib.workouts)[0];
    if (!w) return '';
    const where = slot ? `${esc(activeProg()?.title || 'Programme')} · week ${slot.week} · day ${slot.day}` : 'A low-impact session';
    return `<div class="fxhero"><small>${where}</small><h3 style="margin:4px 0">${esc(w.title)}</h3><p class="fxquiet">${w.minutes} min · ${esc(LEVEL_LABEL[w.level] || w.level)} · ${esc(FOCUS_LABEL[w.focus] || w.focus)} · low impact</p><p class="fxquiet">${esc(feedbackNote(state.bias || 0))}</p><button type="button" class="primary" data-fx="start" data-id="${esc(w.id)}">Start</button></div>`;
  }
  function liveHome() {
    const list = sessions();
    const live = list.find(s => s.phase === 'live');
    const next = list.filter(s => s.phase === 'upcoming').sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))[0];
    if (!live && !next) return `<div class="fxcard"><b>Live classes</b><p class="small muted">No class is scheduled. An admin adds one after the fitness database update is applied. ${esc(STREAM_SOON)}</p><button type="button" data-fx="goto" data-id="live">Open the timetable</button></div>`;
    const card = s => s ? `<div class="fxcard"><small>${s.phase === 'live' ? 'On now' : 'Next class'}${s.demo ? ' · Sample' : ''}</small><b>${esc(s.title)}</b><small>${esc(s.coach)} · ${esc(LEVEL_LABEL[s.level] || s.level)} · ${s.durationMin} min · ${esc(formatLondon(s.startsAt))}</small>${s.phase === 'upcoming' ? `<div class="fxcount" id="fitCountdown" data-fxcount="${esc(s.startsAt)}">${esc(countdown(s.startsAt).label)}</div><button type="button" data-fx="remind" data-id="${esc(s.id)}">${state.reminders.some(r => r.sessionId === s.id) ? 'Reminder saved' : 'Remind me'}</button>` : ''}<button type="button" class="primary" data-fx="join" data-id="${esc(s.id)}">Join</button></div>` : '';
    return card(next) + card(live);
  }
  function liveList() {
    const list = sessions();
    const group = (phase, title) => {
      const rows = list.filter(s => s.phase === phase);
      if (!rows.length) return '';
      return `<h3>${title}</h3>` + rows.map(s => `<button type="button" class="fxrow${s.phase === 'live' ? ' fxnow' : ''}" data-fx="join" data-id="${esc(s.id)}"><span><b>${esc(s.title)}</b><small>${esc(s.coach)} · ${esc(formatLondon(s.startsAt))} · ${esc(LEVEL_LABEL[s.level] || '')} · ${s.durationMin} min${s.demo ? ' · Sample' : ''}</small></span><span>${s.phase === 'upcoming' ? `<b class="fxcount" style="font-size:1.4rem" data-fxcount="${esc(s.startsAt)}">${esc(countdown(s.startsAt).label)}</b>` : s.phase === 'live' ? 'Join' : 'Replay'}</span></button>`).join('');
    };
    return `<h2 class="pagehead">Live timetable</h2><p class="small muted">Times are UK (Europe/London). ${esc(STREAM_SOON)}</p>${group('live', 'On now')}${group('upcoming', 'Coming up')}${group('ended', 'Replays')}${list.length ? '' : '<div class="fxcard">No classes scheduled.</div>'}<p class="small muted">Admins schedule a class in GLP1 Life admin. The database update is <code>supabase/013_fitness_studio.sql</code> and it has not been applied from this app.</p>`;
  }
  function room() {
    const s = sessions().find(x => x.id === roomId);
    if (!s) return '<p>That class is not on this phone.</p>';
    const stream = resolveStream(s, opts.streamConfig?.() || {});
    const stage = stream.enabled && stream.kind === 'hls'
      ? `<video class="vplayer" controls playsinline src="${esc(stream.hlsUrl)}" title="${esc(s.title)}"></video>`
      : stream.enabled ? `<iframe title="${esc(s.title)}" src="${esc(stream.embedUrl)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`
      : `<div class="fxstage" id="fitSoon"><div><b>Coming soon</b><p>${esc(stream.message)}</p><button type="button" disabled>Join video</button></div></div>`;
    const phase = s.phase;
    const chatOpen = phase === 'live';
    const msgs = (state.chat[s.id] || []).map(m => `<div class="fxmsg"><b>${esc(m.author)}</b>${m.demo ? '<span class="fxsample">Sample</span>' : ''}<div>${esc(m.body)}</div></div>`).join('');
    const replay = phase === 'ended' ? (s.replayVideoId ? `<button type="button" class="primary" data-fx="replay" data-id="${esc(s.replayVideoId)}">Watch replay</button><p class="small muted">${s.demo ? 'Sample replay. This opens the published Coach Ava class.' : 'Opens the published class.'}</p>` : '<p class="small muted">Replay coming soon.</p>') : '';
    return `<h2 class="pagehead">${esc(s.title)}</h2><p class="small">${phase === 'live' ? 'Live now' : phase === 'upcoming' ? 'Starts ' + esc(countdown(s.startsAt).label) : 'Ended'} · ${esc(s.coach)} · ${esc(LEVEL_LABEL[s.level] || s.level)} · ${s.durationMin} min${s.demo ? ' · <span class="fxsample">Sample</span>' : ''}</p>
      ${phase === 'upcoming' ? `<div class="fxcount" data-fxcount="${esc(s.startsAt)}">${esc(countdown(s.startsAt).label)}</div><button type="button" data-fx="remind" data-id="${esc(s.id)}">${state.reminders.some(r => r.sessionId === s.id) ? 'Reminder saved' : 'Remind me'}</button>` : ''}
      ${stage}${replay}
      <h3>Class chat</h3>
      ${chatOpen ? `<div class="fxchat" id="fitChat">${msgs || '<p class="small muted">No messages yet. Be kind, and do not post doses or where to buy medication.</p>'}</div><form id="fxChatForm" class="row"><input name="message" maxlength="500" placeholder="Message the class" aria-label="Message the class"><button class="primary" type="submit">Send</button></form>` : `<p class="small muted">${phase === 'upcoming' ? 'Chat opens when the class starts.' : 'Chat has closed for this class.'}</p>${msgs ? `<div class="fxchat">${msgs}</div>` : ''}`}
      <p class="small muted">Stop if anything hurts or you feel dizzy. Check with your GP before new exercise.</p>`;
  }
  function browse() {
    if (!lib) return '<p>Loading workouts…</p>';
    const f = state.filters;
    const rangeOn = r => f.minMinutes === r.min && f.maxMinutes === r.max;
    const items = filterWorkouts(catalogue(lib), f);
    const group = (title, key, values) => `<b class="small">${title}</b><div class="fxchips">${chip(!f[key], 'filter', '', 'Any', `data-kind="${key}"`)}${values.map(v => chip(f[key] === v, 'filter', v, key === 'level' ? LEVEL_LABEL[v] : key === 'focus' ? FOCUS_LABEL[v] : key === 'equipment' ? EQUIP_LABEL[v] : 'Low impact', `data-kind="${key}"`)).join('')}</div>`;
    return `<h2 class="pagehead">Workouts</h2><p class="small muted">Low impact is listed first. Duration covers 5 to 50 minutes.</p>
      <b class="small">Duration</b><div class="fxchips" id="fitFilters">${RANGES.map(r => `<button type="button" class="${rangeOn(r) ? 'on' : ''}" data-fx="range" data-min="${r.min}" data-max="${r.max}">${r.label}</button>`).join('')}</div>
      ${group('Level', 'level', ['beginner', 'intermediate', 'advanced'])}
      ${group('Focus', 'focus', Object.keys(FOCUS_LABEL))}
      ${group('Equipment', 'equipment', ['none', 'basic'])}
      ${group('Intensity', 'intensity', ['low'])}
      <label class="vsearch">Search<input id="fxSearch" type="search" value="${esc(f.q || '')}" placeholder="Name or body area" aria-label="Search workouts"></label>
      <p class="small muted">${items.length} session${items.length === 1 ? '' : 's'}</p>
      ${items.map(w => `<button type="button" class="fxrow" data-fx="start" data-id="${esc(w.id)}"><span><b>${esc(w.title)}</b><small>${w.minutes} min · ${esc(LEVEL_LABEL[w.level])} · ${esc(FOCUS_LABEL[w.focus])} · ${esc(EQUIP_LABEL[w.equipment])} · ${w.kind === 'video' ? 'Coach Ava video' : 'Follow-along'}</small></span></button>`).join('') || '<p>Nothing matches these filters.</p>'}`;
  }
  function programmeList() {
    if (!lib) return '<p>Loading programmes…</p>';
    return `<h2 class="pagehead">Programmes</h2>` + lib.programmes.map(p => `<button type="button" class="fxrow" data-fx="prog" data-id="${esc(p.id)}"><span><b>${esc(p.title)}</b><small>${p.weeks} weeks · ${esc(LEVEL_LABEL[p.level])} · ${esc(FOCUS_LABEL[p.focus])} · low impact${state.programmeId === p.id ? ' · current' : ''}</small></span></button>`).join('');
  }
  function programmeDetail() {
    const p = viewedProg(); if (!p || !lib) return '<p>Choose a programme.</p>';
    const active = state.programmeId === p.id;
    const slot = active ? nextSlot(p, state.programmeDone || 0) : null;
    const days = programmeSlots(p).map(s => {
      const w = s.workoutId ? workoutById(lib, s.workoutId) : null;
      const here = slot && slot.week === s.week && slot.day === s.day;
      const label = s.rest ? 'Rest' : `${w?.title || 'Session'} · ${w?.minutes || ''} min`;
      return `<div class="${s.rest ? 'fxrest' : 'fxrow'}" ${here ? 'style="outline:2px solid #5b2a86"' : ''}><span><b>${WEEKDAYS[s.weekday - 1]}</b> · week ${s.week}<small>${esc(label)}${here ? ' · next' : ''}</small></span></div>`;
    }).join('');
    return `<h2 class="pagehead">${esc(p.title)}</h2><p>${esc(p.blurb)}</p><p class="small muted">${esc(feedbackNote(active ? state.bias || 0 : 0))}</p>
      ${active ? '' : `<button type="button" class="primary" data-fx="useprog" data-id="${esc(p.id)}">Use this programme</button>`}
      ${active && slot ? `<button type="button" class="primary" data-fx="start" data-id="${esc(slot.workoutId)}">Start next session</button>` : active ? '<p>You have finished this programme.</p>' : ''}
      <h3>How did the last session feel?</h3><div class="fxchips"><button type="button" data-fx="feel" data-id="too-easy">Too easy</button><button type="button" data-fx="feel" data-id="just-right">Just right</button><button type="button" data-fx="feel" data-id="too-hard">Too hard</button></div>
      <div class="fxweek">${days}</div><p class="small muted">${esc(lib.safety)}</p>`;
  }
  function planner() {
    if (!lib) return '<p>Loading the planner…</p>';
    const p = activeProg();
    const queue = p ? upcomingQueue(p, state.programmeDone || 0) : sortWorkouts(lib.workouts).map(w => w.id);
    const days = planWeek({ weekStart: mondayOf(londonToday()), trainingDays: state.trainingDays || [], queue });
    return `<h2 class="pagehead">Planner</h2><p class="small muted">Pick the days you want to train. The next ${p ? esc(p.title) : 'low-impact'} sessions land on those days. Other days stay as rest.</p>
      <div class="fxchips">${WEEKDAYS.map((name, i) => chip((state.trainingDays || []).includes(i + 1), 'day', String(i + 1), name.slice(0, 3))).join('')}</div>
      <h3>This week</h3>
      ${days.map(d => { const w = d.workoutId ? workoutById(lib, d.workoutId) : null; return d.rest ? `<div class="fxrest"><b>${WEEKDAYS[d.weekday - 1]}</b><small>Rest · ${esc(d.date)}</small></div>` : `<button type="button" class="fxrow" data-fx="start" data-id="${esc(d.workoutId)}"><span><b>${WEEKDAYS[d.weekday - 1]} · ${esc(w?.title || 'Session')}</b><small>${esc(d.date)} · ${w?.minutes || ''} min · low impact</small></span></button>`; }).join('')}`;
  }
  function trophies() {
    const sum = summariseActivity(state.history || [], new Date(), state.birthday || '');
    const bday = state.birthday ? `${state.birthday.slice(3)}/${state.birthday.slice(0, 2)}` : '';
    return `<h2 class="pagehead">Trophies</h2><div class="fxgrid"><div><b>${sum.weekly}</b><small>week streak</small></div><div><b>${sum.monthly}</b><small>month streak</small></div><div><b>${sum.count}</b><small>workouts</small></div></div>
      <h3>Milestones</h3><div class="fxchips">${sum.milestones.map(m => `<span class="fxbadge${m.unlocked ? '' : ' off'}">${esc(m.title)}</span>`).join('')}</div>
      <h3>Badges</h3>${sum.badges.map(b => `<div class="fxbadge${b.unlocked ? '' : ' off'}" style="text-align:left;margin:6px 0"><b>${esc(b.title)}</b>${b.unlocked ? '<span class="fxsample">Unlocked</span>' : ''}<small class="muted"> ${esc(b.detail)}</small></div>`).join('')}
      <label>Birthday for the badge <input id="fxBday" inputmode="numeric" placeholder="DD/MM" value="${esc(bday)}" aria-label="Birthday day and month"></label><p class="small muted">Day and month only, stored on this phone. ${state.demo ? 'The sample birthday is today so the badge can be seen.' : ''}</p>
      <h3>Activity</h3>${sum.history.length ? sum.history.map(h => `<div class="fxrow"><span><b>${esc(h.title)}</b>${h.demo ? '<span class="fxsample">Sample</span>' : ''}<small>${esc(formatLondon(h.at))} · ${esc(activityLine(h))}</small></span></div>`).join('') : '<p class="small muted">Finished sessions show here. Calories are an estimate.</p>'}
      <p class="small muted">A week counts when it has at least one workout. The streak stays through the current week until that week ends. Calories use MET × 3.5 × kg / 200 per minute and are an estimate, not a measurement.</p>`;
  }
  function tipList() {
    if (!lib) return '<p>Loading tips…</p>';
    return `<h2 class="pagehead">Expert tips</h2><p class="small muted">Short notes on recovery, sleep, mindset and eating. Not medical advice, and nothing here is about doses or where to obtain medication.</p>` + lib.tips.map(t => `<button type="button" class="fxrow" data-fx="tip" data-id="${esc(t.id)}"><span><b>${esc(t.title)}</b><small>${t.minutes} min read · ${esc(t.topic)}</small></span></button>`).join('');
  }
  function article() {
    const t = lib?.tips?.find(x => x.id === tipId); if (!t) return '<p>Choose a tip.</p>';
    return `<h2 class="pagehead">${esc(t.title)}</h2><div class="fxarticle">${t.body.split(/\n\n/).map(p => `<p>${esc(p)}</p>`).join('')}</div>`;
  }
  function health() {
    const on = !!opts.healthWriteEnabled?.();
    const last = (state.history || []).slice().sort((a, b) => new Date(b.at) - new Date(a.at))[0];
    return `<h2 class="pagehead">Connected</h2><div class="fxcard" id="fitHealth"><h3>Health Connect</h3><p>Steps: the Android app can read today's step total. On the web, enter steps from Home. GLP1 Life does not read other Health Connect types.</p><p><b>Write workouts: ${on ? 'On' : 'Off'}</b></p><p class="small">Writing stays off until <code>healthConnectWrite</code> is set and a new Android build keeps the calorie write permission. The health plugin in this app can store a calorie sample. It cannot insert a full exercise session unless the plugin adds that method. Setup is in the fitness studio note. Nothing is sent to Health Connect while this is off.</p>${on && last ? `<button type="button" class="primary" data-fx="writehc">Write the last workout</button>` : ''}</div>
      <h3>Log a workout by hand</h3><form id="fxManual" class="fxcard"><label>What you did<input name="title" required maxlength="80"></label><label>Minutes<input name="minutes" type="number" min="1" max="180" required></label><button class="primary" type="submit">Save on this phone</button><p class="small muted">Calories are an estimate from a standard formula, using 3.5 MET when you type the session yourself.</p></form>
      <div class="fxcard"><h3>Music</h3><p>${esc(MUSIC_NOTE)}</p></div>`;
  }

  function logEntry(entry) {
    const row = { id: 'fit-' + Date.now(), at: new Date().toISOString(), demo: !!state.demo, estimate: true, programmeId: state.programmeId, ...entry };
    state.history = [...(state.history || []), row];
    const slot = nextSlot(activeProg(), state.programmeDone || 0);
    if (slot && entry.workoutId && slot.workoutId === entry.workoutId) state.programmeDone = (state.programmeDone || 0) + 1;
    save(); render();
    return row;
  }
  function startWorkout(id, { preview = false } = {}) {
    const w = workoutById(lib, id);
    if (!w) return;
    if (w.kind === 'video') { opts.openVideo?.(w.videoId); return; }
    player = preview ? previewPlayer(w, state.bias || 0) : createPlayer(w, { bias: state.bias || 0 });
    openOverlay();
    if (!preview) armTimer();
  }
  function openOverlay() {
    closeOverlay(false);
    overlay = document.createElement('div'); overlay.id = 'fitPlayer'; overlay.className = 'fxplayer'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
    document.body.append(overlay);
    overlay.onclick = e => {
      const b = e.target.closest('[data-px]'); if (!b) return; const k = b.dataset.px;
      if (k === 'close') return closeOverlay(true);
      if (k === 'pause') { togglePause(player); if (player.paused) clearInterval(timer); else armTimer(); paint(); return; }
      if (k === 'next') { const r = skipSegment(player); if (opts.beeps?.() !== false) beep(); paint(); return r; }
      if (k === 'easier') { useEasier(player); paint(); return; }
      if (k === 'wake') { const input = b.querySelector('input') || b; state.keepAwake = !!input.checked; save(); setWake(state.keepAwake); return; }
      if (k === 'feel') { state = applyFeedback(state, b.dataset.id); save(); return; }
      if (k === 'save') { const row = completionFromPlayer(player, { kg: opts.weightKg?.() || 75, programmeId: state.programmeId, demo: !!state.demo }); logEntry(row); closeOverlay(false); opts.toast('Saved. ' + activityLine(row)); }
    };
    paint();
    if (state.keepAwake && !player.paused) setWake(true);
    try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume?.(); } catch {}
  }
  function paint() {
    if (!overlay || !player) return;
    const v = playerView(player);
    const seg = v.seg;
    overlay.innerHTML = `<div class="row between"><span class="fxphase">${esc(seg.phase)}</span><button type="button" data-px="close" aria-label="Close">Close</button></div>
      <div class="fxbar" aria-hidden="true"><i data-p="bar" style="width:${Math.round(v.progress * 100)}%"></i></div>
      <p class="small">Move ${v.index + 1} of ${v.count}${player.paused ? ' · Paused' : ''}</p>
      <h2 data-p="name">${esc(seg.using === 'easier' ? seg.swap : seg.name)}</h2>
      <p class="fxclock" data-p="clock">${esc(v.leftLabel)}</p>
      ${seg.reps ? `<p><b>${seg.reps} reps</b></p>` : ''}
      <p class="fxnote">${esc(seg.instruction || seg.tip)}</p>
      ${seg.phase !== 'rest' ? `<p class="small">Easier: ${esc(seg.swap)}</p><p class="small">Stronger: ${esc(seg.harder || '')}</p>` : ''}
      ${v.next ? `<p class="small">Next: ${esc(v.next.name)}</p>` : ''}
      <p class="small">Stop if anything hurts, you feel dizzy, or you feel unwell.</p>
      ${v.done ? `<h3>Well done</h3><p>${esc(activityLine(completionFromPlayer(player, { kg: opts.weightKg?.() || 75 })))}</p><div class="fxchips"><button type="button" data-px="feel" data-id="too-easy">Too easy</button><button type="button" data-px="feel" data-id="just-right">Just right</button><button type="button" data-px="feel" data-id="too-hard">Too hard</button></div><button type="button" class="primary" data-px="save">Save workout</button>` : `<div class="row"><button type="button" class="primary" data-px="next">${esc(v.primary)}</button><button type="button" data-px="pause">${esc(v.pauseLabel)}</button></div>${seg.phase !== 'rest' ? '<button type="button" data-px="easier">Use easier option</button>' : ''}`}
      <label class="check" data-px="wake"><input type="checkbox" ${state.keepAwake ? 'checked' : ''}> Keep the screen awake</label>
      <p class="small">${esc(MUSIC_NOTE)}</p>`;
  }
  function armTimer() {
    clearInterval(timer); let last = performance.now();
    timer = setInterval(() => {
      if (!player || player.paused || player.done) return;
      const now = performance.now(); const dt = Math.min(1.2, (now - last) / 1000) * (opts.speed || 1); last = now;
      const r = tickPlayer(player, dt); if (r.beep && opts.beeps?.() !== false) beep(); paint();
    }, 250);
  }
  function beep() { try { playCue(audioCtx); } catch {} }
  async function setWake(on) {
    try { if (on && navigator.wakeLock?.request) wake = await navigator.wakeLock.request('screen'); else if (wake) { await wake.release(); wake = null; } } catch { wake = null; }
  }
  function closeOverlay(discard) {
    clearInterval(timer); timer = null; setWake(false); overlay?.remove(); overlay = null; if (discard) player = null;
  }
  async function sendChat(session, text) {
    const verdict = classifyChat(text);
    if (verdict.action !== 'ok') { opts.toast(verdict.message); render(); return; }
    (state.chat[session.id] ||= []).push({ id: 'local-' + Date.now(), author: 'You', body: text.trim(), at: new Date().toISOString(), demo: !!state.demo });
    save();
    if (!state.demo && opts.cloudUser?.()) {
      try { await opts.rpc('fitness_chat_post', { p_session: session.id, p_body: text.trim() }); }
      catch { opts.toast('Saved on this phone. Class chat is not on the server yet.'); }
    }
    render();
  }
  async function remind(id) {
    const session = sessions().find(s => s.id === id); if (!session) return;
    const plan = reminderPlan(session);
    if (!state.reminders.some(r => r.sessionId === id)) state.reminders.push({ ...plan, webPush: pushAvailability(opts.vapidPublicKey?.() || '').reason });
    save();
    let how = 'Reminder saved on this phone.';
    const when = new Date(plan.at).getTime() - Date.now();
    const LN = window.Capacitor?.Plugins?.LocalNotifications;
    try {
      if (LN?.schedule && when > 5000) {
        await LN.requestPermissions?.();
        await LN.schedule({ notifications: [{ id: [...id].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 7) % 100000 + 1, title: plan.title, body: plan.body, schedule: { at: new Date(plan.at) } }] });
        how = 'Phone reminder set for 10 minutes before the class.';
      } else if (typeof Notification !== 'undefined') {
        const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
        if (perm === 'granted') { if (when > 5000) setTimeout(() => { try { new Notification(plan.title, { body: plan.body }); } catch {} }, when); else try { new Notification(plan.title, { body: plan.body }); } catch {} how = 'Reminder saved. This browser can alert you while GLP1 Life stays open.'; }
      }
    } catch { how = 'Reminder saved in the app.'; }
    if (!pushAvailability(opts.vapidPublicKey?.() || '').ok) how += ' Web push is not configured.';
    opts.toast(how); render();
  }

  hub.onclick = e => {
    const b = e.target.closest('[data-fx]'); if (!b || !hub.contains(b)) return;
    const fx = b.dataset.fx, id = b.dataset.id || '';
    if (fx === 'goto') { view = id; render(); return; }
    if (fx === 'join') { roomId = id; view = 'room'; render(); return; }
    if (fx === 'start') return startWorkout(id);
    if (fx === 'remind') return remind(id);
    if (fx === 'replay') return opts.openVideo?.(id);
    if (fx === 'prog') { progId = id; view = 'programme'; render(); return; }
    if (fx === 'useprog') { state.programmeId = id; state.programmeDone = 0; state.bias = 0; progId = id; save(); render(); return; }
    if (fx === 'feel') { state = applyFeedback(state, id); save(); opts.toast(feedbackNote(state.bias)); render(); return; }
    if (fx === 'day') { const n = +id; const set = new Set(state.trainingDays || []); set.has(n) ? set.delete(n) : set.add(n); state.trainingDays = [...set].sort(); save(); render(); return; }
    if (fx === 'range') { state.filters.minMinutes = +b.dataset.min; state.filters.maxMinutes = +b.dataset.max; save(); render(); return; }
    if (fx === 'filter') { state.filters[b.dataset.kind] = id; save(); render(); return; }
    if (fx === 'tip') { tipId = id; view = 'tip'; render(); return; }
    if (fx === 'writehc') return writeLast();
  };
  async function writeLast() {
    const last = (state.history || []).slice().sort((a, b) => new Date(b.at) - new Date(a.at))[0]; if (!last) return;
    const end = new Date(last.at), start = new Date(end.getTime() - last.minutes * 60000);
    try { const r = await writeWorkoutSample({ title: last.title, kcal: last.kcal, minutes: last.minutes, start: start.toISOString(), end: end.toISOString() }, { enabled: !!opts.healthWriteEnabled?.() }); opts.toast(r.message || (r.ok ? 'Sent to Health Connect.' : 'Not written.')); }
    catch (e) { opts.toast(e.message || 'Health Connect did not accept the workout.'); }
  }
  function paintCountdown() { hub.querySelectorAll('[data-fxcount]').forEach(el => { el.textContent = countdown(el.dataset.fxcount).label; }); }

  const api = {
    get ready() { return booted; },
    show(v, id) { view = v || 'home'; if (v === 'room') roomId = id || roomId; if (v === 'programme') progId = id || state.programmeId; if (v === 'tip') tipId = id; render(); },
    openPreview(id) { const w = workoutById(lib, id || 'gentle-start-8'); if (w) { player = previewPlayer(w, state.bias || 0); openOverlay(); } },
    closePlayer() { closeOverlay(true); player = null; },
    setFilters(f) { state.filters = { ...state.filters, ...f }; view = 'browse'; save(); render(); },
    noteVideo(v) { if (!v || state.history.some(h => h.videoId === v.id && Date.now() - new Date(h.at).getTime() < 5000)) return; logEntry({ title: v.title, minutes: v.mins, kcal: kcalEstimate(3.5, opts.weightKg?.() || 75, v.mins), workoutId: 'video-' + v.id, videoId: v.id, source: 'video' }); },
    state: () => state,
  };
  (window.__kova ||= {}).fitness = api;
  setInterval(paintCountdown, 1000);
  (async () => {
    try { const r = await fetch('fitness-library.json?v=' + Date.now(), { cache: 'no-store' }); if (r.ok) lib = await r.json(); } catch {}
    booted = true; render();
  })();
  render();
  return api;
}
