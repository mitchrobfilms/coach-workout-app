import fs from 'node:fs';
import {
  validateLibrary, demoBundle, summariseActivity, resolveStream, londonToUtc, formatLondon, countdown, sessionPhase,
  filterWorkouts, catalogue, sortWorkouts, createPlayer, tickPlayer, skipSegment, applyFeedback, resolveSegments,
  planWeek, upcomingQueue, classifyChat, kcalEstimate, activityLine, cueSpec, playCue, healthWritePlan, pushAvailability,
  reminderPlan, previewPlayer, playerView, useEasier, REQUIRED_SECRETS, DEMO_NOTICE, MILESTONES, programmeSlots,
} from '../fitness-core.js';

let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log(c ? 'ok  ' : 'FAIL', m); };
const lib = JSON.parse(fs.readFileSync(new URL('../fitness-library.json', import.meta.url), 'utf8'));
const videos = JSON.parse(fs.readFileSync(new URL('../library-videos.json', import.meta.url), 'utf8'));
const sql = fs.readFileSync(new URL('../supabase/013_fitness_studio.sql', import.meta.url), 'utf8');
const problems = validateLibrary(lib, { videoIds: new Set(videos.videos.map(v => v.id)) });
ok(problems.length === 0, 'library valid: ' + problems.join('; '));
ok(lib.workouts.length >= 12 && lib.workouts.every(w => w.intensity === 'low' && w.minutes >= 5 && w.minutes <= 50), 'low-impact plans from 5 to 50 minutes');
ok(lib.workouts.some(w => w.level === 'beginner') && lib.workouts.some(w => w.level === 'advanced') && lib.workouts.some(w => w.equipment === 'basic') && lib.workouts.some(w => w.equipment === 'none'), 'beginner through advanced, none and basic equipment');
ok(['start-up', 'lean-strong', 'fat-burn', 'core-builder'].every(id => lib.programmes.some(p => p.id === id && p.weeks >= 4 && p.weeks <= 6)), 'four programmes, 4–6 weeks');
ok(lib.programmes.find(p => p.id === 'lean-strong').weeks === 6 && lib.programmes.find(p => p.id === 'start-up').title === 'Start-Up', 'Start-Up and six-week Lean & Strong');
ok(lib.tips.length >= 6 && lib.tips.every(t => /GP/.test(t.body)) && !lib.tips.some(t => /\b(mg|peptide|reconstitut|supplier)\b/i.test(t.body)), 'tips mention a GP and do not discuss doses or sourcing');
ok(!/nike|swoosh/i.test(JSON.stringify(lib)), 'no borrowed training-brand names');
ok(lib.videos.map(v => v.videoId).join() === 'ai-walk-15,ai-seated-10,ai-fullbody-15', 'Coach Ava videos reused as video workouts');

const ordered = sortWorkouts(catalogue(lib));
ok(ordered[0].level === 'beginner' && ordered[0].intensity === 'low', 'low impact and beginner sort first');
const narrow = filterWorkouts(catalogue(lib), { minMinutes: 10, maxMinutes: 20, level: 'beginner', equipment: 'none', intensity: 'low', focus: 'cardio' });
ok(narrow.every(w => w.minutes >= 10 && w.minutes <= 20 && w.level === 'beginner' && w.focus === 'cardio' && w.equipment === 'none'), 'filters: duration, level, focus, equipment, intensity');
ok(filterWorkouts(catalogue(lib), { q: 'chair' }).some(w => /chair/i.test(w.title)), 'search matches a chair session');

