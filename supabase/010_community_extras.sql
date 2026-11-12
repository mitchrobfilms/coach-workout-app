-- NOT APPLIED. Do not run this against production (paxukvgdavcolzkvcapo) until it has been reviewed.
-- Extras for the community chat: voice notes, pins, polls, weekly challenges, wins sections,
-- read receipts, notification settings, push subscriptions, mentions, search and direct messages.
-- Idempotent and non-destructive. Requires 009_community.sql (functions such as
-- community_chat_classify and community_chat_bump_rate). Does not drop tables or browse DMs.
--
-- Push is not deployed with this file. The Edge Function supabase/functions/community-push
-- needs these secrets set in the Supabase dashboard (do not invent or commit the values):
--   VAPID_PUBLIC_KEY
--   VAPID_PRIVATE_KEY
--   VAPID_SUBJECT          example: mailto:support@glp1life.co.uk
-- Android FCM is not configured. The app leaves a documented stub until a Firebase project exists.

alter table public.community_messages add column if not exists kind text not null default 'text';
alter table public.community_messages add column if not exists audio_path text;
alter table public.community_messages add column if not exists audio_seconds int;
alter table public.community_messages drop constraint if exists community_messages_content;
alter table public.community_messages add constraint community_messages_content check (char_length(btrim(body)) > 0 or image_path is not null or audio_path is not null);
alter table public.community_sections add column if not exists kind text not null default 'chat';
alter table public.community_sections add column if not exists members_can_poll boolean not null default false;
update public.community_sections set kind = 'wins' where slug = 'wins' and kind = 'chat';

create table if not exists public.community_pins (
  section_id uuid not null references public.community_sections on delete cascade,
  message_id uuid not null references public.community_messages on delete cascade,
  pinned_by uuid references auth.users on delete set null,
  pinned_at timestamptz not null default now(),
  primary key (section_id, message_id)
);
create table if not exists public.community_polls (
  id uuid primary key default gen_random_uuid(),
  message_id uuid unique references public.community_messages on delete cascade,
  section_id uuid not null references public.community_sections on delete cascade,
  question text not null check (char_length(question) between 1 and 200),
  closed_at timestamptz,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.community_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.community_polls on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  sort int not null default 0
);
create table if not exists public.community_poll_votes (
  poll_id uuid not null references public.community_polls on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  option_id uuid not null references public.community_poll_options on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);
create table if not exists public.community_week_challenges (
  id uuid primary key default gen_random_uuid(),
  section_id uuid references public.community_sections on delete set null,
  title text not null check (char_length(title) between 1 and 80),
  metric text not null check (metric in ('steps','water')),
  target numeric not null check (target > 0 and target <= 100000),
  unit text not null default 'days',
  starts date not null,
  ends date not null,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.community_week_members (
  challenge_id uuid not null references public.community_week_challenges on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  progress numeric not null default 0,
  show_board boolean not null default true,
  primary key (challenge_id, user_id)
);
create table if not exists public.community_self_reads (
  user_id uuid not null references auth.users on delete cascade,
  section_id uuid not null references public.community_sections on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, section_id)
);
create table if not exists public.community_chat_settings (
  user_id uuid primary key references auth.users on delete cascade,
  read_receipts boolean not null default true,
  dms_enabled boolean not null default true,
  notify text not null default 'all' check (notify in ('all','mentions','off'))
);
create table if not exists public.community_section_notify (
  user_id uuid not null references auth.users on delete cascade,
  section_id uuid not null references public.community_sections on delete cascade,
  mode text not null check (mode in ('mute','mentions')),
  primary key (user_id, section_id)
);
create table if not exists public.community_push_subs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  kind text not null default 'web' check (kind in ('web','fcm')),
  created_at timestamptz not null default now()
);
create table if not exists public.community_mentions (
  message_id uuid not null references public.community_messages on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create table if not exists public.community_dm_threads (
  id uuid primary key default gen_random_uuid(),
  user_lo uuid not null references auth.users on delete cascade,
  user_hi uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_lo, user_hi),
  check (user_lo < user_hi)
);
create table if not exists public.community_dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.community_dm_threads on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  image_path text,
  audio_path text,
  audio_seconds int,
  status text not null default 'visible' check (status in ('visible','held','deleted')),
  flag_reason text,
  created_at timestamptz not null default now()
);
create table if not exists public.community_dm_reads (
  thread_id uuid not null references public.community_dm_threads on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);
