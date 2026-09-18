-- Резерви та вкладки магазину.
--
-- Додає state.reserves (куплені й створені резерви), state.reserveFreeBuy (безкоштовна
-- покупка одного мех-резерву на місію) і state.shop.tab (активна вкладка шухляди
-- магазину). Усі поля нові, наявні дані не переносяться.
--
-- Rollback: alter-у схеми немає, лише поля в jsonb.

update public.pilots
set state = state
  || jsonb_build_object('reserves', coalesce(state->'reserves', '[]'::jsonb))
  || jsonb_build_object(
       'reserveFreeBuy',
       coalesce(state->'reserveFreeBuy', jsonb_build_object('max', 1, 'used', 0))
     )
  || jsonb_build_object(
       'shop',
       coalesce(state->'shop', '{}'::jsonb) || jsonb_build_object('tab', 'reserves')
     )
where not (state ? 'reserves')
   or not (state ? 'reserveFreeBuy')
   or not (state->'shop' ? 'tab');
