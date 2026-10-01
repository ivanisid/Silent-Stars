-- Запис на гру через Discord паралельно з апкою.
--
-- Джерело правди одне — game_slots / game_signups. Discord не має власного списку:
--   * кнопки під оголошенням ідуть у edge-функцію discord-interactions, яка пише в ті ж
--     таблиці через discord_* функції нижче (ті самі перевірки, що й RLS для апки);
--   * будь-яка зміна слота чи запису (з апки чи з Discord) тригером смикає edge-функцію
--     discord-sync, яка перемальовує повідомлення з поточного стану бази.
-- Тож «записався в одному місці — видно в обох» виходить без синхронізації двох списків.

create extension if not exists pg_net with schema extensions;

-- ----- Прив'язка Discord-акаунта до акаунта апки -----

create table if not exists public.discord_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  discord_user_id text not null unique,
  discord_username text,
  linked_at timestamptz not null default now()
);
alter table public.discord_links enable row level security;
create policy "read own discord link" on public.discord_links
  for select using (user_id = auth.uid());
create policy "unlink own discord" on public.discord_links
  for delete using (user_id = auth.uid());

-- Одноразові коди для /link. Політик немає навмисно: читає і пише їх лише
-- security definer код нижче.
create table if not exists public.discord_link_codes (
  code text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.discord_link_codes enable row level security;

-- Яке повідомлення в Discord належить якому слоту. Без FK на game_slots навмисно:
-- рядок має пережити видалення слота, інакше discord-sync не знатиме, яке
-- повідомлення прибрати.
create table if not exists public.discord_slot_messages (
  slot_id uuid primary key,
  channel_id text not null,
  message_id text not null,
  created_at timestamptz not null default now()
);
alter table public.discord_slot_messages enable row level security;

-- Код для /link: 6 символів без схожих (0/O, 1/I), живе 15 хвилин. Новий запит
-- замінює попередній код цього ж гравця.
create or replace function public.discord_create_link_code()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
  i int;
begin
  if auth.uid() is null then raise exception 'Потрібно увійти.'; end if;
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from discord_link_codes where code = c);
  end loop;
  insert into discord_link_codes (code, user_id, expires_at)
    values (c, auth.uid(), now() + interval '15 minutes')
    on conflict (user_id) do update set code = excluded.code, expires_at = excluded.expires_at;
  return c;
end;
$function$;

-- ----- Дії з Discord (лише service_role, тобто edge-функції) -----

