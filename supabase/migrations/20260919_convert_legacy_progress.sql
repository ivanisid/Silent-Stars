-- Переведення старих балансів у нові валюти.
--
-- До переходу на нову систему мана була валютою магазину, а прогрес до рівня
-- рахувався кількістю зіграних ігор. Тепер навпаки: мана — це XP до наступного
-- рівня, а витратна валюта — PR. Тому обидва значення міняються ролями:
--
--   зіграні ігри → мана: частка пройденого шляху до наступного рівня, помножена
--                        на ціну цього рівня. Зіграна 1 гра з 3 потрібних дає 1/3
--                        ціни рівня.
--   стара мана   → PR:   100 мани = 10 PR, плюс уже перенесені DC, з обрізанням
--                        по капу 100 PR.
--
-- Має виконуватись ПІСЛЯ 20260918_pr_economy.sql (яка кладе DC у state.pr) і
-- 20260918b_mana_levels.sql (яка проставляє state.ll).
--
-- state.games не чіпається: він лишається лічильником зіграних ігор.
--
-- Rollback: значень до конверсії ця міграція не зберігає, але вони є в
-- pilot_audit_log — кожен рядок тут запише новий запис аудиту.

-- Ціна підвищення з p_ll на p_ll+1. Крок береться за тіром рівня, НА який іде
-- підвищення: Тір 1 (LL2–5) — 100, Тір 2 (LL6–10) — 200, Тір 3 (LL11–12) — 500.
-- Дзеркалить manaLevelCost() з client/src/pilot/logic.js.
create or replace function public.mana_level_cost(p_ll integer)
returns integer
language sql
immutable
as $function$
  select case
    when p_ll is null or p_ll < 2 or p_ll >= 12 then null
    else 1000 + coalesce((
      select sum(case when s <= 5 then 100 when s <= 10 then 200 else 500 end)
      from generate_series(4, p_ll + 1) s
    ), 0)
  end;
$function$;

with thresholds as (
  select array[0,3,6,9,12,16,20,24,29,34,39,44] as g
),
calc as (
  select
    p.id,
    coalesce((p.state->>'games')::int, 0) as games,
    coalesce((p.state->'mana'->>'balance')::numeric, 0) as old_mana,
    coalesce((p.state->>'pr')::int, 0) as pr_from_dc,
    coalesce((p.state->>'ll')::int, 2) as ll
  from public.pilots p
),
conv as (
  select
    c.id,
    -- Частка пройденого шляху між порогом поточного рівня й порогом наступного.
    case
      when public.mana_level_cost(c.ll) is null then 0
      else round(
        public.mana_level_cost(c.ll) *
        least(1, greatest(0,
          (c.games - (select g[c.ll - 1] from thresholds))::numeric
          / nullif((select g[c.ll] from thresholds) - (select g[c.ll - 1] from thresholds), 0)
        ))
      )
    end as new_mana,
    least(100, floor(c.old_mana / 10)::int + c.pr_from_dc) as new_pr
  from calc c
)
update public.pilots p
set state = jsonb_set(
      jsonb_set(p.state, '{pr}', to_jsonb(v.new_pr)),
      '{mana,balance}', to_jsonb(v.new_mana)
    )
from conv v
where p.id = v.id;
