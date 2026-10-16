-- Склад після затвердження: пізній запис і додавання ГМом.
--
-- Поки гру не завершено (status = 'approved'):
--   * гравець може записатись і після затвердження — з апки чи Discord. Такий запис
--     пізній (late): він іде в резерв (approved = false), а не в склад; «Звільнити місце»
--     підтягує його після резерву з контесту;
--   * хто в резерві, може відписатись (раніше — лише поки набір відкрито);
--   * ГМ гри додає будь-якого пілота (public.gm_add_signup): у відкриту гру — як звичайний
--     запис, у затверджену — одразу в склад, з тими ж правилами бонусу, що й «Змінити склад».
-- Завершену гру це не зачіпає.
--
-- Контест (охочих більше, ніж місць) тепер фіксується при затвердженні (game_slots.contested):
-- пізні записи не мають заднім числом робити контест і роздавати +3 тим, хто не потрапив.
-- Пізній запис у контесті не брав участі: прибраний зі складу +3 не отримує.
--
-- Відкат: drop function public.gm_add_signup(uuid, uuid, text); drop function private.roster_set(uuid, boolean, boolean);
-- drop trigger signup_late on public.game_signups; drop function private.signup_late();
-- alter table public.game_signups drop column late; alter table public.game_slots drop column contested;
-- тіла settle_roster і gm_edit_roster — з 20261011_auto_roster.sql; release_seat — з 20261008;
-- discord_signup — з 20261008; discord_withdraw і board_list — з 20261008b; політики — з 20261002b і вихідної схеми.

alter table public.game_slots add column if not exists contested boolean;
alter table public.game_signups add column if not exists late boolean not null default false;

-- Для вже затверджених і завершених ігор пізніх записів ще не було — рахуємо, як рахували.
update public.game_slots s
   set contested = (select count(*) from public.game_signups g where g.slot_id = s.id) > s.seats
 where s.status in ('approved', 'closed') and s.contested is null;

-- Пізній запис — у резерв. Ставить сервер, що б не прислав клієнт.
create or replace function private.signup_late()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  st text;
begin
  select status into st from game_slots where id = new.slot_id;
  new.late := st = 'approved';
  if new.late then
    new.approved := false;
    new.bonus_before := case when new.user_id is null then null
      else coalesce((select contest_bonus from profiles where id = new.user_id), 0) end;
  else
    new.approved := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists signup_late on public.game_signups;
create trigger signup_late
  before insert on public.game_signups
  for each row execute function private.signup_late();

drop policy if exists "player signs up" on public.game_signups;
create policy "player signs up" on public.game_signups
  for insert with check (
    user_id = auth.uid()
    and (approved is null or (late and approved = false))
    and exists (select 1 from pilots p where p.id = game_signups.pilot_id and p.user_id = auth.uid())
    and exists (select 1 from game_slots s
                 where s.id = game_signups.slot_id and s.status in ('open', 'approved') and s.created_by <> auth.uid())
  );

drop policy if exists "player withdraws own signup while open" on public.game_signups;
create policy "player withdraws own signup while open" on public.game_signups
  for delete using (
    user_id = auth.uid()
    and exists (select 1 from game_slots s
                 where s.id = game_signups.slot_id
                   and (s.status = 'open' or (s.status = 'approved' and game_signups.approved is not true)))
  );

