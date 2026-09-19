-- Спрощення стану магазину.
--
-- Позиції, що вимагали кількості, розподілу зарядів чи вибору системи, переїхали на
-- PR, тож поля state.shop.alloc, picked і qty більше нікому не потрібні. Стартова
-- вкладка — printer (ремонт за PR).
--
-- Rollback: alter-у схеми немає, лише поля в jsonb.

update public.pilots
set state = jsonb_set(
  state,
  '{shop}',
  (coalesce(state->'shop', '{}'::jsonb) - 'alloc' - 'picked' - 'qty')
    || jsonb_build_object('tab', coalesce(state->'shop'->>'tab', 'repair'))
)
where jsonb_typeof(state->'shop') = 'object'
  and (state->'shop' ? 'alloc' or state->'shop' ? 'picked' or state->'shop' ? 'qty');
