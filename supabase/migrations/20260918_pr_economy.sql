-- DC стають PR (Printer Requisition) і перестають бути ресурсом меха.
--
-- Правила Тіру 1: PR — єдиний пул пілота, кап 100 (200 з покращенням ангару
-- «Ресурсний буфер»), стартовий запас 30. Нагорода за гру тепер лягає в цей пул,
-- а не на меха, що літав місію, тож mech_id більше не бере участі в нарахуванні
-- (він лишається на game_signups як запис про те, чим саме гравець грав).
--
-- Rollback: 20260808_mission_dc_per_mech.sql містить попереднє означення
-- gm_resolve_slot; колонку й ключі стану треба перейменувати назад вручну.

-- 1. Нагорода слота: reward_dc -> reward_pr
alter table public.game_slots rename column reward_dc to reward_pr;

-- 2. Стан пілота: dcStore -> pr, buf -> prSpend, dcr прибрано, mechs[].dc прибрано.
--    Наявні DC не конвертуються в PR за курсом — старий кап був 5/10, новий 100,
--    тож перенесення 1:1 лишає значення в межах нового капу.
update public.pilots
set state = (
  (state - 'dcStore' - 'buf' - 'dcr')
  || jsonb_build_object(
       'pr', least(coalesce((state->>'dcStore')::int, 0), 100),
       'prSpend', jsonb_build_object('item', null, 'mechId', null, 'pick', null, 'error', '')
     )
  || case
       when jsonb_typeof(state->'mechs') = 'array' then
         jsonb_build_object('mechs', (
           select coalesce(jsonb_agg((e.m - 'dc') order by e.ord), '[]'::jsonb)
           from jsonb_array_elements(state->'mechs') with ordinality e(m, ord)
         ))
       else '{}'::jsonb
     end
)
where state ? 'dcStore' or state ? 'buf' or state ? 'dcr';

-- 3. Нарахування нагороди: PR у пул пілота, з урахуванням капу.
create or replace function public.gm_resolve_slot(p_slot_id uuid, p_approved uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  slot public.game_slots;
  total integer;
  contested boolean;
  r record;
  st jsonb;
  games_before integer;
  pr_before integer;
  pr_after integer;
  pr_cap integer;
  ts text;
  slot_label text;
  entries jsonb;
begin
  select * into slot from game_slots where id = p_slot_id for update;
  if not found then raise exception 'Слот не знайдено.'; end if;

  -- Only the GM who posted the game decides who played it.
  if not private.is_gm() or slot.created_by <> auth.uid() then
    raise exception 'Склад затверджує лише ГМ, який створив цю гру.';
  end if;
  if slot.status <> 'open' then raise exception 'Слот уже закрито.'; end if;

  select count(*) into total from game_signups where slot_id = p_slot_id;
  contested := total > slot.seats;

  update game_signups set approved = (id = any(coalesce(p_approved, '{}'))) where slot_id = p_slot_id;

  if contested then
    update profiles set contest_bonus = 0
      where id in (select user_id from game_signups where slot_id = p_slot_id and approved);
    update profiles set contest_bonus = contest_bonus + 3
      where id in (select user_id from game_signups where slot_id = p_slot_id and not approved);
  end if;

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

    -- PR лягають у пул пілота. Кап залежить від «Ресурсного буфера»; надлишок
    -- понад кап згорає, і рядок логу нижче каже, скільки саме нараховано.
    if slot.reward_pr > 0 then
      pr_cap := case when coalesce((st->'hangar'->'owned'->>'buffer')::int, 0) >= 1 then 200 else 100 end;
      pr_before := coalesce((st->>'pr')::int, 0);
      pr_after := least(pr_before + slot.reward_pr, pr_cap);
      st := jsonb_set(st, '{pr}', to_jsonb(pr_after));
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

    if slot.reward_pr > 0 then
      entries := jsonb_build_array(jsonb_build_object(
        'ts', ts, 'msg', case when pr_after - pr_before < slot.reward_pr
          then format('PR за «%s»: +%s (з %s — решта понад кап %s згоріла)',
                      slot_label, pr_after - pr_before, slot.reward_pr, pr_cap)
          else format('PR за «%s»: +%s (%s → %s)', slot_label, slot.reward_pr, pr_before, pr_after)
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
