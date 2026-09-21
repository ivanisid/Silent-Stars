-- Обмеження на покупку резервів прибране.
--
-- state.reserveFreeBuy рахував «один мех-резерв на місію без downtime-дії». Чи потрібна
-- дія — питання правил за столом, додаток за цим більше не стежить, тож поле зайве.
--
-- Rollback: alter-у схеми немає, лише поле в jsonb.

update public.pilots
set state = state - 'reserveFreeBuy'
where state ? 'reserveFreeBuy';
