-- Профіль пілота в апці підхоплює звіт зв'язків з Foundry наживо: після оновлення білду актора
-- статус «Зміна потребує підтвердження на Foundry» зникає без перезавантаження сторінки.
-- Звіт замінює рядки світу (delete + insert), тож клієнт слухає insert. RLS діє і тут.
alter publication supabase_realtime add table public.foundry_mech_links;
