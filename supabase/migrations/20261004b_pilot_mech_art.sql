-- Арти належать пілоту (портрет) або конкретному меху, як у COMP/CON, а не лежать
-- окремою галереєю. В апці їх видно в профілі пілота; синхронізатор кладе їх у Foundry
-- як pilots/<нік>/<позивний>/portrait.<ext> і .../mech-<назва меха>.<ext>.
--
-- Новий портрет чи арт меха замінює попередній: старий рядок позначається видаленим,
-- синхронізатор прибирає старий файл і кладе новий під тим самим ім'ям — посилання в
-- токенах Foundry не ламаються.

alter table public.art_uploads
  add column if not exists pilot_id uuid references public.pilots(id) on delete set null,
  add column if not exists kind text check (kind in ('portrait', 'mech')),
  add column if not exists mech_id text;

create index if not exists art_uploads_pilot on public.art_uploads (pilot_id) where deleted_at is null;

-- Вставка лише до власного пілота, з правильною парою kind / mech_id.
drop policy if exists "art: add own" on public.art_uploads;
create policy "art: add own" on public.art_uploads
  for insert with check (
    user_id = auth.uid()
    and storage_path like auth.uid()::text || '/%'
    and synced_at is null and foundry_path is null and deleted_at is null
    and exists (select 1 from pilots p where p.id = pilot_id and p.user_id = auth.uid())
    and ((kind = 'portrait' and mech_id is null) or (kind = 'mech' and mech_id is not null))
  );

-- ГМ бачить арти всіх пілотів — так само, як бачить самих пілотів.
drop policy if exists "art: read own" on public.art_uploads;
create policy "art: read own or gm" on public.art_uploads
  for select using (user_id = auth.uid() or private.is_gm());
create policy "pilot-art: gm read" on storage.objects
  for select to authenticated
  using (bucket_id = 'pilot-art' and private.is_gm());

-- Новий арт тієї ж ролі (портрет пілота / арт цього меха) замінює попередній.
create or replace function private.art_replace_previous()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update art_uploads set deleted_at = now()
   where pilot_id = new.pilot_id and kind = new.kind
     and mech_id is not distinct from new.mech_id
     and deleted_at is null and id <> new.id;
  return null;
end;
$function$;

drop trigger if exists art_replace_previous on public.art_uploads;
create trigger art_replace_previous
  after insert on public.art_uploads
  for each row when (new.pilot_id is not null)
  execute function private.art_replace_previous();

-- Пілота видалено — його арти зникають і з Foundry (FK лише обнуляє pilot_id).
create or replace function private.art_on_pilot_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update art_uploads set deleted_at = now() where pilot_id = old.id and deleted_at is null;
  return old;
end;
$function$;

drop trigger if exists art_on_pilot_delete on public.pilots;
create trigger art_on_pilot_delete
  before delete on public.pilots
  for each row execute function private.art_on_pilot_delete();
