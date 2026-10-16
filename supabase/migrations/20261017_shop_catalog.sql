-- Каталог магазину й особистих покращень: ціни, тексти й параметри, які ГМ змінює в апці
-- (розділ «МАГАЗИН» у ГМ-панелі). Специфікація — docs/gm-shop-editor-spec.md.
--
-- shop_items — одна позиція на рядок:
--   kind  'printer' | 'shop' | 'insurance' | 'upgrade'
--   grp   група покращення («ФІНАНСОВИЙ МЕНЕДЖЕР», …); для решти — ''
--   price_pr, price_mana — ціна
--   params — тексти й параметри:
--     insurance: desc, upgraded { title, desc } (лише clone)
--     upgrade:   quote, effect [..], notes [..], requires (ключ іншого покращення або ''),
--                cap (лише buffer — кап PR з «Трастовим фондом»)
--     refill:    tiers { "1", "2", "3" } — ціна поповнення за базовим запасом зарядів
--     prpack:    size — скільки PR у пачці
--   archived — приховано: не продається, але придбане / внесене / поліси пілотів діють.
-- Механіку мають лише вбудовані ключі (див. client/src/pilot/shopCatalog.js); позиції, додані
-- ГМом, лише списують ціну, нові покращення — позначка «придбано» й тексти.
--
-- shop_settings — один рядок: стартові PR нового пілота й базовий кап PR.
--
-- Кап PR у нагородах за гру (gm_close_game, gm_resolve_slot, private.apply_game_reward) тепер
-- береться з каталогу через private.pr_cap(st) замість літералів 200 / 100. Тіла функцій —
-- поточні з бази (16.10.2026), змінено лише вираз капу.
--
-- Читати можуть усі залогінені, писати — лише через gm_* функції (перевірка private.is_gm()).
-- Наповнення — окрема міграція 20261017b_shop_catalog_seed.sql.
--
-- Rollback:
--   відновити gm_resolve_slot, gm_close_game, private.apply_game_reward з виразом
--     case when coalesce((st->'hangar'->'owned'->>'buffer')::int, 0) >= 1 then 200 else 100 end;
--   drop function private.pr_cap(jsonb);
--   drop function public.gm_save_shop_item(text, text, text, text, integer, integer, jsonb);
--   drop function public.gm_set_shop_item_archived(text, boolean);
--   drop function public.gm_reorder_shop_items(text, text[]);
--   drop function public.gm_save_shop_settings(integer, integer);
--   drop table public.shop_items;
--   drop table public.shop_settings;

create table if not exists public.shop_items (
  key text primary key,
  kind text not null check (kind in ('printer', 'shop', 'insurance', 'upgrade')),
  grp text not null default '',
  title text not null,
  price_pr integer not null default 0 check (price_pr >= 0),
  price_mana integer not null default 0 check (price_mana >= 0),
  params jsonb not null default '{}' check (jsonb_typeof(params) = 'object'),
  archived boolean not null default false,
  sort integer not null,
  updated_at timestamptz default now(),
  updated_by uuid references auth.users
);

create table if not exists public.shop_settings (
  id boolean primary key default true check (id),
  pr_start integer not null check (pr_start >= 0),
  pr_cap_base integer not null check (pr_cap_base >= 1),
  updated_at timestamptz default now(),
  updated_by uuid references auth.users
);

alter table public.shop_items enable row level security;
alter table public.shop_settings enable row level security;

drop policy if exists "shop items: read" on public.shop_items;
create policy "shop items: read" on public.shop_items for select to authenticated using (true);
drop policy if exists "shop settings: read" on public.shop_settings;
create policy "shop settings: read" on public.shop_settings for select to authenticated using (true);

-- Кап PR пілота; дзеркалить prCapFor() з client/src/pilot/shopCatalog.js.
-- «Трастовий фонд» діє й прихований.
create or replace function private.pr_cap(st jsonb)
returns integer
language sql
stable
set search_path to 'public'
as $function$
  select case
    when coalesce((st->'hangar'->'owned'->>'buffer')::int, 0) >= 1
      then coalesce((select (params->>'cap')::int from shop_items where key = 'buffer'), 200)
    else coalesce((select pr_cap_base from shop_settings), 100)
  end;
$function$;

