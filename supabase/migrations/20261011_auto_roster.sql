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
-- Затверджений склад ГМ може змінити будь-коли до завершення гри (public.gm_edit_roster):
-- бонус кожного, кого додали чи прибрали, перераховується так, ніби рішення було таким
-- одразу. Для цього при затвердженні запам'ятовується бонус гравця до нього (bonus_before),
-- а зміна застосовується різницею — бонус, змінений відтоді іншою грою, не затирається.
--
-- Відкат: drop function public.gm_edit_roster(uuid, uuid[]); private.roster_bonus(boolean, boolean, integer);
-- alter table public.game_signups drop column bonus_before; select cron.unschedule('auto-approve-rosters'); drop function private.auto_approve_rosters();
-- drop function private.auto_roster(uuid); тіло private.approve_roster — з 20261003b_release_seat.sql;
-- drop function private.settle_roster(uuid, uuid[]).

alter table public.game_signups add column if not exists bonus_before integer;

-- Бонус гравця після затвердження: у складі — 0; поза складом — як був, а після
-- програного контесту ще +3.
create or replace function private.roster_bonus(p_approved boolean, p_contested boolean, p_before integer)
returns integer
language sql
immutable
as $function$
  select case when p_approved then 0 when p_contested then coalesce(p_before, 0) + 3 else coalesce(p_before, 0) end;
$function$;

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

  -- Бонус до затвердження — щоб ГМ міг потім змінити склад (gm_edit_roster).
  update game_signups g
     set bonus_before = coalesce((select contest_bonus from profiles where id = g.user_id), 0)
   where g.slot_id = p_slot_id and g.user_id is not null;

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

-- Зміна вже затвердженого складу ГМом — до завершення гри. p_approved — увесь новий склад.
-- Гарантоване місце тут не примусове: це рішення ГМа. Хто повертається в склад, перестає
-- бути «звільнив місце».
create or replace function public.gm_edit_roster(p_slot_id uuid, p_approved uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  slot public.game_slots;
  contested boolean;
  g record;
  now_in boolean;
begin
  select * into slot from game_slots where id = p_slot_id for update;
  if not found then raise exception 'Слот не знайдено.'; end if;
  if not private.is_gm() or slot.created_by <> auth.uid() then
    raise exception 'Склад змінює лише ГМ, який створив цю гру.';
  end if;
  if slot.status <> 'approved' then
    raise exception 'Змінити можна лише затверджений склад гри, яку ще не завершено.';
  end if;

  contested := (select count(*) from game_signups where slot_id = p_slot_id) > slot.seats;

  for g in select * from game_signups where slot_id = p_slot_id for update loop
    now_in := g.id = any(coalesce(p_approved, '{}'));
    if now_in is distinct from coalesce(g.approved, false) then
      if g.user_id is not null then
        update profiles
           set contest_bonus = greatest(0, contest_bonus
             + private.roster_bonus(now_in, contested, g.bonus_before)
             - private.roster_bonus(coalesce(g.approved, false), contested, g.bonus_before))
         where id = g.user_id;
      end if;
      update game_signups
         set approved = now_in,
             released_at = case when now_in then null else released_at end
       where id = g.id;
    end if;
  end loop;
end;
$function$;
revoke execute on function public.gm_edit_roster(uuid, uuid[]) from public, anon;
grant execute on function public.gm_edit_roster(uuid, uuid[]) to authenticated;

revoke execute on function private.settle_roster(uuid, uuid[]), private.auto_roster(uuid), private.auto_approve_rosters()
  from public, anon, authenticated;

select cron.unschedule('auto-approve-rosters')
 where exists (select 1 from cron.job where jobname = 'auto-approve-rosters');
select cron.schedule('auto-approve-rosters', '*/5 * * * *', $cron$ select private.auto_approve_rosters(); $cron$);
