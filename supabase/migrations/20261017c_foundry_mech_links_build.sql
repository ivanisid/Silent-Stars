-- Версія білду актора Foundry в зв'язках мехів (docs/compcon-link-spec.md §6.3).
--
-- Модуль Foundry (0.15.0+) у дії links звітує прапорець build актора-меха — час файлу
-- COMP/CON, з якого актора створено чи оновлено. Апка порівнює його з часом файлу меха
-- (pilot_compcon.updated_at): файл новіший → «Зміна потребує підтвердження на Foundry».
-- Функція foundry-sync працює й без цієї колонки (зв'язки пишуться без версії).
--
-- Відкат: alter table public.foundry_mech_links drop column build;

alter table public.foundry_mech_links add column if not exists build bigint;
