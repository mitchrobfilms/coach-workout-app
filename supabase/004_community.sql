-- GLP1 Life Community: feed, groups, challenges, recipe swaps, buddies, moderation. All writes go through SECURITY DEFINER
-- RPCs that apply the safety filter; tables are read via RLS (visible content only) and never expose emails.
create table if not exists public.community_members (user_id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 30), guidelines_at timestamptz,
  status text not null default 'active' check (status in ('active','suspended','banned')), strikes int not null default 0,
  last_strike_at timestamptz, created_at timestamptz not null default now());
create table if not exists public.community_groups (id uuid primary key default gen_random_uuid(), slug text unique not null, name text not null,
  description text not null default '', sort int not null default 100, created_by uuid references auth.users on delete set null, created_at timestamptz not null default now());
create table if not exists public.community_posts (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  group_id uuid references public.community_groups on delete set null, kind text not null default 'post' check (kind in ('post','recipe','shoutout')),
  body text not null check (char_length(body) between 1 and 2000), photo_path text, recipe jsonb,
  status text not null default 'visible' check (status in ('visible','held','hidden','deleted')), flag_reason text, dose_topic boolean not null default false,
  created_at timestamptz not null default now());
create index if not exists community_posts_feed on public.community_posts (status, created_at desc);
create table if not exists public.community_comments (id uuid primary key default gen_random_uuid(), post_id uuid not null references public.community_posts on delete cascade,
  user_id uuid not null references auth.users on delete cascade, body text not null check (char_length(body) between 1 and 1000),
  status text not null default 'visible' check (status in ('visible','held','hidden','deleted')), flag_reason text, created_at timestamptz not null default now());
create table if not exists public.community_reactions (post_id uuid references public.community_posts on delete cascade, user_id uuid references auth.users on delete cascade,
  emoji text not null check (emoji in ('👏','❤️','💪','🎉')), primary key (post_id, user_id, emoji));
create table if not exists public.community_reports (id uuid primary key default gen_random_uuid(), post_id uuid references public.community_posts on delete cascade,
  comment_id uuid references public.community_comments on delete cascade, reporter uuid not null references auth.users on delete cascade, reason text not null default '',
  resolved boolean not null default false, created_at timestamptz not null default now());
create table if not exists public.community_blocks (blocker uuid references auth.users on delete cascade, blocked uuid references auth.users on delete cascade, primary key (blocker, blocked));
create table if not exists public.community_challenges (id uuid primary key default gen_random_uuid(), title text not null, description text not null default '',
  metric text not null default 'activity' check (metric in ('activity','pct')), starts date not null, ends date not null, created_at timestamptz not null default now());
create table if not exists public.community_challenge_members (challenge_id uuid references public.community_challenges on delete cascade, user_id uuid references auth.users on delete cascade,
  progress numeric not null default 0, show_progress boolean not null default true, joined_at timestamptz not null default now(), primary key (challenge_id, user_id));
create table if not exists public.community_buddies (id uuid primary key default gen_random_uuid(), requester uuid not null references auth.users on delete cascade,
  addressee uuid not null references auth.users on delete cascade, status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(), unique (requester, addressee), check (requester <> addressee));
create table if not exists public.community_checkins (id uuid primary key default gen_random_uuid(), buddy_id uuid not null references public.community_buddies on delete cascade,
  user_id uuid not null references auth.users on delete cascade, body text not null check (char_length(body) between 1 and 500), mood text,
  status text not null default 'visible' check (status in ('visible','held','hidden')), created_at timestamptz not null default now());
create table if not exists public.community_modlog (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users on delete set null, kind text not null,
  target_id uuid, action text not null, reason text, excerpt text, created_at timestamptz not null default now(), reviewed boolean not null default false);

alter table public.community_members enable row level security; alter table public.community_groups enable row level security;
alter table public.community_posts enable row level security; alter table public.community_comments enable row level security;
alter table public.community_reactions enable row level security; alter table public.community_reports enable row level security;
alter table public.community_blocks enable row level security; alter table public.community_challenges enable row level security;
alter table public.community_challenge_members enable row level security; alter table public.community_buddies enable row level security;
alter table public.community_checkins enable row level security; alter table public.community_modlog enable row level security;