create table if not exists public.community_dm_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.community_dm_messages on delete cascade,
  reporter uuid not null references auth.users on delete cascade,
  reason text not null default '',
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.community_pins enable row level security;
alter table public.community_polls enable row level security;
alter table public.community_poll_options enable row level security;
alter table public.community_poll_votes enable row level security;
alter table public.community_week_challenges enable row level security;
alter table public.community_week_members enable row level security;
alter table public.community_self_reads enable row level security;
alter table public.community_chat_settings enable row level security;
alter table public.community_section_notify enable row level security;
alter table public.community_push_subs enable row level security;
alter table public.community_mentions enable row level security;
alter table public.community_dm_threads enable row level security;
alter table public.community_dm_messages enable row level security;
alter table public.community_dm_reads enable row level security;
alter table public.community_dm_reports enable row level security;

revoke all on public.community_pins, public.community_polls, public.community_poll_options, public.community_poll_votes,
  public.community_week_challenges, public.community_week_members, public.community_self_reads, public.community_chat_settings,
  public.community_section_notify, public.community_push_subs, public.community_mentions, public.community_dm_threads,
  public.community_dm_messages, public.community_dm_reads, public.community_dm_reports from anon, authenticated;

-- Members read pins, polls and challenges through RPCs. Direct messages stay inside security definer functions.
-- Admins can read DM reports only, not every DM.

drop policy if exists extras_pins_read on public.community_pins;
create policy extras_pins_read on public.community_pins for select to authenticated using (
  exists (select 1 from public.community_members m where m.user_id = auth.uid() and m.guidelines_at is not null));
drop policy if exists extras_settings_own on public.community_chat_settings;
create policy extras_settings_own on public.community_chat_settings for select to authenticated using (user_id = auth.uid());
drop policy if exists extras_push_own on public.community_push_subs;
create policy extras_push_own on public.community_push_subs for select to authenticated using (user_id = auth.uid());
drop policy if exists extras_dm_reports_admin on public.community_dm_reports;
create policy extras_dm_reports_admin on public.community_dm_reports for select to authenticated using (public.is_admin());
grant select on public.community_pins, public.community_chat_settings, public.community_push_subs, public.community_dm_reports to authenticated;

create or replace function public.community_chat_settings_get() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare s public.community_chat_settings;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into s from public.community_chat_settings where user_id = auth.uid();
  return jsonb_build_object('read_receipts', coalesce(s.read_receipts, true), 'dms_enabled', coalesce(s.dms_enabled, true), 'notify', coalesce(s.notify, 'all'),
    'sections', coalesce((select jsonb_object_agg(section_id, mode) from public.community_section_notify where user_id = auth.uid()), '{}'::jsonb));
end $fn$;

create or replace function public.community_chat_settings_set(p_receipts boolean default null, p_dms boolean default null, p_notify text default null, p_section uuid default null, p_section_mode text default null) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.community_chat_settings (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update public.community_chat_settings set
    read_receipts = coalesce(p_receipts, read_receipts),
    dms_enabled = coalesce(p_dms, dms_enabled),
    notify = case when p_notify in ('all','mentions','off') then p_notify else notify end
  where user_id = auth.uid();
  if p_receipts is false then delete from public.community_reads where user_id = auth.uid(); end if;
  if p_section is not null then
    if p_section_mode is null or p_section_mode = '' then delete from public.community_section_notify where user_id = auth.uid() and section_id = p_section;
    elsif p_section_mode in ('mute','mentions') then
      insert into public.community_section_notify (user_id, section_id, mode) values (auth.uid(), p_section, p_section_mode)
      on conflict (user_id, section_id) do update set mode = excluded.mode;
    end if;
  end if;
  return public.community_chat_settings_get();
end $fn$;

create or replace function public.community_chat_read(p_section uuid) returns void
language plpgsql security definer set search_path = '' as $fn$
declare share boolean;
begin
  perform public.community_chat_gate_member();
  insert into public.community_self_reads (user_id, section_id, last_read_at) values (auth.uid(), p_section, now())
  on conflict (user_id, section_id) do update set last_read_at = excluded.last_read_at;
  select coalesce(read_receipts, true) into share from public.community_chat_settings where user_id = auth.uid();
  if share is distinct from false then
    insert into public.community_reads (user_id, section_id, last_read_at) values (auth.uid(), p_section, now())
    on conflict (user_id, section_id) do update set last_read_at = excluded.last_read_at;
  end if;
end $fn$;

create or replace function public.community_chat_pin(p_message uuid, p_on boolean default true) returns void
language plpgsql security definer set search_path = '' as $fn$
declare sid uuid;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select section_id into sid from public.community_messages where id = p_message and status = 'visible';
  if sid is null then raise exception 'That message is not available.'; end if;
  if p_on then insert into public.community_pins (section_id, message_id, pinned_by) values (sid, p_message, auth.uid())
    on conflict (section_id, message_id) do nothing;
  else delete from public.community_pins where message_id = p_message; end if;
end $fn$;

create or replace function public.community_chat_pins(p_section uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'body', case when m.kind = 'voice' then 'Voice note' else left(m.body, 140) end, 'author', cm.display_name) order by p.pinned_at desc), '[]'::jsonb)
  from public.community_pins p
  join public.community_messages m on m.id = p.message_id and m.status = 'visible'
  join public.community_members cm on cm.user_id = m.user_id
  where p.section_id = p_section and exists (select 1 from public.community_members me where me.user_id = auth.uid() and me.guidelines_at is not null);
