-- Вхід через Discord (OAuth) як опція поруч із ніком і паролем.
--
-- * Новий акаунт через Discord: ніка в метаданих немає, тож профіль бере ім'я з Discord.
-- * Discord-ідентичність у Supabase Auth (вхід або «Прив'язати Discord-вхід» на наявному
--   акаунті) автоматично стає прив'язкою discord_links — /link з кодом тоді не потрібен,
--   а тригери на discord_links одразу видають ролі LANCER / LLn.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, nick) values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'nick'), ''),
      -- Discord: відображуване ім'я, далі ім'я користувача.
      nullif(btrim(new.raw_user_meta_data->'custom_claims'->>'global_name'), ''),
      nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data->>'name'), ''),
      'Пілот'
    )
  );
  return new;
end;
$function$;

create or replace function private.discord_identity_sync()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    if old.provider = 'discord' then
      delete from public.discord_links where user_id = old.user_id and discord_user_id = old.provider_id;
    end if;
    return null;
  end if;

  if new.provider <> 'discord' then return null; end if;

  -- Один Discord — один акаунт: прив'язка до цього акаунта знімає стару (як і /link).
  delete from public.discord_links where discord_user_id = new.provider_id and user_id <> new.user_id;
  insert into public.discord_links (user_id, discord_user_id, discord_username)
    values (
      new.user_id,
      new.provider_id,
      coalesce(new.identity_data->'custom_claims'->>'global_name', new.identity_data->>'full_name', new.identity_data->>'name'))
    on conflict (user_id) do update
      set discord_user_id = excluded.discord_user_id,
          discord_username = excluded.discord_username,
          linked_at = now();
  return null;
end;
$function$;

drop trigger if exists discord_identity_sync on auth.identities;
create trigger discord_identity_sync
  after insert or delete on auth.identities
  for each row execute function private.discord_identity_sync();