-- Read policies (members only; writes only via RPCs below, admins via is_admin()).
drop policy if exists r on public.community_groups; create policy r on public.community_groups for select to authenticated using (true);
drop policy if exists r on public.community_challenges; create policy r on public.community_challenges for select to authenticated using (true);
drop policy if exists r on public.community_members; create policy r on public.community_members for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists r on public.community_posts; create policy r on public.community_posts for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists r on public.community_comments; create policy r on public.community_comments for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists r on public.community_blocks; create policy r on public.community_blocks for select to authenticated using (blocker = auth.uid());
drop policy if exists r on public.community_buddies; create policy r on public.community_buddies for select to authenticated using (auth.uid() in (requester, addressee));
drop policy if exists r on public.community_checkins; create policy r on public.community_checkins for select to authenticated using (exists (select 1 from public.community_buddies b where b.id = buddy_id and auth.uid() in (b.requester, b.addressee) and b.status = 'accepted') and status = 'visible' or user_id = auth.uid());
drop policy if exists r on public.community_modlog; create policy r on public.community_modlog for select to authenticated using (public.is_admin());
drop policy if exists r on public.community_reports; create policy r on public.community_reports for select to authenticated using (public.is_admin());
drop policy if exists admin_all on public.community_groups; create policy admin_all on public.community_groups for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_all on public.community_challenges; create policy admin_all on public.community_challenges for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke insert, update, delete on public.community_members, public.community_posts, public.community_comments, public.community_reactions, public.community_reports, public.community_blocks, public.community_challenge_members, public.community_buddies, public.community_checkins, public.community_modlog from anon, authenticated;

-- Safety filter. Experiences ("on my prescribed dose and felt sick") are fine. BLOCK: mixing/reconstitution/bac water,
-- buying/selling/sourcing, telling others what dose to take or how to change it. HOLD (admin review): other dose/unit
-- mentions and links. Returns {action: ok|hold|block, reason, dose}.
create or replace function public.community_classify(t text) returns jsonb language plpgsql immutable set search_path = '' as $$
declare s text := lower(coalesce(t, '')); dose boolean;
begin
  dose := s ~ '\m\d+(\.\d+)?\s?(mg|mcg|µg|ml|iu|units?|clicks?)\M' or s ~ '\m(dose|dosage|dosing|titrat\w*)\M';
  if s ~ '(reconstitut|bac(teriostatic)?\s*water|\mbac\s*h2o|mix(ing|ed)?\s+(the\s+|my\s+|your\s+)?(vial|powder|peptide|pen|it|reta|tirz|sema)|(vial|powder|peptide)s?\s+(with|and)\s+water|draw(ing)?\s+up)' then
    return jsonb_build_object('action', 'block', 'reason', 'mixing', 'dose', dose); end if;
  if s ~ '(\m(buy|buying|bought|sell|selling|sold|for sale|order(ing)? from|supplier|vendor|source[sd]?|sourcing|stockist|cheap(er)? (pens?|vials?)|dm me|pm me|whatsapp me|telegram)\M)' and s ~ '(peptide|reta|retatrutide|tirz|tirzepatide|sema|semaglutide|mounjaro|wegovy|ozempic|zepbound|pens?|vials?|meds?|medication|jab|grey market|gray market|research chem|rc\M)' then
    return jsonb_build_object('action', 'block', 'reason', 'selling', 'dose', dose); end if;
  if s ~ '(where (can|do|did) (i|you|u) (get|buy|order|find)|who (sells|has|supplies)|any (sellers?|suppliers?|vendors?|links?)|link (me|pls|please))' then
    return jsonb_build_object('action', 'block', 'reason', 'selling', 'dose', dose); end if;
  if s ~ '(you should (take|be on|go up|up|increase|double|skip|split|microdose)|(up|increase|raise|bump|double|split|lower) (it|yours|your dose|the dose|your shot)\s*(to|by)|how much (should|do|can) (i|you|u) (take|inject|use)|what dose should|((you|u|just|should|could|try to|i''d) (take|inject|use|start (on|at))|\mtry) \d+(\.\d+)?\s?(mg|mcg|ml|iu|units?|clicks?)|microdos|\mcounting clicks)' then
    return jsonb_build_object('action', 'block', 'reason', 'dosing', 'dose', true); end if;
  if s ~ '(https?://|www\.|\.(com|co\.uk|shop|store|net|org|io|xyz|ru)\M)' then return jsonb_build_object('action', 'hold', 'reason', 'link', 'dose', dose); end if;
  if dose and s !~ '(prescribed|my prescriber|my doctor|my gp|my nurse|pharmacist (put|has|started))' then return jsonb_build_object('action', 'hold', 'reason', 'dose_mention', 'dose', true); end if;
  return jsonb_build_object('action', 'ok', 'reason', null, 'dose', dose);