-- Як у 20261011, плюс фіксація контесту.
create or replace function private.settle_roster(p_slot_id uuid, p_approved uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  slot public.game_slots;
  total integer;
  is_contested boolean;
begin
  select * into slot from game_slots where id = p_slot_id;
  select count(*) into total from game_signups where slot_id = p_slot_id;
  is_contested := total > slot.seats;

  -- Бонус до затвердження — щоб ГМ міг потім змінити склад (gm_edit_roster).
  update game_signups g
     set bonus_before = coalesce((select contest_bonus from profiles where id = g.user_id), 0)
   where g.slot_id = p_slot_id and g.user_id is not null;

  -- Гарантоване місце (+9) входить у склад завжди.
  update game_signups
     set approved = (id = any(coalesce(p_approved, '{}')) or guaranteed)
   where slot_id = p_slot_id;

  -- Хто пройшов у склад — використав бонус, був контест чи ні.
  update profiles set contest_bonus = 0
    where id in (select user_id from game_signups where slot_id = p_slot_id and approved);
  -- Хто програв контест — зберігає бонус і отримує +3.
  if is_contested then
    update profiles set contest_bonus = contest_bonus + 3
      where id in (select user_id from game_signups where slot_id = p_slot_id and not approved);
  end if;

  update game_slots set status = 'approved', contested = is_contested where id = p_slot_id;
end;
$function$;

-- Один запис у склад чи з нього: бонус перераховується так, ніби рішення було таким одразу
-- (різницею від bonus_before). Пізній запис у контесті не був — для нього контесту немає.
create or replace function private.roster_set(p_signup uuid, p_in boolean, p_contested boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  g game_signups;
  c boolean;
begin
  select * into g from game_signups where id = p_signup for update;
  if not found or p_in is not distinct from coalesce(g.approved, false) then return; end if;
  c := coalesce(p_contested, false) and not g.late;
  if g.user_id is not null then
    update profiles
       set contest_bonus = greatest(0, contest_bonus
         + private.roster_bonus(p_in, c, g.bonus_before)
         - private.roster_bonus(coalesce(g.approved, false), c, g.bonus_before))
     where id = g.user_id;
  end if;
  update game_signups
     set approved = p_in,
         released_at = case when p_in then null else released_at end
   where id = g.id;
end;
$function$;

-- Зміна вже затвердженого складу ГМом — до завершення гри. p_approved — увесь новий склад.
create or replace function public.gm_edit_roster(p_slot_id uuid, p_approved uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  slot public.game_slots;
  g record;
begin
  select * into slot from game_slots where id = p_slot_id for update;
  if not found then raise exception 'Слот не знайдено.'; end if;
  if not private.is_gm() or slot.created_by <> auth.uid() then
    raise exception 'Склад змінює лише ГМ, який створив цю гру.';
  end if;
  if slot.status <> 'approved' then
    raise exception 'Змінити можна лише затверджений склад гри, яку ще не завершено.';
  end if;

  for g in select id from game_signups where slot_id = p_slot_id loop
    perform private.roster_set(g.id, g.id = any(coalesce(p_approved, '{}')), slot.contested);
  end loop;
end;
$function$;

-- ГМ гри додає пілота. Відкрита гра — звичайний запис (з кидком); затверджена — одразу в склад.
create or replace function public.gm_add_signup(p_slot_id uuid, p_pilot_id uuid, p_mech_id text)
returns public.game_signups
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  slot public.game_slots;
  pil pilots;
  mname text;
  s game_signups;
begin
  select * into slot from game_slots where id = p_slot_id for update;
  if not found then raise exception 'Слот не знайдено.'; end if;
  if not private.is_gm() or slot.created_by <> auth.uid() then
    raise exception 'Додати гравця може лише ГМ, який створив цю гру.';
  end if;
  if slot.status not in ('open', 'approved') then
    raise exception 'Гру вже завершено або скасовано.';
  end if;

  select * into pil from pilots where id = p_pilot_id;
  if not found then raise exception 'Пілота не знайдено.'; end if;
  if pil.user_id = slot.created_by then raise exception 'ГМ не записується на власну гру.'; end if;
  if exists (
    select 1 from game_signups g
     where g.slot_id = p_slot_id
       and (g.user_id = pil.user_id
            or g.discord_user_id = (select discord_user_id from discord_links where user_id = pil.user_id))
  ) then
    raise exception 'Цей гравець уже записаний на цю гру.';
  end if;

  if p_mech_id is not null then
    select m->>'name' into mname
      from jsonb_array_elements(coalesce(pil.state->'mechs', '[]'::jsonb)) m
     where m->>'id' = p_mech_id
     limit 1;
  end if;

  insert into game_signups (slot_id, user_id, pilot_id, mech_id, mech_name)
    values (p_slot_id, pil.user_id, p_pilot_id, p_mech_id, mname)
    returning * into s;

  if slot.status = 'approved' then
    perform private.roster_set(s.id, true, slot.contested);
    select * into s from game_signups where id = s.id;
  end if;
  return s;
end;
$function$;
revoke execute on function public.gm_add_signup(uuid, uuid, text) from public, anon;
grant execute on function public.gm_add_signup(uuid, uuid, text) to authenticated;
revoke execute on function private.roster_set(uuid, boolean, boolean), private.signup_late()
  from public, anon, authenticated;

-- Як у 20261008, але пізні записи — після резерву з контесту.
create or replace function private.release_seat(p_user uuid, p_slot_id uuid, p_discord_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  slot game_slots;
  mine game_signups;
  nxt game_signups;
begin
  select * into slot from game_slots where id = p_slot_id for update;
  if not found then raise exception 'Гру не знайдено.'; end if;
  if slot.status <> 'approved' then
    raise exception 'Звільнити місце можна лише після затвердження складу і до завершення гри.';
  end if;

  select * into mine from game_signups
   where slot_id = p_slot_id
     and ((p_user is not null and user_id = p_user)
          or (p_discord_id is not null and discord_user_id = p_discord_id))
   limit 1;
  if not found or mine.approved is not true then raise exception 'Ви не в складі цієї гри.'; end if;

  update game_signups set approved = false, released_at = now() where id = mine.id;

  -- Наступний у черзі: резерв з контесту раніше за пізні записи, далі гарантоване місце,
  -- вищий пріоритет, хто раніше записався. Той, хто сам звільнив місце, назад у чергу не стає.
  select * into nxt from game_signups
   where slot_id = p_slot_id and approved is false and released_at is null
   order by late, guaranteed desc, coalesce(roll, 0) + coalesce(roll_bonus, 0) desc, created_at
   limit 1;

  if nxt.id is not null then
    update game_signups set approved = true where id = nxt.id;
    -- Потрапив у склад — витратив бонус, як і всі інші.
    update profiles set contest_bonus = 0 where id = nxt.user_id;
  end if;

  perform private.discord_post_event(jsonb_build_object(
    'slot_id', p_slot_id, 'event', 'released',
    'released_user', mine.user_id, 'promoted_user', nxt.user_id,
    'released_signup', mine.id, 'promoted_signup', nxt.id));

  return jsonb_build_object('promoted', nxt.id is not null);
end;
$function$;

-- Як у 20261008, але й після затвердження (у резерв).
create or replace function public.discord_signup(
  p_discord_id text, p_slot_id uuid, p_pilot_id uuid, p_mech_id text, p_username text default null)
returns public.game_signups
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := private.discord_user_id_opt(p_discord_id);
  slot game_slots;
  pil pilots;
  mname text;
  s game_signups;
begin
  select * into slot from game_slots where id = p_slot_id;
  if not found then raise exception 'Гру не знайдено.'; end if;
  if slot.status not in ('open', 'approved') then raise exception 'Запис недоступний — набір уже закрито.'; end if;
  if uid is not null and slot.created_by = uid then raise exception 'ГМ не записується на власну гру.'; end if;

  -- Запис, зроблений до прив'язки, лишається за Discord-ідентифікатором.
  if exists (select 1 from game_signups where slot_id = p_slot_id and discord_user_id = p_discord_id) then
    raise exception 'Ви вже записані на цю гру.';
  end if;

  if uid is null then
    -- Без акаунта апки пілота й меха немає.
    begin
      insert into game_signups (slot_id, user_id, pilot_id, discord_user_id, discord_name)
        values (p_slot_id, null, null, p_discord_id, nullif(btrim(coalesce(p_username, '')), ''))
        returning * into s;
    exception when unique_violation then
      raise exception 'Ви вже записані на цю гру.';
    end;
    return s;
  end if;

  if p_pilot_id is not null then
    select * into pil from pilots where id = p_pilot_id and user_id = uid;
    if not found then raise exception 'Пілота не знайдено.'; end if;

    if p_mech_id is not null then
      select m->>'name' into mname
        from jsonb_array_elements(coalesce(pil.state->'mechs', '[]'::jsonb)) m
       where m->>'id' = p_mech_id
       limit 1;
    end if;
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

-- Як у 20261008b, але після затвердження відписатись може той, хто не в складі.
create or replace function public.discord_withdraw(p_discord_id text, p_slot_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := private.discord_user_id_opt(p_discord_id);
  slot game_slots;
begin
  select * into slot from game_slots where id = p_slot_id;
  if not found then raise exception 'Гру не знайдено.'; end if;
  if slot.status not in ('open', 'approved') then raise exception 'Склад уже затверджено — відписатися не можна.'; end if;
  if slot.status = 'approved' and exists (
    select 1 from game_signups
     where slot_id = p_slot_id and approved
       and (discord_user_id = p_discord_id or (uid is not null and user_id = uid))
  ) then
    raise exception 'Ви в складі гри — відписатися не можна, лише звільнити місце.';
  end if;
  delete from game_signups
   where slot_id = p_slot_id
     and (discord_user_id = p_discord_id or (uid is not null and user_id = uid));
  if not found then raise exception 'Ви не записані на цю гру.'; end if;
end;
$function$;

-- Як у 20261008b, плюс contested слота і late запису.
create or replace function public.board_list()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'createdBy', s.created_by,
    'createdByNick', (select nick from profiles where id = s.created_by),
    'title', s.title,
    'description', s.description,
    'gameAt', s.game_at,
    'signupDeadline', s.signup_deadline,
    'seats', s.seats,
    'status', s.status,
    'contested', s.contested,
    'rewardMana', s.reward_mana,
    'rewardPr', s.reward_pr,
    'difficulty', s.difficulty,
    'gmReward', s.gm_reward,
    'gmRewardPilot', (select callsign from pilots where id = s.gm_reward_pilot_id),
    'createdAt', s.created_at,
    'signups', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id,
        'userId', g.user_id,
        'nick', coalesce(pr.nick, g.discord_name),
        'discordOnly', g.user_id is null,
        'pilotId', g.pilot_id,
        'callsign', p.callsign,
        'pilotName', p.name,
        'games', case when p.id is null then null else coalesce((p.state->>'games')::int, 0) end,
        'll', case when p.id is null then null else coalesce((p.state->>'ll')::int, 2) end,
        'mech', coalesce(
          (select m->>'name'
             from jsonb_array_elements(coalesce(p.state->'mechs', '[]'::jsonb)) m
            where m->>'id' = g.mech_id
            limit 1),
          g.mech_name),
        'roll', g.roll,
        'rollBonus', g.roll_bonus,
        'rolledAt', g.rolled_at,
        'guaranteed', g.guaranteed,
        'releasedAt', g.released_at,
        'approved', g.approved,
        'late', g.late,
        'createdAt', g.created_at
      ) order by g.created_at), '[]'::jsonb)
      from game_signups g
      left join profiles pr on pr.id = g.user_id
      left join pilots p on p.id = g.pilot_id
      where g.slot_id = s.id
    )
  ) order by s.game_at desc nulls first, s.created_at desc), '[]'::jsonb)
  from game_slots s
  where auth.uid() is not null;
$function$;
