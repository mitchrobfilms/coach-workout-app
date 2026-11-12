-- GLP1 Life fitness studio: live timetable, class chat, reminders, optional activity log.
-- Non-destructive. Creates objects if they are missing. Does not drop tables, delete rows, or change existing data.
-- Do not apply this file to production until the pull request is reviewed.
-- Numbered 013 because the open community branch uses 009-012.
-- Requires public.is_admin(), which earlier migrations already use.
--
-- Secrets are NOT created here and no values are stored in the app:
--   BUNNY_STREAM_API_KEY   server only, for creating a Bunny Stream live input
--   BUNNY_LIVE_LIBRARY_ID  public config once a live library exists (not the on-demand video library)
--   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT   web push for Remind me

create table if not exists public.fitness_live_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 80),
  coach text not null check (char_length(btrim(coach)) between 2 and 60),
  starts_at timestamptz not null,
  level text not null check (level in ('beginner', 'intermediate', 'advanced')),
  duration_min int not null check (duration_min between 5 and 90),
  focus text not null default 'full',
  provider text not null default 'none' check (provider in ('none', 'bunny-live', 'hls')),
  bunny_stream_id text,
  hls_url text,
  replay_video_id text,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  check (hls_url is null or hls_url ~ '^https://')
);
create index if not exists fitness_live_sessions_starts on public.fitness_live_sessions (starts_at);

create table if not exists public.fitness_live_chat (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.fitness_live_sessions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  author text not null default 'Member',
  body text not null check (char_length(body) between 1 and 500),
  status text not null default 'visible' check (status in ('visible', 'blocked')),
  flag_reason text,
  created_at timestamptz not null default now()
);
create index if not exists fitness_live_chat_session on public.fitness_live_chat (session_id, created_at);

create table if not exists public.fitness_reminders (
  session_id uuid not null references public.fitness_live_sessions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table if not exists public.fitness_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  minutes int not null check (minutes between 1 and 180),
  kcal_est numeric,
  performed_at timestamptz not null default now(),
  source text not null default 'app'
);
create index if not exists fitness_activity_user on public.fitness_activity (user_id, performed_at desc);

alter table public.fitness_live_sessions enable row level security;
alter table public.fitness_live_chat enable row level security;
alter table public.fitness_reminders enable row level security;
alter table public.fitness_activity enable row level security;

drop policy if exists fitness_live_read on public.fitness_live_sessions;
create policy fitness_live_read on public.fitness_live_sessions for select to authenticated
  using (status <> 'cancelled' or public.is_admin());
drop policy if exists fitness_chat_read on public.fitness_live_chat;
create policy fitness_chat_read on public.fitness_live_chat for select to authenticated
  using (status = 'visible' or user_id = auth.uid() or public.is_admin());
drop policy if exists fitness_remind_read on public.fitness_reminders;
create policy fitness_remind_read on public.fitness_reminders for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists fitness_activity_read on public.fitness_activity;
create policy fitness_activity_read on public.fitness_activity for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

revoke all on public.fitness_live_sessions, public.fitness_live_chat, public.fitness_reminders, public.fitness_activity from anon, authenticated;
grant select on public.fitness_live_sessions, public.fitness_live_chat, public.fitness_reminders, public.fitness_activity to authenticated;

-- Same boundaries as the community filter, kept local so this migration does not depend on a later edit of that function.
create or replace function public.fitness_classify(t text) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare s text := lower(coalesce(t, ''));
begin
  if s ~ '(reconstitut|bacteriostatic|bac\s*water|mix(ing|ed)?\s+(the\s+|my\s+)?(vial|powder|peptide))' then
    return jsonb_build_object('action', 'block', 'reason', 'mixing');
  end if;
  if s ~ '(supplier|vendor|for sale|sourcing|where (can|do) (i|you|u) (get|buy|order))' and s ~ '(peptide|reta|tirz|sema|mounjaro|wegovy|ozempic|pen|vial)' then
    return jsonb_build_object('action', 'block', 'reason', 'selling');
  end if;
  if s ~ '(\d+(\.\d+)?\s?(mg|mcg|µg|ml|iu|units?)|what dose|you should (take|inject)|microdos)' then
    return jsonb_build_object('action', 'block', 'reason', 'dosing');
  end if;
  if s ~ 'https?://' then
    return jsonb_build_object('action', 'block', 'reason', 'link');
  end if;
  return jsonb_build_object('action', 'ok', 'reason', null);
