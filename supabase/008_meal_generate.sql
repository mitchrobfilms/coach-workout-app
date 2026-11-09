-- NOT APPLIED. Rate limit for the meal generator only.
-- Idempotent. Does not change existing member rows.
-- The edge function uses the service role. Members cannot increment the counter themselves.

create table if not exists public.meal_generate_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  n int not null default 0,
  primary key (user_id, day)
);
alter table public.meal_generate_usage enable row level security;
drop policy if exists own_read on public.meal_generate_usage;
create policy own_read on public.meal_generate_usage for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.meal_generate_usage from anon, authenticated;
grant select on public.meal_generate_usage to authenticated;

create or replace function public.claim_meal_generate(p_user uuid, p_limit int default 20) returns int
language plpgsql security definer set search_path = '' as $$
declare d date := (now() at time zone 'Europe/London')::date; n int;
begin
  insert into public.meal_generate_usage(user_id, day, n) values (p_user, d, 1)
    on conflict (user_id, day) do update set n = public.meal_generate_usage.n + 1
    where public.meal_generate_usage.n < p_limit
    returning public.meal_generate_usage.n into n;
  if n is null then return -1; end if;
  return p_limit - n;
end $$;

create or replace function public.refund_meal_generate(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.meal_generate_usage set n = greatest(0, n - 1)
  where user_id = p_user and day = (now() at time zone 'Europe/London')::date;
end $$;

revoke all on function public.claim_meal_generate(uuid, int), public.refund_meal_generate(uuid) from public, anon, authenticated;
grant execute on function public.claim_meal_generate(uuid, int), public.refund_meal_generate(uuid) to service_role;