end $$;

create or replace function public.community_rule_message(reason text) returns text language sql immutable as $$
  select case reason
    when 'mixing' then 'We can''t post this. GLP1 Life Community doesn''t allow questions or advice on mixing, reconstituting or dosing medication or peptides. Please ask your prescriber or pharmacist; they can help safely.'
    when 'selling' then 'We can''t post this. Buying, selling or sourcing medication isn''t allowed in GLP1 Life Community. Please only use a regulated UK pharmacy or your prescriber.'
    when 'dosing' then 'We can''t post this. Please share experiences, not dosing advice. Your prescriber decides your dose, so ask them about changing or choosing a dose.'
    else 'This can''t be posted.' end $$;

create or replace function public.community_me() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare m public.community_members; begin select * into m from public.community_members where user_id = auth.uid();
  return jsonb_build_object('member', m.user_id is not null, 'display_name', m.display_name, 'guidelines', m.guidelines_at is not null, 'status', coalesce(m.status, 'active'), 'is_admin', public.is_admin()); end $$;

create or replace function public.community_join(p_name text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare n text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin if auth.uid() is null then raise exception 'sign in first'; end if;
  if char_length(n) < 2 or char_length(n) > 30 or n ~ '@' then raise exception 'Choose a display name of 2-30 characters (not your email).'; end if;
  insert into public.community_members (user_id, display_name, guidelines_at) values (auth.uid(), n, now())
    on conflict (user_id) do update set display_name = excluded.display_name, guidelines_at = coalesce(public.community_members.guidelines_at, now());
  return public.community_me(); end $$;

-- Gate + filter for every write. Blocked content is logged; 3 blocks within 30 days auto-suspends pending admin review.
create or replace function public.community_gate(p_text text, p_kind text, out verdict jsonb) language plpgsql security definer set search_path = '' as $$
declare m public.community_members; c jsonb;
begin select * into m from public.community_members where user_id = auth.uid();
  if m.user_id is null or m.guidelines_at is null then raise exception 'Please read and accept the community guidelines first.'; end if;
  if m.status <> 'active' then raise exception 'Your community account is %. An admin will review it. Questions: support@glp1life.co.uk', m.status; end if;
  c := public.community_classify(p_text);
  if c->>'action' = 'block' then
    insert into public.community_modlog (user_id, kind, action, reason, excerpt) values (auth.uid(), p_kind, 'blocked', c->>'reason', left(p_text, 280));
    update public.community_members set strikes = case when last_strike_at > now() - interval '30 days' then strikes + 1 else 1 end, last_strike_at = now() where user_id = auth.uid() returning * into m;
    if m.strikes >= 3 then update public.community_members set status = 'suspended' where user_id = auth.uid();
      insert into public.community_modlog (user_id, kind, action, reason) values (auth.uid(), 'member', 'auto_suspended', '3 blocked posts in 30 days'); end if;
  end if;
  verdict := c || jsonb_build_object('message', case when c->>'action' = 'block' then public.community_rule_message(c->>'reason') when c->>'action' = 'hold' then 'Thanks! Your post is waiting for a quick check by our team before it appears.' end, 'suspended', m.status = 'suspended');
end $$;

create or replace function public.community_post(p_body text, p_group uuid default null, p_kind text default 'post', p_photo text default null, p_recipe jsonb default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; pid uuid; txt text := coalesce(p_body, '') || ' ' || coalesce(p_recipe::text, '');
begin v := public.community_gate(txt, 'post');
  if v->>'action' = 'block' then return v; end if;
  if p_photo is not null and p_photo !~ ('^' || auth.uid()::text || '/[A-Za-z0-9._-]+$') then raise exception 'bad photo path'; end if;
  insert into public.community_posts (user_id, group_id, kind, body, photo_path, recipe, status, flag_reason, dose_topic)
    values (auth.uid(), p_group, coalesce(p_kind, 'post'), p_body, p_photo, p_recipe, case when v->>'action' = 'hold' then 'held' else 'visible' end, v->>'reason', coalesce((v->>'dose')::boolean, false)) returning id into pid;
  if v->>'action' = 'hold' then insert into public.community_modlog (user_id, kind, target_id, action, reason, excerpt) values (auth.uid(), 'post', pid, 'held', v->>'reason', left(p_body, 280)); end if;
  return v || jsonb_build_object('id', pid); end $$;

create or replace function public.community_comment(p_post uuid, p_body text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; cid uuid;
begin if not exists (select 1 from public.community_posts where id = p_post and status = 'visible') then raise exception 'post not found'; end if;
  v := public.community_gate(p_body, 'comment'); if v->>'action' = 'block' then return v; end if;
  insert into public.community_comments (post_id, user_id, body, status, flag_reason) values (p_post, auth.uid(), p_body, case when v->>'action' = 'hold' then 'held' else 'visible' end, v->>'reason') returning id into cid;
  if v->>'action' = 'hold' then insert into public.community_modlog (user_id, kind, target_id, action, reason, excerpt) values (auth.uid(), 'comment', cid, 'held', v->>'reason', left(p_body, 280)); end if;
  return v || jsonb_build_object('id', cid); end $$;

create or replace function public.community_react(p_post uuid, p_emoji text) returns boolean language plpgsql security definer set search_path = '' as $$
begin perform public.community_gate('', 'reaction');
  if exists (select 1 from public.community_reactions where post_id = p_post and user_id = auth.uid() and emoji = p_emoji) then delete from public.community_reactions where post_id = p_post and user_id = auth.uid() and emoji = p_emoji; return false; end if;
  insert into public.community_reactions values (p_post, auth.uid(), p_emoji); return true; end $$;

create or replace function public.community_report(p_post uuid default null, p_comment uuid default null, p_reason text default '') returns void language plpgsql security definer set search_path = '' as $$
begin if auth.uid() is null then raise exception 'sign in first'; end if;
  insert into public.community_reports (post_id, comment_id, reporter, reason) values (p_post, p_comment, auth.uid(), left(coalesce(p_reason, ''), 300));
  insert into public.community_modlog (user_id, kind, target_id, action, reason) values (auth.uid(), case when p_post is null then 'comment' else 'post' end, coalesce(p_post, p_comment), 'reported', left(p_reason, 300)); end $$;

create or replace function public.community_block(p_user uuid, p_on boolean default true) returns void language plpgsql security definer set search_path = '' as $$
begin if p_on then insert into public.community_blocks values (auth.uid(), p_user) on conflict do nothing; else delete from public.community_blocks where blocker = auth.uid() and blocked = p_user; end if; end $$;

-- Feed: visible posts (plus my own held ones), display names only, minus people I blocked / who blocked me.
create or replace function public.community_feed(p_group uuid default null, p_kind text default null, p_limit int default 30, p_before timestamptz default null) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]') from (
    select jsonb_build_object('id', p.id, 'author', m.display_name, 'mine', p.user_id = auth.uid(), 'author_id', case when p.user_id = auth.uid() then null else p.user_id end, 'group_id', p.group_id, 'kind', p.kind, 'body', p.body,
      'photo', p.photo_path, 'recipe', p.recipe, 'status', p.status, 'dose_topic', p.dose_topic, 'created_at', p.created_at,
      'reactions', (select coalesce(jsonb_object_agg(e, n), '{}') from (select emoji e, count(*) n from public.community_reactions r where r.post_id = p.id group by emoji) q),
      'my_reactions', (select coalesce(jsonb_agg(emoji), '[]') from public.community_reactions r where r.post_id = p.id and r.user_id = auth.uid()),
      'comments', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'author', cm.display_name, 'body', c.body, 'mine', c.user_id = auth.uid(), 'status', c.status, 'created_at', c.created_at) order by c.created_at), '[]')
        from public.community_comments c join public.community_members cm on cm.user_id = c.user_id where c.post_id = p.id and (c.status = 'visible' or c.user_id = auth.uid())
        and not exists (select 1 from public.community_blocks b where (b.blocker = auth.uid() and b.blocked = c.user_id) or (b.blocker = c.user_id and b.blocked = auth.uid())))) x
    from public.community_posts p join public.community_members m on m.user_id = p.user_id
    where exists (select 1 from public.community_members me where me.user_id = auth.uid() and me.guidelines_at is not null)
      and (p.status = 'visible' or (p.user_id = auth.uid() and p.status = 'held')) and m.status <> 'banned'
      and (p_group is null or p.group_id = p_group) and (p_kind is null or p.kind = p_kind) and (p_before is null or p.created_at < p_before)
      and not exists (select 1 from public.community_blocks b where (b.blocker = auth.uid() and b.blocked = p.user_id) or (b.blocker = p.user_id and b.blocked = auth.uid()))
    order by p.created_at desc limit least(greatest(p_limit, 1), 50)) t $$;

