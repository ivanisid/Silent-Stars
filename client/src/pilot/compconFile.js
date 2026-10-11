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

const fmtDate = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Чи є в апці файл COMP/CON для мехів пілота — з нього модуль Foundry створює актора.
// files — { mechId: updated_at } (api.listCompconProfiles) або null, поки вантажиться.
// kind: 'loading' | 'empty' (мехів немає) | 'ok' | 'partial' | 'none'.
export function compconStatus(mechs, files) {
  if (!files) return { kind: 'loading', text: 'Перевіряю файл COMP/CON…' };
  const list = mechs || [];
  if (!list.length) return { kind: 'empty', text: 'ФАЙЛ НЕ ЗАВАНТАЖЕНО · мехів ще немає' };
  const withFile = list.filter((m) => files[String(m.id)]);
  const missing = list.filter((m) => !files[String(m.id)]).map((m) => m.name);
  const latest = withFile.map((m) => files[String(m.id)]).sort().pop();
  if (!withFile.length) return { kind: 'none', text: 'ФАЙЛ НЕ ЗАВАНТАЖЕНО — актора у Foundry не створити', missing };
  if (missing.length) {
    return { kind: 'partial', text: `ФАЙЛ ОНЛАЙН ДЛЯ ${withFile.length} З ${list.length} · немає: ${missing.join(', ')}`, missing };
  }
  return { kind: 'ok', text: `ФАЙЛ ОНЛАЙН · оновлено ${fmtDate(latest)}`, missing: [] };
}
