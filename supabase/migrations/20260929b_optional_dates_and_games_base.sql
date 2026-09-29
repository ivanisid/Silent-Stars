-- 1. Дата проведення і кінець набору стають необов'язковими.
-- 2. Лічильник зіграних ігор перестає бути нагородою і починає рахуватись із дошки.

alter table public.game_slots
  alter column game_at drop not null,
  alter column signup_deadline drop not null;

-- ---------------------------------------------------------------------------
-- state.gamesBase — ігри поза дошкою
--
-- Досі gm_close_game робила games := games + 1, тобто лічильник був накопиченим
-- наосліп: відкат виплати його не повертав, видалений слот лишався порахованим.
-- Тепер games рахується як gamesBase + кількість закритих слотів, де пілот був
-- у затвердженому складі. gamesBase — це те, що було до дошки або поза нею.
--
-- Разове розділення: gamesBase = games − (закриті слоти пілота). Перевірено на
-- живих даних перед застосуванням — різниця невід'ємна в усіх 37 пілотів, тож
-- жодне поточне число не зміниться.
update pilots p
set state = jsonb_set(
  p.state,
  '{gamesBase}',
  to_jsonb(greatest(0,
    coalesce((p.state->>'games')::int, 0)
    - (select count(*)::int
         from game_signups g
         join game_slots s on s.id = g.slot_id
        where g.pilot_id = p.id and g.approved and s.status = 'closed')
  ))
);

-- ---------------------------------------------------------------------------
-- board_list: слот без дати не має провалюватись у кінець списку.
-- desc у Postgres і так дає NULLS FIRST, але лишати це на замовчуванні не варто —
-- додано явно, плюс created_at як другий ключ, бо без дати слоти інакше
-- перемішуються довільно.
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

-- ---------------------------------------------------------------------------
-- gm_close_game: гра більше не «нараховується» як нагорода.
--
-- Статус слоту тепер ставиться ДО циклу — інакше перерахунок не побачив би цей
-- самий слот серед закритих. Блокування рядка взято на початку, тож усе лишається
-- в одній транзакції.
--
-- games більше не інкрементується, а перераховується: gamesBase + закриті слоти.
-- Так лічильник самовиправляється на кожному закритті — видалений чи перевідкритий
-- слот більше не лишає завищене число назавжди.
create or replace function public.gm_close_game(p_slot_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  slot public.game_slots;
  r record;
  st jsonb;
  games_before integer;
  games_after integer;
  games_base integer;
  board_games integer;
  pr_before integer;
  pr_cap integer;
  pr_after integer;
  pr_gained integer;
  pr_burned integer;
  ts text;
  slot_label text;
  entries jsonb;
begin
  select * into slot from game_slots where id = p_slot_id for update;
  if not found then raise exception 'Слот не знайдено.'; end if;

  if not private.is_gm() or slot.created_by <> auth.uid() then
    raise exception 'Гру завершує лише ГМ, який її створив.';
  end if;
  if slot.status = 'open' then raise exception 'Спершу затвердіть склад.'; end if;
  if slot.status <> 'approved' then raise exception 'Гру вже завершено або слот скасовано.'; end if;

  ts := to_char(now() at time zone 'Europe/Kyiv', 'DD.MM.YYYY HH24:MI:SS');
  slot_label := coalesce(nullif(btrim(slot.title), ''), 'гру');

  -- Спершу статус, щоб перерахунок нижче вже враховував цей слот.
  update game_slots set status = 'closed' where id = p_slot_id;

  for r in
    select g.pilot_id, p.state
    from game_signups g
    join pilots p on p.id = g.pilot_id
    where g.slot_id = p_slot_id and g.approved
  loop
    st := r.state;

    games_before := coalesce((st->>'games')::int, 0);

    -- Цей слот уже позначений closed вище, тож лічильник включає його.
    select count(*)::int into board_games
      from game_signups g2
      join game_slots s2 on s2.id = g2.slot_id
     where g2.pilot_id = r.pilot_id and g2.approved and s2.status = 'closed';

    -- gamesBase може бути відсутнім: відкат повертає знімок стану, а знімки, зроблені
    -- до цієї міграції, поля не мають. Тоді відновлюємо його тут тим самим способом,
    -- що й разове розділення вище — games до закриття мінус закриті слоти без цього.
    if st ? 'gamesBase' then
      games_base := coalesce((st->>'gamesBase')::int, 0);
    else
      games_base := greatest(0, games_before - (board_games - 1));
      st := jsonb_set(st, '{gamesBase}', to_jsonb(games_base));
    end if;

    games_after := games_base + board_games;
    st := jsonb_set(st, '{games}', to_jsonb(games_after));

    pr_before := coalesce((st->>'pr')::int, 0);
    pr_cap := case
      when coalesce((st->'hangar'->'owned'->>'buffer')::int, 0) >= 1 then 200
      else 100
    end;

    if coalesce(slot.reward_pr, 0) > 0 then
      pr_after := least(pr_cap, pr_before + slot.reward_pr);
      if pr_after < pr_before then pr_after := pr_before; end if;
      pr_gained := pr_after - pr_before;
      pr_burned := slot.reward_pr - pr_gained;
      st := jsonb_set(st, '{pr}', to_jsonb(pr_after));
    else
      pr_gained := 0;
      pr_burned := 0;
    end if;

    if slot.reward_mana > 0 then
      st := jsonb_set(st, '{mana,balance}',
        to_jsonb(coalesce((st->'mana'->>'balance')::numeric, 0) + slot.reward_mana));
      st := jsonb_set(st, '{mana,history}', (
        select coalesce(jsonb_agg(e.value order by e.ord), '[]'::jsonb)
        from jsonb_array_elements(
          jsonb_build_array(jsonb_build_object(
            'label', format('+%s · Нагорода за «%s»', slot.reward_mana, slot_label)))
          || coalesce(st->'mana'->'history', '[]'::jsonb)
        ) with ordinality e(value, ord)
        where e.ord <= 4
      ));
    end if;

    -- Запис про лічильник — окремо від нагород і лише коли число змінилось.
    if games_after <> games_before then
      entries := jsonb_build_array(jsonb_build_object(
        'ts', ts, 'msg', format('Зіграних ігор: %s → %s', games_before, games_after)));
    else
      entries := '[]'::jsonb;
    end if;

    if coalesce(slot.reward_pr, 0) > 0 then
      entries := jsonb_build_array(jsonb_build_object(
        'ts', ts, 'msg', case
          when pr_burned > 0 then format(
            'PR за «%s»: +%s (%s → %s), %s згоріло понад капом %s',
            slot_label, pr_gained, pr_before, pr_after, pr_burned, pr_cap)
          else format('PR за «%s»: +%s (%s → %s)',
            slot_label, pr_gained, pr_before, pr_after)
        end)) || entries;
    end if;

    if slot.reward_mana > 0 then
      entries := jsonb_build_array(jsonb_build_object(
        'ts', ts, 'msg', format('Нагорода за «%s»: +%s М', slot_label, slot.reward_mana))) || entries;
    end if;

    st := jsonb_set(st, '{actionLog}', (
      select coalesce(jsonb_agg(e.value order by e.ord), '[]'::jsonb)
      from jsonb_array_elements(entries || coalesce(st->'actionLog', '[]'::jsonb))
        with ordinality e(value, ord)
      where e.ord <= 300
    ));

    update pilots set state = st where id = r.pilot_id;
  end loop;
end;
$function$;