-- Challenges: join, update own progress, leaderboard by % or activity only (never weights).
create or replace function public.community_challenge_join(p_id uuid, p_show boolean default true) returns void language plpgsql security definer set search_path = '' as $$
begin perform public.community_gate('', 'challenge'); insert into public.community_challenge_members (challenge_id, user_id, show_progress) values (p_id, auth.uid(), p_show)
  on conflict (challenge_id, user_id) do update set show_progress = excluded.show_progress; end $$;
create or replace function public.community_challenge_progress(p_id uuid, p_value numeric) returns void language plpgsql security definer set search_path = '' as $$
begin update public.community_challenge_members set progress = greatest(0, least(p_value, 1000)) where challenge_id = p_id and user_id = auth.uid(); end $$;
create or replace function public.community_challenges_list() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'description', c.description, 'metric', c.metric, 'starts', c.starts, 'ends', c.ends,
    'joined', exists (select 1 from public.community_challenge_members x where x.challenge_id = c.id and x.user_id = auth.uid()),
    'my_progress', (select progress from public.community_challenge_members x where x.challenge_id = c.id and x.user_id = auth.uid()),
    'members', (select count(*) from public.community_challenge_members x where x.challenge_id = c.id),
    'leaderboard', (select coalesce(jsonb_agg(jsonb_build_object('name', m.display_name, 'progress', x.progress, 'me', x.user_id = auth.uid()) order by x.progress desc), '[]')
      from (select * from public.community_challenge_members x where x.challenge_id = c.id and (x.show_progress or x.user_id = auth.uid()) order by progress desc limit 10) x join public.community_members m on m.user_id = x.user_id where m.status = 'active')) order by c.ends), '[]')
  from public.community_challenges c where c.ends >= current_date - 7 $$;

