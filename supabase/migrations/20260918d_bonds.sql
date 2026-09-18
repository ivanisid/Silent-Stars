-- Бонд дістає ідеали, відкладений лічильник XP і бонусні сили.
--
-- Старий state.bond був {archetype, xp, powers, newPower}. Додаються поля для
-- major/minor ideals, відміток за поточну гру, сили з чужого бонду та veteran/master
-- power, а також лічильник скидів XP для випадку, коли бонд ще не обрано.
--
-- Наявні archetype, xp і powers зберігаються як є.
--
-- Rollback: alter-у схеми немає, лише поля в jsonb.

update public.pilots
set state = jsonb_set(
  state,
  '{bond}',
  jsonb_build_object(
    'majorIdealFirst', '',
    'minorIdeal', '',
    'marked', jsonb_build_object('major0', false, 'major1', false, 'major2', false, 'minor', false),
    'foreignPower', '',
    'veteranPower', '',
    'masterPower', '',
    'deferredResets', 0,
    -- Пілоти, у яких архетип уже вписано, вважаються такими, що бонд обрали: сили
    -- за вибір їм не нараховуються заднім числом.
    'confirmed', coalesce(btrim(state->'bond'->>'archetype'), '') <> '',
    'powersOwed', 0
  ) || coalesce(state->'bond', '{}'::jsonb)
)
where jsonb_typeof(state->'bond') = 'object'
  and not (state->'bond' ? 'marked');