create or replace function public.discord_link(p_code text, p_discord_id text, p_username text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid;
begin
  delete from discord_link_codes
   where code = upper(btrim(p_code)) and expires_at > now()
   returning user_id into uid;
  if uid is null then
    raise exception 'Код недійсний або прострочений. Згенеруйте новий на сторінці «Запис на гру».';
  end if;
  -- Один Discord — один акаунт: прив'язка до нового акаунта знімає стару.
  delete from discord_links where discord_user_id = p_discord_id and user_id <> uid;
  insert into discord_links (user_id, discord_user_id, discord_username)
    values (uid, p_discord_id, p_username)
    on conflict (user_id) do update
      set discord_user_id = excluded.discord_user_id,
          discord_username = excluded.discord_username,
          linked_at = now();
  return (select nick from profiles where id = uid);
end;
$function$;

create or replace function private.discord_user_id(p_discord_id text)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  uid uuid;
begin
  select user_id into uid from discord_links where discord_user_id = p_discord_id;
  if uid is null then
    raise exception 'Ваш Discord не прив''язаний до апки. Відкрийте «Запис на гру» в апці, натисніть «Прив''язати Discord» і введіть тут /link <код>.';
  end if;
  return uid;
end;
$function$;

-- Ті самі умови, що й у RLS-політиці "player signs up": свій пілот, слот відкритий,
-- ГМ не записується на власну гру.
create or replace function public.discord_signup(p_discord_id text, p_slot_id uuid, p_pilot_id uuid, p_mech_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := private.discord_user_id(p_discord_id);
  slot game_slots;
  pil pilots;
  mname text;
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
      values (p_slot_id, uid, p_pilot_id, p_mech_id, mname);
  exception when unique_violation then
    raise exception 'Ви вже записані на цю гру.';
  end;
end;
$function$;

create or replace function public.discord_withdraw(p_discord_id text, p_slot_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := private.discord_user_id(p_discord_id);
  slot game_slots;
begin
  select * into slot from game_slots where id = p_slot_id;
  if not found then raise exception 'Гру не знайдено.'; end if;
  if slot.status <> 'open' then raise exception 'Склад уже затверджено — відписатися не можна.'; end if;
  delete from game_signups where slot_id = p_slot_id and user_id = uid;
  if not found then raise exception 'Ви не записані на цю гру.'; end if;
end;
$function$;

-- Кидок участі: тіло board_roll винесене сюди з явним користувачем, щоб апка й
-- Discord кидали однаково.
create or replace function private.board_roll_for(p_user uuid, p_signup_id uuid)
returns public.game_signups
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s public.game_signups;
  slot public.game_slots;
  cnt integer;
  bonus integer;
begin
  select * into s from game_signups where id = p_signup_id and user_id = p_user;
  if not found then raise exception 'Запис не знайдено.'; end if;
  if s.roll is not null then raise exception 'Кидок уже зроблено.'; end if;

  select * into slot from game_slots where id = s.slot_id for update;
  if slot.status <> 'open' then raise exception 'Набір уже закрито.'; end if;

  select count(*) into cnt from game_signups where slot_id = s.slot_id;
  if cnt <= slot.seats then raise exception 'Кидок не потрібен — місць вистачає всім.'; end if;

  select contest_bonus into bonus from profiles where id = p_user;

  update game_signups
     set roll = floor(random() * 20)::int + 1,
         roll_bonus = coalesce(bonus, 0),
         rolled_at = now()
   where id = p_signup_id
   returning * into s;
  return s;
end;
$function$;

create or replace function public.board_roll(p_signup_id uuid)
returns public.game_signups
language sql
security definer
set search_path to 'public'
as $function$
  select * from private.board_roll_for(auth.uid(), p_signup_id);
$function$;

create or replace function public.discord_roll(p_discord_id text, p_slot_id uuid)
returns public.game_signups
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := private.discord_user_id(p_discord_id);
  sid uuid;
begin
  select id into sid from game_signups where slot_id = p_slot_id and user_id = uid;
  if sid is null then raise exception 'Спершу запишіться на цю гру.'; end if;
  return private.board_roll_for(uid, sid);
end;
$function$;

-- /game у Discord. Нагороду й складність ГМ задає в апці — вона редагується до закриття.
create or replace function public.discord_create_slot(
  p_discord_id text, p_title text, p_description text,
  p_game_at timestamptz, p_signup_deadline timestamptz, p_seats int)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := private.discord_user_id(p_discord_id);
  new_id uuid;
begin
  if not exists (select 1 from profiles where id = uid and role = 'gm') then
    raise exception 'Створювати ігри може лише ГМ.';
  end if;
  insert into game_slots (created_by, title, description, game_at, signup_deadline, seats)
    values (uid, btrim(p_title), coalesce(btrim(p_description), ''), p_game_at, p_signup_deadline,
            coalesce(p_seats, 4))
    returning id into new_id;
  return new_id;
end;
$function$;

create or replace function public.discord_is_gm(p_discord_id text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from discord_links l join profiles p on p.id = l.user_id
     where l.discord_user_id = p_discord_id and p.role = 'gm'
  );
$function$;

-- ----- Секрет між тригером і discord-sync -----
-- discord-sync відкритий без JWT (його кличе pg_net), тож перевіряє цей секрет.
-- Генерується тут і ніде не світиться: тригер читає його з vault, функція — через
-- discord_sync_secret(), доступну лише service_role.

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'discord_sync_secret')
 where not exists (select 1 from vault.secrets where name = 'discord_sync_secret');

create or replace function public.discord_sync_secret()
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select decrypted_secret from vault.decrypted_secrets where name = 'discord_sync_secret';
$function$;

revoke execute on function
  public.discord_link(text, text, text),
  public.discord_signup(text, uuid, uuid, text),
  public.discord_withdraw(text, uuid),
  public.discord_roll(text, uuid),
  public.discord_create_slot(text, text, text, timestamptz, timestamptz, int),
  public.discord_is_gm(text),
  public.discord_sync_secret()
  from public, anon, authenticated;
grant execute on function
  public.discord_link(text, text, text),
  public.discord_signup(text, uuid, uuid, text),
  public.discord_withdraw(text, uuid),
  public.discord_roll(text, uuid),
  public.discord_create_slot(text, text, text, timestamptz, timestamptz, int),
  public.discord_is_gm(text),
  public.discord_sync_secret()
  to service_role;

-- ----- Тригер: будь-яка зміна → перемалювати повідомлення -----
-- pg_net асинхронний: запит іде після коміту і не гальмує сам запис.

create or replace function private.discord_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  sid uuid;
begin
  if tg_table_name = 'game_slots' then
    sid := coalesce(new.id, old.id);
  else
    sid := coalesce(new.slot_id, old.slot_id);
  end if;
  perform net.http_post(
    url := 'https://dmqkxxedabawnhznzlmx.supabase.co/functions/v1/discord-sync',
    body := jsonb_build_object(
      'slot_id', sid,
      -- Нове оголошення публікується лише на створення слота; решта подій тільки
      -- оновлює вже опубліковане (інакше паралельні події дублювали б повідомлення).
      'post', tg_table_name = 'game_slots' and tg_op = 'INSERT'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'discord_sync_secret')));
  return null;
end;
$function$;

drop trigger if exists discord_notify_slot on public.game_slots;
create trigger discord_notify_slot
  after insert or update or delete on public.game_slots
  for each row execute function private.discord_notify();

drop trigger if exists discord_notify_signup on public.game_signups;
create trigger discord_notify_signup
  after insert or update or delete on public.game_signups
  for each row execute function private.discord_notify();

-- ----- Realtime для апки -----
-- Запис із Discord має з'явитися на відкритій дошці без перезавантаження.
-- RLS на читання вже пускає будь-кого залогіненого.
alter publication supabase_realtime add table public.game_slots, public.game_signups;

-- Код прив'язки — лише для залогінених (функція й так відмовляє без auth.uid()).
revoke execute on function public.discord_create_link_code() from public, anon;
grant execute on function public.discord_create_link_code() to authenticated;