$fn$;

create or replace function public.community_chat_poll_create(p_section uuid, p_question text, p_options jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare m public.community_members; s public.community_sections; v jsonb; mid uuid; pid uuid; opt text; i int := 0; n int;
begin
  m := public.community_chat_gate_member();
  if m.status <> 'active' then raise exception 'Your community account cannot post.'; end if;
  select * into s from public.community_sections where id = p_section and archived_at is null;
  if s.id is null then raise exception 'That section is not available.'; end if;
  if not (public.is_admin() or s.members_can_poll) then raise exception 'Only an admin can start a poll in this section.'; end if;
  if public.community_chat_bump_rate('m', date_trunc('minute', now()), 8) is null then raise exception 'You are sending messages very quickly. Please wait a minute.'; end if;
  v := public.community_chat_classify(p_question || ' ' || coalesce(p_options::text, ''));
  if v->>'action' = 'hold' then return v || jsonb_build_object('id', null); end if;
  select count(*) into n from jsonb_array_elements_text(coalesce(p_options, '[]'::jsonb));
  if n < 2 or n > 6 then raise exception 'A poll needs 2 to 6 options.'; end if;
  insert into public.community_messages (section_id, user_id, body, kind, status) values (p_section, auth.uid(), left(btrim(p_question), 200), 'poll', 'visible') returning id into mid;
  insert into public.community_polls (message_id, section_id, question, created_by) values (mid, p_section, left(btrim(p_question), 200), auth.uid()) returning id into pid;
  for opt in select jsonb_array_elements_text(p_options) loop
    i := i + 1; insert into public.community_poll_options (poll_id, label, sort) values (pid, left(btrim(opt), 80), i);
  end loop;
  return jsonb_build_object('action', 'ok', 'id', mid, 'poll_id', pid);
end $fn$;

create or replace function public.community_chat_poll_vote(p_poll uuid, p_option uuid) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  perform public.community_chat_gate_member();
  if exists (select 1 from public.community_polls where id = p_poll and closed_at is not null) then raise exception 'This poll is closed.'; end if;
  if not exists (select 1 from public.community_poll_options where id = p_option and poll_id = p_poll) then raise exception 'Choose one of the options.'; end if;
  insert into public.community_poll_votes (poll_id, user_id, option_id) values (p_poll, auth.uid(), p_option)
  on conflict (poll_id, user_id) do update set option_id = excluded.option_id, created_at = now();
end $fn$;

create or replace function public.community_chat_poll_close(p_poll uuid) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  if not public.is_admin() and not exists (select 1 from public.community_polls where id = p_poll and created_by = auth.uid()) then raise exception 'You cannot close this poll.'; end if;
  update public.community_polls set closed_at = coalesce(closed_at, now()) where id = p_poll;
end $fn$;

create or replace function public.community_chat_polls(p_section uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'message_id', p.message_id, 'question', p.question, 'closed', p.closed_at is not null,
    'mine', p.created_by = auth.uid(),
    'options', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label,
      'n', (select count(*) from public.community_poll_votes v where v.option_id = o.id),
      'pct', case when (select count(*) from public.community_poll_votes v where v.poll_id = p.id) = 0 then 0
        else round((select count(*) from public.community_poll_votes v where v.option_id = o.id)::numeric / (select count(*) from public.community_poll_votes v where v.poll_id = p.id) * 100) end
    ) order by o.sort), '[]'::jsonb) from public.community_poll_options o where o.poll_id = p.id),
    'total', (select count(*) from public.community_poll_votes v where v.poll_id = p.id),
    'my_option', (select option_id from public.community_poll_votes v where v.poll_id = p.id and v.user_id = auth.uid())
  )), '[]'::jsonb)
  from public.community_polls p where p.section_id = p_section
    and exists (select 1 from public.community_members m where m.user_id = auth.uid() and m.guidelines_at is not null);