end $$;

create or replace function public.fitness_rule(reason text) returns text
language sql immutable set search_path = '' as $$
  select case reason
    when 'mixing' then 'Class chat cannot include mixing or reconstitution. Ask your prescriber or pharmacist.'
    when 'selling' then 'Class chat cannot include buying, selling or sourcing medication.'
    when 'dosing' then 'Class chat cannot include doses or dosing advice. Your prescriber decides that. Check with your GP.'
    when 'link' then 'Links are not posted in class chat.'
    else 'This cannot be posted.' end $$;

create or replace function public.fitness_live_phase(starts timestamptz, mins int, status text) returns text
language sql stable set search_path = '' as $$
  select case
    when status = 'cancelled' then 'cancelled'
    when now() < starts then 'upcoming'
    when now() < starts + make_interval(mins => mins) then 'live'
    else 'ended' end $$;

create or replace function public.fitness_live_list() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'title', s.title, 'coach', s.coach, 'startsAt', s.starts_at, 'level', s.level,
    'durationMin', s.duration_min, 'focus', s.focus, 'provider', s.provider, 'bunnyStreamId', s.bunny_stream_id,
    'hlsUrl', s.hls_url, 'replayVideoId', s.replay_video_id, 'status', s.status,
    'phase', public.fitness_live_phase(s.starts_at, s.duration_min, s.status)
  ) order by s.starts_at), '[]'::jsonb)
  from public.fitness_live_sessions s
  where auth.uid() is not null
    and (s.status <> 'cancelled' or public.is_admin())
    and s.starts_at > now() - interval '30 days' $$;

create or replace function public.fitness_live_save(p_title text, p_coach text, p_starts timestamptz, p_level text, p_duration int, p_focus text default 'full', p_provider text default 'none', p_bunny text default null, p_hls text default null, p_replay text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only'; end if;
  if p_starts is null then raise exception 'Choose a start time.'; end if;
  if p_level not in ('beginner', 'intermediate', 'advanced') then raise exception 'Level must be beginner, intermediate or advanced.'; end if;
  if p_duration < 5 or p_duration > 90 then raise exception 'Duration must be between 5 and 90 minutes.'; end if;
  if coalesce(p_provider, 'none') not in ('none', 'bunny-live', 'hls') then raise exception 'Provider must be none, bunny-live or hls.'; end if;
  if nullif(btrim(coalesce(p_hls, '')), '') is not null and btrim(p_hls) !~ '^https://' then raise exception 'HLS address must start with https://'; end if;
  insert into public.fitness_live_sessions (title, coach, starts_at, level, duration_min, focus, provider, bunny_stream_id, hls_url, replay_video_id, created_by)
  values (btrim(p_title), btrim(p_coach), p_starts, p_level, p_duration, coalesce(nullif(btrim(coalesce(p_focus, '')), ''), 'full'), coalesce(p_provider, 'none'), nullif(btrim(coalesce(p_bunny, '')), ''), nullif(btrim(coalesce(p_hls, '')), ''), nullif(btrim(coalesce(p_replay, '')), ''), auth.uid())
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.fitness_live_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only'; end if;
  update public.fitness_live_sessions set status = 'cancelled' where id = p_id;
end $$;

create or replace function public.fitness_chat_list(p_session uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'author', c.author, 'body', c.body, 'at', c.created_at, 'mine', c.user_id = auth.uid()) order by c.created_at), '[]'::jsonb)
  from public.fitness_live_chat c
  where c.session_id = p_session and auth.uid() is not null and (c.status = 'visible' or c.user_id = auth.uid() or public.is_admin()) $$;

