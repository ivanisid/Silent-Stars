-- Крок подорожчання рівня береться за тіром, З ЯКОГО йде підвищення.
--
-- 20260919_convert_legacy_progress створила mana_level_cost() з кроком за тіром,
-- НА який іде підвищення (generate_series(4, p_ll + 1)). Правила змінились: перехід
-- між тірами дорожчає ще за поточним тіром, а не за новим. LL5→LL6 крокує на +100
-- як решта Тіру 1, LL10→LL11 — на +200 як решта Тіру 2.
--
-- Дзеркалить manaLevelCost() з client/src/pilot/logic.js.
--
-- Нові ціни: 1000 / 1100 / 1200 / 1300 / 1500 / 1700 / 1900 / 2100 / 2300 / 2800,
-- повний шлях LL2 → LL12 = 16 900 (було 18 200).
--
-- Конверсію старого прогресу ця зміна не переписує: вона вже відпрацювала й записала
-- значення в pilots.state. На момент конверсії жоден пілот з LL5 і вище не мав
-- часткового прогресу за іграми, тож стара формула на їхні баланси не вплинула —
-- уся їхня мана прийшла зі старого залишку, незалежного від ціни рівня.

create or replace function public.mana_level_cost(p_ll integer)
returns integer
language sql
immutable
as $function$
  select case
    when p_ll is null or p_ll < 2 or p_ll >= 12 then null
    else 1000 + coalesce((
      select sum(case when s <= 5 then 100 when s <= 10 then 200 else 500 end)
      from generate_series(3, p_ll) s
    ), 0)
  end;
$function$;
