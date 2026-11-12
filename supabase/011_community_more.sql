-- NOT APPLIED. Do not run this against production (paxukvgdavcolzkvcapo) until it has been reviewed.
-- Buddies, daily prompts, recipe cards, Q&A, profiles, scheduled posts, stickers/GIF metadata and translation limits.
-- Idempotent and non-destructive. Requires 009 and 010. Does not drop tables.
-- Does not add any shop, peptide, supplier or ordering feature.
-- Every member-written text is passed through community_chat_classify before it is stored.
--
-- Not deployed:
--   supabase/functions/community-daily   posts due prompts and scheduled announcements.
--     Schedule it every 15 minutes in the Supabase dashboard, or with pg_cron if you enable that extension yourself.
--     Example (do not run from this file):
--       select cron.schedule('community-daily', '*/15 * * * *', $$select public.community_daily_run()$$);
--     The function uses Europe/London.
--   supabase/functions/community-translate   uses the existing secret GROQ_API_KEY. Do not invent a key.
-- GIF search stays disabled until the secret GIF_API_KEY is set (Tenor or GIPHY). No key is stored in the repo.

alter table public.community_messages add column if not exists card jsonb;
alter table public.community_messages drop constraint if exists community_messages_content;
alter table public.community_messages add constraint community_messages_content
  check (char_length(btrim(body)) > 0 or image_path is not null or audio_path is not null or card is not null);
alter table public.community_members add column if not exists welcomed_at timestamptz;

create table if not exists public.community_pairs (
  id uuid primary key default gen_random_uuid(),
  user_lo uuid not null references auth.users on delete cascade,
  user_hi uuid not null references auth.users on delete cascade,
  status text not null default 'pending' check (status in ('pending','active','ended')),
  goal text not null default '',
  requested_by uuid references auth.users on delete set null,
  checkin text,
  checkin_by uuid references auth.users on delete set null,
  checkin_at timestamptz,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (user_lo, user_hi)
);
create table if not exists public.community_pair_queue (
  user_id uuid primary key references auth.users on delete cascade,
  goal text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.community_daily_prompts (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.community_sections on delete cascade,
  body text not null check (char_length(body) between 1 and 200),
  hour int not null check (hour between 0 and 23),
  minute int not null check (minute between 0 and 59),
  enabled boolean not null default true,
  last_posted date,
  created_by uuid references auth.users on delete set null
);
create table if not exists public.community_events (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.community_sections on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references auth.users on delete set null
);
create table if not exists public.community_event_reminders (
  event_id uuid not null references public.community_events on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  primary key (event_id, user_id)
);
create table if not exists public.community_event_questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.community_events on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  body text not null check (char_length(body) between 1 and 200),
  answered boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.community_event_votes (
  question_id uuid not null references public.community_event_questions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  primary key (question_id, user_id)
);
create table if not exists public.community_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  bio text not null default '' check (char_length(bio) <= 160),
  streak_days int not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.community_badges (
  user_id uuid not null references auth.users on delete cascade,
  badge text not null check (badge in ('streak7','streak30','first_win','challenge')),
  earned_at timestamptz not null default now(),
  primary key (user_id, badge)
);
create table if not exists public.community_scheduled (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.community_sections on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  send_at timestamptz not null,
  created_by uuid references auth.users on delete set null,
  sent_at timestamptz
);
create table if not exists public.community_translate_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  n int not null default 0,
  primary key (user_id, day)
);

alter table public.community_pairs enable row level security;
alter table public.community_pair_queue enable row level security;
alter table public.community_daily_prompts enable row level security;
alter table public.community_events enable row level security;
alter table public.community_event_reminders enable row level security;
alter table public.community_event_questions enable row level security;
alter table public.community_event_votes enable row level security;
alter table public.community_profiles enable row level security;
alter table public.community_badges enable row level security;
alter table public.community_scheduled enable row level security;
alter table public.community_translate_usage enable row level security;
revoke all on public.community_pairs, public.community_pair_queue, public.community_daily_prompts, public.community_events,
  public.community_event_reminders, public.community_event_questions, public.community_event_votes, public.community_profiles,
  public.community_badges, public.community_scheduled, public.community_translate_usage from anon, authenticated;

create or replace function public.community_pair_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select exists (select 1 from public.community_blocks x where (x.blocker = a and x.blocked = b) or (x.blocker = b and x.blocked = a));
$fn$;

