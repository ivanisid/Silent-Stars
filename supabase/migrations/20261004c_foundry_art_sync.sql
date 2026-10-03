-- Синхронізація артів у Foundry тепер іде з Supabase (функція foundry-art-sync через
-- File Browser на сервері Foundry), а не окремим сервісом на самому сервері.
-- Запуск: одразу на новий арт чи видалення + pg_cron кожні 5 хв (дотягує невдалі спроби
-- і прибирає арти мехів, яких уже немає в пілота).

create or replace function private.foundry_art_sync_request()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform net.http_post(
    url := 'https://dmqkxxedabawnhznzlmx.supabase.co/functions/v1/foundry-art-sync',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'discord_sync_secret')),
    timeout_milliseconds := 60000);
end;
$function$;

create or replace function private.foundry_art_on_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform private.foundry_art_sync_request();
  return null;
end;
$function$;

-- Раз на інструкцію, а не на рядок: заміна портрета — це вставка + позначка старого,
-- і обидві обробить один виклик.
drop trigger if exists foundry_art_on_insert on public.art_uploads;
create trigger foundry_art_on_insert
  after insert on public.art_uploads
  for each statement execute function private.foundry_art_on_change();

drop trigger if exists foundry_art_on_delete_mark on public.art_uploads;
create trigger foundry_art_on_delete_mark
  after update of deleted_at on public.art_uploads
  for each statement execute function private.foundry_art_on_change();

select cron.unschedule('foundry-art-sync')
 where exists (select 1 from cron.job where jobname = 'foundry-art-sync');
select cron.schedule('foundry-art-sync', '*/5 * * * *', $cron$ select private.foundry_art_sync_request(); $cron$);
