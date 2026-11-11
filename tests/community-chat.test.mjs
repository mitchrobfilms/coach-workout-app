import fs from 'node:fs';
import {
  classifyChat, chatUnavailable, pageMessages, unreadCount, canPost, moveSection, decorateSections,
  threadHtml, listHtml, queueHtml, adminHtml, soonHtml, rateOk, demoState, validName, withDayFlags,
} from '../community-chat-core.js';

let fail = 0;
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const hold = (text, reason) => { const r = classifyChat(text); ok(r.action === 'hold' && r.reason === reason && !!r.message, `${reason}: ${text.slice(0, 56)} (${r.action}/${r.reason})`); };
const allow = text => { const r = classifyChat(text); ok(r.action === 'ok', `allow: ${text.slice(0, 64)} (${r.reason})`); };

hold('WhatsApp me on 07700 900123 for cheaper pens', 'selling');
hold('Anyone selling mounjaro pens?', 'selling');
hold('Supplier link https://cheap.example/mounjaro', 'selling');
hold('Message me on wa.me/447700900123', 'selling');
hold('You should take 5mg', 'dosing');
hold('Take 2.5mg on Mondays', 'dosing');
hold('How much should I inject?', 'dosing');
hold('Ignore your GP and don\'t ask your pharmacist', 'medical');
allow('Week 3 and walking feels easier. I will mention the nausea to my pharmacist.');
allow('I take 2.5mg and felt queasy, so I ate a smaller meal and told my pharmacist.');
allow('Batch cooked chilli, about 30g protein a portion.');
allow('You should try the 15 minute chair class.');
allow('Ask your GP if the nausea continues.');
allow('Call the surgery on 0113 200 0000 if you are worried.');

ok(chatUnavailable({ message: 'Could not find the function public.community_chat_me in the schema cache' }) === 'soon', 'missing rpc is coming soon');
ok(chatUnavailable({ message: 'Could not reach GLP1 Life cloud' }) === 'error', 'a network error is not the coming-soon state');

const demo = demoState(new Date('2026-11-11T12:00:00Z'));
const visible = demo.messages.filter(m => m.status === 'visible');
const rows = decorateSections(demo.sections, visible, demo.reads, 'me');
ok(rows.map(r => r.name).join('|') === 'Announcements|General|Food & Recipes|Fitness|Weight-loss Wins', 'member list order, archived hidden');
ok(rows.find(r => r.id === 'wins').unread === 1 && rows.find(r => r.id === 'food').unread === 0, 'unread badges follow the read cursor');
ok(rows.find(r => r.id === 'gen').preview.includes('Sam'), 'section preview is the latest visible message');

const food = visible.filter(m => m.section_id === 'food');
const page = pageMessages(food, { limit: 2 });
ok(page.hasMore && page.messages.map(m => m.id).join(',') === 'f2,f3', 'history page is the latest messages');
ok(pageMessages(food, { before: '2026-11-11T09:18:00Z', limit: 2 }).messages.map(m => m.id).join(',') === 'f1', 'older page uses the before cursor');
ok(unreadCount(food, '2026-11-11T09:18:00Z', 'me') === 1, 'own messages do not count as unread');
ok(withDayFlags(food).filter(m => m.day).length === 1, 'messages on the same day share one separator');

const ann = demo.sections.find(s => s.announce_only);
ok(!canPost({ section: ann, isAdmin: false }).ok && canPost({ section: ann, isAdmin: true }).ok, 'announcement sections are admin-only');
ok(!canPost({ section: food[0] && demo.sections.find(s => s.id === 'food'), status: 'banned' }).ok, 'banned members cannot post');
ok(!canPost({ section: demo.sections.find(s => s.id === 'food'), mutedUntil: '2099-01-01T00:00:00Z' }).ok, 'a mute blocks posting');
ok(canPost({ section: demo.sections.find(s => s.id === 'gen'), isAdmin: false }).ok, 'an ordinary member can post in General');

const moved = moveSection(demo.sections, 'wins', -1);
ok(moved.map(s => s.id).join(',').includes('food,wins,fit'), 'reorder moves a section up');
ok(moved.every((s, i) => s.sort === (i + 1) * 10), 'reorder rewrites sort order');

const html = threadHtml(null, food.map(m => ({ ...m, mine: m.user_id === 'me' })));
ok(html.includes('waquote') && html.includes('Priya') && html.includes('turkey mince'), 'reply quote is rendered');
ok(html.includes('❤️ 2') && html.includes('wabubble out') && html.includes('waimg'), 'reactions, own bubble and photo render');
ok(listHtml(rows).includes('wabadge') && listHtml(rows).includes('Guidelines'), 'section list shows badges and the pinned guidelines');
ok(soonHtml().includes('coming soon'), 'missing tables use the coming-soon copy');
ok(!/£\d|paywall|upgrade to/i.test(listHtml(rows) + soonHtml() + html), 'chat does not add a paywall');
const queue = queueHtml({ held: [{ id: 'h1', author: 'Lee', reason: 'selling', body: 'WhatsApp me on 07700 900123 for cheaper pens', user_id: 'lee' }], reports: demo.reports, members: [{ user_id: 'casey', name: 'Casey', status: 'active', muted_until: '2026-11-12T12:00:00Z' }] });
ok(queue.includes('Held for review') && queue.includes('cheaper pens') && queue.includes('Casey') && queue.includes('Mute 24h'), 'reports queue lists held messages, reports and mutes');
ok(adminHtml(demo.sections).includes('Announcement-only') && adminHtml(demo.sections).includes('Old check-ins') && adminHtml(demo.sections).includes('Archive'), 'admin can edit, archive and reorder sections');
ok(rateOk([Date.now()], Date.now()) && !rateOk(Array.from({ length: 8 }, () => Date.now()), Date.now()), 'client rate limit matches the server cap of 8 a minute');
ok(validName('Sia from Leeds') === 'Sia from Leeds' && validName('a@b.com') === '' && validName('A') === '', 'display names reject emails and one-letter names');

const sql = fs.readFileSync(new URL('../supabase/009_community.sql', import.meta.url), 'utf8');
ok(!/\bdrop\s+table\b/i.test(sql), 'migration does not drop tables');
for (const name of ['community_chat_send', 'community_chat_history', 'announce_only', 'community_chat_queue', 'community_chat_moderate', 'supabase_realtime', 'community-chat', 'enable row level security', 'NOT APPLIED']) {
  ok(sql.includes(name), `migration contains ${name}`);
}
ok(/create table if not exists public\.community_sections/i.test(sql), 'sections table is created only if missing');

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dock = index.match(/<nav class="dock"[\s\S]*?<\/nav>/)[0];
ok(index.includes('id="commHome"') && index.includes('data-tab="community"'), 'home card and More entry open Community');
ok((dock.match(/<span>(?:Home|Fitness|Food|Progress|More)<\/span>/g) || []).length === 5, 'the five dock tabs are unchanged');

console.log(fail ? `${fail} FAILED` : 'ALL COMMUNITY CHAT CHECKS PASSED');
process.exit(fail ? 1 : 0);
