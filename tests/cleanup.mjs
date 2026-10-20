// Removes ALL throwaway test data from the live Supabase project. Used in every e2e `finally` and runnable directly:
//   node tests/cleanup.mjs
// Test data = auth users glp1life.test.*@example.com, trainers named "Test Trainer ..." or owned/emailed by test users,
// their promo codes (+ orphaned codes left by earlier runs), invoices, and their storage photos.
const REF = 'paxukvgdavcolzkvcapo';
export const sql = async q => { const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: 'POST', headers: { authorization: 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ query: q }) }); const j = await r.json(); if (!r.ok) throw new Error(j.message || r.status); return j; };
export async function cleanupTestData({ quiet = false } = {}) {
  const T = `(select id from public.trainers where name like 'Test Trainer %' or name like 'glp1life.test%' or email like 'glp1life.test.%@example.com' or user_id in (select id from auth.users where email like 'glp1life.test.%@example.com'))`;
  const steps = [
    ['photos', `select set_config('storage.allow_delete_query','true',true); delete from storage.objects where bucket_id='trainers' and (name like 'pending/%' or name ~ '^[0-9]+-icon[_-]192\.png$' or name in (select regexp_replace(photo_url, '^.*/trainers/', '') from public.trainers where id in ${T}))`],
    ['invoices', `delete from public.trainer_invoices where trainer_id in ${T}`],
    ['redemptions', `delete from public.promo_redemptions where code_id in (select id from public.promo_codes where trainer_id in ${T} or trainer_id is null and code ~ '^[A-Z]{3}PT-[A-Z0-9]{4}$') or user_id in (select id from auth.users where email like 'glp1life.test.%@example.com')`],
    ['codes', `delete from public.promo_codes where trainer_id in ${T} or (trainer_id is null and code ~ '^[A-Z]{3}PT-[A-Z0-9]{4}$' and not exists (select 1 from public.promo_redemptions r where r.code_id = promo_codes.id))`],
    ['trainers', `delete from public.trainers where id in ${T}`],
    ['community', `select set_config('storage.allow_delete_query','true',true); delete from storage.objects where bucket_id='community' and split_part(name,'/',1) in (select id::text from auth.users where email like 'glp1life.test.%@example.com'); delete from public.community_groups where name like 'Test Group %'; delete from public.community_modlog where user_id in (select id from auth.users where email like 'glp1life.test.%@example.com')`],
    ['admins', `delete from public.admins where user_id in (select id from auth.users where email like 'glp1life.test.%@example.com')`],
    ['users', `delete from auth.users where email like 'glp1life.test.%@example.com'`]];
  for (const [n, q] of steps) { try { await sql(q); } catch (e) { if (!quiet) console.warn('cleanup', n, e.message); } }
  const left = await sql(`select (select count(*) from public.trainers where id in ${T})::int t, (select count(*) from auth.users where email like 'glp1life.test.%@example.com')::int u`);
  if (!quiet) console.log('cleanup left', JSON.stringify(left[0])); return left[0];
}
if (import.meta.url === `file://${process.argv[1]}`) await cleanupTestData();
