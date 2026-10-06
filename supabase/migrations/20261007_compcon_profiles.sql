-- Файли COMP/CON, з яких модуль Foundry створює акторів (пілот + мех).
--
-- Апка з файлу бере лише мехів, а повний актор Lancer потребує всього файлу: таланти,
-- скіли, ліцензії, лоадаут. Тож файл зберігається як є — по одному на меха апки, і в
-- ньому лишається тільки цей мех. Гравець з двома профілями (різні таланти/ліцензії під
-- кожного меха) завантажує два файли; у Foundry з них вийде два актори-пілоти, кожен зі
-- своїм мехом, а ХП і стрес пілота в апці лишаються одні.
--
-- Читає функція foundry-sync (service_role), коли ГМ натискає «Створити з апки».

create table if not exists public.pilot_compcon (
  pilot_id uuid not null references public.pilots(id) on delete cascade,
  mech_id text not null,
  data jsonb not null,
  uploaded_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (pilot_id, mech_id)
);
alter table public.pilot_compcon enable row level security;

-- Як і з артами: файли свого пілота — власник, усіх пілотів — ГМ.
create policy "compcon: read own or gm" on public.pilot_compcon
  for select using (exists (select 1 from pilots p where p.id = pilot_id and (p.user_id = auth.uid() or private.is_gm())));
create policy "compcon: add own or gm" on public.pilot_compcon
  for insert with check (exists (select 1 from pilots p where p.id = pilot_id and (p.user_id = auth.uid() or private.is_gm())));
create policy "compcon: replace own or gm" on public.pilot_compcon
  for update using (exists (select 1 from pilots p where p.id = pilot_id and (p.user_id = auth.uid() or private.is_gm())));
create policy "compcon: delete own or gm" on public.pilot_compcon
  for delete using (exists (select 1 from pilots p where p.id = pilot_id and (p.user_id = auth.uid() or private.is_gm())));
