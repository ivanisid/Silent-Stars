import { api } from '../api';
import { mapCompconBond, mapCompconPilot } from './compconImport';
import { applyAssignment, changesText, defaultAssignment, isObvious, profilesFor, slotCount } from './slotImport';

// Імпорт файлу COMP/CON у відкритий профіль пілота — спільний для кнопки під профілем
// (пілот, мех і бонд), кнопок слотів ангару (лише мех цього слота) і сторінки пілотів.
// Мехи лягають у слоти ангару (slotImport.js); коли розклад неочевидний (у файлі кілька
// мехів, слотів бракує, мех замінює іншого) — гравець обирає його у вікні.

export async function readCompconJson(file) {
  try {
    return JSON.parse(await file.text());
  } catch {
    throw new Error('Файл не є коректним JSON.');
  }
}

// Що імпортувати і куди за замовчуванням. target — слот, з кнопки якого завантажено файл.
export function prepareImport(json, state, slots, target = null) {
  const mapped = mapCompconPilot(json);
  const imported = mapped.state.mechs;
  if (!imported.length) throw new Error('У файлі COMP/CON немає жодного меха.');
  const existing = state.mechs || [];
  const assignment = defaultAssignment(existing, slots, imported, target);
  return {
    mapped,
    imported,
    existing,
    slots: slotCount(existing, slots),
    assignment,
    obvious: isObvious(existing, imported, assignment),
  };
}

// Застосувати розклад: мехи в стан, бонд (withBond), файли для Foundry — по одному на меха.
// Повертає { ok, text }; помилку розкладу кидає з поясненням.
export async function commitImport({ json, prep, assignment, pilotId, dispatch, withBond, fileName }) {
  const r = applyAssignment(prep.existing, prep.imported, assignment);
  if (r.error) throw new Error(r.error);
  const what = changesText(r.changes) || 'мехи не змінено';
  // Бонуси до HP / Overcharge з файлу — щоб нове HP не виглядало вигаданим.
  const bonusOf = (m) => [m.hpBonus && `HP ${m.hpBonus}`, m.ocSteps && `Overcharge до ${m.ocSteps[m.ocSteps.length - 1]} (${m.ocSource})`]
    .filter(Boolean).join(' · ');
  const bonuses = r.changes.filter(({ mech }) => bonusOf(mech)).map(({ mech }) => `${mech.name}: ${bonusOf(mech)}`);
  dispatch({
    type: 'SET_COMPCON_MECHS',
    mechs: r.mechs,
    msg: `COMP/CON («${prep.mapped.callsign}»): ${what}` + (bonuses.length ? ` · бонуси — ${bonuses.join('; ')}` : ''),
  });
  const bond = withBond ? mapCompconBond(json) : null;
  if (bond) dispatch({ type: 'IMPORT_BOND', payload: bond });

  const text = `«${fileName}»: ${what}${bond ? ` · бонд «${bond.name}»` : ''}`;
  try {
    await api.saveCompconProfiles(pilotId, profilesFor(r.changes, json));
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
