-- Хроніка: візуальний редактор, картинки в тексті й портрет запису.
--
-- chronicle_entries.doc — документ редактора (JSON TipTap); body лишається простим текстом
-- документа для пошуку (старі записи без doc апка перетворює з body при відкритті).
-- chronicle_entries.portrait_path — портрет запису в сховищі.
-- Сховище 'chronicle' (приватне, до 10 МБ, лише картинки): шлях <uid автора файлу>/<файл>;
-- читають ГМи (розділ поки лише для ГМів), завантажує ГМ у свою теку, видаляє власник теки.
--
-- Rollback:
--   drop function public.gm_save_chronicle_entry(uuid, text, text, text, jsonb, text, text, uuid, date, uuid[]);
--   (повернути gm_save_chronicle_entry з 20261106b_chronicle_gm_edit.sql)
--   drop policy "chronicle: gm read" on storage.objects;
--   drop policy "chronicle: gm uploads own folder" on storage.objects;
--   drop policy "chronicle: own folder delete" on storage.objects;
--   alter table public.chronicle_entries drop column doc, drop column portrait_path;
--   (бакет chronicle видаляється через Storage API разом з файлами)

alter table public.chronicle_entries
  add column if not exists doc jsonb,
  add column if not exists portrait_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chronicle', 'chronicle', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "chronicle: gm read" on storage.objects;
create policy "chronicle: gm read" on storage.objects
  for select to authenticated using (bucket_id = 'chronicle' and private.is_gm());
drop policy if exists "chronicle: gm uploads own folder" on storage.objects;
create policy "chronicle: gm uploads own folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'chronicle' and private.is_gm() and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "chronicle: own folder delete" on storage.objects;
create policy "chronicle: own folder delete" on storage.objects
  for delete to authenticated using (bucket_id = 'chronicle' and (storage.foldername(name))[1] = auth.uid()::text);

drop function if exists public.gm_save_chronicle_entry(uuid, text, text, text, text, uuid, date, uuid[]);

create or replace function public.gm_save_chronicle_entry(
  p_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_doc jsonb,
  p_portrait text,
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
  if p_doc is not null and (jsonb_typeof(p_doc) <> 'object' or p_doc ->> 'type' <> 'doc') then
    raise exception 'Невідомий формат тексту.';
  end if;

  if p_id is null then
    insert into chronicle_entries (kind, title, body, doc, portrait_path, visibility, author_id, updated_by, slot_id, event_date)
    values (
      p_kind, btrim(p_title), coalesce(p_body, ''), p_doc, nullif(p_portrait, ''), p_visibility, auth.uid(), auth.uid(),
      case when p_kind = 'report' then p_slot_id end,
      case when p_kind = 'event' then p_event_date end
    )
    returning id into v_id;
  else
    update chronicle_entries set
      kind = p_kind,
      title = btrim(p_title),
      body = coalesce(p_body, ''),
      doc = p_doc,
      portrait_path = nullif(p_portrait, ''),
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

revoke execute on function public.gm_save_chronicle_entry(uuid, text, text, text, jsonb, text, text, uuid, date, uuid[]) from public, anon;
grant execute on function public.gm_save_chronicle_entry(uuid, text, text, text, jsonb, text, text, uuid, date, uuid[]) to authenticated;
