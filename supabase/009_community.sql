-- NOT APPLIED. Do not run this against production (paxukvgdavcolzkvcapo) until it has been reviewed.
-- GLP1 Life community chat: one community, many sections, WhatsApp-style messages.
-- Idempotent and non-destructive. It does not drop tables, posts, or member rows.
-- The feed from 004_community.sql is left in place. Chat writes go through SECURITY DEFINER
-- RPCs. The website shows "coming soon" until these functions exist.
-- Requires public.is_admin(), already used since 003. A deny-all stub is created only when
-- that function is missing, so this file can be read on an empty database.

create or replace function public.community_chat_touch_admin() returns void
language plpgsql as $fn$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_admin'
  ) then
    execute 'create function public.is_admin() returns boolean language sql stable security definer set search_path = '''' as $stub$ select false $stub$';
  end if;
end $fn$;
select public.community_chat_touch_admin();
drop function public.community_chat_touch_admin();

create table if not exists public.community_members (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 30),
  guidelines_at timestamptz,
  status text not null default 'active' check (status in ('active','suspended','banned')),
  strikes int not null default 0,
  last_strike_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.community_blocks (
  blocker uuid references auth.users on delete cascade,
  blocked uuid references auth.users on delete cascade,
  primary key (blocker, blocked)
);
create table if not exists public.community_modlog (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete set null,
  kind text not null,
  target_id uuid,
  action text not null,
  reason text,
  excerpt text,
  created_at timestamptz not null default now(),
  reviewed boolean not null default false
);

create table if not exists public.community_sections (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null check (char_length(name) between 1 and 40),
  description text not null default '' check (char_length(description) <= 200),
  emoji text not null default '💬' check (char_length(emoji) between 1 and 8),
  sort int not null default 100,
  announce_only boolean not null default false,
  archived_at timestamptz,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.community_messages (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.community_sections on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  image_path text,
  reply_to uuid references public.community_messages on delete set null,
  status text not null default 'visible' check (status in ('visible','held','deleted')),
  flag_reason text,
  created_at timestamptz not null default now(),
  constraint community_messages_content check (char_length(btrim(body)) > 0 or image_path is not null)
);
create index if not exists community_messages_section_created on public.community_messages (section_id, created_at desc);
create table if not exists public.community_msg_reactions (
  message_id uuid references public.community_messages on delete cascade,
  user_id uuid references auth.users on delete cascade,
  emoji text not null check (emoji in ('👍','❤️','😂','😮','😢','🙏')),
  primary key (message_id, user_id, emoji)
);
create table if not exists public.community_reads (
  user_id uuid references auth.users on delete cascade,
  section_id uuid references public.community_sections on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, section_id)
);
create table if not exists public.community_chat_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.community_messages on delete cascade,
  reporter uuid not null references auth.users on delete cascade,
  reason text not null default '',
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.community_chat_mutes (
  user_id uuid primary key references auth.users on delete cascade,
  until timestamptz not null,
  by_admin uuid references auth.users on delete set null,
  reason text,
  created_at timestamptz not null default now()
);
create table if not exists public.community_chat_rate (
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('m','h')),
  bucket timestamptz not null,
  n int not null default 0,
  primary key (user_id, kind, bucket)
);
create table if not exists public.community_chat_meta (
  id int primary key check (id = 1),
  body text not null,
  updated_at timestamptz not null default now()
);

alter table public.community_sections enable row level security;
alter table public.community_messages enable row level security;
alter table public.community_msg_reactions enable row level security;
alter table public.community_reads enable row level security;
alter table public.community_chat_reports enable row level security;
alter table public.community_chat_mutes enable row level security;
alter table public.community_chat_rate enable row level security;
alter table public.community_chat_meta enable row level security;
alter table public.community_members enable row level security;
alter table public.community_blocks enable row level security;
alter table public.community_modlog enable row level security;

insert into public.community_chat_meta (id, body) values (1,
  'Be kind. No selling or sourcing medicines or peptides, no supplier links or numbers, no dosing instructions, and no advice that replaces your GP or pharmacist.')
on conflict (id) do nothing;

insert into public.community_sections (slug, name, description, emoji, sort, announce_only) values
  ('announcements', 'Announcements', 'News from GLP1 Life. Only admins can post.', '📣', 10, true),
  ('general', 'General', 'Say hello and talk about the week.', '💬', 20, false),
  ('food', 'Food & Recipes', 'High-protein ideas, batch cooking and shop finds.', '🥗', 30, false),
  ('fitness', 'Fitness', 'Walks, classes and gentle strength.', '💪', 40, false),
  ('wins', 'Weight-loss Wins', 'Non-scale victories and kind encouragement.', '🏆', 50, false)
on conflict (slug) do nothing;

-- Soft keyword filter. Experiences stay allowed. Selling, sourcing, supplier contact,
-- dosing instructions and advice that replaces a clinician are held, not posted.
-- Keep in step with classifyChat() in community-chat-core.js.
create or replace function public.community_chat_classify(t text) returns jsonb
language plpgsql immutable set search_path = '' as $fn$
declare s text := coalesce(t, ''); meds boolean; source boolean; phone boolean; reason text;
begin
  meds := s ~* '\y(peptides?|retatrutide|reta|tirzepatide|tirz|semaglutide|sema|mounjaro|wegovy|ozempic|zepbound|liraglutide|saxenda|pens?|vials?|meds?|medication|jabs?)\y'
    or s ~* 'grey\s*market|gray\s*market|research\s*chem';
  source := s ~* '\y(buy(ing)?|bought|sell(ing)?|sold|for sale|order(ing)?|supplier|vendor|sourc(e|es|ing)|stockist|dm me|pm me|whatsapp me|telegram|text me)\y';
  phone := s ~ '\+?\d[\d[:space:]().-]{8,}\d';
  if s ~* '\ywa\.me\y|\yt\.me\y|chat\.whatsapp\.com' or (source and meds) or (s ~* 'https?://|www\.' and meds) or (phone and (meds or source)) then
    reason := 'selling';
  elsif s ~* '\yyou should (take|inject|increase|decrease|double|skip|split|start|microdose|come off|stop)\y|\y(what dose|how much) should (i|you|u)\y|\yshould (i|you|u) (take|inject|increase|skip|split)\y|\ymicrodos|\ycounting clicks\y|\y(increase|double|split|skip) (it|yours|your dose|the dose)\y'
     or s ~* '(^|[.!?]\s+|\yplease\s+)(take|inject|start(\s+at|\s+on)?)\s+\d'
     or (s ~* '\y(take|inject|use|start(\s+at|\s+on)?)\s+\d+(\.\d+)?\s?(mg|mcg|µg|ml|iu|units?|clicks?)\y' and s !~* '\y(i|i''m|im|i''ve|ive)\y') then
    reason := 'dosing';
  elsif s ~* '\y(don''t|do not|dont)\s+(bother\s+)?(ask|see|call)(ing)?\s+(your|a|the)\s+(gp|doctor|prescriber|pharmacist)\y'
     or s ~* '\yinstead of (seeing |asking )?(your|a) (gp|doctor|prescriber|pharmacist)\y'
     or s ~* '\y(no need to|you don''t need to|you dont need to) (see|ask) (a |your )?(gp|doctor|prescriber|pharmacist)\y'
     or s ~* '\yyou (don''t|dont) need a (prescription|gp|doctor|prescriber)\y'
     or s ~* '\yignore your (gp|doctor|prescriber|pharmacist)\y' then
    reason := 'medical';
  end if;
  return jsonb_build_object('action', case when reason is null then 'ok' else 'hold' end, 'reason', reason,
    'message', case reason
      when 'selling' then 'This is held for review and is not in the chat. GLP1 Life does not allow selling, sourcing, supplier links or contact numbers for medicines or peptides.'
      when 'dosing' then 'This is held for review and is not in the chat. Please share how you feel, not dosing instructions. Your prescriber decides your dose.'
      when 'medical' then 'This is held for review and is not in the chat. Members cannot give advice that replaces a GP, prescriber or pharmacist.'
      else null end);
end $fn$;

create or replace function public.community_chat_me() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare m public.community_members; mute timestamptz;
begin
  if auth.uid() is null then return jsonb_build_object('signed_in', false); end if;
  select * into m from public.community_members where user_id = auth.uid();
  select until into mute from public.community_chat_mutes where user_id = auth.uid();
  return jsonb_build_object(
    'signed_in', true,
    'member', m.user_id is not null,
    'display_name', m.display_name,
    'guidelines', m.guidelines_at is not null,
    'status', coalesce(m.status, 'active'),
    'is_admin', public.is_admin(),
    'muted_until', mute,
    'user_id', auth.uid(),
    'pinned', (select body from public.community_chat_meta where id = 1));
end $fn$;

create or replace function public.community_chat_join(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare n text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if char_length(n) < 2 or char_length(n) > 30 or n ~ '@' then
    raise exception 'Choose a display name of 2-30 characters, and do not use your email.'; end if;
  insert into public.community_members (user_id, display_name, guidelines_at)
  values (auth.uid(), n, now())
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        guidelines_at = coalesce(public.community_members.guidelines_at, now());
  return public.community_chat_me();
end $fn$;

create or replace function public.community_chat_gate_member() returns public.community_members
language plpgsql stable security definer set search_path = '' as $fn$
declare m public.community_members;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into m from public.community_members where user_id = auth.uid();
  if m.user_id is null or m.guidelines_at is null then
    raise exception 'Please read and accept the community guidelines first.'; end if;
  return m;
end $fn$;

create or replace function public.community_chat_sections() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare result jsonb;
begin
  perform public.community_chat_gate_member();
  select coalesce(jsonb_agg(row order by (row->>'sort')::int), '[]'::jsonb) into result from (
    select jsonb_build_object(
      'id', s.id, 'slug', s.slug, 'name', s.name, 'description', s.description, 'emoji', s.emoji,
      'sort', s.sort, 'announce_only', s.announce_only, 'archived', s.archived_at is not null,
      'last_body', lm.body, 'last_author', lm.author, 'last_at', lm.created_at, 'unread', coalesce(ur.n, 0)
    ) as row
    from public.community_sections s
    left join lateral (
      select left(case when btrim(coalesce(m.body, '')) = '' and m.image_path is not null then 'Photo' else m.body end, 140) as body,
             cm.display_name as author, m.created_at
      from public.community_messages m
      join public.community_members cm on cm.user_id = m.user_id
      where m.section_id = s.id and m.status = 'visible' and cm.status <> 'banned'
        and not exists (select 1 from public.community_blocks b where (b.blocker = auth.uid() and b.blocked = m.user_id) or (b.blocker = m.user_id and b.blocked = auth.uid()))
      order by m.created_at desc limit 1
    ) lm on true
    left join lateral (
      select count(*)::int as n from public.community_messages m
      join public.community_members cm on cm.user_id = m.user_id
      where m.section_id = s.id and m.status = 'visible' and m.user_id <> auth.uid() and cm.status <> 'banned'
        and m.created_at > coalesce((select r.last_read_at from public.community_reads r where r.user_id = auth.uid() and r.section_id = s.id), '-infinity'::timestamptz)
        and not exists (select 1 from public.community_blocks b where (b.blocker = auth.uid() and b.blocked = m.user_id) or (b.blocker = m.user_id and b.blocked = auth.uid()))
    ) ur on true
    where s.archived_at is null or public.is_admin()
  ) q;
  return result;
end $fn$;

create or replace function public.community_chat_history(p_section uuid, p_before timestamptz default null, p_limit int default 40) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare v_lim int := least(greatest(coalesce(p_limit, 40), 1), 50); v_rows jsonb; v_count int;
begin
  perform public.community_chat_gate_member();
  if not exists (select 1 from public.community_sections s where s.id = p_section and (s.archived_at is null or public.is_admin())) then
    raise exception 'That section is not available.'; end if;
  with page as (
    select m.id, m.body, m.image_path, m.created_at, m.status, m.user_id, m.reply_to, cm.display_name
    from public.community_messages m
    join public.community_members cm on cm.user_id = m.user_id
    where m.section_id = p_section
      and (m.status = 'visible' or (m.user_id = auth.uid() and m.status = 'held'))
      and (cm.status <> 'banned' or m.user_id = auth.uid())
      and (p_before is null or m.created_at < p_before)
      and not exists (select 1 from public.community_blocks b where (b.blocker = auth.uid() and b.blocked = m.user_id) or (b.blocker = m.user_id and b.blocked = auth.uid()))
    order by m.created_at desc
    limit v_lim + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'body', p.body, 'image', p.image_path, 'created_at', p.created_at, 'status', p.status,
    'mine', p.user_id = auth.uid(), 'author', p.display_name,
    'user_id', case when p.user_id = auth.uid() then null else p.user_id end,
    'reply', case when p.reply_to is null then null else (
      select jsonb_build_object('id', r.id, 'author', rm.display_name,
        'body', case when r.status = 'deleted' then '' else left(coalesce(nullif(btrim(r.body), ''), 'Photo'), 180) end,
        'gone', r.status = 'deleted')
      from public.community_messages r left join public.community_members rm on rm.user_id = r.user_id where r.id = p.reply_to) end,
    'reactions', coalesce((select jsonb_object_agg(e, n) from (select emoji e, count(*) n from public.community_msg_reactions x where x.message_id = p.id group by emoji) q), '{}'::jsonb),
    'my_reactions', coalesce((select jsonb_agg(emoji) from public.community_msg_reactions x where x.message_id = p.id and x.user_id = auth.uid()), '[]'::jsonb)
  ) order by p.created_at), '[]'::jsonb), count(*)
  into v_rows, v_count
  from page p;
  if v_count > v_lim then
    select coalesce(jsonb_agg(value order by value->>'created_at'), '[]'::jsonb) into v_rows
    from jsonb_array_elements(v_rows) with ordinality where ordinality > 1;
  end if;
  return jsonb_build_object('messages', coalesce(v_rows, '[]'::jsonb), 'has_more', v_count > v_lim);
end $fn$;

create or replace function public.community_chat_bump_rate(p_kind text, p_bucket timestamptz, p_max int) returns int
language plpgsql security definer set search_path = '' as $fn$
declare v int;
begin
  begin
    insert into public.community_chat_rate as r (user_id, kind, bucket, n)
    values (auth.uid(), p_kind, p_bucket, 1)
    on conflict (user_id, kind, bucket) do update set n = r.n + 1 where r.n < p_max
    returning n into v;
  exception when no_data_found then
    v := null;
  end;
  return v;
end $fn$;

create or replace function public.community_chat_send(p_section uuid, p_body text default '', p_image text default null, p_reply uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare m public.community_members; s public.community_sections; v jsonb; v_id uuid; txt text := btrim(coalesce(p_body, ''));
begin
  m := public.community_chat_gate_member();
  if m.status <> 'active' then raise exception 'Your community account is % and cannot post.', m.status; end if;
  if exists (select 1 from public.community_chat_mutes where user_id = auth.uid() and until > now()) then
    raise exception 'You are muted and cannot post yet.'; end if;
  select * into s from public.community_sections where id = p_section;
  if s.id is null or s.archived_at is not null then raise exception 'That section is not available.'; end if;
  if s.announce_only and not public.is_admin() then raise exception 'Only admins can post in this section.'; end if;
  if txt = '' and p_image is null then raise exception 'Write a message or add a photo.'; end if;
  if p_image is not null and p_image !~ ('^' || auth.uid()::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'Use a JPEG, PNG or WebP photo under 2 MB.'; end if;
  if p_reply is not null and not exists (
    select 1 from public.community_messages where id = p_reply and section_id = p_section and status <> 'deleted'
  ) then raise exception 'That message is no longer available to reply to.'; end if;
  delete from public.community_chat_rate where user_id = auth.uid() and bucket < now() - interval '2 days';
  if public.community_chat_bump_rate('m', date_trunc('minute', now()), 8) is null
     or public.community_chat_bump_rate('h', date_trunc('hour', now()), 40) is null then
    raise exception 'You are sending messages very quickly. Please wait a minute.'; end if;
  v := public.community_chat_classify(txt);
  insert into public.community_messages (section_id, user_id, body, image_path, reply_to, status, flag_reason)
  values (p_section, auth.uid(), txt, p_image, p_reply, case when v->>'action' = 'hold' then 'held' else 'visible' end, v->>'reason')
  returning id into v_id;
  if v->>'action' = 'hold' then
    insert into public.community_modlog (user_id, kind, target_id, action, reason, excerpt)
    values (auth.uid(), 'chat', v_id, 'held', v->>'reason', left(txt, 280));
  end if;
  return v || jsonb_build_object('id', v_id);
end $fn$;

create or replace function public.community_chat_react(p_message uuid, p_emoji text) returns boolean
language plpgsql security definer set search_path = '' as $fn$
declare m public.community_members;
begin
  m := public.community_chat_gate_member();
  if m.status <> 'active' then raise exception 'Your community account cannot react right now.'; end if;
  if p_emoji not in ('👍','❤️','😂','😮','😢','🙏') then raise exception 'That reaction is not available.'; end if;
  if not exists (select 1 from public.community_messages where id = p_message and status = 'visible') then
    raise exception 'That message is not available.'; end if;
  if exists (select 1 from public.community_msg_reactions where message_id = p_message and user_id = auth.uid() and emoji = p_emoji) then
    delete from public.community_msg_reactions where message_id = p_message and user_id = auth.uid() and emoji = p_emoji;
    return false;
  end if;
  insert into public.community_msg_reactions (message_id, user_id, emoji) values (p_message, auth.uid(), p_emoji);
  return true;
end $fn$;

create or replace function public.community_chat_read(p_section uuid) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  perform public.community_chat_gate_member();
  insert into public.community_reads (user_id, section_id, last_read_at) values (auth.uid(), p_section, now())
  on conflict (user_id, section_id) do update set last_read_at = excluded.last_read_at;
end $fn$;

create or replace function public.community_chat_report(p_message uuid, p_reason text default '') returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  perform public.community_chat_gate_member();
  if not exists (select 1 from public.community_messages where id = p_message and status = 'visible') then
    raise exception 'That message is not available.'; end if;
  insert into public.community_chat_reports (message_id, reporter, reason)
  values (p_message, auth.uid(), left(coalesce(p_reason, ''), 300));
  insert into public.community_modlog (user_id, kind, target_id, action, reason)
  values (auth.uid(), 'chat', p_message, 'reported', left(coalesce(p_reason, ''), 300));
end $fn$;

create or replace function public.community_chat_block(p_user uuid, p_on boolean default true) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_user = auth.uid() then raise exception 'You cannot block yourself.'; end if;
  if p_on then insert into public.community_blocks (blocker, blocked) values (auth.uid(), p_user) on conflict do nothing;
  else delete from public.community_blocks where blocker = auth.uid() and blocked = p_user; end if;
end $fn$;

create or replace function public.community_chat_delete(p_message uuid) returns void
language plpgsql security definer set search_path = '' as $fn$
declare owner uuid;
begin
  perform public.community_chat_gate_member();
  select user_id into owner from public.community_messages where id = p_message;
  if owner is null then raise exception 'That message is not available.'; end if;
  if owner <> auth.uid() and not public.is_admin() then raise exception 'You can only delete your own messages.'; end if;
  update public.community_messages set status = 'deleted' where id = p_message;
  if public.is_admin() and owner <> auth.uid() then
    insert into public.community_modlog (user_id, kind, target_id, action) values (auth.uid(), 'chat', p_message, 'admin_delete');
  end if;
end $fn$;

create or replace function public.community_chat_section_save(p_id uuid default null, p_name text default null, p_description text default null, p_emoji text default null, p_announce boolean default null) returns uuid
language plpgsql security definer set search_path = '' as $fn$
declare v_id uuid := p_id; v_name text := btrim(coalesce(p_name, '')); v_slug text; v_emoji text := coalesce(nullif(btrim(coalesce(p_emoji, '')), ''), '💬');
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if char_length(v_emoji) > 8 then raise exception 'Use a shorter emoji.'; end if;
  if v_id is null then
    if char_length(v_name) < 1 or char_length(v_name) > 40 then raise exception 'Name the section in 40 characters or fewer.'; end if;
    v_slug := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
    if v_slug = '' then v_slug := 'section'; end if;
    if exists (select 1 from public.community_sections where slug = v_slug) then
      v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4); end if;
    insert into public.community_sections (slug, name, description, emoji, sort, announce_only, created_by)
    values (v_slug, v_name, left(coalesce(p_description, ''), 200), v_emoji,
      coalesce((select max(sort) + 10 from public.community_sections), 10), coalesce(p_announce, false), auth.uid())
    returning id into v_id;
  else
    update public.community_sections set
      name = case when char_length(v_name) > 0 then left(v_name, 40) else name end,
      description = case when p_description is null then description else left(p_description, 200) end,
      emoji = v_emoji,
      announce_only = coalesce(p_announce, announce_only)
    where id = v_id;
    if not found then raise exception 'Section not found'; end if;
  end if;
  return v_id;
end $fn$;

create or replace function public.community_chat_section_archive(p_id uuid, p_on boolean default true) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.community_sections set archived_at = case when p_on then coalesce(archived_at, now()) else null end where id = p_id;
end $fn$;

create or replace function public.community_chat_section_delete(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  delete from public.community_sections where id = p_id;
end $fn$;

create or replace function public.community_chat_reorder(p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $fn$
declare i int;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  for i in 1 .. coalesce(array_length(p_ids, 1), 0) loop
    update public.community_sections set sort = i * 10 where id = p_ids[i];
  end loop;
end $fn$;

create or replace function public.community_chat_queue() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only'; end if;
  return jsonb_build_object(
    'held', coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'body', m.body, 'reason', m.flag_reason, 'author', cm.display_name, 'user_id', m.user_id,
      'section', s.name, 'at', m.created_at) order by m.created_at)
      from public.community_messages m
      join public.community_members cm on cm.user_id = m.user_id
      join public.community_sections s on s.id = m.section_id
      where m.status = 'held'), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'message_id', r.message_id, 'reason', r.reason, 'body', m.body, 'author', cm.display_name,
      'user_id', m.user_id, 'at', r.created_at) order by r.created_at)
      from public.community_chat_reports r
      join public.community_messages m on m.id = r.message_id
      left join public.community_members cm on cm.user_id = m.user_id
      where not r.resolved), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
      'user_id', cm.user_id, 'name', cm.display_name, 'status', cm.status, 'muted_until', mu.until) order by cm.display_name)
      from public.community_members cm
      left join public.community_chat_mutes mu on mu.user_id = cm.user_id and mu.until > now()
      where cm.status <> 'active' or mu.user_id is not null), '[]'::jsonb));
end $fn$;

create or replace function public.community_chat_moderate(p_kind text, p_id uuid, p_action text) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only'; end if;
  if p_kind = 'message' and p_action = 'approve' then
    update public.community_messages set status = 'visible', flag_reason = null where id = p_id and status = 'held';
  elsif p_kind = 'message' and p_action = 'delete' then
    update public.community_messages set status = 'deleted' where id = p_id;
    update public.community_chat_reports set resolved = true where message_id = p_id;
  elsif p_kind = 'report' and p_action = 'dismiss' then
    update public.community_chat_reports set resolved = true where id = p_id;
  elsif p_kind = 'user' and p_action = 'mute' then
    insert into public.community_chat_mutes (user_id, until, by_admin, reason)
    values (p_id, now() + interval '24 hours', auth.uid(), 'admin')
    on conflict (user_id) do update set until = excluded.until, by_admin = auth.uid(), reason = 'admin';
  elsif p_kind = 'user' and p_action = 'ban' then
    update public.community_members set status = 'banned' where user_id = p_id;
  elsif p_kind = 'user' and p_action = 'restore' then
    update public.community_members set status = 'active', strikes = 0 where user_id = p_id;
    delete from public.community_chat_mutes where user_id = p_id;
  else raise exception 'bad action'; end if;
  insert into public.community_modlog (user_id, kind, target_id, action) values (auth.uid(), 'chat_' || p_kind, p_id, 'admin_' || p_action);
end $fn$;

revoke all on function public.community_chat_classify(text) from public, anon, authenticated;
revoke all on function public.community_chat_gate_member() from public, anon, authenticated;
revoke all on function public.community_chat_bump_rate(text, timestamptz, int) from public, anon, authenticated;

do $$ declare f text; begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'community\_chat\_%'
      and p.proname not in ('community_chat_classify', 'community_chat_gate_member', 'community_chat_bump_rate')
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

revoke all on public.community_sections, public.community_messages, public.community_msg_reactions, public.community_reads,
  public.community_chat_reports, public.community_chat_mutes, public.community_chat_rate, public.community_chat_meta from anon, authenticated;
grant select on public.community_sections, public.community_messages, public.community_msg_reactions, public.community_reads to authenticated;

drop policy if exists chat_sections_read on public.community_sections;
create policy chat_sections_read on public.community_sections for select to authenticated using (
  (archived_at is null or public.is_admin())
  and (public.is_admin() or exists (select 1 from public.community_members m where m.user_id = auth.uid() and m.guidelines_at is not null))
);
drop policy if exists chat_messages_read on public.community_messages;
create policy chat_messages_read on public.community_messages for select to authenticated using (
  (status <> 'deleted' or public.is_admin())
  and (
    public.is_admin()
    or (
      exists (select 1 from public.community_members m where m.user_id = auth.uid() and m.guidelines_at is not null and m.status = 'active')
      and (status = 'visible' or user_id = auth.uid())
      and not exists (select 1 from public.community_blocks b where (b.blocker = auth.uid() and b.blocked = community_messages.user_id) or (b.blocker = community_messages.user_id and b.blocked = auth.uid()))
      and not exists (select 1 from public.community_members author where author.user_id = community_messages.user_id and author.status = 'banned' and community_messages.user_id <> auth.uid())
    )
  )
);
drop policy if exists chat_reactions_read on public.community_msg_reactions;
create policy chat_reactions_read on public.community_msg_reactions for select to authenticated using (
  exists (select 1 from public.community_messages m where m.id = message_id and m.status = 'visible')
  and exists (select 1 from public.community_members me where me.user_id = auth.uid() and me.guidelines_at is not null)
);
drop policy if exists chat_reads_own on public.community_reads;
create policy chat_reads_own on public.community_reads for select to authenticated using (user_id = auth.uid());
drop policy if exists chat_reports_admin on public.community_chat_reports;
create policy chat_reports_admin on public.community_chat_reports for select to authenticated using (public.is_admin());
drop policy if exists chat_mutes_read on public.community_chat_mutes;
create policy chat_mutes_read on public.community_chat_mutes for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists chat_meta_read on public.community_chat_meta;
create policy chat_meta_read on public.community_chat_meta for select to authenticated using (true);

alter table public.community_messages replica identity full;
alter table public.community_msg_reactions replica identity full;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_messages') then
      alter publication supabase_realtime add table public.community_messages; end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_msg_reactions') then
      alter publication supabase_realtime add table public.community_msg_reactions; end if;
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-chat', 'community-chat', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
drop policy if exists "chat upload own" on storage.objects;
create policy "chat upload own" on storage.objects for insert to authenticated with check (
  bucket_id = 'community-chat' and (storage.foldername(name))[1] = auth.uid()::text
  and exists (select 1 from public.community_members m where m.user_id = auth.uid() and m.status = 'active' and m.guidelines_at is not null));
drop policy if exists "chat read members" on storage.objects;
create policy "chat read members" on storage.objects for select to authenticated using (
  bucket_id = 'community-chat'
  and exists (select 1 from public.community_members m where m.user_id = auth.uid() and m.guidelines_at is not null and m.status = 'active'));
drop policy if exists "chat delete own" on storage.objects;
create policy "chat delete own" on storage.objects for delete to authenticated using (
  bucket_id = 'community-chat' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
