-- Promo codes + trainer programme (applied 2026-10-20)
create table if not exists public.promo_codes (id uuid primary key default gen_random_uuid(), code text not null unique check (code ~ '^[A-Z0-9-]{4,24}$'), trainer_id uuid references public.trainers on delete set null, max_uses int check (max_uses is null or max_uses > 0), expires_at timestamptz, active boolean not null default true, created_at timestamptz not null default now());
create table if not exists public.promo_redemptions (user_id uuid primary key references auth.users on delete cascade, code_id uuid not null references public.promo_codes on delete cascade, redeemed_at timestamptz not null default now(), revoked boolean not null default false);
alter table public.promo_codes enable row level security; alter table public.promo_redemptions enable row level security;
drop policy if exists admin_all on public.promo_codes; create policy admin_all on public.promo_codes for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_all on public.promo_redemptions; create policy admin_all on public.promo_redemptions for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists own_read on public.promo_redemptions; create policy own_read on public.promo_redemptions for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.promo_codes, public.promo_redemptions from anon; grant select, insert, update, delete on public.promo_codes, public.promo_redemptions to authenticated;
-- Redeem: validated server-side; one code per user; counts only non-revoked redemptions.
create or replace function public.redeem_promo(p_code text) returns json language plpgsql security definer set search_path = '' as $$
declare c public.promo_codes; used int; t text; begin
  if auth.uid() is null then raise exception 'Sign in to your cloud account first'; end if;
  if exists (select 1 from public.promo_redemptions where user_id = auth.uid() and not revoked) then raise exception 'You have already used a promo code'; end if;
  select * into c from public.promo_codes where code = upper(trim(p_code)) for update;
  if not found or not c.active then raise exception 'That code is not valid'; end if;
  if c.expires_at is not null and c.expires_at < now() then raise exception 'That code has expired'; end if;
  select count(*) into used from public.promo_redemptions where code_id = c.id and not revoked;
  if c.max_uses is not null and used >= c.max_uses then raise exception 'That code has been fully used'; end if;
  insert into public.promo_redemptions(user_id, code_id) values (auth.uid(), c.id) on conflict (user_id) do update set code_id = excluded.code_id, redeemed_at = now(), revoked = false;
  select name into t from public.trainers where id = c.trainer_id;
  return json_build_object('plan', 'plus', 'code', c.code, 'trainer', t);
end $$;
create or replace function public.my_plan() returns json language sql stable security definer set search_path = '' as $$
  select coalesce((select json_build_object('plan', 'plus', 'code', c.code, 'trainer', t.name, 'redeemed_at', r.redeemed_at) from public.promo_redemptions r join public.promo_codes c on c.id = r.code_id left join public.trainers t on t.id = c.trainer_id where r.user_id = auth.uid() and not r.revoked), json_build_object('plan', 'free')) $$;
-- Admin: usage list with emails
create or replace function public.promo_usage() returns table(code_id uuid, user_id uuid, email text, redeemed_at timestamptz, revoked boolean) language plpgsql stable security definer set search_path = '' as $$
begin if not public.is_admin() then raise exception 'admin only'; end if;
return query select r.code_id, r.user_id, u.email::text, r.redeemed_at, r.revoked from public.promo_redemptions r join auth.users u on u.id = r.user_id order by r.redeemed_at desc; end $$;
revoke all on function public.redeem_promo(text), public.my_plan(), public.promo_usage() from public, anon;
grant execute on function public.redeem_promo(text), public.my_plan(), public.promo_usage() to authenticated;
alter table public.trainers add column if not exists status text not null default 'approved' check (status in ('pending','approved','rejected')),
  add column if not exists business text, add column if not exists email text, add column if not exists bio text,
  add column if not exists user_id uuid unique references auth.users on delete set null, add column if not exists terms_at timestamptz, add column if not exists client_code text unique;
alter table public.promo_redemptions add column if not exists billing text not null default 'monthly' check (billing in ('monthly','yearly')),
  add column if not exists billing_start date not null default current_date, add column if not exists share_progress boolean not null default false;
