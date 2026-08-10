-- Approving the roster and finishing the game are two different events.
--
-- gm_resolve_slot conflated them: one call locked the roster AND paid the reward, so a slot
-- jumped from "signup open" straight to "played and settled" and there was no way to say
-- "the line-up is fixed, the game has not happened yet". Split into:
--
--   gm_approve_roster  open     -> approved  · who is in, contest bonuses settled, no reward
--   gm_close_game      approved -> closed    · the approved pilots played; reward paid out
--
-- No RLS change is needed for the new state. The signup INSERT and withdraw DELETE policies
-- both require game_slots.status = 'open', so 'approved' already blocks joining and leaving.
-- The reward stays editable through 'approved' via the ordinary GM update policy, which is
-- the point of the intermediate state: the GM can set the payout before paying it.
--
-- Rollback: restore gm_resolve_slot from 20260808_mission_dc_per_mech.sql, drop the two
-- functions below, and narrow the status check back to ('open','closed','cancelled') —
-- after moving any 'approved' slots to 'open' or 'closed', or the constraint will not validate.

alter table public.game_slots drop constraint if exists game_slots_status_check;
alter table public.game_slots add constraint game_slots_status_check
  check (status = any (array['open'::text, 'approved'::text, 'closed'::text, 'cancelled'::text]));

-- gm_resolve_slot is kept as a deprecated shim rather than dropped: the bundle already
-- deployed still calls it, and dropping it would break the live GM panel in the window
-- between this migration and the next deploy. It now does both steps in order, which is
-- exactly the old behaviour. Safe to drop once no client calls it.

-- Locks the line-up. Contest bonuses belong here: the contest is decided by who got a seat,
-- which is settled the moment the roster is approved, not when the game is played.
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

  update game_signups set approved = (id = any(coalesce(p_approved, '{}'))) where slot_id = p_slot_id;

  if contested then
    update profiles set contest_bonus = 0
      where id in (select user_id from game_signups where slot_id = p_slot_id and approved);
    update profiles set contest_bonus = contest_bonus + 3
      where id in (select user_id from game_signups where slot_id = p_slot_id and not approved);
  end if;

  update game_slots set status = 'approved' where id = p_slot_id;
end;
$function$;

-- The game happened: the approved pilots get paid. Mana lands on the pilot, DC on the mech
-- that flew (see 20260808_mission_dc_per_mech.sql), and each gets one more played game.
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
  mech_count integer;
  target_mech text;
  dc_mech_name text;
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

create or replace function public.gm_resolve_slot(p_slot_id uuid, p_approved uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.gm_approve_roster(p_slot_id, p_approved);
  perform public.gm_close_game(p_slot_id);
end;
$function$;
