-- Двостороння синхронізація пілотів/мехів з акторами Lancer у Foundry.
--
-- Модуль silent-stars-sync у Foundry ходить у функцію foundry-sync з ключем у заголовку
-- x-foundry-key. Ключ генерується тут і лежить у vault; ГМ бере його звідти й вписує в
-- налаштування модуля:
--   select decrypted_secret from vault.decrypted_secrets where name = 'foundry_sync_key';

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'foundry_sync_key') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'foundry_sync_key',
      'Ключ модуля Foundry silent-stars-sync для функції foundry-sync');
  end if;
end;
$$;

-- Лише для функції (service_role): гравці й анонім цей ключ не бачать.
create or replace function public.foundry_sync_key()
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select decrypted_secret from vault.decrypted_secrets where name = 'foundry_sync_key';
$function$;
revoke execute on function public.foundry_sync_key() from public, anon, authenticated;
grant execute on function public.foundry_sync_key() to service_role;

-- Зміни з Foundry мають з'являтися у відкритому профілі пілота без перезавантаження.
-- RLS діє і на realtime: гравець отримує події лише своїх пілотів, ГМ — усіх.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pilots') then
    alter publication supabase_realtime add table public.pilots;
  end if;
end;
$$;
