-- Резерви та вкладки магазину.
--
-- Додає state.reserves (куплені й створені резерви) і state.shop.tab (активна вкладка
-- шухляди магазину). Обидва поля нові, наявні дані не переносяться.
--
-- Rollback: alter-у схеми немає, лише поля в jsonb.

update public.pilots
set state = state
  || jsonb_build_object('reserves', coalesce(state->'reserves', '[]'::jsonb))
  || jsonb_build_object(
       'shop',
       coalesce(state->'shop', '{}'::jsonb) || jsonb_build_object('tab', 'reserves')
     )
where not (state ? 'reserves')
   or not (state->'shop' ? 'tab');
