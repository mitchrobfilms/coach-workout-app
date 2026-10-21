-- Food Photo Diary (applied 2026-10-21)
-- Private bucket: <user id>/<entry id>.jpg, each user only touches their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('food-photos', 'food-photos', false, 716800, array['image/jpeg','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 716800, allowed_mime_types = array['image/jpeg','image/webp'];
drop policy if exists "food photos own read" on storage.objects;
create policy "food photos own read" on storage.objects for select to authenticated using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "food photos own write" on storage.objects;
create policy "food photos own write" on storage.objects for insert to authenticated with check (bucket_id = 'food-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "food photos own delete" on storage.objects;
create policy "food photos own delete" on storage.objects for delete to authenticated using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Diary entries (estimates; user-editable)
create table if not exists public.food_diary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  meal text not null default 'meal' check (meal in ('breakfast','lunch','dinner','snack','meal')),
  photo_path text,
  items jsonb not null default '[]'::jsonb,
  kcal int not null default 0 check (kcal between 0 and 10000),
  protein_g numeric(6,1) not null default 0 check (protein_g between 0 and 1000),
  carbs_g numeric(6,1) not null default 0 check (carbs_g between 0 and 1000),
  fat_g numeric(6,1) not null default 0 check (fat_g between 0 and 1000),
  fibre_g numeric(6,1) not null default 0 check (fibre_g between 0 and 1000),
  score text, tips jsonb not null default '[]'::jsonb, edited boolean not null default false,
  source text not null default 'photo' check (source in ('photo','manual')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists food_diary_user_day on public.food_diary (user_id, day);
alter table public.food_diary enable row level security;
drop policy if exists own_all on public.food_diary;
create policy own_all on public.food_diary for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (photo_path is null or split_part(photo_path, '/', 1) = (select auth.uid())::text));
revoke all on public.food_diary from anon; grant select, insert, update, delete on public.food_diary to authenticated;

-- Per-user daily photo-analysis quota. Only the Edge Function (service role) can claim/refund.
create table if not exists public.food_photo_usage (user_id uuid not null references auth.users on delete cascade, day date not null, n int not null default 0, primary key (user_id, day));
alter table public.food_photo_usage enable row level security;
drop policy if exists own_read on public.food_photo_usage;
create policy own_read on public.food_photo_usage for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.food_photo_usage from anon, authenticated; grant select on public.food_photo_usage to authenticated;
create or replace function public.claim_food_photo(p_user uuid, p_limit int default 20) returns int language plpgsql security definer set search_path = '' as $$
declare d date := (now() at time zone 'Europe/London')::date; used int; begin
  insert into public.food_photo_usage(user_id, day, n) values (p_user, d, 1)
    on conflict (user_id, day) do update set n = public.food_photo_usage.n + 1 where public.food_photo_usage.n < p_limit
    returning n into used;
  if used is null then return -1; end if; -- limit reached
  return p_limit - used; end $$;
create or replace function public.refund_food_photo(p_user uuid) returns void language sql security definer set search_path = '' as $$
  update public.food_photo_usage set n = greatest(0, n - 1) where user_id = p_user and day = (now() at time zone 'Europe/London')::date $$;
revoke all on function public.claim_food_photo(uuid, int), public.refund_food_photo(uuid) from public, anon, authenticated;
grant execute on function public.claim_food_photo(uuid, int), public.refund_food_photo(uuid) to service_role;
