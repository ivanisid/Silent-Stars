-- Ціна рідкісного резерву в PR, яку задає ГМ.
--
-- Наявним резервам ставиться ціна за рангом: ранг 1 — 15 PR, ранг 2 — 30 PR. Далі ГМ
-- править її в редакторі для кожного резерву окремо. Додаток за цю ціну нічого не списує —
-- це довідкове число, як і раніше розраховуються за столом.
--
-- gm_save_rare_reserve отримує новий параметр p_price_pr, тож стара сигнатура видаляється.
--
-- Rollback:
--   drop function public.gm_save_rare_reserve(text, integer, text, text, text, text, text, uuid[], integer);
--   alter table public.rare_reserves drop column price_pr;
--   і відновити gm_save_rare_reserve з 20261006_rare_reserves_catalog.sql.

alter table public.rare_reserves
  add column if not exists price_pr integer not null default 0 check (price_pr >= 0);

update public.rare_reserves set price_pr = case rank when 1 then 15 when 2 then 30 else price_pr end
where price_pr = 0;

drop function if exists public.gm_save_rare_reserve(text, integer, text, text, text, text, text, uuid[]);

create or replace function public.gm_save_rare_reserve(
  p_key text,
  p_rank integer,
  p_name text,
  p_action text,
  p_traits text,
  p_description text,
  p_flavor text,
  p_tag_ids uuid[],
  p_price_pr integer
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key text;
begin
  if not private.is_gm() then raise exception 'Редагувати резерви може лише ГМ.'; end if;
  if p_rank not in (1, 2) then raise exception 'Ранг рідкісного резерву — 1 або 2.'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'Вкажіть назву резерву.'; end if;
  if p_price_pr is null or p_price_pr < 0 then raise exception 'Ціна — ціле число від 0.'; end if;

  if p_key is null then
    insert into rare_reserves (rank, name, action, traits, description, flavor, price_pr, sort)
    values (
      p_rank, btrim(p_name), coalesce(btrim(p_action), ''), coalesce(btrim(p_traits), ''),
      coalesce(btrim(p_description), ''), coalesce(btrim(p_flavor), ''), p_price_pr,
      (select coalesce(max(sort), 0) + 1 from rare_reserves)
    )
    returning key into v_key;
  else
    update rare_reserves set
      rank = p_rank,
      name = btrim(p_name),
      action = coalesce(btrim(p_action), ''),
      traits = coalesce(btrim(p_traits), ''),
      description = coalesce(btrim(p_description), ''),
      flavor = coalesce(btrim(p_flavor), ''),
      price_pr = p_price_pr,
      updated_at = now()
    where key = p_key
    returning key into v_key;
    if v_key is null then raise exception 'Резерв не знайдено.'; end if;
  end if;

  delete from rare_reserve_tags where reserve_key = v_key;
  insert into rare_reserve_tags (reserve_key, tag_id)
  select v_key, t.id from reserve_tags t where t.id = any (coalesce(p_tag_ids, '{}'));

  return v_key;
end;
$function$;

revoke execute on function public.gm_save_rare_reserve(text, integer, text, text, text, text, text, uuid[], integer) from public, anon;
grant execute on function public.gm_save_rare_reserve(text, integer, text, text, text, text, text, uuid[], integer) to authenticated;
