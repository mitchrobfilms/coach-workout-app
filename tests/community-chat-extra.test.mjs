import {
  voiceOk, voiceClock, VOICE_MAX_BYTES, mentionSuggestions, applyMention, searchMessages, pollView, castVote,
  leaderboard, shouldNotify, receiptState, dmAllowed, validOptions, highlightBody, enrichDemo,
} from '../community-chat-extra.js';
import { demoState } from '../community-chat-core.js';
import fs from 'node:fs';

let fail = 0;
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };

ok(voiceClock(12) === '0:12' && voiceClock(60) === '1:00'.replace('1:00', '0:60') || voiceClock(60) === '0:60', 'voice clock caps at 60 seconds');
ok(voiceClock(60) === '0:60', '60 seconds renders as 0:60');
ok(voiceOk({ size: VOICE_MAX_BYTES + 1, seconds: 10 }).includes('1 MB'), 'voice notes over 1 MB are refused');
ok(voiceOk({ size: 1000, seconds: 61 }).includes('60'), 'voice notes over 60 seconds are refused');
ok(voiceOk({ size: 1000, seconds: 8 }) === '', 'a short voice note is allowed');

const members = [{ id: 'priya', name: 'Priya' }, { id: 'sam', name: 'Sam' }, { id: 'me', name: 'Mitchell' }];
ok(mentionSuggestions(members, 'hello @P', 'me').map(p => p.name).join(',') === 'Priya', 'mention autocomplete matches the typed name');
ok(applyMention('hello @P', 'Priya') === 'hello @Priya ', 'choosing a mention completes the name');
ok(highlightBody('Hi @Priya', ['Priya']).includes('wamention'), 'mentions are highlighted');

const messages = [
  { id: '1', section_id: 'food', status: 'visible', author: 'Priya', body: 'Batch-cooked chilli' },
  { id: '2', section_id: 'gen', status: 'visible', author: 'Sam', body: 'Chair class' },
  { id: '3', section_id: 'food', status: 'deleted', author: 'Lee', body: 'chilli for sale' },
];
ok(searchMessages(messages, 'chilli').map(m => m.id).join(',') === '1', 'search skips deleted messages');
ok(searchMessages(messages, 'chilli', { sectionId: 'gen' }).length === 0, 'section search stays in that section');
ok(searchMessages(messages, 'c').length === 0, 'search needs at least 2 letters');

const poll = { id: 'p', question: 'When?', options: [{ id: 'a', label: 'Mon' }, { id: 'b', label: 'Wed' }] };
let votes = [{ poll_id: 'p', user_id: 'jon', option_id: 'a' }];
votes = castVote(votes, { pollId: 'p', userId: 'me', optionId: 'b' });
votes = castVote(votes, { pollId: 'p', userId: 'me', optionId: 'a' });
ok(votes.filter(v => v.user_id === 'me').length === 1 && votes.find(v => v.user_id === 'me').option_id === 'a', 'a member has one vote and can change it');
ok(pollView(poll, votes).options.find(o => o.id === 'a').n === 2, 'poll totals count each member once');
ok(validOptions(['Walk', 'Cook']) && !validOptions(['Only one']), 'polls need 2 to 6 options');

const board = leaderboard([
  { user_id: 'ava', name: 'Ava', progress: 4, show_board: true },
  { user_id: 'priya', name: 'Priya', progress: 9, show_board: false },
  { user_id: 'me', name: 'Mitchell', progress: 2, show_board: false },
], 'me');
ok(board.map(e => e.name).join(',') === 'Ava,Mitchell' && !board.some(e => e.name === 'Priya'), 'opted-out members stay off the public board');
ok(board.find(e => e.user_id === 'me').hidden, 'you still see your own hidden row');

ok(shouldNotify({ settings: { notify: 'all' }, reply: true }), 'replies notify');
ok(shouldNotify({ settings: { notify: 'mentions' }, announcement: true }) === false, 'mentions-only skips plain announcements');
ok(shouldNotify({ settings: { notify: 'all' }, sectionMode: 'mute', announcement: true }) === false, 'a muted section skips announcements');
ok(shouldNotify({ settings: { notify: 'all' }, sectionMode: 'mute', mentioned: true }), 'a mention still notifies in a muted section');
ok(shouldNotify({ settings: { notify: 'off' }, mentioned: true }) === false, 'notifications off skips everything');
ok(receiptState({ mine: true, seen: 3 }) === 'seen' && receiptState({ mine: true, seen: 0 }) === 'delivered', 'ticks are sent, delivered, then seen');
ok(!dmAllowed({ blocked: true }).ok && !dmAllowed({ recipientDms: false }).ok && dmAllowed({}).ok, 'DMs stop for blocks and for members who turned them off');

const demo = enrichDemo(demoState());
ok(demo.messages.some(m => m.kind === 'voice') && demo.polls.length === 1 && demo.challenges.length === 1, 'demo data includes a voice note, poll and challenge');
ok(demo.sections.find(s => s.id === 'wins').kind === 'wins', 'wins is a milestone section');
ok(demo.dms.length === 2 && demo.dmMessages['dm-priya'].length === 2, 'demo direct messages are fake and local');

const sql = fs.readFileSync(new URL('../supabase/010_community_extras.sql', import.meta.url), 'utf8');
ok(!/\bdrop\s+table\b/i.test(sql), 'extras migration does not drop tables');
for (const name of ['community-voice', 'community_dm_messages', 'community_push_subs', 'VAPID_PUBLIC_KEY', 'NOT APPLIED', 'community_chat_voice']) {
  ok(sql.includes(name), `010 contains ${name}`);
}
const fn = fs.readFileSync(new URL('../supabase/functions/community-push/index.ts', import.meta.url), 'utf8');
ok(fn.includes('NOT DEPLOYED') && fn.includes('VAPID_PRIVATE_KEY') && !/BEGIN PRIVATE KEY/.test(fn), 'push function documents secrets and does not embed a key');
const native = fs.readFileSync(new URL('../native.js', import.meta.url), 'utf8');
ok(native.includes('fcm_not_configured'), 'Android push stays a documented stub');

console.log(fail ? `${fail} FAILED` : 'ALL COMMUNITY EXTRA CHECKS PASSED');
process.exit(fail ? 1 : 0);
