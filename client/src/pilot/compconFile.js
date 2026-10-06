import { api } from '../api';
import { compconProfiles, mapCompconBond, mapCompconPilot, mechClashMessage, mechNameClashes } from './compconImport';

// Імпорт файлу COMP/CON у відкритий профіль пілота — спільний для меню профілю, кнопки
// під ним і панелі мехів. Мехи вливаються за назвою; withBond — файл основного профілю,
// з нього ще й бонд. Сам файл зберігається для кожного меха: з нього модуль Foundry
// створює актора. Повертає текст статусу; помилку кидає з поясненням для гравця.
export async function importCompconFile(file, { state, pilotId, dispatch, withBond }) {
  let json;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error('Файл не є коректним JSON.');
  }
  const mapped = mapCompconPilot(json);
  const clashes = mechNameClashes(state.mechs, mapped.state.mechs);
  if (clashes.length) throw new Error(mechClashMessage(clashes));
  const profiles = compconProfiles(state.mechs, mapped.state.mechs, json);

  dispatch({ type: 'MERGE_COMPCON_MECHS', payload: { mechs: mapped.state.mechs, callsign: mapped.callsign } });
  const bond = withBond ? mapCompconBond(json) : null;
  if (bond) dispatch({ type: 'IMPORT_BOND', payload: bond });

  const names = mapped.state.mechs.map((m) => m.name).join(', ') || '—';
  let text = `Мех(и) з «${file.name}»: ${names}${bond ? ` · бонд «${bond.name}»` : ''}`;
  try {
    await api.saveCompconProfiles(pilotId, profiles);
  } catch (err) {
    return { ok: false, text: `${text} · файл для Foundry не збережено: ${err.message}` };
  }
  return { ok: true, text };
}
