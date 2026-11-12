import {
  allowText, matchWaiting, endPair, duePrompt, eventPhase, toggleUpvote, badgeList, dueScheduled,
  gifPicker, demoTranslate, translateAllowed, moreDemo, WELCOME, QA_NOTICE, GIF_SECRET, TRANSLATE_LIMIT,
  validateMemberRecipe, toMemberPlannerRecipe, RECIPE_LABEL,
} from '../community-more.js';
import { demoState } from '../community-chat-core.js';
import { enrichDemo } from '../community-chat-extra.js';
import fs from 'node:fs';

let fail = 0;
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };

ok(!allowText('WhatsApp me on 07700 900123 for cheaper pens').ok, 'buddy and Q&A text still blocks sourcing');
ok(allowText('Walk on 4 days this week').ok, 'a walking goal is allowed');
ok(!allowText('You should take 5mg').ok, 'dosing text is still held');

const paired = matchWaiting([{ user_id: 'a', goal: 'Walk' }, { user_id: 'b', goal: 'Walk' }], []);
ok(paired?.status === 'active' && paired.user_lo === 'a' && paired.user_hi === 'b', 'two waiting members are paired');
ok(matchWaiting([{ user_id: 'a' }, { user_id: 'b' }], [['a', 'b']]) == null, 'blocked members are not paired');
ok(endPair({ id: 'p', user_lo: 'me', user_hi: 'ava', status: 'active' }, 'me').pair.status === 'ended', 'either person can end a pairing');
ok(!endPair({ id: 'p', user_lo: 'ava', user_hi: 'jon', status: 'active' }, 'me').ok, 'someone else cannot end the pairing');

const morning = new Date('2026-11-11T08:05:00Z');
ok(duePrompt({ enabled: true, hour: 8, minute: 0 }, morning, false), 'an 08:00 UK prompt is due at 08:05 in winter');
ok(!duePrompt({ enabled: true, hour: 8, minute: 0 }, morning, true), 'a prompt already posted today is skipped');
ok(eventPhase({ starts_at: '2026-11-11T18:00:00Z', ends_at: '2026-11-11T19:00:00Z' }, new Date('2026-11-11T18:30:00Z')) === 'live', 'Q&A is live during its slot');
ok(QA_NOTICE.toLowerCase().includes('not medical advice'), 'Q&A says it is not medical advice');

let votes = [];
votes = toggleUpvote(votes, 'q1', 'me');
votes = toggleUpvote(votes, 'q1', 'me');
ok(votes.length === 0, 'an upvote toggles off');
ok(badgeList({ streak: 30, wins: 1, challenges: 1 }).map(b => b.id).join(',') === 'streak7,streak30,first_win,challenge', 'streak, win and challenge badges');
ok(dueScheduled([{ send_at: '2026-11-11T12:00:00Z', sent_at: null }, { send_at: '2026-11-12T12:00:00Z', sent_at: null }], new Date('2026-11-11T13:00:00Z')).length === 1, 'only due announcements are sent');

ok(!gifPicker({ apiKey: '' }).enabled && gifPicker({ apiKey: '' }).secret === GIF_SECRET, 'GIF picker stays off without GIF_API_KEY');
ok(demoTranslate('Hello').text.startsWith('[Demo French]') && demoTranslate('Hello').demo, 'demo translation is labelled as fake');
ok(translateAllowed(TRANSLATE_LIMIT - 1) && !translateAllowed(TRANSLATE_LIMIT), 'translation stops at the daily limit');

const demo = moreDemo(enrichDemo(demoState()));
ok(demo.welcome.body === WELCOME && demo.pair.hi.name === 'Ava', 'demo buddy and welcome are fake local data');
ok(demo.messages.some(m => m.card?.id === 'o-skyrberry'), 'demo shares a real meal-planner recipe');
ok(demo.event.questions.length === 2 && demo.profiles.ava.badges.length >= 2, 'demo Q&A and profile badges');
ok(demo.gif.enabled === false, 'demo GIF provider is disabled');
const bowl = validateMemberRecipe({
  title: 'Turkey mince and spinach bowl',
  tags: ['high-protein', 'mild', 'not-a-tag'],
  ingredients: [{ name: 'Turkey mince', quantity: 150, unit: 'g' }, { name: 'Yoghurt', quantity: 40, unit: 'ml' }],
  steps: ['Cook the turkey mince until it is cooked through and no longer pink.'],
});
ok(bowl.ok && bowl.recipe.ingredients[0].imperial.includes('oz') && bowl.recipe.tags.join(',') === 'high-protein,mild', 'member recipe keeps metric, imperial and known tags');
ok(!validateMemberRecipe({ title: 'Pen', ingredients: [{ name: 'Powder', quantity: 1, unit: 'g' }], steps: ['Mix bac water into the vial.'] }).ok, 'mixing instructions are not posted');
const saved = toMemberPlannerRecipe(bowl.recipe, 'mr1');
ok(saved.member && !saved.ai && saved.proteinLabel === RECIPE_LABEL && saved.ingredients[0].qty === 150, 'saving uses the meal planner shape and the allergy label');

const memberSql = fs.readFileSync(new URL('../supabase/012_member_recipes.sql', import.meta.url), 'utf8');
ok(!/\bdrop\s+table\b/i.test(memberSql) && memberSql.includes('community_member_recipes') && memberSql.includes('community_chat_classify'), 'member recipe migration is filtered and non-destructive');
ok(!/create table[\s\S]{0,80}dose|reconstitution calculator/i.test(memberSql), 'the migration does not add a dosage calculator');
const sql = fs.readFileSync(new URL('../supabase/011_community_more.sql', import.meta.url), 'utf8');
ok(!/\bdrop\s+table\b/i.test(sql) && sql.includes('NOT APPLIED') && sql.includes('Europe/London'), 'migration is non-destructive and documents UK time');
ok(!/peptide shop|add to basket|checkout/i.test(sql), 'migration has no shop or ordering feature');
for (const name of ['community_pairs', 'community_daily_run', 'community_events', 'community_welcome', 'GIF_API_KEY', 'claim_community_translate']) {
  ok(sql.includes(name), `011 contains ${name}`);
}
const daily = fs.readFileSync(new URL('../supabase/functions/community-daily/index.ts', import.meta.url), 'utf8');
const tr = fs.readFileSync(new URL('../supabase/functions/community-translate/index.ts', import.meta.url), 'utf8');
ok(daily.includes('NOT DEPLOYED') && daily.includes('pg_cron') && tr.includes('NOT DEPLOYED') && tr.includes('GROQ_API_KEY') && tr.includes('openai/gpt-oss-20b') && !/gsk_/.test(tr), 'jobs are documented and contain no key');

console.log(fail ? `${fail} FAILED` : 'ALL COMMUNITY MORE CHECKS PASSED');
process.exit(fail ? 1 : 0);
