-- Сторінка правил (/rules): розділи правил кампанії живуть у базі, щоб ГМ редагував їх
-- в апці. Розділ — назва й упорядкований список блоків (jsonb):
--   { "type": "paragraph", "text": "…" }
--   { "type": "table",     "rows":  [ { "name": "…", "value": "…" } ] }
--   { "type": "cards",     "items": [ { "title": "…", "text": "…" } ] }
--   { "type": "quote",     "text": "…" }
-- У тексті розмітка — лише **виділення** і [текст](https://…); HTML не рендериться.
--
-- Читати можуть усі залогінені, писати — лише через gm_* функції (перевірка private.is_gm()).
-- Наповнення з docs/rules-source.md — окрема міграція 20261016c_rules_seed.sql.
--
-- Rollback:
--   drop function public.gm_save_rule_section(uuid, text, jsonb);
--   drop function public.gm_delete_rule_section(uuid);
--   drop function public.gm_reorder_rule_sections(uuid[]);
--   drop table public.rule_sections;

create table if not exists public.rule_sections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  sort integer not null,
  blocks jsonb not null default '[]',
  updated_at timestamptz default now(),
  updated_by uuid references auth.users
);

alter table public.rule_sections enable row level security;

drop policy if exists "rule sections: read" on public.rule_sections;
create policy "rule sections: read" on public.rule_sections for select to authenticated using (true);

-- Створити (p_id null — у кінець списку) або оновити розділ.
create or replace function public.gm_save_rule_section(p_id uuid, p_title text, p_blocks jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_block jsonb;
begin
  if not private.is_gm() then raise exception 'Редагувати правила може лише ГМ.'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'Вкажіть назву розділу.'; end if;
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'Блоки розділу мають бути списком.';
  end if;
  for v_block in select * from jsonb_array_elements(p_blocks) loop
    if jsonb_typeof(v_block) <> 'object'
      or coalesce(v_block ->> 'type', '') not in ('paragraph', 'table', 'cards', 'quote') then
      raise exception 'Невідомий тип блоку: %', coalesce(v_block ->> 'type', '—');
    end if;
  end loop;

  if p_id is null then
    insert into rule_sections (title, sort, blocks, updated_by)
    values (btrim(p_title), (select coalesce(max(sort), 0) + 1 from rule_sections), p_blocks, auth.uid())
    returning id into v_id;
  else
    update rule_sections set
      title = btrim(p_title),
      blocks = p_blocks,
      updated_at = now(),
      updated_by = auth.uid()
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Розділ не знайдено.'; end if;
  end if;
  return v_id;
end;
$function$;

create or replace function public.gm_delete_rule_section(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not private.is_gm() then raise exception 'Редагувати правила може лише ГМ.'; end if;
  delete from rule_sections where id = p_id;
  if not found then raise exception 'Розділ не знайдено.'; end if;
end;
$function$;

-- sort = позиція в масиві (1, 2, …); розділи, яких немає в масиві, не змінюються.
create or replace function public.gm_reorder_rule_sections(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not private.is_gm() then raise exception 'Редагувати правила може лише ГМ.'; end if;
  update rule_sections s set sort = t.ord, updated_at = now(), updated_by = auth.uid()
  from unnest(coalesce(p_ids, '{}')) with ordinality as t(id, ord)
  where s.id = t.id;
end;
$function$;

revoke execute on function public.gm_save_rule_section(uuid, text, jsonb) from public, anon;
revoke execute on function public.gm_delete_rule_section(uuid) from public, anon;
revoke execute on function public.gm_reorder_rule_sections(uuid[]) from public, anon;
grant execute on function public.gm_save_rule_section(uuid, text, jsonb) to authenticated;
grant execute on function public.gm_delete_rule_section(uuid) to authenticated;
grant execute on function public.gm_reorder_rule_sections(uuid[]) to authenticated;