$fn$;

create or replace function public.community_week_create(p_section uuid, p_title text, p_metric text, p_target numeric, p_starts date, p_ends date) returns uuid
language plpgsql security definer set search_path = '' as $fn$
declare id uuid; v jsonb;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_metric not in ('steps','water') then raise exception 'Choose steps or water.'; end if;
  if p_ends < p_starts then raise exception 'The end date is before the start date.'; end if;
  v := public.community_chat_classify(coalesce(p_title, ''));
  if v->>'action' <> 'ok' then raise exception '%', coalesce(v->>'message', 'This challenge cannot be posted.'); end if;
  insert into public.community_week_challenges (section_id, title, metric, target, starts, ends, created_by)
  values (p_section, left(btrim(p_title), 80), p_metric, p_target, p_starts, p_ends, auth.uid()) returning community_week_challenges.id into id;
  return id;
end $fn$;

create or replace function public.community_week_log(p_id uuid, p_progress numeric, p_show boolean default true) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  perform public.community_chat_gate_member();
  insert into public.community_week_members (challenge_id, user_id, progress, show_board)
  values (p_id, auth.uid(), greatest(0, least(coalesce(p_progress, 0), 100000)), coalesce(p_show, true))
  on conflict (challenge_id, user_id) do update set progress = excluded.progress, show_board = excluded.show_board;
end $fn$;

create or replace function public.community_week_list(p_section uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'title', c.title, 'metric', c.metric, 'target', c.target, 'unit', c.unit, 'starts', c.starts, 'ends', c.ends,
    'entries', (select coalesce(jsonb_agg(jsonb_build_object('name', m.display_name, 'progress', e.progress, 'me', e.user_id = auth.uid(), 'hidden', not e.show_board)
      order by e.progress desc), '[]'::jsonb)
      from public.community_week_members e join public.community_members m on m.user_id = e.user_id
      where e.challenge_id = c.id and (e.show_board or e.user_id = auth.uid()))
  )), '[]'::jsonb)
  from public.community_week_challenges c
  where c.section_id = p_section and c.ends >= current_date - 7
    and exists (select 1 from public.community_members me where me.user_id = auth.uid() and me.guidelines_at is not null);
$fn$;

create or replace function public.community_chat_members(p_section uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.user_id, 'name', m.display_name) order by m.display_name), '[]'::jsonb)
  from public.community_members m
  where m.status = 'active' and m.guidelines_at is not null and m.user_id <> auth.uid()
    and not exists (select 1 from public.community_blocks b where (b.blocker = auth.uid() and b.blocked = m.user_id) or (b.blocker = m.user_id and b.blocked = auth.uid()))
    and exists (select 1 from public.community_members me where me.user_id = auth.uid() and me.guidelines_at is not null);
$fn$;

create or replace function public.community_chat_search(p_query text, p_section uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select jsonb_build_object('id', m.id, 'section_id', m.section_id, 'author', cm.display_name, 'body', left(m.body, 180), 'created_at', m.created_at) x
    from public.community_messages m
    join public.community_members cm on cm.user_id = m.user_id
    join public.community_sections s on s.id = m.section_id
    where m.status = 'visible' and s.archived_at is null and char_length(btrim(coalesce(p_query, ''))) >= 2
      and (p_section is null or m.section_id = p_section)
      and m.body ilike '%' || replace(replace(btrim(p_query), '%', ''), '_', '') || '%'
      and cm.status <> 'banned'
      and not exists (select 1 from public.community_blocks b where (b.blocker = auth.uid() and b.blocked = m.user_id) or (b.blocker = m.user_id and b.blocked = auth.uid()))
      and exists (select 1 from public.community_members me where me.user_id = auth.uid() and me.guidelines_at is not null)
    order by m.created_at desc limit 30
  ) q;
