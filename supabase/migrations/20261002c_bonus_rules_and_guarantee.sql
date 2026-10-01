-- Правила бонусу до пріоритету й гарантоване місце.
--
-- Бонус (profiles.contest_bonus) накопичується +3 за кожен програний контест і
-- витрачається, щойно гравець потрапляє в склад:
--   * гравців ≤ місць  — усі, хто пройшов у склад, бонус втрачають (раніше він лишався);
--   * контест          — хто пройшов, бонус втрачає; хто ні — зберігає його і отримує +3.
-- Гравець, якого ГМ не взяв, хоча місць вистачало, бонус зберігає без +3: контесту не було.
--
-- Бонус +9 = гарантоване місце: під час запису d20 не кидається, а затвердження складу
-- включає такого гравця завжди, хоч би що відмітив ГМ. Після цього бонус, як і в усіх,
-- хто пройшов, обнуляється.

alter table public.game_signups add column if not exists guaranteed boolean not null default false;
alter table public.game_signup_rolls add column if not exists guaranteed boolean not null default false;
-- Гарантованому місцю d20 не потрібен.
alter table public.game_signup_rolls alter column roll drop not null;

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
  select * into r from game_signup_rolls where slot_id = new.slot_id and user_id = new.user_id;
  if not found then
    b := coalesce((select contest_bonus from profiles where id = new.user_id), 0);
    insert into game_signup_rolls (slot_id, user_id, roll, roll_bonus, guaranteed)
      values (new.slot_id, new.user_id,
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

create or replace function public.gm_approve_roster(p_slot_id uuid, p_approved uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  slot public.game_slots;
  total integer;
  contested boolean;
begin
  select * into slot from game_slots where id = p_slot_id for update;
  if not found then raise exception 'Слот не знайдено.'; end if;

  if not private.is_gm() or slot.created_by <> auth.uid() then
    raise exception 'Склад затверджує лише ГМ, який створив цю гру.';
  end if;
  if slot.status <> 'open' then raise exception 'Склад уже затверджено.'; end if;

  select count(*) into total from game_signups where slot_id = p_slot_id;
  contested := total > slot.seats;

  -- Гарантоване місце (+9) входить у склад завжди.
  update game_signups
     set approved = (id = any(coalesce(p_approved, '{}')) or guaranteed)
   where slot_id = p_slot_id;

  -- Хто пройшов у склад — використав бонус, був контест чи ні.
  update profiles set contest_bonus = 0
    where id in (select user_id from game_signups where slot_id = p_slot_id and approved);
  -- Хто програв контест — зберігає бонус і отримує +3.
  if contested then
    update profiles set contest_bonus = contest_bonus + 3
      where id in (select user_id from game_signups where slot_id = p_slot_id and not approved);
  end if;

  update game_slots set status = 'approved' where id = p_slot_id;
end;
$function$;

-- board_list віддає guaranteed; решта незмінна.
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
    'createdAt', s.created_at,
    'signups', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id,
        'userId', g.user_id,
        'nick', pr.nick,
        'pilotId', g.pilot_id,
        'callsign', p.callsign,
        'pilotName', p.name,
        'games', coalesce((p.state->>'games')::int, 0),
        'll', coalesce((p.state->>'ll')::int, 2),
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