create table if not exists public.trainer_invoices (trainer_id uuid references public.trainers on delete cascade, month date, amount_pence int not null, paid_at timestamptz, primary key (trainer_id, month));
alter table public.trainer_invoices enable row level security;
drop policy if exists admin_all on public.trainer_invoices; create policy admin_all on public.trainer_invoices for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.trainer_invoices to authenticated;
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname='public' and tablename='trainers' and cmd='SELECT' loop execute format('drop policy %I on public.trainers', p.policyname); end loop; end $$;
create policy public_read on public.trainers for select using (active and status = 'approved');
create policy admin_read on public.trainers for select to authenticated using (public.is_admin());
create policy own_read on public.trainers for select to authenticated using (user_id = (select auth.uid()));
-- Public column exposure: hide email/user_id from anon
revoke select on public.trainers from anon; grant select (id,name,photo_url,specialties,glp1_support,area,whatsapp,virtual_pt,active,sort,status,business,bio) on public.trainers to anon;
-- pending photo uploads by the registering user
drop policy if exists "trainer photos pending" on storage.objects; create policy "trainer photos pending" on storage.objects for insert to authenticated with check (bucket_id = 'trainers' and (storage.foldername(name))[1] = 'pending' and (storage.foldername(name))[2] = (select auth.uid())::text);
create or replace function public.is_trainer() returns uuid language sql stable security definer set search_path = '' as $$ select id from public.trainers where user_id = auth.uid() and status = 'approved' $$;
create or replace function public.register_trainer(p jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare i uuid; wa text := regexp_replace(coalesce(p->>'whatsapp',''), '\D', '', 'g'); begin
  if auth.uid() is null then raise exception 'Create your account first'; end if;
  if not coalesce((p->>'terms')::boolean, false) then raise exception 'Please agree to the terms'; end if;
  if length(coalesce(p->>'name','')) < 2 then raise exception 'Name is required'; end if;
  if wa !~ '^\d{8,15}$' then raise exception 'Valid WhatsApp number required'; end if;
  if exists (select 1 from public.trainers where user_id = auth.uid()) then raise exception 'You have already registered'; end if;
  insert into public.trainers(name, business, email, whatsapp, specialties, photo_url, bio, glp1_support, area, virtual_pt, status, active, user_id, terms_at)
  values (left(p->>'name',80), left(p->>'business',120), (select email from auth.users where id = auth.uid()), wa,
    coalesce((select array_agg(left(trim(x),40)) from jsonb_array_elements_text(coalesce(p->'specialties','[]')) x where trim(x) <> ''), '{}'),
    case when p->>'photo_url' ~ '^https://[a-z]+\.supabase\.co/storage/v1/object/public/trainers/pending/' then p->>'photo_url' end,
    left(p->>'bio',1000), left(p->>'glp1_support',600), left(p->>'area',80), coalesce((p->>'virtual_pt')::boolean,false), 'pending', false, auth.uid(), now()) returning id into i;
  return i; end $$;
create or replace function public.approve_trainer(t uuid) returns text language plpgsql security definer set search_path = '' as $$
declare n text; c text; begin if not public.is_admin() then raise exception 'admin only'; end if;
  select upper(left(regexp_replace(coalesce(business, name), '[^A-Za-z]', '', 'g'), 3)) into n from public.trainers where id = t;
  loop c := coalesce(nullif(n,''),'GLP') || 'PT-' || upper(substr(md5(gen_random_uuid()::text), 1, 4)); exit when not exists (select 1 from public.promo_codes where code = c); end loop;
  update public.trainers set status = 'approved', active = true, client_code = coalesce(client_code, c) where id = t returning client_code into c;
  insert into public.promo_codes(code, trainer_id) values (c, t) on conflict (code) do nothing; return c; end $$;
create or replace function public.trainer_clients() returns table(user_id uuid, name text, email text, billing text, billing_start date, redeemed_at timestamptz, share_progress boolean) language sql stable security definer set search_path = '' as $$
  select r.user_id, pr.name, u.email::text, r.billing, r.billing_start, r.redeemed_at, r.share_progress from public.promo_redemptions r join public.promo_codes c on c.id = r.code_id
  join auth.users u on u.id = r.user_id left join public.profiles pr on pr.user_id = r.user_id where c.trainer_id = public.is_trainer() and not r.revoked order by r.redeemed_at desc $$;
create or replace function public.set_client_billing(c uuid, b text) returns void language plpgsql security definer set search_path = '' as $$
begin update public.promo_redemptions r set billing = b, billing_start = current_date from public.promo_codes pc where pc.id = r.code_id and r.user_id = c and pc.trainer_id = public.is_trainer() and r.billing is distinct from b;
end $$;
create or replace function public.client_progress(c uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.promo_redemptions r join public.promo_codes pc on pc.id = r.code_id where r.user_id = c and r.share_progress and not r.revoked and pc.trainer_id = public.is_trainer())
  then (select coalesce(jsonb_agg(w.data order by w.id), '[]') from public.weights w where w.user_id = c and not w.deleted) else null end $$;
create or replace function public.set_share_progress(s boolean) returns void language sql security definer set search_path = '' as $$ update public.promo_redemptions set share_progress = s where user_id = auth.uid() $$;
-- commission for month m: £2 per active monthly client, £20 per yearly client whose start/renewal anniversary falls in month m
create or replace function public.commission(m date) returns table(trainer_id uuid, name text, monthly int, yearly int, yearly_due int, owed_pence int, renewals text, paid_at timestamptz) language plpgsql stable security definer set search_path = '' as $$
begin if not public.is_admin() then raise exception 'admin only'; end if;
return query with c as (select pc.trainer_id t, r.* from public.promo_redemptions r join public.promo_codes pc on pc.id = r.code_id where not r.revoked and pc.trainer_id is not null and r.billing_start < (date_trunc('month', m) + interval '1 month'))
select tr.id, tr.name, count(*) filter (where c.billing='monthly')::int, count(*) filter (where c.billing='yearly')::int,
  count(*) filter (where c.billing='yearly' and extract(month from c.billing_start) = extract(month from m))::int,
  (200 * count(*) filter (where c.billing='monthly') + 2000 * count(*) filter (where c.billing='yearly' and extract(month from c.billing_start) = extract(month from m)))::int,
  string_agg(case when c.billing='yearly' then to_char((c.billing_start + ((extract(year from age(date_trunc('month', m) + interval '1 month' - interval '1 day', c.billing_start))::int + 1) * interval '1 year'))::date, 'DD Mon YYYY') end, ', '),
  (select i.paid_at from public.trainer_invoices i where i.trainer_id = tr.id and i.month = date_trunc('month', m)::date)
from public.trainers tr left join c on c.t = tr.id where tr.status = 'approved' group by tr.id, tr.name order by tr.name; end $$;
revoke all on function public.is_trainer(), public.register_trainer(jsonb), public.approve_trainer(uuid), public.trainer_clients(), public.set_client_billing(uuid,text), public.client_progress(uuid), public.set_share_progress(boolean), public.commission(date) from public, anon;
grant execute on function public.is_trainer(), public.register_trainer(jsonb), public.approve_trainer(uuid), public.trainer_clients(), public.set_client_billing(uuid,text), public.client_progress(uuid), public.set_share_progress(boolean), public.commission(date) to authenticated;
revoke select on public.trainers from authenticated; grant select (id,name,photo_url,specialties,glp1_support,area,whatsapp,virtual_pt,active,sort,status,business,bio,created_at,updated_at) on public.trainers to authenticated;
create or replace function public.admin_trainers() returns setof public.trainers language plpgsql stable security definer set search_path = '' as $$ begin if not public.is_admin() then raise exception 'admin only'; end if; return query select * from public.trainers order by status desc, sort, created_at; end $$;
create or replace function public.my_trainer() returns setof public.trainers language sql stable security definer set search_path = '' as $$ select * from public.trainers where user_id = auth.uid() $$;
create or replace function public.my_plan() returns json language sql stable security definer set search_path = '' as $$
  select coalesce((select json_build_object('plan', 'plus', 'code', c.code, 'trainer', t.name, 'by_trainer', c.trainer_id is not null, 'share_progress', r.share_progress, 'redeemed_at', r.redeemed_at) from public.promo_redemptions r join public.promo_codes c on c.id = r.code_id left join public.trainers t on t.id = c.trainer_id where r.user_id = auth.uid() and not r.revoked), json_build_object('plan', 'free')) $$;
revoke all on function public.admin_trainers(), public.my_trainer() from public, anon; grant execute on function public.admin_trainers(), public.my_trainer() to authenticated;
alter table public.promo_redemptions add column if not exists share jsonb not null default '{"weights":false,"workouts":false,"meals":false,"injections":false}', add column if not exists consent_at timestamptz;
drop function if exists public.redeem_promo(text);
create or replace function public.redeem_promo(p_code text, p_consent boolean default false) returns json language plpgsql security definer set search_path = '' as $$
declare c public.promo_codes; used int; t text; begin
  if auth.uid() is null then raise exception 'Sign in to your cloud account first'; end if;
  if exists (select 1 from public.promo_redemptions where user_id = auth.uid() and not revoked) then raise exception 'You have already used a promo code'; end if;
  select * into c from public.promo_codes where code = upper(trim(p_code)) for update;
  if not found or not c.active then raise exception 'That code is not valid'; end if;
  if c.expires_at is not null and c.expires_at < now() then raise exception 'That code has expired'; end if;
  select count(*) into used from public.promo_redemptions where code_id = c.id and not revoked;
  if c.max_uses is not null and used >= c.max_uses then raise exception 'That code has been fully used'; end if;
  select name into t from public.trainers where id = c.trainer_id;
  if c.trainer_id is not null and not p_consent then return json_build_object('needs_consent', true, 'trainer', t); end if;
  insert into public.promo_redemptions(user_id, code_id, share, consent_at, share_progress, billing, billing_start) values (auth.uid(), c.id,
    case when c.trainer_id is not null then '{"weights":true,"workouts":true,"meals":true,"injections":true}'::jsonb else '{"weights":false,"workouts":false,"meals":false,"injections":false}'::jsonb end,
    case when c.trainer_id is not null then now() end, c.trainer_id is not null, 'monthly', current_date)
  on conflict (user_id) do update set code_id = excluded.code_id, redeemed_at = now(), revoked = false, share = excluded.share, consent_at = excluded.consent_at, share_progress = excluded.share_progress, billing = 'monthly', billing_start = current_date;
  return json_build_object('plan', 'plus', 'code', c.code, 'trainer', t); end $$;
create or replace function public.set_share(s jsonb) returns jsonb language sql security definer set search_path = '' as $$
  update public.promo_redemptions set share = jsonb_build_object('weights', coalesce((s->>'weights')::boolean,false), 'workouts', coalesce((s->>'workouts')::boolean,false), 'meals', coalesce((s->>'meals')::boolean,false), 'injections', coalesce((s->>'injections')::boolean,false)),
   share_progress = coalesce((s->>'weights')::boolean,false) or coalesce((s->>'workouts')::boolean,false) or coalesce((s->>'meals')::boolean,false) or coalesce((s->>'injections')::boolean,false)
  where user_id = auth.uid() returning share $$;
drop function if exists public.set_share_progress(boolean);
drop function if exists public.client_progress(uuid);
create or replace function public.client_progress(c uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s jsonb; begin
  select r.share into s from public.promo_redemptions r join public.promo_codes pc on pc.id = r.code_id where r.user_id = c and not r.revoked and pc.trainer_id = public.is_trainer();
  if s is null then raise exception 'Not your client'; end if;
  return jsonb_build_object('share', s,
    'weights', case when (s->>'weights')::boolean then (select coalesce(jsonb_agg(w.data), '[]') from public.weights w where w.user_id = c and not w.deleted) end,
    'workouts', case when (s->>'workouts')::boolean then (select coalesce(jsonb_object_agg(k.id, k.data), '{}') from public.check_ins k where k.user_id = c and not k.deleted and k.id in ('sessions','classes','weekChecks','daily')) end,
    'meals', case when (s->>'meals')::boolean then (select coalesce(jsonb_object_agg(m.id, m.data), '{}') from public.meal_plans m where m.user_id = c and not m.deleted) end,
    'injections', case when (s->>'injections')::boolean then (select coalesce(jsonb_agg(i.data), '[]') from public.injections i where i.user_id = c and not i.deleted) end); end $$;
drop function if exists public.trainer_clients();
create or replace function public.trainer_clients() returns table(user_id uuid, name text, email text, billing text, billing_start date, redeemed_at timestamptz, share jsonb) language sql stable security definer set search_path = '' as $$
  select r.user_id, pr.name, u.email::text, r.billing, r.billing_start, r.redeemed_at, r.share from public.promo_redemptions r join public.promo_codes c on c.id = r.code_id
  join auth.users u on u.id = r.user_id left join public.profiles pr on pr.user_id = r.user_id where c.trainer_id = public.is_trainer() and not r.revoked order by r.redeemed_at desc $$;
create or replace function public.my_plan() returns json language sql stable security definer set search_path = '' as $$
  select coalesce((select json_build_object('plan', 'plus', 'code', c.code, 'trainer', t.name, 'by_trainer', c.trainer_id is not null, 'share', r.share, 'consent_at', r.consent_at) from public.promo_redemptions r join public.promo_codes c on c.id = r.code_id left join public.trainers t on t.id = c.trainer_id where r.user_id = auth.uid() and not r.revoked), json_build_object('plan', 'free')) $$;
revoke all on function public.redeem_promo(text, boolean), public.set_share(jsonb), public.client_progress(uuid), public.trainer_clients() from public, anon;
grant execute on function public.redeem_promo(text, boolean), public.set_share(jsonb), public.client_progress(uuid), public.trainer_clients() to authenticated;
grant select (created_at, updated_at) on public.trainers to anon;
create policy "trainer photos read" on storage.objects for select using (bucket_id = 'trainers');
