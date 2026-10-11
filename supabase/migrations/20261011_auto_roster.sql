-- Автоматичне затвердження складу.
--
-- Коли настає дедлайн набору (а без дедлайну — час гри), відкритий слот із записами
-- затверджується сам, без ГМа:
--   * гравців ≤ місць — у склад ідуть усі;
--   * гравців > місць  — «авто-рол»: перші за пріоритетом (d20 + бонус, кидається ще при
--     записі); гарантовані місця (+9) — завжди, рівні — у порядку запису.
-- Бонуси — за тими самими правилами, що й ручне затвердження (тіло спільне —
-- private.settle_roster): хто пройшов, бонус витрачає; хто програв контест, отримує +3.
--
-- ГМ і далі може затвердити склад раніше дедлайну (кнопкою в апці чи Discord). Слот без
-- жодного запису не чіпається — його ГМ скасовує сам.
--
-- Відкат: select cron.unschedule('auto-approve-rosters'); drop function private.auto_approve_rosters();
-- drop function private.auto_roster(uuid); тіло private.approve_roster — з 20261003b_release_seat.sql;
-- drop function private.settle_roster(uuid, uuid[]).

-- Спільна частина ручного й автоматичного затвердження. Слот уже заблоковано (for update)
-- і перевірено викликачем.
create or replace function private.settle_roster(p_slot_id uuid, p_approved uuid[])
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
  select * into slot from game_slots where id = p_slot_id;
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

create or replace function private.approve_roster(p_user uuid, p_slot_id uuid, p_approved uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  slot public.game_slots;
begin
  select * into slot from game_slots where id = p_slot_id for update;
  if not found then raise exception 'Слот не знайдено.'; end if;

  if not exists (select 1 from profiles where id = p_user and role = 'gm') or slot.created_by <> p_user then
    raise exception 'Склад затверджує лише ГМ, який створив цю гру.';
  end if;
  if slot.status <> 'open' then raise exception 'Склад уже затверджено.'; end if;

  perform private.settle_roster(p_slot_id, p_approved);
end;
$function$;

-- Склад за пріоритетом: гарантовані, далі d20 + бонус за спаданням, рівні — хто раніше
-- записався; стільки, скільки місць (гарантовані понад місця теж ідуть — як і в ручному).
create or replace function private.auto_roster(p_slot_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(array_agg(id), '{}')
    from (
      select g.id
        from game_signups g
       where g.slot_id = p_slot_id
       order by g.guaranteed desc, (g.roll + coalesce(g.roll_bonus, 0)) desc nulls last, g.created_at
       limit (select seats from game_slots where id = p_slot_id)
    ) top;
$function$;

-- Планувальник: усі відкриті слоти, чий дедлайн (або час гри) настав. Повертає, скільки
-- затверджено. Помилка на одному слоті не зупиняє решту.
create or replace function private.auto_approve_rosters()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s record;
  done integer := 0;
begin
  for s in
    select id from game_slots sl
     where sl.status = 'open'
       and coalesce(sl.signup_deadline, sl.game_at) <= now()
       and exists (select 1 from game_signups g where g.slot_id = sl.id)
     for update skip locked
  loop
    begin
      perform private.settle_roster(s.id, private.auto_roster(s.id));
      done := done + 1;
    exception when others then
      raise warning 'auto_approve_rosters: слот % — %', s.id, sqlerrm;
    end;
  end loop;
  return done;
end;
$function$;

revoke execute on function private.settle_roster(uuid, uuid[]), private.auto_roster(uuid), private.auto_approve_rosters()
  from public, anon, authenticated;

select cron.unschedule('auto-approve-rosters')
 where exists (select 1 from cron.job where jobname = 'auto-approve-rosters');
select cron.schedule('auto-approve-rosters', '*/5 * * * *', $cron$ select private.auto_approve_rosters(); $cron$);
