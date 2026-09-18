-- Рівень ліцензії стає власним полем стану і купується за ману.
--
-- Раніше LL виводився з кількості зіграних ігор за таблицею порогів
-- (GAMES_TABLE = [0,3,6,9,12,16,20,24,29,34,39,44]). Тепер games лишається просто
-- лічильником зіграних ігор, а LL зберігається в state.ll і піднімається явною
-- покупкою за ману.
--
-- Rollback: alter-у схеми тут немає, лише поле в jsonb — досить прибрати state.ll
-- і повернути попереднє означення board_list із 20260918_pr_economy.sql.

-- 1. Backfill: виставити ll наявним пілотам за старою таблицею порогів, щоб нікого
--    не відкинуло на LL2. ll = 1 + (скільки порогів не перевищують games), максимум 12.
update public.pilots
set state = state || jsonb_build_object(
  'll',
  least(12, 1 + (
    select count(*)
    from unnest(array[0,3,6,9,12,16,20,24,29,34,39,44]) as t
    where t <= coalesce((state->>'games')::int, 0)
  ))
)
where not (state ? 'll');

-- 2. board_list має віддавати рівень: клієнт більше не може порахувати його з games.
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
    'rewardMana', s.reward_mana,
    'rewardPr', s.reward_pr,
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
        'approved', g.approved,
        'createdAt', g.created_at
      ) order by g.created_at), '[]'::jsonb)
      from game_signups g
      left join profiles pr on pr.id = g.user_id
      left join pilots p on p.id = g.pilot_id
      where g.slot_id = s.id
    )
  ) order by s.game_at desc), '[]'::jsonb)
  from game_slots s
  where auth.uid() is not null;
$function$;
