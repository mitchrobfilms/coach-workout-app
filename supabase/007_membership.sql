-- NOT APPLIED. Do not run this against the live database.
-- No access codes are inserted. An admin must create one later, after this file is reviewed and applied.
-- Complimentary codes are not Stripe subscriptions and do not start a Google Play purchase.
-- Live Stripe account context that must not be used for tests: Pepvexia acct_1LKefrExfE48MyWq (live only; no sandbox here).

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.access_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  code_hint text not null,
  label text not null default '',
  lifetime boolean not null default false,
  duration_days int,
  max_redemptions int not null,
  redeem_by timestamptz,
  active boolean not null default true,
  revoked_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint access_duration_explicit check (
    (lifetime = true and duration_days is null) or
    (lifetime = false and duration_days between 1 and 3650)
  ),
  constraint access_limit_explicit check (max_redemptions between 1 and 100000)
);
create table if not exists public.access_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.access_codes(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  ends_at timestamptz,
  unique (code_id, user_id)
);
create table if not exists public.admin_preview (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mode text not null check (mode in ('free', 'premium')),
  updated_at timestamptz not null default now()
);
create table if not exists public.stripe_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text,
  subscription_id text unique,
  price_id text,
  status text not null,
  ends_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.stripe_events (
  event_id text primary key,
  processed_at timestamptz not null default now()
);
create table if not exists public.play_purchases (
  purchase_token text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  package_name text not null,
  product_id text not null,
  base_plan_id text,
  state text not null,
  ends_at timestamptz,
  acknowledged boolean not null default false,
  obfuscated_account_id text,
  linked_purchase_token text,
  last_event_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.play_notifications (
  message_id text primary key,
  purchase_token text,
  published_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.access_codes enable row level security;
alter table public.access_redemptions enable row level security;
alter table public.admin_preview enable row level security;
alter table public.stripe_subscriptions enable row level security;
alter table public.stripe_events enable row level security;
alter table public.play_purchases enable row level security;
alter table public.play_notifications enable row level security;
revoke all on public.access_codes, public.access_redemptions, public.admin_preview, public.stripe_subscriptions, public.stripe_events, public.play_purchases, public.play_notifications from anon, authenticated;

create or replace function public.admin_create_access_code(p_lifetime boolean, p_duration_days int, p_max_redemptions int, p_redeem_by timestamptz, p_label text)
returns json language plpgsql security definer set search_path = '' as $$
declare raw text := ''; i int; n int; hid uuid; hint text;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only'; end if;
  if coalesce(p_lifetime, false) and p_duration_days is not null then raise exception 'Choose days or lifetime, not both'; end if;
  if coalesce(p_lifetime, false) is not true and (p_duration_days is null or p_duration_days < 1 or p_duration_days > 3650) then raise exception 'Duration is required'; end if;
  if p_max_redemptions is null or p_max_redemptions < 1 or p_max_redemptions > 100000 then raise exception 'Redemption limit is required'; end if;
  if p_redeem_by is not null and p_redeem_by <= now() then raise exception 'Redeem-by must be in the future'; end if;
  for i in 1..12 loop
    n := get_byte(extensions.gen_random_bytes(1), 0) % 32;
    raw := raw || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', n + 1, 1);
  end loop;
  hint := right(raw, 4);
  insert into public.access_codes(code_hash, code_hint, label, lifetime, duration_days, max_redemptions, redeem_by, created_by)
  values (encode(extensions.digest(convert_to(raw, 'UTF8'), 'sha256'), 'hex'), hint, left(coalesce(p_label, ''), 80), coalesce(p_lifetime, false),
    case when coalesce(p_lifetime, false) then null else p_duration_days end, p_max_redemptions, p_redeem_by, auth.uid())
  returning id into hid;
  return json_build_object('id', hid, 'code', raw, 'hint', hint);
end $$;

create or replace function public.admin_list_access_codes()
returns table(id uuid, code_hint text, label text, lifetime boolean, duration_days int, max_redemptions int, used int, redeem_by timestamptz, active boolean, revoked_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only'; end if;
  return query select c.id, c.code_hint, c.label, c.lifetime, c.duration_days, c.max_redemptions,
    (select count(*)::int from public.access_redemptions r where r.code_id = c.id), c.redeem_by, c.active, c.revoked_at, c.created_at
  from public.access_codes c order by c.created_at desc;
end $$;

create or replace function public.admin_revoke_access_code(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only'; end if;
  update public.access_codes set active = false, revoked_at = now() where id = p_id;
end $$;

create or replace function public.redeem_access_code(p_code text) returns json
language plpgsql security definer set search_path = '' as $$
declare c public.access_codes; used int; norm text; hash text; ends timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in to your cloud account first'; end if;
  norm := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  if norm !~ '^[A-Z0-9]{8,32}$' then raise exception 'That code is not valid'; end if;
  hash := encode(extensions.digest(convert_to(norm, 'UTF8'), 'sha256'), 'hex');
  select * into c from public.access_codes where code_hash = hash for update;
  if not found or c.active is not true or c.revoked_at is not null then raise exception 'That code is not valid'; end if;
  if c.redeem_by is not null and c.redeem_by <= now() then raise exception 'That code has expired'; end if;
  if exists (select 1 from public.access_redemptions where code_id = c.id and user_id = auth.uid()) then raise exception 'You have already used this code'; end if;
  select count(*) into used from public.access_redemptions where code_id = c.id;
  if used >= c.max_redemptions then raise exception 'That code has been fully used'; end if;
  ends := case when c.lifetime then null else now() + make_interval(days => c.duration_days) end;
  insert into public.access_redemptions(code_id, user_id, ends_at) values (c.id, auth.uid(), ends);
  return json_build_object('kind', 'complimentary', 'lifetime', c.lifetime, 'ends_at', ends);
end $$;

create or replace function public.admin_set_preview(p_mode text) returns json
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only'; end if;
  if p_mode = 'off' then delete from public.admin_preview where user_id = auth.uid();
  elsif p_mode in ('free', 'premium') then
    insert into public.admin_preview(user_id, mode) values (auth.uid(), p_mode)
    on conflict (user_id) do update set mode = excluded.mode, updated_at = now();
  else raise exception 'Preview must be free, premium or off'; end if;
  return json_build_object('preview', p_mode, 'entitlement_unchanged', true);
end $$;

create or replace function public.membership_state() returns json
language plpgsql stable security definer set search_path = '' as $$
declare admin boolean := public.is_admin(); prev text;
begin
  if auth.uid() is null then return json_build_object('signed_in', false, 'is_admin', false, 'live_paywall', false, 'preview', null); end if;
  if admin then select mode into prev from public.admin_preview where user_id = auth.uid(); end if;
  return json_build_object(
    'signed_in', true,
    'is_admin', admin,
    'live_paywall', false,
    'preview', case when admin then prev else null end,
    'complimentary', (select json_build_object('kind', 'complimentary', 'lifetime', c.lifetime, 'ends_at', r.ends_at)
      from public.access_redemptions r join public.access_codes c on c.id = r.code_id
      where r.user_id = auth.uid() and (c.lifetime or r.ends_at > now()) order by r.redeemed_at desc limit 1),
    'stripe', (select json_build_object('kind', 'stripe', 'status', s.status, 'ends_at', s.ends_at) from public.stripe_subscriptions s
      where s.user_id = auth.uid() and (s.status in ('active', 'trialing') or (s.status = 'canceled' and s.ends_at > now()))),
    'play', (select json_build_object('kind', 'play', 'state', p.state, 'ends_at', p.ends_at) from public.play_purchases p
      where p.user_id = auth.uid() and (p.state in ('SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD') or (p.state = 'SUBSCRIPTION_STATE_CANCELED' and p.ends_at > now()))
      order by p.updated_at desc limit 1)
  );
end $$;

revoke all on function public.admin_create_access_code(boolean, int, int, timestamptz, text), public.admin_list_access_codes(), public.admin_revoke_access_code(uuid), public.redeem_access_code(text), public.admin_set_preview(text), public.membership_state() from public, anon;
grant execute on function public.admin_create_access_code(boolean, int, int, timestamptz, text), public.admin_list_access_codes(), public.admin_revoke_access_code(uuid), public.redeem_access_code(text), public.admin_set_preview(text), public.membership_state() to authenticated;
