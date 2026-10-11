-- Календар гравців: у які дні гравець хоче грати, на два тижні вперед.
--
-- Гравець відмічає дні (в апці на сторінці «Запис на гру» або в Discord командою /calendar),
-- ГМ бачить, скільки людей і хто хоче грати в кожен день, і вирішує, чи відкривати набір.
-- Відмітка — лише «хочу грати цього дня», без часу: про час домовляються в оголошенні гри.
--
-- Хто відмічає: акаунт апки (user_id) або Discord без прив'язки (discord_user_id) — так само,
-- як із записом на гру. Прив'язаний Discord пише від імені акаунта.
--
-- Відкат: drop function public.calendar_list(date, date), public.discord_calendar_set(text, text, date[], date, date);
-- drop table public.play_availability;

create table if not exists public.play_availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  discord_user_id text,
  discord_name text,
  day date not null,
  created_at timestamptz not null default now(),
  constraint play_availability_identity check (user_id is not null or discord_user_id is not null)
);
create unique index if not exists play_availability_user_day
  on public.play_availability (user_id, day) where user_id is not null;
create unique index if not exists play_availability_discord_day
  on public.play_availability (discord_user_id, day) where user_id is null;
create index if not exists play_availability_day on public.play_availability (day);

alter table public.play_availability enable row level security;
-- Календар бачать усі залогінені (через calendar_list); свої відмітки гравець ставить і знімає сам.
create policy "availability: read" on public.play_availability
  for select using (auth.uid() is not null);
create policy "availability: add own" on public.play_availability
  for insert with check (user_id = auth.uid() and discord_user_id is null);
create policy "availability: remove own" on public.play_availability
  for delete using (user_id = auth.uid());

-- Дні з відмітками в діапазоні: [{ day, players: [{ userId, nick, discordId }] }].
create or replace function public.calendar_list(p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'players', d.players) order by d.day), '[]'::jsonb)
    from (
      select a.day,
             jsonb_agg(jsonb_build_object(
               'userId', a.user_id,
               'nick', coalesce(pr.nick, a.discord_name, 'Discord'),
               'discordId', coalesce(l.discord_user_id, a.discord_user_id)
             ) order by a.created_at) as players
        from play_availability a
        left join profiles pr on pr.id = a.user_id
        left join discord_links l on l.user_id = a.user_id
       where a.day between p_from and p_to
       group by a.day
    ) d
   where auth.uid() is not null;
$function$;
revoke execute on function public.calendar_list(date, date) from public, anon;
grant execute on function public.calendar_list(date, date) to authenticated;

-- Discord: замінити відмітки гравця в діапазоні [p_from, p_to] на p_days (меню /calendar).
-- Повертає календар діапазону — бот одразу показує, хто ще хоче грати.
create or replace function public.discord_calendar_set(
  p_discord_id text, p_username text, p_days date[], p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := private.discord_user_id_opt(p_discord_id);
begin
  if uid is not null then
    delete from play_availability where user_id = uid and day between p_from and p_to;
    insert into play_availability (user_id, day)
      select uid, d from unnest(coalesce(p_days, '{}')) d where d between p_from and p_to
      on conflict do nothing;
  else
    delete from play_availability where user_id is null and discord_user_id = p_discord_id and day between p_from and p_to;
    insert into play_availability (discord_user_id, discord_name, day)
      select p_discord_id, p_username, d from unnest(coalesce(p_days, '{}')) d where d between p_from and p_to
      on conflict do nothing;
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object('day', x.day, 'count', x.n, 'names', x.names) order by x.day), '[]'::jsonb)
      from (
        select a.day, count(*) as n,
               jsonb_agg(coalesce(pr.nick, a.discord_name, 'Discord') order by a.created_at) as names
          from play_availability a left join profiles pr on pr.id = a.user_id
         where a.day between p_from and p_to
         group by a.day
      ) x
  );
end;
$function$;
revoke execute on function public.discord_calendar_set(text, text, date[], date, date) from public, anon, authenticated;
grant execute on function public.discord_calendar_set(text, text, date[], date, date) to service_role;

-- Відкритий календар оновлюється наживо, коли хтось відмічає дні (зокрема з Discord).
alter publication supabase_realtime add table public.play_availability;