-- Створити (p_key null — у кінець вкладки) або оновити позицію. Вкладку наявної позиції
-- змінити не можна.
create or replace function public.gm_save_shop_item(
  p_key text,
  p_kind text,
  p_grp text,
  p_title text,
  p_price_pr integer,
  p_price_mana integer,
  p_params jsonb
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key text;
  v_kind text;
  v_req text;
  v_n text;
begin
  if not private.is_gm() then raise exception 'Редагувати магазин може лише ГМ.'; end if;
  if p_kind not in ('printer', 'shop', 'insurance', 'upgrade') then raise exception 'Невідома вкладка магазину.'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'Вкажіть назву.'; end if;
  if p_price_pr is null or p_price_pr < 0 or p_price_mana is null or p_price_mana < 0 then
    raise exception 'Ціна — ціле число від 0.';
  end if;
  if p_params is null or jsonb_typeof(p_params) <> 'object' then raise exception 'Параметри позиції мають бути об''єктом.'; end if;

  if p_key is not null then
    select kind into v_kind from shop_items where key = p_key;
    if v_kind is null then raise exception 'Позицію не знайдено.'; end if;
    if v_kind <> p_kind then raise exception 'Вкладку позиції змінити не можна.'; end if;
  end if;

  if p_kind = 'upgrade' then
    if coalesce(btrim(p_grp), '') = '' then raise exception 'Вкажіть групу покращення.'; end if;
    v_req := coalesce(p_params->>'requires', '');
    if v_req <> '' and (v_req = p_key or not exists (select 1 from shop_items where key = v_req and kind = 'upgrade')) then
      raise exception 'Потрібне покращення не знайдено.';
    end if;
  end if;

  if p_key = 'refill' then
    foreach v_n in array array['1', '2', '3'] loop
      if jsonb_typeof(p_params->'tiers'->v_n) <> 'number' or (p_params->'tiers'->>v_n)::numeric < 0
        or (p_params->'tiers'->>v_n)::numeric <> trunc((p_params->'tiers'->>v_n)::numeric) then
        raise exception 'Ціна поповнення зарядів — ціле число від 0.';
      end if;
    end loop;
  end if;
  if p_key = 'prpack' and (jsonb_typeof(p_params->'size') <> 'number' or (p_params->>'size')::numeric < 1
    or (p_params->>'size')::numeric <> trunc((p_params->>'size')::numeric)) then
    raise exception 'Розмір пачки PR — ціле число від 1.';
  end if;
  if p_key = 'buffer' and (jsonb_typeof(p_params->'cap') <> 'number' or (p_params->>'cap')::numeric < 1
    or (p_params->>'cap')::numeric <> trunc((p_params->>'cap')::numeric)) then
    raise exception 'Кап PR — ціле число від 1.';
  end if;

  if p_key is null then
    insert into shop_items (key, kind, grp, title, price_pr, price_mana, params, sort, updated_by)
    values (
      'c_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
      p_kind,
      case when p_kind = 'upgrade' then btrim(p_grp) else '' end,
      btrim(p_title), p_price_pr, p_price_mana, p_params,
      (select coalesce(max(sort), 0) + 1 from shop_items where kind = p_kind),
      auth.uid()
    )
    returning key into v_key;
  else
    update shop_items set
      grp = case when p_kind = 'upgrade' then btrim(p_grp) else '' end,
      title = btrim(p_title),
      price_pr = p_price_pr,
      price_mana = p_price_mana,
      params = p_params,
      updated_at = now(),
      updated_by = auth.uid()
    where key = p_key
    returning key into v_key;
  end if;
  return v_key;
end;
$function$;

create or replace function public.gm_set_shop_item_archived(p_key text, p_archived boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not private.is_gm() then raise exception 'Редагувати магазин може лише ГМ.'; end if;
  update shop_items set archived = coalesce(p_archived, false), updated_at = now(), updated_by = auth.uid()
  where key = p_key;
  if not found then raise exception 'Позицію не знайдено.'; end if;
end;
$function$;

-- sort = позиція в масиві (1, 2, …) у межах вкладки; позиції, яких немає в масиві, не змінюються.
create or replace function public.gm_reorder_shop_items(p_kind text, p_keys text[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not private.is_gm() then raise exception 'Редагувати магазин може лише ГМ.'; end if;
  update shop_items s set sort = t.ord, updated_at = now(), updated_by = auth.uid()
  from unnest(coalesce(p_keys, '{}')) with ordinality as t(key, ord)
  where s.key = t.key and s.kind = p_kind;
end;
$function$;

create or replace function public.gm_save_shop_settings(p_pr_start integer, p_pr_cap_base integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not private.is_gm() then raise exception 'Редагувати магазин може лише ГМ.'; end if;
  if p_pr_start is null or p_pr_start < 0 then raise exception 'Стартові PR — ціле число від 0.'; end if;
  if p_pr_cap_base is null or p_pr_cap_base < 1 then raise exception 'Кап PR — ціле число від 1.'; end if;
  insert into shop_settings (id, pr_start, pr_cap_base, updated_by)
  values (true, p_pr_start, p_pr_cap_base, auth.uid())
  on conflict (id) do update set
    pr_start = excluded.pr_start,
    pr_cap_base = excluded.pr_cap_base,
    updated_at = now(),
    updated_by = auth.uid();
end;
$function$;

revoke execute on function public.gm_save_shop_item(text, text, text, text, integer, integer, jsonb) from public, anon;
revoke execute on function public.gm_set_shop_item_archived(text, boolean) from public, anon;
revoke execute on function public.gm_reorder_shop_items(text, text[]) from public, anon;
revoke execute on function public.gm_save_shop_settings(integer, integer) from public, anon;
grant execute on function public.gm_save_shop_item(text, text, text, text, integer, integer, jsonb) to authenticated;
grant execute on function public.gm_set_shop_item_archived(text, boolean) to authenticated;
grant execute on function public.gm_reorder_shop_items(text, text[]) to authenticated;
grant execute on function public.gm_save_shop_settings(integer, integer) to authenticated;

-- ---------- Кап PR у нагородах за гру — з каталогу ----------

CREATE OR REPLACE FUNCTION public.gm_resolve_slot(p_slot_id uuid, p_approved uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    if slot.reward_pr > 0 then
      pr_cap := private.pr_cap(st);
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

CREATE OR REPLACE FUNCTION public.gm_close_game(p_slot_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  update game_slots set status = 'closed' where id = p_slot_id;

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

    pr_before := coalesce((st->>'pr')::int, 0);
    pr_cap := private.pr_cap(st);

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

CREATE OR REPLACE FUNCTION private.apply_game_reward(st jsonb, p_mana integer, p_pr integer, p_label text, p_ts text, p_gm boolean, p_tail jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  who text := case when p_gm then ' ГМа' else '' end;
  entries jsonb := coalesce(p_tail, '[]'::jsonb);
  pr_before integer;
  pr_cap integer;
  pr_after integer;
  pr_gained integer;
  pr_burned integer;
begin
  if coalesce(p_pr, 0) > 0 then
    pr_before := coalesce((st->>'pr')::int, 0);
    pr_cap := private.pr_cap(st);
    pr_after := least(pr_cap, pr_before + p_pr);
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
