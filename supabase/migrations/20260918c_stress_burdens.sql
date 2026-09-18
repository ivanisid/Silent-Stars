-- Стрес дістає власний ліміт, burden-и стають динамічними.
--
-- Раніше state.burdens був масивом рівно з трьох наперед створених слотів
-- ({type: minor4|middle6|major8, filled, heal, name}), і гравець сам обирав тип
-- кожного. За правилами burden не існує, доки його не отримано, а розмір задається
-- порядковим номером серед невилікуваних: перший 4 сегменти, другий 6, третій 8.
--
-- Порожні слоти (без назви й без прогресу) відкидаються — вони нічого не означали.
-- Заповнені стають справжніми burden-ами: type → size, filled → healed.
-- Окремий чотирисегментний трек heal не має відповідника в правилах і не переноситься.
--
-- Rollback: alter-у схеми немає, лише поля в jsonb.

update public.pilots
set state = state
  || jsonb_build_object(
       'stressMax', 8,
       'downAndOut', false,
       'burdens', coalesce((
         select jsonb_agg(
                  jsonb_build_object(
                    'id', (extract(epoch from now())::bigint * 1000) + e.ord,
                    'name', coalesce(e.b->>'name', ''),
                    'size', case e.b->>'type'
                              when 'minor4' then 4
                              when 'middle6' then 6
                              else 8
                            end,
                    -- Прогрес не може перевищувати новий розмір, інакше burden був би
                    -- одразу вилікуваний при першому ж кліку.
                    'healed', least(
                      coalesce((e.b->>'filled')::int, 0),
                      case e.b->>'type'
                        when 'minor4' then 4
                        when 'middle6' then 6
                        else 8
                      end - 1
                    )
                  )
                  order by e.ord)
         from jsonb_array_elements(coalesce(state->'burdens', '[]'::jsonb)) with ordinality e(b, ord)
         where coalesce(btrim(e.b->>'name'), '') <> ''
            or coalesce((e.b->>'filled')::int, 0) > 0
       ), '[]'::jsonb)
     )
where jsonb_typeof(state->'burdens') = 'array'
   or not (state ? 'stressMax');