create or replace function public.community_pair_me() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare p public.community_pairs; other uuid; name text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into p from public.community_pairs where status = 'active' and auth.uid() in (user_lo, user_hi) order by created_at desc limit 1;
  if p.id is null then return jsonb_build_object('pair', null); end if;
  other := case when p.user_lo = auth.uid() then p.user_hi else p.user_lo end;
  select display_name into name from public.community_members where user_id = other;
  return jsonb_build_object('id', p.id, 'goal', p.goal, 'name', name, 'checkin', p.checkin, 'checkin_at', p.checkin_at, 'status', p.status);
end $fn$;

create or replace function public.community_pair_optin(p_goal text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare v jsonb; other uuid; goal text := left(btrim(coalesce(p_goal, '')), 80);
begin
  perform public.community_chat_gate_member();
  v := public.community_chat_classify(goal);
  if v->>'action' <> 'ok' then return v; end if;
  if exists (select 1 from public.community_pairs where status = 'active' and auth.uid() in (user_lo, user_hi)) then
    raise exception 'You already have a buddy. End that pairing first.'; end if;
  select q.user_id into other from public.community_pair_queue q
    where q.user_id <> auth.uid() and not public.community_pair_blocked(auth.uid(), q.user_id)
    order by q.created_at limit 1;
  if other is null then
    insert into public.community_pair_queue (user_id, goal) values (auth.uid(), goal)
    on conflict (user_id) do update set goal = excluded.goal;
    return jsonb_build_object('action', 'waiting');
  end if;
  delete from public.community_pair_queue where user_id in (auth.uid(), other);
  insert into public.community_pairs (user_lo, user_hi, status, goal, requested_by)
  values (least(auth.uid(), other), greatest(auth.uid(), other), 'active', goal, auth.uid());
  return jsonb_build_object('action', 'paired');
end $fn$;

create or replace function public.community_pair_request(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare other uuid;
begin
  perform public.community_chat_gate_member();
  select user_id into other from public.community_members where lower(display_name) = lower(btrim(p_name)) and status = 'active' and user_id <> auth.uid() limit 1;
  if other is null then raise exception 'No member with that display name.'; end if;
  if public.community_pair_blocked(auth.uid(), other) then raise exception 'You cannot pair with this member.'; end if;
  insert into public.community_pairs (user_lo, user_hi, status, goal, requested_by)
  values (least(auth.uid(), other), greatest(auth.uid(), other), 'pending', '', auth.uid())
  on conflict (user_lo, user_hi) do update set status = 'pending', requested_by = auth.uid(), ended_at = null
  where public.community_pairs.status = 'ended';
  return jsonb_build_object('action', 'requested');
end $fn$;

create or replace function public.community_pair_end(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  update public.community_pairs set status = 'ended', ended_at = now()
  where id = p_id and status <> 'ended' and auth.uid() in (user_lo, user_hi);
end $fn$;

create or replace function public.community_pair_checkin(p_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare v jsonb;
begin
  perform public.community_chat_gate_member();
  v := public.community_chat_classify(coalesce(p_body, ''));
  if v->>'action' <> 'ok' then return v; end if;
  update public.community_pairs set checkin = left(btrim(p_body), 200), checkin_by = auth.uid(), checkin_at = now()
  where id = p_id and status = 'active' and auth.uid() in (user_lo, user_hi);
  return v || jsonb_build_object('action', 'ok');
end $fn$;

create or replace function public.community_daily_set(p_section uuid, p_body text, p_hour int, p_minute int, p_on boolean default true) returns uuid
language plpgsql security definer set search_path = '' as $fn$
declare id uuid; v jsonb;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  v := public.community_chat_classify(coalesce(p_body, ''));
  if v->>'action' <> 'ok' then raise exception '%', coalesce(v->>'message', 'That prompt cannot be saved.'); end if;
  insert into public.community_daily_prompts (section_id, body, hour, minute, enabled, created_by)
  values (p_section, left(btrim(p_body), 200), p_hour, p_minute, coalesce(p_on, true), auth.uid()) returning community_daily_prompts.id into id;
  return id;
end $fn$;

create or replace function public.community_daily_run() returns int
language plpgsql security definer set search_path = '' as $fn$
declare n int := 0; r record; london timestamp; today date;
begin
  london := now() at time zone 'Europe/London';
  today := london::date;
  for r in select * from public.community_daily_prompts where enabled and (last_posted is null or last_posted < today)
    and (london::time >= make_time(hour, minute, 0))
  loop
    insert into public.community_messages (section_id, user_id, body, kind, status)
    select r.section_id, r.created_by, r.body, 'prompt', 'visible' where r.created_by is not null;
    update public.community_daily_prompts set last_posted = today where id = r.id;
    n := n + 1;
  end loop;
  for r in select * from public.community_scheduled where sent_at is null and send_at <= now()
  loop
    insert into public.community_messages (section_id, user_id, body, kind, status)
    select r.section_id, r.created_by, r.body, 'text', 'visible' where r.created_by is not null;
    update public.community_scheduled set sent_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $fn$;

create or replace function public.community_schedule_post(p_section uuid, p_body text, p_send timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $fn$
declare id uuid; v jsonb;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  v := public.community_chat_classify(coalesce(p_body, ''));
  if v->>'action' <> 'ok' then raise exception '%', coalesce(v->>'message', 'That announcement cannot be scheduled.'); end if;
  insert into public.community_scheduled (section_id, body, send_at, created_by)
  values (p_section, left(btrim(p_body), 500), p_send, auth.uid()) returning community_scheduled.id into id;
  return id;
end $fn$;

create or replace function public.community_event_save(p_section uuid, p_title text, p_starts timestamptz, p_ends timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $fn$
declare id uuid; v jsonb;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  v := public.community_chat_classify(coalesce(p_title, ''));
  if v->>'action' <> 'ok' then raise exception '%', coalesce(v->>'message', 'That event cannot be saved.'); end if;
  insert into public.community_events (section_id, title, starts_at, ends_at, created_by)
  values (p_section, left(btrim(p_title), 80), p_starts, p_ends, auth.uid()) returning community_events.id into id;
  return id;
end $fn$;

create or replace function public.community_event_list(p_section uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'title', e.title, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
    'reminded', exists (select 1 from public.community_event_reminders r where r.event_id = e.id and r.user_id = auth.uid()),
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'body', q.body, 'answered', q.answered, 'author', m.display_name,
      'votes', (select count(*) from public.community_event_votes v where v.question_id = q.id)) order by q.created_at), '[]'::jsonb)
      from public.community_event_questions q join public.community_members m on m.user_id = q.user_id where q.event_id = e.id)
  ) order by e.starts_at), '[]'::jsonb)
  from public.community_events e where e.section_id = p_section
    and exists (select 1 from public.community_members me where me.user_id = auth.uid() and me.guidelines_at is not null);
