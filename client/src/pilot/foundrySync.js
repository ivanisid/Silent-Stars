// Зміни, що прийшли з Foundry (функція foundry-sync), поки профіль пілота відкритий.
//
// Профіль тримає весь state у пам'яті й автозбереженням пише його цілком, тож без
// цього наступне збереження стерло б те, що записала Foundry. Тому подія realtime з
// новою позначкою foundrySyncAt вливається в стан у пам'яті — лише поля, які Foundry
// взагалі може міняти. Власна «луна» автозбереження має ту саму позначку, що й локальний
// стан, і ігнорується — інакше вона відкочувала б ще не збережені локальні зміни.
//
// Нову версію з COMP/CON можна прийняти й у модулі Foundry: тоді функція пише мехи й
// прив'язку (state.compcon) з позначкою compconSyncAt — вони вливаються в стан цілком.

import { pruneRetainedState } from './mechMerge.js';

const MECH_KEYS = [
  'hpCurrent', 'hpMax', 'repairCurrent', 'repairMax',
  'structureFilled', 'reactorFilled', 'overcharge', 'corePower',
];

const sameEntry = (a, b) => a.ts === b.ts && a.msg === b.msg;

// Записи журналу дій з бази, яких локально ще немає.
function freshLog(local, remote) {
  const localLog = local.actionLog || [];
  const fresh = (remote.actionLog || []).filter((e) => !localLog.some((l) => sameEntry(l, e)));
  return [...fresh, ...localLog].slice(0, 300);
}

// Повертає новий стан або той самий об'єкт, якщо вливати нічого.
export function mergeFoundryState(local, remote) {
  if (!local || !remote) return local;
  let next = local;
  if (remote.compconSyncAt && remote.compconSyncAt !== local.compconSyncAt) {
    next = pruneRetainedState({
      ...next,
      mechs: remote.mechs || [],
      compcon: { ...next.compcon, ...remote.compcon },
      actionLog: freshLog(next, remote),
      compconSyncAt: remote.compconSyncAt,
    });
  }
  if (!remote.foundrySyncAt || remote.foundrySyncAt === local.foundrySyncAt) return next;
  return mergeCombat(next, remote);
}

function mergeCombat(local, remote) {
  const remoteMechs = new Map((remote.mechs || []).map((m) => [String(m.id), m]));
  const mechs = (local.mechs || []).map((m) => {
    const r = remoteMechs.get(String(m.id));
    if (!r) return m;
    const next = { ...m };
    for (const k of MECH_KEYS) if (r[k] !== undefined) next[k] = r[k];
    // Заряди лімітної зброї й систем (записи items з max).
    const key = (l) => (l.name || '').trim().toLowerCase();
    const rItems = new Map((r.items || r.limited || []).filter((l) => l.max != null).map((l) => [key(l), l]));
    next.items = (m.items || []).map((l) => {
      const rl = l.max != null && rItems.get(key(l));
      return rl ? { ...l, current: rl.current, max: rl.max } : l;
    });
    // Позначка «знищено» — для всієї зброї й систем.
    const rAll = new Map((r.items || r.limited || []).map((l) => [key(l), l]));
    next.items = next.items.map((l) => {
      const rl = rAll.get(key(l));
      return rl && rl.destroyed !== undefined && !!rl.destroyed !== !!l.destroyed ? { ...l, destroyed: !!rl.destroyed } : l;
    });
    return next;
  });

  return pruneRetainedState({
    ...local,
    hp: { ...local.hp, current: remote.hp?.current ?? local.hp?.current },
    stress: remote.stress ?? local.stress,
    // Бонд: XP, галочки ідеалів і обраний мінорний ідеал — те, що синхронізує Foundry.
    bond: {
      ...local.bond,
      xp: remote.bond?.xp ?? local.bond?.xp,
      checks: remote.bond?.checks ?? local.bond?.checks,
      pick: remote.bond?.pick ?? local.bond?.pick,
    },
    mechs,
    // Записи «Foundry: …» з журналу дій, яких локально ще немає.
    actionLog: freshLog(local, remote),
    foundrySyncAt: remote.foundrySyncAt,
  });
}
