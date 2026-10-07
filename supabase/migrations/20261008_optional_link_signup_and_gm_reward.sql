-- 1. Запис у Discord без прив'язки до апки.
-- 2. Нагорода ГМа за проведену гру.
--
-- ----- 1. Запис без прив'язки -----
-- Прив'язка Discord до апки лишається, але стала необов'язковою: вона дає записуватись
-- пілотом і мехом з апки. Хто не прив'язаний, записується в Discord одним натисканням —
-- без пілота й меха, лише з Discord-іменем.
--
--   * game_signups / game_signup_rolls: user_id і pilot_id можуть бути порожні; такий
--     запис тримається на discord_user_id (одна людина — один запис на гру);
--   * кидок d20 для такого запису без бонусу — бонус (profiles.contest_bonus) живе в
--     акаунті апки, якого в нього немає, тож за програні контести він не копиться;
--   * затвердження складу, «звільнити місце» і відписка працюють так само;
--   * завершення гри нагороджує лише записи з пілотом (раніше теж, бо join на pilots).
--
-- ----- 2. Нагорода ГМа -----
-- Завершуючи гру, ГМ обирає одну з трьох:
--   mana     — один із його пілотів отримує стільки мани, скільки гравці (reward_mana);
--   pr       — один із його пілотів отримує стільки PR, скільки гравці (reward_pr), з тим
--              самим капом, що й у гравців;
--   priority — ГМ отримує +3 до бонусу пріоритету (profiles.contest_bonus).

-- ----- Записи без акаунта -----

alter table public.game_signups alter column user_id drop not null;
alter table public.game_signups alter column pilot_id drop not null;
alter table public.game_signups add column if not exists discord_user_id text;
alter table public.game_signups add column if not exists discord_name text;
alter table public.game_signups drop constraint if exists game_signups_identity;
alter table public.game_signups add constraint game_signups_identity
  check (user_id is not null or discord_user_id is not null);
create unique index if not exists game_signups_slot_discord_key
  on public.game_signups (slot_id, discord_user_id) where discord_user_id is not null;

alter table public.game_signup_rolls drop constraint if exists game_signup_rolls_pkey;
alter table public.game_signup_rolls alter column user_id drop not null;
alter table public.game_signup_rolls add column if not exists discord_user_id text;
alter table public.game_signup_rolls drop constraint if exists game_signup_rolls_identity;
alter table public.game_signup_rolls add constraint game_signup_rolls_identity
  check (user_id is not null or discord_user_id is not null);
create unique index if not exists game_signup_rolls_user_key
  on public.game_signup_rolls (slot_id, user_id) where user_id is not null;
create unique index if not exists game_signup_rolls_discord_key
  on public.game_signup_rolls (slot_id, discord_user_id) where discord_user_id is not null;

-- Кидок ставить сервер: для акаунта — з бонусом, для запису лише з Discord — без нього.
create or replace function private.signup_roll()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r game_signup_rolls;
  b int;
begin
  if new.user_id is not null then
    select * into r from game_signup_rolls where slot_id = new.slot_id and user_id = new.user_id;
  else
    select * into r from game_signup_rolls where slot_id = new.slot_id and discord_user_id = new.discord_user_id;
  end if;
  if not found then
    b := case when new.user_id is null then 0
              else coalesce((select contest_bonus from profiles where id = new.user_id), 0) end;
    insert into game_signup_rolls (slot_id, user_id, discord_user_id, roll, roll_bonus, guaranteed)
      values (new.slot_id, new.user_id, case when new.user_id is null then new.discord_user_id end,
              case when b >= 9 then null else floor(random() * 20)::int + 1 end,
              b, b >= 9)
      returning * into r;
  end if;
  -- Що б не прислав клієнт, кидок і гарантію ставить сервер.
  new.roll := r.roll;
  new.roll_bonus := r.roll_bonus;
  new.rolled_at := r.rolled_at;
  new.guaranteed := r.guaranteed;
  return new;
end;
$function$;

