-- Друга частина 20261008: заміна наявних функцій у схемі public і прибирання дубля.
--
-- Окремо, бо ці команди (create or replace / drop для вже наявних public-функцій) не
-- виконуються через інструмент доступу до бази — запит зависає. Запустити в SQL-редакторі
-- Supabase разом (одним запуском).
--
-- Поки вона не виконана: у Discord без привʼязки можна записатись, але не відписатись і не
-- звільнити місце; в апці записи без пілота показуються без Discord-імені й без вибраної
-- нагороди ГМа.

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
create or replace function public.release_seat(p_slot_id uuid)
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
  select private.release_seat(auth.uid(), p_slot_id, null::text);
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

-- Старе перевантаження з 4 аргументами більше не потрібне: edge-функція завжди передає
-- p_username. Без цього виклик з 4 іменованими аргументами був би неоднозначним.
drop function if exists public.discord_signup(text, uuid, uuid, text);
