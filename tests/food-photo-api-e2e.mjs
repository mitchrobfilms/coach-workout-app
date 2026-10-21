// Live end-to-end test of the Food Photo Diary backend (Supabase London): storage RLS, Edge Function auth, Gemini analysis,
// non-food rejection, per-user daily limit, diary RLS, GDPR delete. Uses throwaway glp1life.test.*@example.com users, always cleaned up.
//   node tests/food-photo-api-e2e.mjs        (needs SUPABASE_ACCESS_TOKEN)
import { readFileSync } from 'node:fs';
import { SB_URL, SB_KEY } from '../cloud.js';
import { cleanupTestData, sql } from './cleanup.mjs';
const FN = SB_URL + '/functions/v1/food-photo', PW = 'Test-pass-' + Date.now();
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const signUp = async tag => { const j = await (await fetch(SB_URL + '/auth/v1/signup', { method: 'POST', headers: { apikey: SB_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email: `glp1life.test.food${tag}${Date.now()}@example.com`, password: PW }) })).json(); if (!j.access_token) throw new Error('signup ' + JSON.stringify(j).slice(0, 200)); return { tok: j.access_token, id: j.user.id }; };
const H = u => ({ apikey: SB_KEY, authorization: 'Bearer ' + u.tok });
const upload = async (u, path, file) => (await fetch(`${SB_URL}/storage/v1/object/food-photos/${path}`, { method: 'POST', headers: { ...H(u), 'content-type': 'image/jpeg' }, body: readFileSync(file) })).status;
const analyse = async (u, path) => { const r = await fetch(FN, { method: 'POST', headers: { ...H(u), 'content-type': 'application/json' }, body: JSON.stringify({ path }) }); return { status: r.status, j: await r.json() }; };
try {
  const A = await signUp('a'), B = await signUp('b');
  const st = await (await fetch(FN, { headers: H(A) })).json(); ok(st.ready === true && st.limit === 20 && st.remaining === 20, 'status: key works, 20/day ' + JSON.stringify(st));
  ok((await fetch(FN, { headers: { apikey: SB_KEY } })).status === 401, 'no token -> 401');
  const pA = `${A.id}/${crypto.randomUUID()}.jpg`;
  ok(await upload(A, pA, 'tests/fixtures/food-fish.jpg') === 200, 'A uploads to own folder');
  ok(await upload(B, `${A.id}/${crypto.randomUUID()}.jpg`, 'tests/fixtures/food-fish.jpg') >= 400, "B can't upload into A's folder");
  ok((await fetch(`${SB_URL}/storage/v1/object/authenticated/food-photos/${pA}`, { headers: H(B) })).status >= 400, "B can't read A's photo");
  ok((await fetch(`${SB_URL}/storage/v1/object/public/food-photos/${pA}`)).status >= 400, 'bucket is not public');
  ok((await analyse(B, pA)).status === 400, "B can't analyse A's photo (path check)");
  const t0 = Date.now(), a = await analyse(A, pA); console.log('  fish & chips ->', Date.now() - t0, 'ms', JSON.stringify(a.j).slice(0, 900));
  ok(a.status === 200 && a.j.is_food && a.j.items.length >= 1 && a.j.totals.kcal > 300 && a.j.estimate === true, 'real photo analysed (fish & chips)');
  ok(a.j.items?.some(i => /chip|fries|potato/i.test(i.name)) && a.j.items?.some(i => /fish|cod|haddock|batter/i.test(i.name)), 'found fish and chips');
  ok(!/\bbad\b|unhealthy|junk/i.test(JSON.stringify(a.j)), 'supportive wording');
  ok(a.j.remaining === 19, 'quota counted (19 left)');
  const pN = `${A.id}/${crypto.randomUUID()}.jpg`; await upload(A, pN, 'tests/fixtures/food-notfood.jpg');
  const n = await analyse(A, pN); console.log('  not food ->', JSON.stringify(n.j));
  ok(n.status === 200 && n.j.is_food === false && n.j.message && n.j.remaining === 19, 'non-food photo rejected kindly and not counted');
  // save to diary (RLS)
  const row = { day: '2026-10-21', meal: 'dinner', photo_path: pA, items: a.j.items, kcal: a.j.totals.kcal, protein_g: a.j.totals.protein_g, carbs_g: a.j.totals.carbs_g, fat_g: a.j.totals.fat_g, fibre_g: a.j.totals.fibre_g, score: a.j.score, tips: a.j.tips };
  ok((await fetch(SB_URL + '/rest/v1/food_diary', { method: 'POST', headers: { ...H(A), 'content-type': 'application/json' }, body: JSON.stringify(row) })).status === 201, 'A saves diary entry');
  ok((await fetch(SB_URL + '/rest/v1/food_diary', { method: 'POST', headers: { ...H(B), 'content-type': 'application/json' }, body: JSON.stringify(row) })).status >= 400, "B can't save an entry pointing at A's photo");
  ok((await (await fetch(SB_URL + '/rest/v1/food_diary?select=id', { headers: H(B) })).json()).length === 0, "B can't see A's diary");
  ok((await (await fetch(SB_URL + '/rest/v1/food_diary?select=id', { headers: H(A) })).json()).length === 1, 'A sees own diary');
  ok((await fetch(SB_URL + '/rest/v1/rpc/claim_food_photo', { method: 'POST', headers: { ...H(A), 'content-type': 'application/json' }, body: JSON.stringify({ p_user: A.id, p_limit: 999 }) })).status >= 400, "users can't call the quota function");
  // daily limit
  await sql(`update public.food_photo_usage set n = 20 where user_id = '${A.id}'`);
  const l = await analyse(A, pA); ok(l.status === 429 && l.j.error === 'limit', 'limit reached -> 429 friendly message');
  // GDPR delete: photos + rows gone
  const list = await (await fetch(SB_URL + '/storage/v1/object/list/food-photos', { method: 'POST', headers: { ...H(A), 'content-type': 'application/json' }, body: JSON.stringify({ prefix: A.id + '/', limit: 1000 }) })).json();
  ok(list.length === 2, 'A lists own photos (2)');
  await fetch(SB_URL + '/storage/v1/object/food-photos', { method: 'DELETE', headers: { ...H(A), 'content-type': 'application/json' }, body: JSON.stringify({ prefixes: list.map(o => `${A.id}/${o.name}`) }) });
  await fetch(SB_URL + '/rest/v1/rpc/delete_my_account', { method: 'POST', headers: { ...H(A), 'content-type': 'application/json' }, body: '{}' });
  const left = await sql(`select (select count(*) from public.food_diary where user_id='${A.id}')::int d, (select count(*) from storage.objects where bucket_id='food-photos' and name like '${A.id}/%')::int p, (select count(*) from public.food_photo_usage where user_id='${A.id}')::int u`);
  ok(left[0].d === 0 && left[0].p === 0 && left[0].u === 0, 'account delete removes diary, photos and usage ' + JSON.stringify(left[0]));
} catch (e) { fails++; console.error('ERROR', e); }
finally { await cleanupTestData({ quiet: true }); }
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