-- Buddies: find by display name, request/accept, simple check-ins (filtered like posts).
create or replace function public.community_buddy_request(p_name text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare t uuid; begin perform public.community_gate('', 'buddy');
  select user_id into t from public.community_members where lower(display_name) = lower(btrim(p_name)) and status = 'active' and user_id <> auth.uid() limit 1;
  if t is null then raise exception 'No member with that display name.'; end if;
  if exists (select 1 from public.community_blocks b where (b.blocker = t and b.blocked = auth.uid()) or (b.blocker = auth.uid() and b.blocked = t)) then raise exception 'You can''t buddy with this member.'; end if;
  insert into public.community_buddies (requester, addressee) values (auth.uid(), t) on conflict (requester, addressee) do update set status = 'pending' where public.community_buddies.status = 'declined';
  return jsonb_build_object('ok', true); end $$;
create or replace function public.community_buddy_answer(p_id uuid, p_accept boolean) returns void language plpgsql security definer set search_path = '' as $$
begin update public.community_buddies set status = case when p_accept then 'accepted' else 'declined' end where id = p_id and addressee = auth.uid(); end $$;
create or replace function public.community_buddies_list() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'status', b.status, 'incoming', b.addressee = auth.uid(), 'name', m.display_name,
    'checkins', (select coalesce(jsonb_agg(jsonb_build_object('body', c.body, 'mood', c.mood, 'mine', c.user_id = auth.uid(), 'at', c.created_at) order by c.created_at desc), '[]') from (select * from public.community_checkins c where c.buddy_id = b.id and (c.status = 'visible' or c.user_id = auth.uid()) order by created_at desc limit 10) c))), '[]')
  from public.community_buddies b join public.community_members m on m.user_id = case when b.requester = auth.uid() then b.addressee else b.requester end
  where auth.uid() in (b.requester, b.addressee) and b.status <> 'declined' $$;