-- Як private.discord_user_id, але без помилки для тих, хто не прив'язаний.
create or replace function private.discord_user_id_opt(p_discord_id text)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select user_id from discord_links where discord_user_id = p_discord_id;
$function$;

-- Запис з Discord. Прив'язаний — як раніше (пілот і мех обов'язкові, якщо пілот є);
-- прив'язаний без жодного пілота чи не прив'язаний узагалі — запис без пілота.
drop function if exists public.discord_signup(text, uuid, uuid, text);
create function public.discord_signup(
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
  if slot.status <> 'open' then raise exception 'Запис недоступний — набір уже закрито.'; end if;
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
revoke execute on function public.discord_signup(text, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.discord_signup(text, uuid, uuid, text, text) to service_role;

-- Відписка: і від запису акаунта, і від запису лише з Discord.
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
  if slot.status <> 'open' then raise exception 'Склад уже затверджено — відписатися не можна.'; end if;
  delete from game_signups
   where slot_id = p_slot_id
     and (discord_user_id = p_discord_id or (uid is not null and user_id = uid));
  if not found then raise exception 'Ви не записані на цю гру.'; end if;
end;
$function$;

-- «Звільнити місце»: тепер і для запису лише з Discord. Подія для discord-sync несе id
-- записів — у запису без акаунта немає user_id.
drop function if exists private.release_seat(uuid, uuid);
create function private.release_seat(p_user uuid, p_slot_id uuid, p_discord_id text default null)
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

  -- Наступний у черзі: гарантоване місце, далі вищий пріоритет, далі хто раніше записався.
  -- Той, хто сам звільнив місце, назад у чергу не стає.
  select * into nxt from game_signups
   where slot_id = p_slot_id and approved is false and released_at is null
   order by guaranteed desc, coalesce(roll, 0) + coalesce(roll_bonus, 0) desc, created_at
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

create or replace function public.release_seat(p_slot_id uuid)
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
  select private.release_seat(auth.uid(), p_slot_id, null);
$function$;

create or replace function public.discord_release_seat(p_discord_id text, p_slot_id uuid)
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
  select private.release_seat(private.discord_user_id_opt(p_discord_id), p_slot_id, p_discord_id);
$function$;

-- Теги складу для ГМа: Discord-ідентифікатор і ім'я беруться й із записів без акаунта.
create or replace function public.slot_discord_mentions(p_slot_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  slot game_slots;
begin
  select * into slot from game_slots where id = p_slot_id;
  if not found then raise exception 'Гру не знайдено.'; end if;
  if slot.created_by <> auth.uid() then raise exception 'Теги складу бачить лише ГМ цієї гри.'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'nick', coalesce(pr.nick, g.discord_name, 'Discord'),
      'callsign', p.callsign,
      'discordId', coalesce(l.discord_user_id, g.discord_user_id)
    ) order by g.created_at)
    from game_signups g
    left join profiles pr on pr.id = g.user_id
    left join pilots p on p.id = g.pilot_id
    left join discord_links l on l.user_id = g.user_id
    where g.slot_id = p_slot_id
      and (slot.status = 'open' or g.approved)
  ), '[]'::jsonb);
end;
$function$;

-- ----- Нагорода ГМа -----

alter table public.game_slots add column if not exists gm_reward text;
alter table public.game_slots drop constraint if exists game_slots_gm_reward_check;
alter table public.game_slots add constraint game_slots_gm_reward_check
  check (gm_reward is null or gm_reward in ('mana', 'pr', 'priority'));
alter table public.game_slots add column if not exists gm_reward_pilot_id uuid
  references public.pilots(id) on delete set null;

