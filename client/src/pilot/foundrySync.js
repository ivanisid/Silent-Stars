// Зміни, що прийшли з Foundry (функція foundry-sync), поки профіль пілота відкритий.
//
// Профіль тримає весь state у пам'яті й автозбереженням пише його цілком, тож без
// цього наступне збереження стерло б те, що записала Foundry. Тому подія realtime з
// новою позначкою foundrySyncAt вливається в стан у пам'яті — лише поля, які Foundry
// взагалі може міняти. Власна «луна» автозбереження має ту саму позначку, що й локальний
// стан, і ігнорується — інакше вона відкочувала б ще не збережені локальні зміни.

const MECH_KEYS = [
  'hpCurrent', 'hpMax', 'repairCurrent', 'repairMax',
  'structureFilled', 'reactorFilled', 'overcharge', 'corePower',
];

const sameEntry = (a, b) => a.ts === b.ts && a.msg === b.msg;

// Повертає новий стан або той самий об'єкт, якщо вливати нічого.
export function mergeFoundryState(local, remote) {
  if (!local || !remote?.foundrySyncAt || remote.foundrySyncAt === local.foundrySyncAt) return local;

  const remoteMechs = new Map((remote.mechs || []).map((m) => [String(m.id), m]));
  const mechs = (local.mechs || []).map((m) => {
    const r = remoteMechs.get(String(m.id));
    if (!r) return m;
    const next = { ...m };
    for (const k of MECH_KEYS) if (r[k] !== undefined) next[k] = r[k];
    const rLimited = new Map((r.limited || []).map((l) => [(l.name || '').trim().toLowerCase(), l]));
    next.limited = (m.limited || []).map((l) => {
      const rl = rLimited.get((l.name || '').trim().toLowerCase());
      return rl ? { ...l, current: rl.current, max: rl.max } : l;
    });
    return next;
  });

  // Записи «Foundry: …» з журналу дій, яких локально ще немає.
  const localLog = local.actionLog || [];
  const fresh = (remote.actionLog || []).filter((e) => !localLog.some((l) => sameEntry(l, e)));

  return {
    ...local,
    hp: { ...local.hp, current: remote.hp?.current ?? local.hp?.current },
    stress: remote.stress ?? local.stress,
    mechs,
    actionLog: [...fresh, ...localLog].slice(0, 300),
    foundrySyncAt: remote.foundrySyncAt,
  };
}