create or replace function public.community_checkin(p_buddy uuid, p_body text, p_mood text default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; begin
  if not exists (select 1 from public.community_buddies where id = p_buddy and status = 'accepted' and auth.uid() in (requester, addressee)) then raise exception 'not your buddy'; end if;
  v := public.community_gate(p_body, 'checkin'); if v->>'action' = 'block' then return v; end if;
  insert into public.community_checkins (buddy_id, user_id, body, mood, status) values (p_buddy, auth.uid(), p_body, left(p_mood, 8), case when v->>'action' = 'hold' then 'held' else 'visible' end);
  return v; end $$;

-- Admin moderation
create or replace function public.community_mod_queue() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin if not public.is_admin() then raise exception 'admin only'; end if;
  return jsonb_build_object(
    'held', (select coalesce(jsonb_agg(jsonb_build_object('kind', 'post', 'id', p.id, 'body', p.body, 'reason', p.flag_reason, 'author', m.display_name, 'user_id', p.user_id, 'at', p.created_at) order by p.created_at), '[]') from public.community_posts p join public.community_members m using (user_id) where p.status = 'held')
      || (select coalesce(jsonb_agg(jsonb_build_object('kind', 'comment', 'id', c.id, 'body', c.body, 'reason', c.flag_reason, 'author', m.display_name, 'user_id', c.user_id, 'at', c.created_at) order by c.created_at), '[]') from public.community_comments c join public.community_members m using (user_id) where c.status = 'held'),
    'reports', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'post_id', r.post_id, 'comment_id', r.comment_id, 'reason', r.reason, 'at', r.created_at, 'body', coalesce(p.body, c.body), 'author', m.display_name, 'user_id', coalesce(p.user_id, c.user_id)) order by r.created_at), '[]')
      from public.community_reports r left join public.community_posts p on p.id = r.post_id left join public.community_comments c on c.id = r.comment_id left join public.community_members m on m.user_id = coalesce(p.user_id, c.user_id) where not r.resolved),
    'blocked', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'reason', l.reason, 'excerpt', l.excerpt, 'author', m.display_name, 'user_id', l.user_id, 'at', l.created_at) order by l.created_at desc), '[]') from (select * from public.community_modlog where action = 'blocked' order by created_at desc limit 50) l left join public.community_members m using (user_id)),
    'suspended', (select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'name', display_name, 'status', status, 'strikes', strikes)), '[]') from public.community_members where status <> 'active'),
    'groups', (select coalesce(jsonb_agg(g order by g.sort), '[]') from public.community_groups g)); end $$;
