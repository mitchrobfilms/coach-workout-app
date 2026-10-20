// Live Supabase test of the community backend: guidelines gate, filter (allow experience / block mixing+selling+dose advice /
// hold borderline), auto-suspend, reactions, comments, report, block, buddies, challenges, admin queue. Always cleans up.
import { SB_URL, SB_KEY } from '../cloud.js';
import { sql, cleanupTestData } from './cleanup.mjs';
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const PW = 'Test-' + Math.random().toString(36).slice(2) + '!9', stamp = Date.now();
const signup = async e => (await fetch(SB_URL + '/auth/v1/signup', { method: 'POST', headers: { apikey: SB_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email: e, password: PW }) })).json();
const rpc = (tok) => async (f, b = {}) => { const r = await fetch(`${SB_URL}/rest/v1/rpc/${f}`, { method: 'POST', headers: { apikey: SB_KEY, authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: JSON.stringify(b) }); const t = await r.text(); const j = t ? JSON.parse(t) : null; if (!r.ok) throw new Error(j?.message || r.status); return j; };
process.on('uncaughtException', async e => { console.error(e); await cleanupTestData({ quiet: true }); process.exit(1); });
try {
  const [a, b, c, ad] = await Promise.all(['a', 'b', 'c', 'ad'].map(x => signup(`glp1life.test.cm${x}${stamp}@example.com`)));
  ok(a.access_token && b.access_token && c.access_token && ad.access_token, 'throwaway users');
  const A = rpc(a.access_token), B = rpc(b.access_token), C = rpc(c.access_token), AD = rpc(ad.access_token);
  let err = ''; try { await A('community_post', { p_body: 'hello' }); } catch (e) { err = e.message; } ok(/guidelines/i.test(err), 'cannot post before accepting guidelines: ' + err);
  err = ''; try { await A('community_join', { p_name: 'me@example.com' }); } catch (e) { err = e.message; } ok(err, 'email rejected as display name');
  await A('community_join', { p_name: `Test A ${stamp % 1e4}` }); await B('community_join', { p_name: `Test B ${stamp % 1e4}` }); await C('community_join', { p_name: `Test C ${stamp % 1e4}` });
  ok((await A('community_me')).guidelines, 'joined');
  const allow = ["I'm on my prescribed 5mg dose and felt a bit sick on day 2", 'Week 3 on Mounjaro, appetite is way down and energy is better!'];
  for (const t of allow) { const v = await A('community_post', { p_body: t }); ok(v.action === 'ok', `allowed: "${t}"`); }
  for (const t of ['How do I reconstitute my vial with bac water?', 'Anyone selling pens? DM me', 'You should take 2.5mg to start']) { const v = await B('community_post', { p_body: t }); ok(v.action === 'block' && /prescriber/i.test(v.message), `blocked: "${t}" → ${v.reason}`); }
  const me = await B('community_me'); ok(me.status === 'suspended', 'B auto-suspended after 3 blocked attempts: ' + me.status);
  err = ''; try { const v = await B('community_post', { p_body: 'nice day' }); err = v.suspended ? 'suspended' : ''; } catch (e) { err = e.message; } ok(/suspend/i.test(err), 'suspended member cannot post');
  const h = await C('community_post', { p_body: 'I take 15 units on Mondays, is that normal?' }); ok(h.action === 'hold', 'borderline dose mention held: ' + h.action);
  const feedA = await A('community_feed', {}); ok(!feedA.some(p => p.id === h.id), 'held post hidden from others');
  ok((await C('community_feed', {})).some(p => p.id === h.id && p.status === 'held'), 'held post visible to its author');
  const pa = feedA.find(p => /prescribed 5mg/.test(p.body)); ok(pa?.dose_topic, 'dose thread flagged for banner');
  await C('community_react', { p_post: pa.id, p_emoji: '👏' }); const cm = await C('community_comment', { p_post: pa.id, p_body: 'Same here, it settles after a week 💜' }); ok(cm.action === 'ok', 'comment ok');
  const cb = await C('community_comment', { p_post: pa.id, p_body: 'just up it to 10mg' }); ok(cb.action === 'block', 'dose advice in comment blocked');
  const pa2 = (await A('community_feed', {})).find(p => p.id === pa.id); ok(pa2.reactions['👏'] === 1 && pa2.comments.length === 1, 'reaction + comment counted');
  await A('community_report', { p_post: pa.id, p_reason: 'test report' });
  await A('community_block', { p_user: c.user.id, p_on: true }); ok(!(await A('community_feed', {})).find(p => p.id === pa.id).comments.length, 'blocked member\'s comments hidden');
  await A('community_block', { p_user: c.user.id, p_on: false });
  await A('community_buddy_request', { p_name: `Test C ${stamp % 1e4}` }); const inc = (await C('community_buddies_list')).find(x => x.incoming); ok(inc, 'buddy request received');
  await C('community_buddy_answer', { p_id: inc.id, p_accept: true }); const ck = await A('community_checkin', { p_buddy: inc.id, p_body: 'Walked 20 min today', p_mood: '🙂' }); ok(ck.action === 'ok', 'buddy check-in');
  ok((await C('community_buddies_list'))[0].checkins.length === 1, 'buddy sees check-in');
  const ch = (await A('community_challenges_list'))[0]; await A('community_challenge_join', { p_id: ch.id }); await A('community_challenge_progress', { p_id: ch.id, p_value: 3 });
  const lb = (await C('community_challenges_list')).find(x => x.id === ch.id).leaderboard; ok(lb.some(l => l.progress == 3) && !JSON.stringify(lb).match(/kg|weight|@/i), 'leaderboard shows progress only, no weights/emails');
  err = ''; try { await A('community_mod_queue'); } catch (e) { err = e.message; } ok(/admin/.test(err), 'non-admin cannot read mod queue');
  await sql(`insert into public.admins (user_id) values ('${ad.user.id}')`);
  const q = await AD('community_mod_queue'); ok(q.held.some(x => x.id === h.id), 'held post in admin queue'); ok(q.reports.length >= 1, 'report in admin queue'); ok(q.blocked.length >= 4, 'blocked attempts logged'); ok(q.suspended.some(u => u.user_id === b.user.id), 'suspended member listed');
  await AD('community_mod', { p_kind: 'post', p_id: h.id, p_action: 'approve' }); ok((await A('community_feed', {})).some(p => p.id === h.id), 'approved post now visible');
  await AD('community_mod', { p_kind: 'user', p_id: b.user.id, p_action: 'restore' }); ok((await B('community_me')).status === 'active', 'admin restored member');
  await AD('community_add_group', { p_name: `Test Group ${stamp}` }); ok((await AD('community_mod_queue')).groups.some(g => g.name === `Test Group ${stamp}`), 'admin added group');
  const anon = await fetch(`${SB_URL}/rest/v1/community_posts?select=body&limit=1`, { headers: { apikey: SB_KEY } }); ok(!(await anon.json()).length, 'anon cannot read posts');
  const tr = await fetch(`${SB_URL}/rest/v1/trainers?select=name&limit=1`, { headers: { apikey: SB_KEY } }); ok(tr.ok, 'anon trainer listing still works');
} catch (e) { console.error(e); fails++; } finally { await cleanupTestData(); }
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
