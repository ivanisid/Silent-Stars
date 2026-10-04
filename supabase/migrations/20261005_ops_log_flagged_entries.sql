-- Журнал операцій показує й операції без зміни мани/PR.
--
-- Інтерфейс 2a вимагає, щоб кожне списання ремкомплектів і кожне видалення (зброя,
-- системи, мех, нотатка) потрапляло в журнал операцій з відкатом. Ремонт лише за
-- ремкомплекти мани й PR не змінює, тож фільтр функції його відсіював. Клієнт тепер
-- позначає такі записи actionLog полем "op": true — їх і пропускаємо.
--
-- Rollback: перевиконати означення з 20260918g_merge_operations_log.sql.

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
     -- Записи журналу з позначкою op: списання ремкомплектів, видалення зброї, систем,
     -- мехів і нотаток — те, що не змінює ману чи PR, але має бути видно й відкочуватись.
     or jsonb_path_exists(log_added, '$[*] ? (@.op == true)')
  order by changed_at desc
  limit 500;
$function$;