create or replace function public.community_mod(p_kind text, p_id uuid, p_action text) returns void language plpgsql security definer set search_path = '' as $$
begin if not public.is_admin() then raise exception 'admin only'; end if;
  if p_kind = 'post' then update public.community_posts set status = case p_action when 'approve' then 'visible' when 'hide' then 'hidden' when 'delete' then 'deleted' end where id = p_id;
    if p_action <> 'approve' then update public.community_reports set resolved = true where post_id = p_id; end if;
  elsif p_kind = 'comment' then update public.community_comments set status = case p_action when 'approve' then 'visible' when 'hide' then 'hidden' when 'delete' then 'deleted' end where id = p_id;
    if p_action <> 'approve' then update public.community_reports set resolved = true where comment_id = p_id; end if;
  elsif p_kind = 'report' then update public.community_reports set resolved = true where id = p_id;
  elsif p_kind = 'user' then update public.community_members set status = case p_action when 'ban' then 'banned' when 'suspend' then 'suspended' when 'restore' then 'active' end, strikes = case when p_action = 'restore' then 0 else strikes end where user_id = p_id;
    if p_action = 'ban' then update public.community_posts set status = 'hidden' where user_id = p_id and status in ('visible','held'); end if;
  else raise exception 'bad kind'; end if;
  insert into public.community_modlog (user_id, kind, target_id, action) values (auth.uid(), p_kind, p_id, 'admin_' || p_action); end $$;
create or replace function public.community_add_group(p_name text, p_desc text default '') returns uuid language plpgsql security definer set search_path = '' as $$
declare i uuid; begin if not public.is_admin() then raise exception 'admin only'; end if;
  insert into public.community_groups (slug, name, description, created_by) values (regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'), p_name, coalesce(p_desc, ''), auth.uid()) returning id into i; return i; end $$;

revoke execute on function public.community_classify(text) from public; grant execute on function public.community_classify(text) to authenticated;
revoke execute on function public.community_gate(text, text) from public, anon, authenticated;
do $$ declare f text; begin for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'community\_%' and p.proname not in ('community_gate') loop
  execute format('revoke execute on function %s from anon', f); execute format('grant execute on function %s to authenticated', f); end loop; end $$;

insert into public.community_groups (slug, name, description, sort) values
 ('beginners', 'Beginners', 'New to GLP-1 or exercise? Start here. No question is too small (except dosing ones, ask your prescriber!).', 10),
 ('sciatica-recovery', 'Sciatica & Recovery', 'Gentle movement, back care and coming back from injury.', 20),
 ('meal-prep-budget', 'Meal Prep on a Budget', 'Batch cooking, Aldi & Lidl finds and cheap high-protein meals.', 30),
 ('mums-on-glp1', 'Mums on GLP-1', 'Juggling family life, school runs and your journey.', 40)
on conflict (slug) do nothing;
insert into public.community_challenges (title, description, metric, starts, ends)
select '7-day hydration streak', 'Hit 2 litres of water on 7 days this week. Progress = days completed.', 'activity', date_trunc('week', current_date)::date, (date_trunc('week', current_date) + interval '6 days')::date
where not exists (select 1 from public.community_challenges where title = '7-day hydration streak' and ends >= current_date);
insert into public.community_challenges (title, description, metric, starts, ends)
select 'Move 20 minutes, 5 days', 'Any class, walk or video counts. Progress = active days.', 'activity', date_trunc('week', current_date)::date, (date_trunc('week', current_date) + interval '6 days')::date
where not exists (select 1 from public.community_challenges where title = 'Move 20 minutes, 5 days' and ends >= current_date);

-- Storage: community photos, public read (random file names), members upload only into their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('community', 'community', true, 5242880, array['image/jpeg','image/png','image/webp'])
  on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
drop policy if exists "community upload own" on storage.objects;
create policy "community upload own" on storage.objects for insert to authenticated with check (bucket_id = 'community' and (storage.foldername(name))[1] = auth.uid()::text
  and exists (select 1 from public.community_members m where m.user_id = auth.uid() and m.status = 'active' and m.guidelines_at is not null));
drop policy if exists "community read" on storage.objects;
create policy "community read" on storage.objects for select to authenticated using (bucket_id = 'community');
drop policy if exists "community delete own" on storage.objects;
create policy "community delete own" on storage.objects for delete to authenticated using (bucket_id = 'community' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
