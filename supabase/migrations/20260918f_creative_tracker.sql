-- Проєкти замінені трекером Get Creative.
--
-- Старий state.projects був списком довільних проєктів зі стадіями 1–3 і власною
-- щотижневою дією «Прогрес проекту». За правилами такої дії немає — натомість є
-- Get Creative: один резерв за раз, лічильник на стільки секцій, скільки в резерву
-- рангів, кидок Д20 перед місією (1–9 → 1 секція, 10–19 → 2, 20+ → 3).
--
-- Старі проєкти не конвертуються: у них немає резерву, до якого їх привʼязати.
-- Їхні назви лишаються в actionLog, тож історія не губиться.
--
-- Rollback: alter-у схеми немає, лише поля в jsonb.

update public.pilots
set state = (state - 'projects' - 'projectDraft')
  || jsonb_build_object(
       'creative',
       coalesce(
         state->'creative',
         jsonb_build_object('key', null, 'filled', 0, 'lastRoll', null)
       )
     )
where state ? 'projects'
   or not (state ? 'creative');
