-- 1. Пріоритет при записі: d20 кидається одразу, разом із бонусом за програні контести.
-- 2. Сповіщення в Discord: затвердження складу, скасування, завершення гри, нагадування.
--
-- Раніше кидок робили окремою кнопкою і лише коли охочих було більше, ніж місць.
-- Тепер кожен запис одразу отримує «пріоритет = d20 + бонус», і ГМ бачить ранжований
-- список ще до того, як набір переповниться.

-- ----- Пріоритет -----

-- Кидок прив'язаний до пари (гра, гравець), а не до запису: інакше вийти й записатися
-- знову було б способом перекинути невдалий d20.
create table if not exists public.game_signup_rolls (
  slot_id uuid not null references public.game_slots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  roll int not null,
  roll_bonus int not null,
  rolled_at timestamptz not null default now(),
  primary key (slot_id, user_id)
);
alter table public.game_signup_rolls enable row level security;

-- Уже зроблені кидки переносимо, щоб і вони не перекидались.
insert into public.game_signup_rolls (slot_id, user_id, roll, roll_bonus, rolled_at)
  select slot_id, user_id, roll, coalesce(roll_bonus, 0), coalesce(rolled_at, now())
    from public.game_signups where roll is not null
  on conflict do nothing;

create or replace function private.signup_roll()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r game_signup_rolls;
begin
  select * into r from game_signup_rolls where slot_id = new.slot_id and user_id = new.user_id;
  if not found then
    insert into game_signup_rolls (slot_id, user_id, roll, roll_bonus)
      values (new.slot_id, new.user_id, floor(random() * 20)::int + 1,
              coalesce((select contest_bonus from profiles where id = new.user_id), 0))
      returning * into r;
  end if;
  -- Що б не прислав клієнт, кидок ставить сервер.
  new.roll := r.roll;
  new.roll_bonus := r.roll_bonus;
  new.rolled_at := r.rolled_at;
  return new;
end;
$function$;

drop trigger if exists signup_roll on public.game_signups;
create trigger signup_roll
  before insert on public.game_signups
  for each row execute function private.signup_roll();

-- Політика вимагала roll IS NULL; WITH CHECK перевіряється вже після BEFORE-тригера,
-- тож ця умова тепер завалила б кожен запис. Решта умов без змін.
drop policy if exists "player signs up" on public.game_signups;
create policy "player signs up" on public.game_signups
  for insert with check (
    user_id = auth.uid()
    and approved is null
    and exists (select 1 from pilots p where p.id = game_signups.pilot_id and p.user_id = auth.uid())
    and exists (select 1 from game_slots s
                 where s.id = game_signups.slot_id and s.status = 'open' and s.created_by <> auth.uid())
  );

-- Записи у ще відкритих іграх, де кидка не було, отримують його зараз.
do $$
declare
  g record;
  r game_signup_rolls;
begin
  for g in
    select gs.id, gs.slot_id, gs.user_id
      from game_signups gs join game_slots s on s.id = gs.slot_id
     where gs.roll is null and s.status = 'open'
  loop
    insert into game_signup_rolls (slot_id, user_id, roll, roll_bonus)
      values (g.slot_id, g.user_id, floor(random() * 20)::int + 1,
              coalesce((select contest_bonus from profiles where id = g.user_id), 0))
      on conflict (slot_id, user_id) do update set slot_id = excluded.slot_id
      returning * into r;
    update game_signups set roll = r.roll, roll_bonus = r.roll_bonus, rolled_at = r.rolled_at
     where id = g.id;
  end loop;
end $$;

-- Окремий кидок більше не потрібен.
drop function if exists public.discord_roll(text, uuid);
drop function if exists public.board_roll(uuid);
drop function if exists private.board_roll_for(uuid, uuid);

-- discord_signup тепер повертає запис — бот одразу показує пріоритет.
drop function if exists public.discord_signup(text, uuid, uuid, text);
create function public.discord_signup(p_discord_id text, p_slot_id uuid, p_pilot_id uuid, p_mech_id text)
returns public.game_signups
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := private.discord_user_id(p_discord_id);
  slot game_slots;
  pil pilots;
  mname text;
  s game_signups;
begin
  select * into slot from game_slots where id = p_slot_id;
  if not found then raise exception 'Гру не знайдено.'; end if;
  if slot.status <> 'open' then raise exception 'Запис недоступний — набір уже закрито.'; end if;
  if slot.created_by = uid then raise exception 'ГМ не записується на власну гру.'; end if;

  select * into pil from pilots where id = p_pilot_id and user_id = uid;
  if not found then raise exception 'Пілота не знайдено.'; end if;

  if p_mech_id is not null then
    select m->>'name' into mname
      from jsonb_array_elements(coalesce(pil.state->'mechs', '[]'::jsonb)) m
     where m->>'id' = p_mech_id
     limit 1;
  end if;

  begin
    insert into game_signups (slot_id, user_id, pilot_id, mech_id, mech_name)
      values (p_slot_id, uid, p_pilot_id, p_mech_id, mname)
      returning * into s;
  exception when unique_violation then
    raise exception 'Ви вже записані на цю гру.';
  end;
  return s;
end;
$function$;
revoke execute on function public.discord_signup(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.discord_signup(text, uuid, uuid, text) to service_role;

-- ----- Сповіщення -----

-- Які нагадування по грі вже відправлено (щоб планувальник не слав їх щоразу).
create table if not exists public.discord_reminders (
  slot_id uuid not null references public.game_slots(id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (slot_id, kind)
);
alter table public.discord_reminders enable row level security;

-- Тригер тепер повідомляє і про зміну статусу гри: discord-sync, крім оновлення
-- оголошення, пише в канал окреме повідомлення з пінгом учасників.
create or replace function private.discord_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  sid uuid;
  ev text;
begin
  if tg_table_name = 'game_slots' then
    sid := coalesce(new.id, old.id);
    if tg_op = 'UPDATE' and new.status is distinct from old.status then
      ev := new.status; -- approved / closed / cancelled
    end if;
  else
    sid := coalesce(new.slot_id, old.slot_id);
  end if;
  perform net.http_post(
    url := 'https://dmqkxxedabawnhznzlmx.supabase.co/functions/v1/discord-sync',
    body := jsonb_build_object(
      'slot_id', sid,
      -- Нове оголошення публікується лише на створення слота; решта подій тільки
      -- оновлює вже опубліковане (інакше паралельні події дублювали б повідомлення).
      'post', tg_table_name = 'game_slots' and tg_op = 'INSERT',
      'event', ev),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'discord_sync_secret')));
  return null;
end;
$function$;

-- Нагадування: кожні 10 хвилин discord-sync перевіряє, кому пора нагадати.
create extension if not exists pg_cron;

select cron.unschedule('discord-reminders')
 where exists (select 1 from cron.job where jobname = 'discord-reminders');
select cron.schedule('discord-reminders', '*/10 * * * *', $cron$
  select net.http_post(
    url := 'https://dmqkxxedabawnhznzlmx.supabase.co/functions/v1/discord-sync',
    body := '{"mode":"remind"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'discord_sync_secret')));
$cron$);