const now = new Date('2026-11-12T12:00:00.000Z');
const demo = demoBundle(now);
ok(demo.demo && demo.notice === DEMO_NOTICE && demo.sessions.every(s => s.demo && s.coach === 'Demo Coach') && demo.history.every(h => h.demo), 'demo data is marked as a sample');
ok(demo.sessions.find(s => s.id === 'demo-live') && sessionPhase(demo.sessions.find(s => s.id === 'demo-live'), now) === 'live', 'sample class is live relative to the preview clock');
ok(countdown(demo.sessions.find(s => s.id === 'demo-next').startsAt, now).label === '02:05', 'countdown is 02:05');
ok(/Nov/.test(formatLondon(demo.sessions.find(s => s.id === 'demo-next').startsAt)) && formatLondon('2026-06-15T17:30:00.000Z').includes('18:30'), 'times render in Europe/London, including British Summer Time');
ok(londonToUtc('2026-06-15T18:30') === '2026-06-15T17:30:00.000Z' && londonToUtc('2026-11-12T18:30') === '2026-11-12T18:30:00.000Z', 'UK wall time converts to UTC');
const sum = summariseActivity(demo.history, now, demo.birthday);
ok(sum.weekly >= 3 && sum.monthly >= 2 && sum.count === 7, 'sample week and month streaks: ' + sum.weekly + ' / ' + sum.monthly + ' / ' + sum.count);
ok(sum.milestones.filter(m => m.unlocked).map(m => m.n).join() === '1,5' && MILESTONES.join() === '1,5,10,25,50,100', 'milestones 1 and 5 unlocked, 10 still locked');
ok(sum.badges.every(b => b.unlocked) && sum.badges.map(b => b.id).join() === 'new-year,halloween,birthday', 'New Year, Halloween and birthday badges');
ok(activityLine(sum.history[0]).includes('kcal estimate') && sum.history.every(h => h.estimate), 'activity calories are labelled as an estimate');
ok(kcalEstimate(3, 75, 10) === 39, 'kcal estimate uses MET × 3.5 × kg / 200');

const startup = lib.programmes.find(p => p.id === 'start-up');
ok(programmeSlots(startup).length === 28 && programmeSlots(startup).some(s => s.rest), 'Start-Up is day by day and includes rest days');
let feel = applyFeedback({ bias: 0 }, 'too-hard');
ok(feel.bias === -1 && applyFeedback(feel, 'too-easy').bias === 0 && applyFeedback({ bias: 0 }, 'just-right').bias === 0, 'feedback moves the next session easier or back to the written plan');
const gentle = lib.workouts.find(w => w.id === 'gentle-start-8');
const eased = resolveSegments(gentle, -1);
ok(eased.find(s => s.phase === 'work').using === 'easier' && eased.find(s => s.phase === 'work').instruction === eased.find(s => s.phase === 'work').swap, 'too hard uses the easier swap next time');
ok(eased.find(s => s.phase === 'rest').seconds === gentle.segments.find(s => s.phase === 'rest').seconds + 10, 'too hard adds rest');
const days = planWeek({ weekStart: '2026-11-12', trainingDays: [1, 3, 5], queue: upcomingQueue(startup, 0) });
ok(days.length === 7 && days.filter(d => !d.rest).map(d => d.weekday).join() === '1,3,5' && days[0].workoutId === 'gentle-start-8' && days[1].rest, 'planner puts the next sessions on the chosen days and rests the others');

const player = createPlayer(gentle);
ok(playerView(player).phase === 'warmup' && playerView(player).primary === 'Done / next', 'player starts on the warm-up');
skipSegment(player);
const mid = playerView(player);
ok(mid.phase === 'work' && (mid.seg.reps || mid.seg.name), 'next segment is a move with a name');
useEasier(player);
ok(player.segments[player.index].using === 'easier', 'easier option can be chosen mid-move');
let finished = false; for (let i = 0; i < 8000 && !finished; i++) finished = tickPlayer(player, 1).finished;
ok(finished && player.done, 'player reaches the end of the session');
const preview = previewPlayer(gentle);
ok(preview.paused && playerView(preview).phase === 'work' && playerView(preview).progress > 0 && playerView(preview).progress < 1, 'preview opens mid-session and paused');
const cue = cueSpec();
ok(cue.ducksOtherAudio === false && cue.gain <= 0.1 && cue.seconds <= 0.2 && !/volume|duck/.test(playCue.toString()), 'beep does not turn other audio down');
const ctx = { currentTime: 0, createOscillator: () => ({ frequency: {}, connect() {}, start() {}, stop() {} }), createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }) };
ok(playCue(ctx) === true && playCue(null) === false, 'beep uses a supplied audio context only');

