-- «Звільнити місце»: гравець зі складу, що не зможе прийти, віддає місце — і його одразу
-- отримує наступний за пріоритетом із тих, хто не потрапив. Працює між затвердженням
-- складу і завершенням гри; з апки (release_seat) і з Discord (discord_release_seat).

alter table public.game_signups add column if not exists released_at timestamptz;

-- Подія для discord-sync поза зміною статусу гри (тут — хто звільнив і хто зайшов).
create or replace function private.discord_post_event(p_body jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform net.http_post(
    url := 'https://dmqkxxedabawnhznzlmx.supabase.co/functions/v1/discord-sync',
    body := p_body,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'discord_sync_secret')));
end;
$function$;

create or replace function private.release_seat(p_user uuid, p_slot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  slot game_slots;
  mine game_signups;
  nxt game_signups;
begin
  select * into slot from game_slots where id = p_slot_id for update;
  if not found then raise exception 'Гру не знайдено.'; end if;
  if slot.status <> 'approved' then
    raise exception 'Звільнити місце можна лише після затвердження складу і до завершення гри.';
  end if;

  select * into mine from game_signups where slot_id = p_slot_id and user_id = p_user;
  if not found or mine.approved is not true then raise exception 'Ви не в складі цієї гри.'; end if;

  update game_signups set approved = false, released_at = now() where id = mine.id;

  -- Наступний у черзі: гарантоване місце, далі вищий пріоритет, далі хто раніше записався.
  -- Той, хто сам звільнив місце, назад у чергу не стає.
  select * into nxt from game_signups
   where slot_id = p_slot_id and approved is false and released_at is null
   order by guaranteed desc, coalesce(roll, 0) + coalesce(roll_bonus, 0) desc, created_at
   limit 1;

  if nxt.id is not null then
    update game_signups set approved = true where id = nxt.id;
    -- Потрапив у склад — витратив бонус, як і всі інші.
    update profiles set contest_bonus = 0 where id = nxt.user_id;
  end if;

  perform private.discord_post_event(jsonb_build_object(
    'slot_id', p_slot_id, 'event', 'released',
    'released_user', p_user, 'promoted_user', nxt.user_id));

  return jsonb_build_object('promoted', nxt.id is not null);
end;
$function$;

create or replace function public.release_seat(p_slot_id uuid)
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
  select private.release_seat(auth.uid(), p_slot_id);
$function$;
revoke execute on function public.release_seat(uuid) from public, anon;
grant execute on function public.release_seat(uuid) to authenticated;

create or replace function public.discord_release_seat(p_discord_id text, p_slot_id uuid)
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
  select private.release_seat(private.discord_user_id(p_discord_id), p_slot_id);
$function$;
revoke execute on function public.discord_release_seat(text, uuid) from public, anon, authenticated;
grant execute on function public.discord_release_seat(text, uuid) to service_role;

-- ----- Затвердження складу з Discord -----
-- Тіло gm_approve_roster винесене в private.approve_roster з явним користувачем, щоб апка
-- (auth.uid()) і Discord (за прив'язкою) затверджували склад однаково.

create or replace function private.approve_roster(p_user uuid, p_slot_id uuid, p_approved uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  slot public.game_slots;
  total integer;
  contested boolean;
begin
  select * into slot from game_slots where id = p_slot_id for update;
  if not found then raise exception 'Слот не знайдено.'; end if;

  if not exists (select 1 from profiles where id = p_user and role = 'gm') or slot.created_by <> p_user then
    raise exception 'Склад затверджує лише ГМ, який створив цю гру.';
  end if;
  if slot.status <> 'open' then raise exception 'Склад уже затверджено.'; end if;

  select count(*) into total from game_signups where slot_id = p_slot_id;
  contested := total > slot.seats;

  -- Гарантоване місце (+9) входить у склад завжди.
  update game_signups
     set approved = (id = any(coalesce(p_approved, '{}')) or guaranteed)
   where slot_id = p_slot_id;

  -- Хто пройшов у склад — використав бонус, був контест чи ні.
  update profiles set contest_bonus = 0
    where id in (select user_id from game_signups where slot_id = p_slot_id and approved);
  -- Хто програв контест — зберігає бонус і отримує +3.
  if contested then
    update profiles set contest_bonus = contest_bonus + 3
      where id in (select user_id from game_signups where slot_id = p_slot_id and not approved);
  end if;

  update game_slots set status = 'approved' where id = p_slot_id;
end;
$function$;

create or replace function public.gm_approve_roster(p_slot_id uuid, p_approved uuid[])
returns void
language sql
security definer
set search_path to 'public'
as $function$
  select private.approve_roster(auth.uid(), p_slot_id, p_approved);
$function$;

create or replace function public.discord_approve_roster(p_discord_id text, p_slot_id uuid, p_approved uuid[])
returns void
language sql
security definer
set search_path to 'public'
as $function$
  select private.approve_roster(private.discord_user_id(p_discord_id), p_slot_id, p_approved);
$function$;
revoke execute on function public.discord_approve_roster(text, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.discord_approve_roster(text, uuid, uuid[]) to service_role;

-- board_list віддає releasedAt; решта незмінна.
create or replace function public.board_list()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'createdBy', s.created_by,
    'createdByNick', (select nick from profiles where id = s.created_by),
    'title', s.title,
    'description', s.description,
    'gameAt', s.game_at,
    'signupDeadline', s.signup_deadline,
    'seats', s.seats,
    'status', s.status,
    'rewardMana', s.reward_mana,
    'rewardPr', s.reward_pr,
    'difficulty', s.difficulty,
    'createdAt', s.created_at,
    'signups', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id,
        'userId', g.user_id,
        'nick', pr.nick,
        'pilotId', g.pilot_id,
        'callsign', p.callsign,
        'pilotName', p.name,
        'games', coalesce((p.state->>'games')::int, 0),
        'll', coalesce((p.state->>'ll')::int, 2),
        'mech', coalesce(
          (select m->>'name'
             from jsonb_array_elements(coalesce(p.state->'mechs', '[]'::jsonb)) m
            where m->>'id' = g.mech_id
            limit 1),
          g.mech_name),
        'roll', g.roll,
        'rollBonus', g.roll_bonus,
        'rolledAt', g.rolled_at,
        'guaranteed', g.guaranteed,
        'releasedAt', g.released_at,
        'approved', g.approved,
        'createdAt', g.created_at
      ) order by g.created_at), '[]'::jsonb)
      from game_signups g
      left join profiles pr on pr.id = g.user_id
      left join pilots p on p.id = g.pilot_id
      where g.slot_id = s.id
    )
  ) order by s.game_at desc nulls first, s.created_at desc), '[]'::jsonb)
  from game_slots s
  where auth.uid() is not null;
$function$;
