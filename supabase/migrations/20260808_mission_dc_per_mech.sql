-- Mission DC moves from the pilot's buffer to the mech that flew the game.
--
-- Before this migration gm_resolve_slot topped up pilots.state->>'dcStore' — the Resource
-- Buffer — which capped the reward at 5 (10 with buffer L2) and let unspent DC linger there.
-- DC are per-mech and burn: each closed game refreshes the flying mech's counter to that
-- game's reward, and only what the pilot moves into the buffer survives.
--
-- The mech is taken from the signup (game_signups.mech_id, recorded at signup time). A pilot
-- with exactly one mech gets it credited there regardless, since there was no choice to make.
-- dcStore is left alone: the buffer is still filled by the pilot's own repair modal.
--
-- Rollback: re-apply the previous definition, which differed only in this block --
--   cap := case when coalesce((st->'hangar'->'owned'->>'buffer')::int, 0) >= 2 then 10 else 5 end;
--   dc_before := coalesce((st->>'dcStore')::int, 0);
--   dc_after  := least(greatest(dc_before, cap), dc_before + slot.reward_dc);
--   st := jsonb_set(st, '{dcStore}', to_jsonb(dc_after));
-- -- and in naming dc_after - dc_before in the log line instead of the mech.

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
  mech_count integer;
  target_mech text;
  dc_mech_name text;
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
    select g.pilot_id, g.mech_id, p.state
    from game_signups g
    join pilots p on p.id = g.pilot_id
    where g.slot_id = p_slot_id and g.approved
  loop
    st := r.state;

    games_before := coalesce((st->>'games')::int, 0);
    st := jsonb_set(st, '{games}', to_jsonb(games_before + 1));

    -- Mission DC land on the mech that flew this game. Mech ids are client-generated
    -- numbers stored as text on the signup, so the match is text-to-text.
    mech_count := coalesce(jsonb_array_length(st->'mechs'), 0);
    target_mech := null;
    dc_mech_name := null;
    if mech_count = 1 then
      target_mech := st->'mechs'->0->>'id';
    elsif mech_count > 1 then
      target_mech := r.mech_id;
    end if;

    if target_mech is not null then
      select m->>'name' into dc_mech_name
      from jsonb_array_elements(st->'mechs') m
      where m->>'id' = target_mech;
    end if;

    -- A mech deleted between signup and closing leaves nothing to credit; the reward line
    -- below then says so rather than silently dropping the DC.
    if dc_mech_name is not null then
      st := jsonb_set(st, '{mechs}', (
        select jsonb_agg(
                 case when e.m->>'id' = target_mech
                      then jsonb_set(e.m, '{dc}', to_jsonb(slot.reward_dc))
                      else e.m end
                 order by e.ord)
        from jsonb_array_elements(st->'mechs') with ordinality e(m, ord)
      ));
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

    if slot.reward_dc > 0 then
      entries := jsonb_build_array(jsonb_build_object(
        'ts', ts, 'msg', case when dc_mech_name is not null
          then format('DC за «%s»: %s DC на меха «%s»', slot_label, slot.reward_dc, dc_mech_name)
          else format('DC за «%s»: %s DC не нараховано — мех не визначений', slot_label, slot.reward_dc)
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
