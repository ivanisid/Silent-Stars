-- Швидко тегнути склад гри: гілка під оголошенням, пост на дошці завдань (форум) і
-- готовий рядок тегів для копіювання — у Discord і в апці.

-- Яку гілку / пост уже створено для гри — щоб повторне натискання вело туди, а не
-- плодило копії.
alter table public.discord_slot_messages add column if not exists thread_id text;
alter table public.discord_slot_messages add column if not exists forum_thread_id text;

-- Discord-теги складу для кнопки «Копіювати теги» в апці. discord_links гравці між
-- собою не бачать (RLS), тож віддаємо їх лише ГМу, який веде цю гру. До затвердження
-- складу — усі записані, після — лише ті, хто летить.
create or replace function public.slot_discord_mentions(p_slot_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  slot game_slots;
begin
  select * into slot from game_slots where id = p_slot_id;
  if not found then raise exception 'Гру не знайдено.'; end if;
  if slot.created_by <> auth.uid() then raise exception 'Теги складу бачить лише ГМ цієї гри.'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'nick', pr.nick, 'callsign', p.callsign, 'discordId', l.discord_user_id
    ) order by g.created_at)
    from game_signups g
    left join profiles pr on pr.id = g.user_id
    left join pilots p on p.id = g.pilot_id
    left join discord_links l on l.user_id = g.user_id
    where g.slot_id = p_slot_id
      and (slot.status = 'open' or g.approved)
  ), '[]'::jsonb);
end;
$function$;
revoke execute on function public.slot_discord_mentions(uuid) from public, anon;
grant execute on function public.slot_discord_mentions(uuid) to authenticated;