$fn$;

create or replace function public.community_dm_open(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $fn$
declare other uuid; lo uuid; hi uuid; tid uuid; dms boolean;
begin
  perform public.community_chat_gate_member();
  select user_id into other from public.community_members where lower(display_name) = lower(btrim(p_name)) and status = 'active' and user_id <> auth.uid() limit 1;
  if other is null then raise exception 'No member with that display name.'; end if;
  if exists (select 1 from public.community_blocks b where (b.blocker = auth.uid() and b.blocked = other) or (b.blocker = other and b.blocked = auth.uid())) then
    raise exception 'You cannot message someone you have blocked, or who has blocked you.'; end if;
  select coalesce(dms_enabled, true) into dms from public.community_chat_settings where user_id = other;
  if dms is false then raise exception 'This member is not accepting direct messages.'; end if;
  lo := least(auth.uid(), other); hi := greatest(auth.uid(), other);
  insert into public.community_dm_threads (user_lo, user_hi) values (lo, hi)
  on conflict (user_lo, user_hi) do update set created_at = public.community_dm_threads.created_at
  returning id into tid;
  return tid;
end $fn$;

create or replace function public.community_dm_list() returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', m.display_name, 'user_id', m.user_id,
    'preview', (select left(body, 80) from public.community_dm_messages d where d.thread_id = t.id and d.status = 'visible' order by created_at desc limit 1),
    'at', (select created_at from public.community_dm_messages d where d.thread_id = t.id and d.status = 'visible' order by created_at desc limit 1)
  ) order by t.created_at desc), '[]'::jsonb)
  from public.community_dm_threads t
  join public.community_members m on m.user_id = case when t.user_lo = auth.uid() then t.user_hi else t.user_lo end
  where auth.uid() in (t.user_lo, t.user_hi);
$fn$;

create or replace function public.community_dm_history(p_thread uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'body', d.body, 'mine', d.user_id = auth.uid(), 'author', m.display_name, 'status', d.status, 'created_at', d.created_at, 'audio_seconds', d.audio_seconds, 'kind', case when d.audio_path is not null then 'voice' else 'text' end) order by d.created_at), '[]'::jsonb)
  from public.community_dm_messages d
  join public.community_members m on m.user_id = d.user_id
  where d.thread_id = p_thread and (d.status = 'visible' or d.user_id = auth.uid())
    and exists (select 1 from public.community_dm_threads t where t.id = p_thread and auth.uid() in (t.user_lo, t.user_hi));
$fn$;

create or replace function public.community_dm_send(p_thread uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare v jsonb; id uuid;
begin
  if not exists (select 1 from public.community_dm_threads t where t.id = p_thread and auth.uid() in (t.user_lo, t.user_hi)) then raise exception 'That conversation is not available.'; end if;
  perform public.community_chat_gate_member();
  if public.community_chat_bump_rate('m', date_trunc('minute', now()), 8) is null
     or public.community_chat_bump_rate('h', date_trunc('hour', now()), 40) is null then
    raise exception 'You are sending messages very quickly. Please wait a minute.'; end if;
  v := public.community_chat_classify(coalesce(p_body, ''));
  insert into public.community_dm_messages (thread_id, user_id, body, status, flag_reason)
  values (p_thread, auth.uid(), btrim(coalesce(p_body, '')), case when v->>'action' = 'hold' then 'held' else 'visible' end, v->>'reason')
  returning community_dm_messages.id into id;
  return v || jsonb_build_object('id', id);
end $fn$;

create or replace function public.community_dm_report(p_message uuid, p_reason text default '') returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not exists (
    select 1 from public.community_dm_messages d join public.community_dm_threads t on t.id = d.thread_id
    where d.id = p_message and auth.uid() in (t.user_lo, t.user_hi)
  ) then raise exception 'That message is not available.'; end if;
  insert into public.community_dm_reports (message_id, reporter, reason) values (p_message, auth.uid(), left(coalesce(p_reason, ''), 300));
end $fn$;

create or replace function public.community_dm_queue() returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'message_id', r.message_id, 'reason', r.reason, 'body', d.body, 'user_id', d.user_id, 'author', m.display_name, 'at', r.created_at, 'dm', true) order by r.created_at), '[]'::jsonb)
  from public.community_dm_reports r
  join public.community_dm_messages d on d.id = r.message_id
  left join public.community_members m on m.user_id = d.user_id
  where public.is_admin() and not r.resolved;
