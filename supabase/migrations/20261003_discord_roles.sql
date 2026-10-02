-- Ролі в Discord: LANCER — усім, хто прив'язав апку; LLn — за найвищим LL серед
-- активних (не архівних) пілотів гравця.
--
-- Ролі видає discord-sync (mode = 'roles'). Тригери нижче кличуть його, коли змінюється
-- щось, від чого залежать ролі: прив'язка Discord або LL / статус / власник пілота.
-- Передаємо Discord ID, а не user_id: функція щоразу сама дивиться, кому цей Discord
-- прив'язаний зараз, тож запити в будь-якому порядку сходяться до одного стану
-- (важливо, коли /link перепривʼязує Discord від одного акаунта до іншого).

create or replace function private.discord_roles_request(p_discord_ids text[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_discord_ids is null or cardinality(p_discord_ids) = 0 then return; end if;
  perform net.http_post(
    url := 'https://dmqkxxedabawnhznzlmx.supabase.co/functions/v1/discord-sync',
    body := jsonb_build_object('mode', 'roles', 'discord_ids', to_jsonb(p_discord_ids)),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'discord_sync_secret')));
end;
$function$;

-- Прив'язка / відв'язка / перепривʼязка Discord.
create or replace function private.discord_roles_on_link()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform private.discord_roles_request(array_remove(array[
    case when tg_op <> 'INSERT' then old.discord_user_id end,
    case when tg_op <> 'DELETE' then new.discord_user_id end
  ], null));
  return null;
end;
$function$;

drop trigger if exists discord_roles_on_link on public.discord_links;
create trigger discord_roles_on_link
  after insert or update or delete on public.discord_links
  for each row execute function private.discord_roles_on_link();

-- Пілот: стан змінюється на кожну дію в апці, тож Discord смикаємо лише тоді, коли
-- змінилось те, від чого залежить роль, — LL, статус (архів) або власник.
create or replace function private.discord_roles_on_pilot()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  users uuid[];
begin
  if tg_op = 'UPDATE'
     and old.user_id is not distinct from new.user_id
     and old.state->'ll' is not distinct from new.state->'ll'
     and old.state->'status' is not distinct from new.state->'status' then
    return null;
  end if;
  users := array_remove(array[
    case when tg_op <> 'INSERT' then old.user_id end,
    case when tg_op <> 'DELETE' then new.user_id end
  ], null);
  perform private.discord_roles_request(
    (select array_agg(distinct discord_user_id) from discord_links where user_id = any(users)));
  return null;
end;
$function$;

drop trigger if exists discord_roles_on_pilot on public.pilots;
create trigger discord_roles_on_pilot
  after insert or update or delete on public.pilots
  for each row execute function private.discord_roles_on_pilot();