create or replace function public.fitness_chat_post(p_session uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.fitness_live_sessions; v jsonb; cid uuid; name text;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select * into s from public.fitness_live_sessions where id = p_session and status <> 'cancelled';
  if s.id is null then raise exception 'That class is not available.'; end if;
  if now() < s.starts_at - interval '10 minutes' or now() > s.starts_at + make_interval(mins => s.duration_min) + interval '15 minutes' then
    raise exception 'Chat is open from 10 minutes before the class until shortly after it ends.';
  end if;
  if exists (select 1 from public.fitness_live_chat where user_id = auth.uid() and created_at > now() - interval '2 seconds') then
    raise exception 'Please wait a moment before sending another message.';
  end if;
  v := public.fitness_classify(p_body);
  begin
    select coalesce(nullif(btrim(p.name), ''), 'Member') into name from public.profiles p where p.user_id = auth.uid();
  exception when undefined_table or undefined_column then
    name := 'Member';
  end;
  name := coalesce(name, 'Member');
  insert into public.fitness_live_chat (session_id, user_id, author, body, status, flag_reason)
  values (p_session, auth.uid(), name, btrim(p_body), case when v->>'action' = 'block' then 'blocked' else 'visible' end, v->>'reason')
  returning id into cid;
  return v || jsonb_build_object('id', cid, 'message', case when v->>'action' = 'block' then public.fitness_rule(v->>'reason') else '' end);
end $$;

create or replace function public.fitness_remind(p_session uuid, p_on boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if p_on then insert into public.fitness_reminders (session_id, user_id) values (p_session, auth.uid()) on conflict do nothing;
  else delete from public.fitness_reminders where session_id = p_session and user_id = auth.uid(); end if;
end $$;

create or replace function public.fitness_log_activity(p_title text, p_minutes int, p_kcal numeric default null, p_at timestamptz default now()) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if p_minutes < 1 or p_minutes > 180 then raise exception 'Minutes look wrong.'; end if;
  insert into public.fitness_activity (user_id, title, minutes, kcal_est, performed_at, source)
  values (auth.uid(), left(btrim(p_title), 80), p_minutes, p_kcal, coalesce(p_at, now()), 'app')
  returning id into new_id;
  return new_id;
end $$;

revoke all on function public.fitness_classify(text) from public, anon;
revoke all on function public.fitness_rule(text) from public, anon;
revoke all on function public.fitness_live_phase(timestamptz, int, text) from public, anon;
revoke all on function public.fitness_live_list() from public, anon;
revoke all on function public.fitness_live_save(text, text, timestamptz, text, int, text, text, text, text, text) from public, anon;
revoke all on function public.fitness_live_cancel(uuid) from public, anon;
revoke all on function public.fitness_chat_list(uuid) from public, anon;
revoke all on function public.fitness_chat_post(uuid, text) from public, anon;
revoke all on function public.fitness_remind(uuid, boolean) from public, anon;
revoke all on function public.fitness_log_activity(text, int, numeric, timestamptz) from public, anon;
grant execute on function public.fitness_live_list() to authenticated;
grant execute on function public.fitness_live_save(text, text, timestamptz, text, int, text, text, text, text, text) to authenticated;
grant execute on function public.fitness_live_cancel(uuid) to authenticated;
grant execute on function public.fitness_chat_list(uuid) to authenticated;
grant execute on function public.fitness_chat_post(uuid, text) to authenticated;
grant execute on function public.fitness_remind(uuid, boolean) to authenticated;
grant execute on function public.fitness_log_activity(text, int, numeric, timestamptz) to authenticated;