$fn$;

create or replace function public.community_event_remind(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  perform public.community_chat_gate_member();
  insert into public.community_event_reminders (event_id, user_id) values (p_id, auth.uid()) on conflict do nothing;
end $fn$;

create or replace function public.community_event_ask(p_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare v jsonb;
begin
  perform public.community_chat_gate_member();
  if public.community_chat_bump_rate('m', date_trunc('minute', now()), 8) is null then raise exception 'You are sending messages very quickly. Please wait a minute.'; end if;
  v := public.community_chat_classify(coalesce(p_body, ''));
  if v->>'action' <> 'ok' then return v; end if;
  insert into public.community_event_questions (event_id, user_id, body) values (p_id, auth.uid(), left(btrim(p_body), 200));
  return jsonb_build_object('action', 'ok');
end $fn$;

create or replace function public.community_event_vote(p_question uuid) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  perform public.community_chat_gate_member();
  if exists (select 1 from public.community_event_votes where question_id = p_question and user_id = auth.uid()) then
    delete from public.community_event_votes where question_id = p_question and user_id = auth.uid();
  else insert into public.community_event_votes (question_id, user_id) values (p_question, auth.uid()); end if;
end $fn$;

create or replace function public.community_event_answer(p_question uuid) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.community_event_questions set answered = true where id = p_question;
end $fn$;

create or replace function public.community_profile_set(p_bio text, p_streak int default null) returns void
language plpgsql security definer set search_path = '' as $fn$
declare v jsonb;
begin
  perform public.community_chat_gate_member();
  v := public.community_chat_classify(coalesce(p_bio, ''));
  if v->>'action' <> 'ok' then raise exception '%', coalesce(v->>'message', 'That bio cannot be saved.'); end if;
  insert into public.community_profiles (user_id, bio, streak_days) values (auth.uid(), left(btrim(coalesce(p_bio, '')), 160), greatest(0, least(coalesce(p_streak, 0), 365)))
  on conflict (user_id) do update set bio = excluded.bio, streak_days = coalesce(p_streak, public.community_profiles.streak_days), updated_at = now();
  if coalesce(p_streak, 0) >= 7 then insert into public.community_badges (user_id, badge) values (auth.uid(), 'streak7') on conflict do nothing; end if;
  if coalesce(p_streak, 0) >= 30 then insert into public.community_badges (user_id, badge) values (auth.uid(), 'streak30') on conflict do nothing; end if;
end $fn$;

create or replace function public.community_profile_get(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare m public.community_members; bio text; streak int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if public.community_pair_blocked(auth.uid(), p_user) then raise exception 'This profile is not available.'; end if;
  select * into m from public.community_members where user_id = p_user and status = 'active';
  if m.user_id is null then raise exception 'Member not found.'; end if;
  select p.bio, p.streak_days into bio, streak from public.community_profiles p where p.user_id = p_user;
  return jsonb_build_object('name', m.display_name, 'bio', coalesce(bio, ''), 'joined', m.created_at, 'streak', coalesce(streak, 0),
    'badges', coalesce((select jsonb_agg(badge) from public.community_badges where user_id = p_user), '[]'::jsonb));
end $fn$;

create or replace function public.community_welcome() returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare seen boolean;
begin
  perform public.community_chat_gate_member();
  select welcomed_at is not null into seen from public.community_members where user_id = auth.uid();
  if seen then return jsonb_build_object('show', false); end if;
  update public.community_members set welcomed_at = now() where user_id = auth.uid();
  return jsonb_build_object('show', true, 'body', 'Welcome to GLP1 Life Community. Be kind. No selling or sourcing medicines or peptides, no supplier links or numbers, no dosing instructions, and nothing here replaces your GP, prescriber or pharmacist.');
end $fn$;

create or replace function public.community_share_recipe(p_section uuid, p_id text, p_title text, p_detail text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare v jsonb; mid uuid;
begin
  perform public.community_chat_gate_member();
  v := public.community_chat_classify(coalesce(p_title, '') || ' ' || coalesce(p_detail, ''));
  if v->>'action' <> 'ok' then return v; end if;
  if p_id !~ '^[a-z0-9-]{2,40}$' then raise exception 'Choose a recipe from the meal planner.'; end if;
  insert into public.community_messages (section_id, user_id, body, kind, card, status)
  values (p_section, auth.uid(), left(btrim(coalesce(p_title, 'Recipe')), 200), 'recipe',
    jsonb_build_object('type', 'recipe', 'id', p_id, 'title', left(p_title, 80), 'detail', left(coalesce(p_detail, ''), 80)), 'visible')
  returning id into mid;
  return jsonb_build_object('action', 'ok', 'id', mid);
end $fn$;

create or replace function public.claim_community_translate(p_user uuid, p_limit int default 20) returns int
language plpgsql security definer set search_path = '' as $fn$
declare d date := (now() at time zone 'Europe/London')::date; n int;
begin
  insert into public.community_translate_usage (user_id, day, n) values (p_user, d, 1)
  on conflict (user_id, day) do update set n = public.community_translate_usage.n + 1
  where public.community_translate_usage.n < p_limit
  returning public.community_translate_usage.n into n;
  if n is null then return -1; end if;
  return p_limit - n;
end $fn$;

revoke all on function public.community_pair_blocked(uuid, uuid), public.community_daily_run(), public.claim_community_translate(uuid, int) from public, anon, authenticated;
grant execute on function public.community_chat_classify(text) to service_role;
grant execute on function public.community_daily_run() to service_role;
grant execute on function public.claim_community_translate(uuid, int) to service_role;

do $$ declare f text; begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'community_pair_me','community_pair_optin','community_pair_request','community_pair_end','community_pair_checkin',
      'community_daily_set','community_schedule_post','community_event_save','community_event_list','community_event_remind',
      'community_event_ask','community_event_vote','community_event_answer','community_profile_set','community_profile_get',
      'community_welcome','community_share_recipe')
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