ok(resolveStream({ provider: 'bunny-live', bunnyStreamId: 'abc' }, {}).reason === 'coming-soon' && !resolveStream({ provider: 'none' }, {}).enabled, 'live video stays off until a library id exists');
ok(!/786067|iframe\.mediadelivery/.test(resolveStream({ provider: 'bunny-live' }, {}).message || ''), 'coming soon does not invent a Bunny library');
const hls = resolveStream({ provider: 'hls', hlsUrl: 'https://example.com/live/playlist.m3u8' }, {});
ok(hls.enabled && hls.kind === 'hls' && !resolveStream({ provider: 'hls', hlsUrl: 'http://example.com/a.m3u8' }, {}).enabled, 'only https HLS addresses play');
ok(resolveStream({ provider: 'bunny-live', bunnyStreamId: 'stream-1' }, { bunnyLiveLibraryId: '999' }).embedUrl.includes('/999/stream-1'), 'bunny embed is built only from the supplied ids');
ok(pushAvailability('').reason === 'vapid-not-configured' && reminderPlan(demo.sessions[0], now).local === true, 'web push is not configured; the reminder is still local');
ok(REQUIRED_SECRETS.map(s => s.name).join() === 'BUNNY_STREAM_API_KEY,BUNNY_LIVE_LIBRARY_ID,VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY,VAPID_SUBJECT', 'required secret names are documented in code');
ok(!REQUIRED_SECRETS.some(s => /BEGIN|sk_live|eyJ/.test(JSON.stringify(s))), 'secret list has names only');

ok(classifyChat('Taking the smaller steps today').action === 'ok', 'ordinary class chat is allowed');
ok(classifyChat('you should take 2.5 mg').reason === 'dosing', 'dosing advice is blocked');
ok(classifyChat('where can I buy retatrutide').reason === 'selling', 'sourcing is blocked');
ok(classifyChat('how do I reconstitute the vial').reason === 'mixing', 'mixing is blocked');
ok(healthWritePlan({ enabled: false, native: true, canSaveSample: true }).reason === 'flag-off', 'Health Connect write stays off');
ok(healthWritePlan({ enabled: true, native: false }).reason === 'web', 'web has no Health Connect write');
ok(healthWritePlan({ enabled: true, native: true, canSaveSample: true }).call === 'saveSample', 'the current plugin can store a calorie sample only');
ok(healthWritePlan({ enabled: true, native: true, canSaveWorkout: true, canSaveSample: true }).call === 'saveWorkout', 'a plugin with saveWorkout is preferred');

ok(sql.includes('enable row level security') && !/\bdrop table\b|\btruncate\b/i.test(sql), 'migration enables RLS and does not drop or truncate tables');
ok((sql.match(/delete from/gi) || []).length === 1 && /delete from public\.fitness_reminders where session_id = p_session and user_id = auth\.uid\(\)/.test(sql), 'the only delete turns off the signed-in member\'s own reminder');
ok(sql.includes('fitness_live_save') && sql.includes('is_admin()') && sql.includes('BUNNY_STREAM_API_KEY') && sql.includes('VAPID_PRIVATE_KEY'), 'migration documents admin writes and secret names');
ok(!/sk_live|eyJ|BEGIN PRIVATE/.test(sql), 'migration contains no secret values');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
ok(html.includes('id="fitHub"') && html.includes('id="videoLib"') && html.includes('id="fitCourse"') && html.includes('fitness.css'), 'Fitness tab keeps Coach Ava classes and the course banner');
const doc = fs.readFileSync(new URL('../docs/fitness-studio.md', import.meta.url), 'utf8');
ok(doc.includes('HEALTH_CONNECT_WRITE=1') && doc.includes('does not turn other audio down') && doc.includes('013'), 'setup note covers Health Connect, music and the migration number');

let wrote = false;
globalThis.window = { Capacitor: { isNativePlatform: () => true, Plugins: { Health: { async saveSample() { wrote = true; }, async requestAuthorization() {} } } } };
const { writeWorkoutSample } = await import('../health.js');
const off = await writeWorkoutSample({ title: 'Sample', kcal: 20, minutes: 10 }, { enabled: false });
ok(off.reason === 'flag-off' && wrote === false, 'Health Connect is not called while the flag is off');
const on = await writeWorkoutSample({ title: 'Sample', kcal: 20, minutes: 10 }, { enabled: true });
ok(on.call === 'saveSample' && wrote === true, 'with the flag on, the current plugin stores a calorie sample');

console.log(fail ? fail + ' FAILED' : 'ALL FITNESS CHECKS PASSED');
process.exit(fail ? 1 : 0);
