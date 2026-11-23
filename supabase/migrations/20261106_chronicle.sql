-- Хроніка (/chronicle): записи ГМів — довідкові записи (NPC, фракції, локації…), звіти ігор
-- і події світу. Специфікація — docs/chronicle-spec.md.
--
-- chronicle_entries.kind:
--   'record' — запис (тип задають теги: NPC, ФРАКЦІЯ, ЛОКАЦІЯ, власні);
--   'report' — звіт гри, slot_id → game_slots;
--   'event'  — подія світу, event_date.
-- chronicle_entries.visibility:
--   'private' — лише автор; 'gms' — усі ГМи; 'players' — усі залогінені (ГМи й гравці).
-- Змінює й видаляє запис лише автор (ГМ). Текст — звичайний текст з розміткою
-- **виділення**, [текст](https://…) і згадками @[Назва](<uuid запису>).
--
-- Теги — спільний пул: читають усі залогінені, додає будь-який ГМ, видаляє той, хто додав.
--
-- Rollback:
--   drop function public.gm_save_chronicle_entry(uuid, text, text, text, text, uuid, date, uuid[]);
--   drop table public.chronicle_entry_tags;
--   drop table public.chronicle_entries;
--   drop table public.chronicle_tags;

create table if not exists public.chronicle_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> '' and char_length(name) <= 32),
  created_by uuid references auth.users on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists chronicle_tags_name_key on public.chronicle_tags (lower(btrim(name)));

create table if not exists public.chronicle_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('record', 'report', 'event')),
  title text not null check (btrim(title) <> '' and char_length(title) <= 120),
  body text not null default '',
  visibility text not null default 'private' check (visibility in ('private', 'gms', 'players')),
  author_id uuid not null default auth.uid() references auth.users on delete cascade,
  slot_id uuid references public.game_slots on delete set null,
  event_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'report' or slot_id is null),
  check (kind = 'event' or event_date is null)
);
create index if not exists chronicle_entries_author_idx on public.chronicle_entries (author_id);
create index if not exists chronicle_entries_slot_idx on public.chronicle_entries (slot_id);

create table if not exists public.chronicle_entry_tags (
  entry_id uuid not null references public.chronicle_entries on delete cascade,
  tag_id uuid not null references public.chronicle_tags on delete cascade,
  primary key (entry_id, tag_id)
);
create index if not exists chronicle_entry_tags_tag_idx on public.chronicle_entry_tags (tag_id);

alter table public.chronicle_tags enable row level security;
alter table public.chronicle_entries enable row level security;
alter table public.chronicle_entry_tags enable row level security;

drop policy if exists "chronicle tags: read" on public.chronicle_tags;
create policy "chronicle tags: read" on public.chronicle_tags
  for select to authenticated using (true);
drop policy if exists "chronicle tags: gm adds" on public.chronicle_tags;
create policy "chronicle tags: gm adds" on public.chronicle_tags
  for insert to authenticated with check (private.is_gm() and created_by = auth.uid());
drop policy if exists "chronicle tags: creator deletes" on public.chronicle_tags;
create policy "chronicle tags: creator deletes" on public.chronicle_tags
  for delete to authenticated using (private.is_gm() and created_by = auth.uid());

drop policy if exists "chronicle entries: read" on public.chronicle_entries;
create policy "chronicle entries: read" on public.chronicle_entries
  for select to authenticated using (
    author_id = auth.uid()
    or (visibility = 'gms' and private.is_gm())
    or visibility = 'players'
  );
drop policy if exists "chronicle entries: gm adds own" on public.chronicle_entries;
create policy "chronicle entries: gm adds own" on public.chronicle_entries
  for insert to authenticated with check (private.is_gm() and author_id = auth.uid());
drop policy if exists "chronicle entries: author edits" on public.chronicle_entries;
create policy "chronicle entries: author edits" on public.chronicle_entries
  for update to authenticated
  using (private.is_gm() and author_id = auth.uid())
  with check (private.is_gm() and author_id = auth.uid());
drop policy if exists "chronicle entries: author deletes" on public.chronicle_entries;
create policy "chronicle entries: author deletes" on public.chronicle_entries
  for delete to authenticated using (private.is_gm() and author_id = auth.uid());

-- Теги запису видно тим, хто бачить запис (підзапит іде під RLS chronicle_entries).
drop policy if exists "chronicle entry tags: read" on public.chronicle_entry_tags;
create policy "chronicle entry tags: read" on public.chronicle_entry_tags
  for select to authenticated using (
    exists (select 1 from public.chronicle_entries e where e.id = entry_id)
  );
drop policy if exists "chronicle entry tags: author adds" on public.chronicle_entry_tags;
create policy "chronicle entry tags: author adds" on public.chronicle_entry_tags
  for insert to authenticated with check (
    private.is_gm() and exists (select 1 from public.chronicle_entries e where e.id = entry_id and e.author_id = auth.uid())
  );
drop policy if exists "chronicle entry tags: author removes" on public.chronicle_entry_tags;
create policy "chronicle entry tags: author removes" on public.chronicle_entry_tags
  for delete to authenticated using (
    private.is_gm() and exists (select 1 from public.chronicle_entries e where e.id = entry_id and e.author_id = auth.uid())
  );

-- Створити (p_id null) або оновити запис разом із повним набором тегів однією транзакцією.
-- security invoker: права перевіряє RLS вище.
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
    insert into chronicle_entries (kind, title, body, visibility, author_id, slot_id, event_date)
    values (
      p_kind, btrim(p_title), coalesce(p_body, ''), p_visibility, auth.uid(),
      case when p_kind = 'report' then p_slot_id end,
      case when p_kind = 'event' then p_event_date end
    )
    returning id into v_id;
  else
    update chronicle_entries set
      kind = p_kind,
      title = btrim(p_title),
      body = coalesce(p_body, ''),
      visibility = p_visibility,
      slot_id = case when p_kind = 'report' then p_slot_id end,
      event_date = case when p_kind = 'event' then p_event_date end,
      updated_at = now()
    where id = p_id and author_id = auth.uid()
    returning id into v_id;
    if v_id is null then raise exception 'Запис не знайдено або він не ваш.'; end if;
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

insert into public.chronicle_tags (name, created_by)
select v.name, null
from (values ('NPC'), ('ФРАКЦІЯ'), ('ЛОКАЦІЯ')) as v(name)
where not exists (select 1 from public.chronicle_tags t where lower(t.name) = lower(v.name));
