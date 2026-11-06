-- Хроніка: записи з доступом «ГМИ» і «УСІ» редагує будь-який ГМ, не лише автор.
-- Приватний запис («ЛИШЕ Я») і далі змінює лише автор. Доступ запису змінює і видаляє запис
-- лише автор. Хто змінював останнім — updated_by.
--
-- Rollback:
--   drop trigger chronicle_entries_guard on public.chronicle_entries;
--   drop function private.chronicle_entry_guard();
--   alter table public.chronicle_entries drop column updated_by;
--   (і повернути політики та gm_save_chronicle_entry з 20261106_chronicle.sql)

alter table public.chronicle_entries
  add column if not exists updated_by uuid references auth.users on delete set null default auth.uid();

-- Автора не змінює ніхто; доступ змінює лише автор; updated_by / updated_at ставляться самі.
create or replace function private.chronicle_entry_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.author_id is distinct from old.author_id then
    raise exception 'Автора запису змінити не можна.';
  end if;
  if auth.uid() is not null and old.author_id <> auth.uid() and new.visibility is distinct from old.visibility then
    raise exception 'Доступ до запису змінює лише автор.';
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists chronicle_entries_guard on public.chronicle_entries;
create trigger chronicle_entries_guard
  before update on public.chronicle_entries
  for each row execute function private.chronicle_entry_guard();

drop policy if exists "chronicle entries: author edits" on public.chronicle_entries;
drop policy if exists "chronicle entries: gm edits shared" on public.chronicle_entries;
create policy "chronicle entries: gm edits shared" on public.chronicle_entries
  for update to authenticated
  using (private.is_gm() and (author_id = auth.uid() or visibility <> 'private'))
  with check (private.is_gm() and (author_id = auth.uid() or visibility <> 'private'));

drop policy if exists "chronicle entry tags: author adds" on public.chronicle_entry_tags;
drop policy if exists "chronicle entry tags: editor adds" on public.chronicle_entry_tags;
create policy "chronicle entry tags: editor adds" on public.chronicle_entry_tags
  for insert to authenticated with check (
    private.is_gm() and exists (
      select 1 from public.chronicle_entries e
      where e.id = entry_id and (e.author_id = auth.uid() or e.visibility <> 'private')
    )
  );
drop policy if exists "chronicle entry tags: author removes" on public.chronicle_entry_tags;
drop policy if exists "chronicle entry tags: editor removes" on public.chronicle_entry_tags;
create policy "chronicle entry tags: editor removes" on public.chronicle_entry_tags
  for delete to authenticated using (
    private.is_gm() and exists (
      select 1 from public.chronicle_entries e
      where e.id = entry_id and (e.author_id = auth.uid() or e.visibility <> 'private')
    )
  );

-- Не-автор зберігає зміст і теги; доступ лишається тим, що поставив автор.
create or replace function public.gm_save_chronicle_entry(
  p_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_visibility text,
  p_slot_id uuid,
  p_event_date date,
  p_tag_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  if not private.is_gm() then raise exception 'Вести хроніку може лише ГМ.'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'Вкажіть назву.'; end if;
  if p_kind not in ('record', 'report', 'event') then raise exception 'Невідомий тип запису.'; end if;
  if p_visibility not in ('private', 'gms', 'players') then raise exception 'Невідомий доступ.'; end if;

  if p_id is null then
    insert into chronicle_entries (kind, title, body, visibility, author_id, updated_by, slot_id, event_date)
    values (
      p_kind, btrim(p_title), coalesce(p_body, ''), p_visibility, auth.uid(), auth.uid(),
      case when p_kind = 'report' then p_slot_id end,
      case when p_kind = 'event' then p_event_date end
    )
    returning id into v_id;
  else
    update chronicle_entries set
      kind = p_kind,
      title = btrim(p_title),
      body = coalesce(p_body, ''),
      visibility = case when author_id = auth.uid() then p_visibility else visibility end,
      slot_id = case when p_kind = 'report' then p_slot_id end,
      event_date = case when p_kind = 'event' then p_event_date end
    where id = p_id and (author_id = auth.uid() or visibility <> 'private')
    returning id into v_id;
    if v_id is null then raise exception 'Запис не знайдено або його не можна змінити.'; end if;
    delete from chronicle_entry_tags where entry_id = v_id;
  end if;

  insert into chronicle_entry_tags (entry_id, tag_id)
  select v_id, t from unnest(coalesce(p_tag_ids, '{}')) as t
  on conflict do nothing;

  return v_id;
end;
$function$;

revoke execute on function public.gm_save_chronicle_entry(uuid, text, text, text, text, uuid, date, uuid[]) from public, anon;
grant execute on function public.gm_save_chronicle_entry(uuid, text, text, text, text, uuid, date, uuid[]) to authenticated;
