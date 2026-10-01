-- Складність місії: швидкий пресет нагороди плюс підказка про рекомендований ЛЛ.
--
-- Зберігається окремим полем, а не виводиться з reward_mana/reward_pr. Пара чисел
-- справді однозначно визначає пресет (усі дев'ять пар різні), але числа ще
-- змінюватимуться — і виведена мітка переписала б заднім числом усі старі слоти.
--
-- Поле необов'язкове: ГМ може задати нагороду вручну, не обираючи складність.
-- Перевірки значень тут немає навмисно: перелік живе в client/src/difficulty.js
-- і там же змінюватиметься, а constraint довелось би мігрувати разом із кожною правкою.

alter table public.game_slots add column if not exists difficulty text;

-- board_list віддає нове поле; решта незмінна.
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
