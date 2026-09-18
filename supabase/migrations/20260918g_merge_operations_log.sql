-- Журнал операцій: дві функції зливаються в одну.
--
-- Було дві майже однакові функції над тим самим pilot_audit_log:
--   pilot_change_log        — для власника пілота, лише дії 'update', без автора змін
--   gm_pilot_resource_log   — для ГМ, надмножина: автор, тип дії, довжина журналу
-- і два компоненти з дубльованою розміткою. Тепер одна функція, один компонент:
-- гравець бачить свої операції, ГМ — операції в чужих чарниках, вигляд однаковий.
--
-- Заразом виправлено поле ресурсу: обидві функції читали state->>'dcStore', якого після
-- переходу на PR (20260918_pr_economy.sql) уже немає, тож колонка завжди була порожня.
-- Тепер читається state->>'pr' і колонка називається pr_old/pr_new.
--
-- Наслідок, який варто мати на увазі: аудит більше не прихований від гравця. Очистити
-- його гравець як не міг, так і не може — журнал лежить на сервері, — але тепер бачить.
--
-- Rollback: відновити pilot_change_log і gm_pilot_resource_log з попередніх означень
-- і прибрати pilot_operations_log.

create or replace function public.pilot_operations_log(p_pilot_id uuid)
returns table (
  id uuid,
  changed_at timestamptz,
  changed_by_nick text,
  action text,
  mana_old numeric,
  mana_new numeric,
  pr_old numeric,
  pr_new numeric,
  log_old_count integer,
  log_new_count integer,
  log_added jsonb,
  revertible boolean
)
language sql
stable security definer
set search_path to 'public'
as $function$
  with rows as (
    select
      a.id,
      a.changed_at,
      pr.nick as changed_by_nick,
      a.action,
      (a.old_data->'state'->'mana'->>'balance')::numeric as mana_old,
      (a.new_data->'state'->'mana'->>'balance')::numeric as mana_new,
      (a.old_data->'state'->>'pr')::numeric as pr_old,
      (a.new_data->'state'->>'pr')::numeric as pr_new,
      coalesce(jsonb_array_length(a.old_data->'state'->'actionLog'), 0) as log_old_count,
      coalesce(jsonb_array_length(a.new_data->'state'->'actionLog'), 0) as log_new_count,
      (
        select coalesce(jsonb_agg(t.e order by t.ord), '[]'::jsonb)
        from jsonb_array_elements(coalesce(a.new_data->'state'->'actionLog', '[]'::jsonb))
          with ordinality t(e, ord)
        where not exists (
          select 1
          from jsonb_array_elements(coalesce(a.old_data->'state'->'actionLog', '[]'::jsonb)) o(e)
          where o.e = t.e
        )
      ) as log_added,
      (a.action = 'update' and a.old_data->'state' is not null) as revertible
    from pilot_audit_log a
    left join profiles pr on pr.id = a.changed_by
    join pilots p on p.id = a.pilot_id
    where a.pilot_id = p_pilot_id
      -- Доступ як у старої функції власника: свій чарник або будь-який для ГМ.
      and (p.user_id = auth.uid() or private.is_gm())
  )
  select * from rows
  -- Показуємо лише те, що змінило ресурси, створення/видалення пілота, та очищення
  -- журналу — рядки, де не змінилось нічого цікавого, відсіюються.
  where action <> 'update'
     or mana_old is distinct from mana_new
     or pr_old is distinct from pr_new
     or log_new_count < log_old_count
  order by changed_at desc
  limit 500;
$function$;

drop function if exists public.pilot_change_log(uuid);
drop function if exists public.gm_pilot_resource_log(uuid);
