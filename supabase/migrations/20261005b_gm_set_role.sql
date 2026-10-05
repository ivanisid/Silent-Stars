-- ГМ може робити ГМом іншого учасника або знімати з нього роль ГМа.
--
-- Таблиця profiles не має політики на UPDATE, тож напряму роль не змінити — лише через
-- цю функцію. Правила:
--   * викликати може тільки ГМ (private.is_gm());
--   * роль — 'gm' або 'player';
--   * свою роль змінити не можна: так ГМ не зніме роль сам із себе випадково, а в
--     кампанії завжди лишається щонайменше один ГМ (той, хто викликає).
-- Ролі в Discord від ролі ГМа не залежать (див. 20261003_discord_roles.sql), тож
-- синхронізація не потрібна.
--
-- Rollback: drop function public.gm_set_role(uuid, text);

create or replace function public.gm_set_role(p_user_id uuid, p_role text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text;
begin
  if not private.is_gm() then
    raise exception 'Змінювати ролі може лише ГМ.' using errcode = '42501';
  end if;
  if p_role not in ('gm', 'player') then
    raise exception 'Невідома роль: %', p_role using errcode = '22023';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Свою роль змінити не можна.' using errcode = '42501';
  end if;

  update profiles set role = p_role where id = p_user_id returning role into v_role;
  if v_role is null then
    raise exception 'Учасника не знайдено.' using errcode = 'P0002';
  end if;
  return v_role;
end;
$function$;

revoke all on function public.gm_set_role(uuid, text) from public, anon;
grant execute on function public.gm_set_role(uuid, text) to authenticated;
