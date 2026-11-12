-- NOT APPLIED. Do not run this against production until it has been reviewed.
-- Member recipes shared in community chat. Idempotent and non-destructive.
-- Requires 009 and 011 (community_messages.card). No dosage or reconstitution tools.
-- Text is classified before it is stored. Photos use the existing community-chat bucket.

create table if not exists public.community_member_recipes (
  id uuid primary key default gen_random_uuid(),
  message_id uuid unique references public.community_messages on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  title text not null check (char_length(title) between 3 and 80),
  photo_path text,
  ingredients jsonb not null,
  steps jsonb not null,
  tags text[] not null default '{}',
  status text not null default 'visible' check (status in ('visible','held','deleted')),
  created_at timestamptz not null default now()
);
alter table public.community_member_recipes enable row level security;
revoke all on public.community_member_recipes from anon, authenticated;
drop policy if exists member_recipe_read on public.community_member_recipes;
create policy member_recipe_read on public.community_member_recipes for select to authenticated using (
  status = 'visible'
  and exists (select 1 from public.community_members m where m.user_id = auth.uid() and m.guidelines_at is not null)
);
grant select on public.community_member_recipes to authenticated;

create or replace function public.community_post_member_recipe(
  p_section uuid, p_title text, p_ingredients jsonb, p_steps jsonb, p_tags jsonb default '[]'::jsonb, p_photo text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare blob text; v jsonb; mid uuid; rid uuid; tag text; tags text[] := '{}';
begin
  perform public.community_chat_gate_member();
  if public.community_chat_bump_rate('m', date_trunc('minute', now()), 8) is null then
    raise exception 'You are sending messages very quickly. Please wait a minute.'; end if;
  if p_photo is not null and p_photo !~ ('^' || auth.uid()::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'Use a JPEG, PNG or WebP photo under 2 MB.'; end if;
  select string_agg(value, ' ') into blob from (
    select p_title as value
    union all select jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) #>> '{}'
    union all select jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) ->> 'name'
  ) s;
  v := public.community_chat_classify(coalesce(blob, ''));
  if v->>'action' = 'hold' then return v || jsonb_build_object('id', null); end if;
  if char_length(btrim(coalesce(p_title, ''))) < 3 then raise exception 'Give the recipe a short title.'; end if;
  if jsonb_array_length(coalesce(p_ingredients, '[]'::jsonb)) < 1 or jsonb_array_length(coalesce(p_ingredients, '[]'::jsonb)) > 20 then
    raise exception 'Add ingredients in grams or millilitres.'; end if;
  if jsonb_array_length(coalesce(p_steps, '[]'::jsonb)) < 1 then raise exception 'Add at least one step.'; end if;
  for tag in select jsonb_array_elements_text(coalesce(p_tags, '[]'::jsonb)) loop
    if tag in ('high-protein', 'mild') then tags := tags || tag; end if;
  end loop;
  insert into public.community_messages (section_id, user_id, body, kind, card, status)
  values (p_section, auth.uid(), left(btrim(p_title), 80), 'recipe', jsonb_build_object('type', 'member-recipe', 'title', left(btrim(p_title), 80)), 'visible')
  returning id into mid;
  insert into public.community_member_recipes (message_id, user_id, title, photo_path, ingredients, steps, tags)
  values (mid, auth.uid(), left(btrim(p_title), 80), p_photo, p_ingredients, p_steps, tags)
  returning id into rid;
  update public.community_messages set card = card || jsonb_build_object('id', rid) where id = mid;
  return jsonb_build_object('action', 'ok', 'id', mid, 'recipe_id', rid);
end $fn$;

revoke all on function public.community_post_member_recipe(uuid, text, jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.community_post_member_recipe(uuid, text, jsonb, jsonb, jsonb, text) to authenticated;