$fn$;

create or replace function public.community_chat_voice(p_section uuid, p_path text, p_seconds int) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare id uuid;
begin
  perform public.community_chat_gate_member();
  if p_seconds < 1 or p_seconds > 60 then raise exception 'Voice notes are 1 to 60 seconds.'; end if;
  if p_path is null or p_path !~ ('^' || auth.uid()::text || '/[A-Za-z0-9._-]+$') then raise exception 'Voice note upload failed.'; end if;
  if exists (select 1 from public.community_sections s where s.id = p_section and s.announce_only and not public.is_admin()) then raise exception 'Only admins can post in this section.'; end if;
  if public.community_chat_bump_rate('m', date_trunc('minute', now()), 8) is null then raise exception 'You are sending messages very quickly. Please wait a minute.'; end if;
  insert into public.community_messages (section_id, user_id, body, kind, audio_path, audio_seconds, status)
  values (p_section, auth.uid(), '', 'voice', p_path, p_seconds, 'visible') returning community_messages.id into id;
  return jsonb_build_object('action', 'ok', 'id', id);
end $fn$;

create or replace function public.community_push_save(p_endpoint text, p_p256dh text, p_auth text, p_kind text default 'web') returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_kind not in ('web','fcm') then raise exception 'Unknown push kind.'; end if;
  insert into public.community_push_subs (user_id, endpoint, p256dh, auth, kind)
  values (auth.uid(), left(p_endpoint, 500), left(p_p256dh, 200), left(p_auth, 200), p_kind)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, kind = excluded.kind;
end $fn$;

-- Seen ticks: other members who share read receipts and have opened the section since this message.
create or replace function public.community_chat_seen(p_section uuid, p_at timestamptz) returns int
language sql stable security definer set search_path = '' as $fn$
  select count(*)::int from public.community_reads r
  where r.section_id = p_section and r.user_id <> auth.uid() and r.last_read_at >= p_at
    and coalesce((select s.read_receipts from public.community_chat_settings s where s.user_id = r.user_id), true);
$fn$;

do $$ declare f text; begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'community_chat_settings_get','community_chat_settings_set','community_chat_pin','community_chat_pins',
      'community_chat_poll_create','community_chat_poll_vote','community_chat_poll_close','community_chat_polls',
      'community_week_create','community_week_log','community_week_list','community_chat_members','community_chat_search',
      'community_dm_open','community_dm_list','community_dm_history','community_dm_send','community_dm_report','community_dm_queue',
      'community_push_save','community_chat_seen','community_chat_voice')
      or (n.nspname = 'public' and p.proname = 'community_chat_read')
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-voice', 'community-voice', false, 1048576, array['audio/webm','audio/ogg','audio/mp4','audio/mpeg'])
on conflict (id) do update set public = false, file_size_limit = 1048576, allowed_mime_types = array['audio/webm','audio/ogg','audio/mp4','audio/mpeg'];
drop policy if exists "voice upload own" on storage.objects;
create policy "voice upload own" on storage.objects for insert to authenticated with check (
  bucket_id = 'community-voice' and (storage.foldername(name))[1] = auth.uid()::text
  and exists (select 1 from public.community_members m where m.user_id = auth.uid() and m.status = 'active' and m.guidelines_at is not null));
drop policy if exists "voice read members" on storage.objects;
create policy "voice read members" on storage.objects for select to authenticated using (
  bucket_id = 'community-voice'
  and exists (select 1 from public.community_members m where m.user_id = auth.uid() and m.guidelines_at is not null and m.status = 'active'));
drop policy if exists "voice delete own" on storage.objects;
create policy "voice delete own" on storage.objects for delete to authenticated using (
  bucket_id = 'community-voice' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
