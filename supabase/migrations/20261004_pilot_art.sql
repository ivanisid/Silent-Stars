-- Арти гравців для Foundry VTT.
--
-- Гравець вантажить зображення в апці → приватний бакет pilot-art, у свою папку
-- (<user_id>/...) → рядок у art_uploads. Синхронізатор на сервері Foundry
-- (foundry-sync/) забирає нові рядки, кладе файл у Data/pilots/<нік>/ і проставляє
-- synced_at + foundry_path. Видалення в апці — м'яке (deleted_at): синхронізатор
-- прибирає файл із Foundry і тоді видаляє рядок.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pilot-art', 'pilot-art', false, 10 * 1024 * 1024,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Кожен гравець бачить і змінює лише свою папку в бакеті.
create policy "pilot-art: own folder read" on storage.objects
  for select to authenticated
  using (bucket_id = 'pilot-art' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "pilot-art: own folder upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pilot-art' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "pilot-art: own folder delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'pilot-art' and (storage.foldername(name))[1] = auth.uid()::text);

create table if not exists public.art_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  size_bytes integer,
  created_at timestamptz not null default now(),
  -- Заповнює синхронізатор: коли файл ліг у Foundry і куди (шлях відносно Data/).
  synced_at timestamptz,
  foundry_path text,
  -- М'яке видалення: синхронізатор прибирає файл із Foundry і видаляє рядок.
  deleted_at timestamptz
);
create index if not exists art_uploads_pending on public.art_uploads (created_at)
  where synced_at is null or deleted_at is not null;
alter table public.art_uploads enable row level security;

create policy "art: read own" on public.art_uploads
  for select using (user_id = auth.uid());
create policy "art: add own" on public.art_uploads
  for insert with check (
    user_id = auth.uid()
    and storage_path like auth.uid()::text || '/%'
    and synced_at is null and foundry_path is null and deleted_at is null
  );

-- Видалення з апки: позначка для синхронізатора. Рядок оновлює лише ця функція —
-- прямого UPDATE гравцям не даємо, щоб не можна було підробити foundry_path.
create or replace function public.art_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update art_uploads set deleted_at = now()
   where id = p_id and user_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'Арт не знайдено.'; end if;
end;
$function$;
revoke execute on function public.art_delete(uuid) from public, anon;
grant execute on function public.art_delete(uuid) to authenticated;

-- Синхронізація в апці без перезавантаження: «очікує» → «у Foundry».
alter publication supabase_realtime add table public.art_uploads;
