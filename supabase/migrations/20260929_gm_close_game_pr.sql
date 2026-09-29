-- gm_close_game: нагорода йде в пул PR, а не в поле `dc` меха.
--
-- Функція лишилась з доPR-системи і падала на «record "slot" has no field "reward_dc"»,
-- тобто видати нагороду за закриту місію було неможливо взагалі. Перейменування колонки
-- (20260918_pr_economy) оновило gm_resolve_slot і board_list, але цю функцію пропустило.
--
-- Крім назви колонки тут змінена й сама механіка, бо стара більше не має сенсу:
--
-- 1. Було: нагорода писалась у `state.mechs[i].dc` — DC були ресурсом конкретного меха.
--    Стало: PR — єдиний пул пілота `state.pr`, полів `dc` у мехів більше немає.
--    Тому mech_id із заявки для нагороди більше не потрібен.
-- 2. Додано кап: 100, або 200 з покращенням ангару «Ресурсний буфер». Надлишок згорає —
--    саме це BoardPage і обіцяє ГМу в підтвердженні закриття гри.
-- 3. Стара версія ставила `dc` рівним нагороді (перезапис), а не додавала. Пул PR
--    накопичувальний, тож тепер саме додавання.
-- 4. Тексти в журналі: «DC» → «PR», і видно, скільки реально нараховано.
--
-- Решта поведінки не змінена: +1 зіграна гра, нагорода маною з історією, обрізання
-- журналу до 300 записів, перевірки прав і статусу слоту.

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

  for r in
    select g.pilot_id, p.state
    from game_signups g
    join pilots p on p.id = g.pilot_id
    where g.slot_id = p_slot_id and g.approved
  loop
    st := r.state;

    games_before := coalesce((st->>'games')::int, 0);
    st := jsonb_set(st, '{games}', to_jsonb(games_before + 1));

    -- Кап PR піднімає лише «Ресурсний буфер»; дзеркалить prCap() з reducer.js.
    pr_before := coalesce((st->>'pr')::int, 0);
    pr_cap := case
      when coalesce((st->'hangar'->'owned'->>'buffer')::int, 0) >= 1 then 200
      else 100
    end;

    if coalesce(slot.reward_pr, 0) > 0 then
      pr_after := least(pr_cap, pr_before + slot.reward_pr);
      -- Пілот уже понад капом (кап міг впасти разом із покращенням) — не віднімаємо.
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

    entries := jsonb_build_array(jsonb_build_object(
      'ts', ts, 'msg', format('Гра записана: %s → %s', games_before, games_before + 1)));

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

  update game_slots set status = 'closed' where id = p_slot_id;
end;
$function$;