-- Мана й PR за гру для одного пілота: баланс, історія мани, кап PR, запис у журналі.
-- Спільне для гравців і ГМа, щоб вони рахувались однаково. p_tail — записи журналу, які
-- мають лишитись під нагородами (лічильник ігор).
create or replace function private.apply_game_reward(
  st jsonb, p_mana int, p_pr int, p_label text, p_ts text, p_gm boolean, p_tail jsonb)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  who text := case when p_gm then ' ГМа' else '' end;
  entries jsonb := coalesce(p_tail, '[]'::jsonb);
  pr_before integer;
  pr_cap integer;
  pr_after integer;
  pr_gained integer;
  pr_burned integer;
begin
  -- Кап PR піднімає лише «Ресурсний буфер»; дзеркалить prCap() з reducer.js.
  if coalesce(p_pr, 0) > 0 then
    pr_before := coalesce((st->>'pr')::int, 0);
    pr_cap := case
      when coalesce((st->'hangar'->'owned'->>'buffer')::int, 0) >= 1 then 200
      else 100
    end;
    pr_after := least(pr_cap, pr_before + p_pr);
    -- Пілот уже понад капом (кап міг впасти разом із покращенням) — не віднімаємо.
    if pr_after < pr_before then pr_after := pr_before; end if;
    pr_gained := pr_after - pr_before;
    pr_burned := p_pr - pr_gained;
    st := jsonb_set(st, '{pr}', to_jsonb(pr_after));
    entries := jsonb_build_array(jsonb_build_object(
      'ts', p_ts, 'msg', case
        when pr_burned > 0 then format(
          'PR%s за «%s»: +%s (%s → %s), %s згоріло понад капом %s',
          who, p_label, pr_gained, pr_before, pr_after, pr_burned, pr_cap)
        else format('PR%s за «%s»: +%s (%s → %s)', who, p_label, pr_gained, pr_before, pr_after)
      end)) || entries;
  end if;

  if coalesce(p_mana, 0) > 0 then
    st := jsonb_set(st, '{mana,balance}',
      to_jsonb(coalesce((st->'mana'->>'balance')::numeric, 0) + p_mana));
    st := jsonb_set(st, '{mana,history}', (
      select coalesce(jsonb_agg(e.value order by e.ord), '[]'::jsonb)
      from jsonb_array_elements(
        jsonb_build_array(jsonb_build_object(
          'label', format('+%s · Нагорода%s за «%s»', p_mana, who, p_label)))
        || coalesce(st->'mana'->'history', '[]'::jsonb)
      ) with ordinality e(value, ord)
      where e.ord <= 4
    ));
    entries := jsonb_build_array(jsonb_build_object(
      'ts', p_ts, 'msg', format('Нагорода%s за «%s»: +%s М', who, p_label, p_mana))) || entries;
  end if;

  if jsonb_array_length(entries) > 0 then
    st := jsonb_set(st, '{actionLog}', (
      select coalesce(jsonb_agg(e.value order by e.ord), '[]'::jsonb)
      from jsonb_array_elements(entries || coalesce(st->'actionLog', '[]'::jsonb))
        with ordinality e(value, ord)
      where e.ord <= 300
    ));
  end if;
  return st;
end;
$function$;

