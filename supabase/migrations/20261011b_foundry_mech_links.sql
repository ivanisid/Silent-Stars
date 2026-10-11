-- Які мехи апки зв'язані з акторами Foundry — звітує модуль silent-stars-sync (дія `links`
-- функції foundry-sync) після кожного повного циклу, коли список змінився, і щонайменше раз
-- на 30 хв.
--
-- Апка за цим знає, що стан меха (шкода, заряди, Overcharge) приходить із Foundry, і блокує
-- ручне списання на картці меха — лишаються ремонт і покупки. Зв'язок вважається робочим,
-- поки seen_at свіжий (14 днів, див. MechsPanel).
--
-- Рядки ключуються світом Foundry: ключ синхронізації один на всі столи, і кожен світ
-- замінює лише свій список (інакше два світи стирали б зв'язки одне одного).
--
-- Відкат: drop table public.foundry_mech_links;

create table if not exists public.foundry_mech_links (
  world text not null,
  pilot_id uuid not null references public.pilots(id) on delete cascade,
  mech_id text not null,
  actor_name text,
  seen_at timestamptz not null default now(),
  primary key (world, pilot_id, mech_id)
);
alter table public.foundry_mech_links enable row level security;

-- Пише лише функція foundry-sync (service_role). Читає власник пілота й ГМ.
create policy "foundry links: read own or gm" on public.foundry_mech_links
  for select using (exists (select 1 from pilots p where p.id = pilot_id and (p.user_id = auth.uid() or private.is_gm())));
