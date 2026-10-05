-- ГМ може видалити профіль (акаунт) іншого учасника.
--
-- Видаляється рядок auth.users; каскадом зникають profiles, pilots (а з ними записи на
-- ігри), discord_links (тригер знімає ролі в Discord), коди прив'язки, кидки й рядки
-- art_uploads. pilot_audit_log зовнішнього ключа не має — історія операцій лишається.
-- Файли артів у сховищі й Foundry ця функція не чистить.
--
-- Правила:
--   * викликати може тільки ГМ;
--   * себе видалити не можна;
--   * ГМа видалити не можна — спершу понизити до гравця (gm_set_role);
--   * учасника, що веде слоти ігор, видалити не можна: game_slots.created_by не має
--     каскаду, а слоти — це історія ігор інших гравців. Спершу видалити слоти.
--
-- Rollback: drop function public.gm_delete_user(uuid);

create or replace function public.gm_delete_user(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_nick text;
  v_role text;
  v_slots integer;
begin
  if not private.is_gm() then
    raise exception 'Видаляти профілі може лише ГМ.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Свій профіль видалити не можна.' using errcode = '42501';
  end if;

  select nick, role into v_nick, v_role from profiles where id = p_user_id;
  if v_nick is null then
    raise exception 'Учасника не знайдено.' using errcode = 'P0002';
  end if;
  if v_role = 'gm' then
    raise exception 'Спершу понизьте «%» до гравця.', v_nick using errcode = '42501';
  end if;

  select count(*) into v_slots from game_slots where created_by = p_user_id;
  if v_slots > 0 then
    raise exception '«%» веде слотів ігор: % — спершу видаліть їх.', v_nick, v_slots using errcode = '23503';
  end if;

  -- Записи на ігри зникли б і каскадом через пілотів; явно — на випадок запису,
  -- що не прив'язаний до пілота цього ж гравця.
  delete from game_signups where user_id = p_user_id;
  delete from auth.users where id = p_user_id;
  return v_nick;
end;
$function$;

revoke all on function public.gm_delete_user(uuid) from public, anon;
grant execute on function public.gm_delete_user(uuid) to authenticated;