-- Завершення гри: нагорода гравцям, як і раніше, плюс вибір нагороди ГМа. Без вибору
-- (старий виклик з одним аргументом) ГМ нагороди не отримує.
drop function if exists public.gm_close_game(uuid);
create function public.gm_close_game(
  p_slot_id uuid, p_gm_reward text default null, p_gm_pilot_id uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  slot public.game_slots;
  r record;
  st jsonb;
  gm_state jsonb;
  games_before integer;
  games_after integer;
  games_base integer;
  board_games integer;
  ts text;
  slot_label text;
  tail jsonb;
begin
  select * into slot from game_slots where id = p_slot_id for update;
  if not found then raise exception 'Слот не знайдено.'; end if;

  if not private.is_gm() or slot.created_by <> auth.uid() then
    raise exception 'Гру завершує лише ГМ, який її створив.';
  end if;
  if slot.status = 'open' then raise exception 'Спершу затвердіть склад.'; end if;
  if slot.status <> 'approved' then raise exception 'Гру вже завершено або слот скасовано.'; end if;

  -- Нагороду ГМа перевіряємо до будь-яких змін, щоб помилка не лишила гру наполовину закритою.
  if p_gm_reward is not null and p_gm_reward not in ('mana', 'pr', 'priority') then
    raise exception 'Невідома нагорода ГМа.';
  end if;
  if p_gm_reward in ('mana', 'pr') then
    if p_gm_pilot_id is null then raise exception 'Оберіть свого персонажа для нагороди.'; end if;
    select state into gm_state from pilots where id = p_gm_pilot_id and user_id = slot.created_by for update;
    if not found then raise exception 'Персонажа не знайдено серед ваших.'; end if;
    if p_gm_reward = 'mana' and coalesce(slot.reward_mana, 0) <= 0 then
      raise exception 'У цієї гри немає нагороди мани.';
    end if;
    if p_gm_reward = 'pr' and coalesce(slot.reward_pr, 0) <= 0 then
      raise exception 'У цієї гри немає нагороди PR.';
    end if;
  end if;

  ts := to_char(now() at time zone 'Europe/Kyiv', 'DD.MM.YYYY HH24:MI:SS');
  slot_label := coalesce(nullif(btrim(slot.title), ''), 'гру');

  -- Статус ставиться ДО циклу — інакше перерахунок ігор не побачив би цей самий слот.
  update game_slots
     set status = 'closed',
         gm_reward = p_gm_reward,
         gm_reward_pilot_id = case when p_gm_reward in ('mana', 'pr') then p_gm_pilot_id end
   where id = p_slot_id;

  for r in
    select g.pilot_id, p.state
    from game_signups g
    join pilots p on p.id = g.pilot_id
    where g.slot_id = p_slot_id and g.approved
  loop
    st := r.state;

    games_before := coalesce((st->>'games')::int, 0);

    select count(*)::int into board_games
      from game_signups g2
      join game_slots s2 on s2.id = g2.slot_id
     where g2.pilot_id = r.pilot_id and g2.approved and s2.status = 'closed';

    if st ? 'gamesBase' then
      games_base := coalesce((st->>'gamesBase')::int, 0);
    else
      games_base := greatest(0, games_before - (board_games - 1));
      st := jsonb_set(st, '{gamesBase}', to_jsonb(games_base));
    end if;

    games_after := games_base + board_games;
    st := jsonb_set(st, '{games}', to_jsonb(games_after));

    if games_after <> games_before then
      tail := jsonb_build_array(jsonb_build_object(
        'ts', ts, 'msg', format('Зіграних ігор: %s → %s', games_before, games_after)));
    else
      tail := '[]'::jsonb;
    end if;

    st := private.apply_game_reward(st, slot.reward_mana, slot.reward_pr, slot_label, ts, false, tail);

    update pilots set state = st where id = r.pilot_id;
  end loop;

  -- Нагорода ГМа: стільки ж, скільки отримали гравці.
  if p_gm_reward = 'mana' then
    update pilots
       set state = private.apply_game_reward(gm_state, slot.reward_mana, 0, slot_label, ts, true, '[]'::jsonb)
     where id = p_gm_pilot_id;
  elsif p_gm_reward = 'pr' then
    update pilots
       set state = private.apply_game_reward(gm_state, 0, slot.reward_pr, slot_label, ts, true, '[]'::jsonb)
     where id = p_gm_pilot_id;
  elsif p_gm_reward = 'priority' then
    update profiles set contest_bonus = contest_bonus + 3 where id = slot.created_by;
  end if;
end;
$function$;
revoke execute on function public.gm_close_game(uuid, text, uuid) from public, anon;
grant execute on function public.gm_close_game(uuid, text, uuid) to authenticated;

-- ----- Дошка -----
-- Записи без пілота віддаються без LL і ігор; нік береться з Discord-імені. Для завершеної
-- гри віддається обрана нагорода ГМа (і позивний пілота, який її отримав).
create or replace function public.board_list()
returns jsonb
language sql
stable
security definer
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
