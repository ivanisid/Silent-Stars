-- Документи ГМів (вкладка ДОКУМЕНТИ в ГМ-панелі) замість окремої Хроніки. Специфікація —
-- docs/gm-documents-spec.md.
--
-- Документ = назва + текст (візуальний редактор: chronicle_entries.doc, простий текст — body).
-- Доступ — два варіанти: 'private' («Лише для мене») і 'gms' («Для всіх ГМів»). Варіанта
-- «усі» (гравці) більше немає: такі записи стають «Для всіх ГМів».
-- Змінює спільний документ будь-який ГМ, приватний — лише автор; доступ змінює і видаляє
-- лише автор (тригер chronicle_entries_guard з 20261106b_chronicle_gm_edit.sql лишається).
--
-- Типи (kind), теги, гра, дата й портрет більше не використовуються апкою. Колонки й таблиці
-- тегів (chronicle_tags, chronicle_entry_tags) лишаються в базі з даними — їх не видаляємо.
--
-- Rollback:
--   drop function public.gm_save_document(uuid, text, text, jsonb, text);
--   alter table public.chronicle_entries drop constraint chronicle_entries_visibility_check,
--     add constraint chronicle_entries_visibility_check check (visibility in ('private', 'gms', 'players'));
--   (повернути політику читання й gm_save_chronicle_entry з 20261106c_chronicle_rich.sql)

update public.chronicle_entries set visibility = 'gms' where visibility = 'players';

alter table public.chronicle_entries drop constraint if exists chronicle_entries_visibility_check;
alter table public.chronicle_entries
  add constraint chronicle_entries_visibility_check check (visibility in ('private', 'gms'));

drop policy if exists "chronicle entries: read" on public.chronicle_entries;
create policy "chronicle entries: read" on public.chronicle_entries
  for select to authenticated using (
    private.is_gm() and (author_id = auth.uid() or visibility = 'gms')
  );

drop function if exists public.gm_save_chronicle_entry(uuid, text, text, text, jsonb, text, text, uuid, date, uuid[]);

-- Створити (p_id null) або змінити документ. security invoker: права перевіряє RLS.
create or replace function public.gm_save_document(
  p_id uuid,
  p_title text,
  p_body text,
  p_doc jsonb,
  p_visibility text
)
returns uuid
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  if not private.is_gm() then raise exception 'Документи ведуть лише ГМи.'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'Вкажіть назву.'; end if;
  if p_visibility not in ('private', 'gms') then raise exception 'Невідомий доступ.'; end if;
  if p_doc is not null and (jsonb_typeof(p_doc) <> 'object' or p_doc ->> 'type' <> 'doc') then
    raise exception 'Невідомий формат тексту.';
  end if;

  if p_id is null then
    insert into chronicle_entries (kind, title, body, doc, visibility, author_id, updated_by)
    values ('record', btrim(p_title), coalesce(p_body, ''), p_doc, p_visibility, auth.uid(), auth.uid())
    returning id into v_id;
  else
    update chronicle_entries set
      title = btrim(p_title),
      body = coalesce(p_body, ''),
      doc = p_doc,
      visibility = case when author_id = auth.uid() then p_visibility else visibility end
    where id = p_id and (author_id = auth.uid() or visibility <> 'private')
    returning id into v_id;
    if v_id is null then raise exception 'Документ не знайдено або його не можна змінити.'; end if;
  end if;

  return v_id;
end;
$function$;

revoke execute on function public.gm_save_document(uuid, text, text, jsonb, text) from public, anon;
grant execute on function public.gm_save_document(uuid, text, text, jsonb, text) to authenticated;
