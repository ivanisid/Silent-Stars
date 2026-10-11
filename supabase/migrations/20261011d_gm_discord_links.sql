-- ГМ-панель: Discord-імена гравців, які прив'язали Discord до акаунта апки.
--
-- discord_links за RLS кожен бачить лише свій рядок; ГМу список віддає ця функція.
--
-- Відкат: drop function public.gm_discord_links();

create or replace function public.gm_discord_links()
returns table (user_id uuid, discord_user_id text, discord_username text, linked_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select l.user_id, l.discord_user_id, l.discord_username, l.linked_at
    from discord_links l
   where private.is_gm();
$function$;
revoke execute on function public.gm_discord_links() from public, anon;
grant execute on function public.gm_discord_links() to authenticated;
