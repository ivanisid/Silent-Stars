// Чиста логіка синхронізації — без звертань до Foundry, тож її можна перевірити в node
// (foundry-module/silent-stars-sync/scripts/sync.test.mjs).
//
// Двосторонні поля зводяться трьохстороннім злиттям: A — значення в апці, F — у Foundry,
// B — «база», останнє значення, на якому обидві сторони зійшлися (лежить у прапорці
// актора). Змінилась лише одна сторона — її значення йде в іншу. Змінились обидві — бере
// гору новіша зміна (updated_at пілота проти часу зміни актора/предмета). Бази ще немає
// (актора щойно зв'язали) — бере гору апка.
//
// Усі двосторонні поля порівнюються в одиницях Foundry, крім структури й реактора: там
// одиниця — кількість втрачених клітинок, як у апці, бо максимум у Foundry залежить від
// фрейма, а в апці завжди 4.

export const MODULE = 'silent-stars-sync';
export const APP_BOXES = 4;

export function get(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

const int = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const norm = (s) => String(s || '').trim().toLowerCase();

// ----- Опис полів -----
// app(x)          — значення з даних апки (pilot чи mech з pull) у спільних одиницях
// foundry(doc)    — значення з актора/предмета у спільних одиницях
// toFoundry(v, doc) — { шлях: значення } для doc.update
// toApp(v)        — частина патча для push (в одиницях апки)

export const PILOT_FIELDS = {
  hp: {
    app: (p) => int(p.hpCurrent),
    foundry: (a) => int(get(a, 'system.hp.value')),
    toFoundry: (v) => ({ 'system.hp.value': v }),
    toApp: (v) => ({ hpCurrent: v }),
  },
  stress: {
    app: (p) => int(p.stress),
    foundry: (a) => int(get(a, 'system.bond_state.stress.value')),
    toFoundry: (v) => ({ 'system.bond_state.stress.value': v }),
    toApp: (v) => ({ stress: v }),
  },
};

const lost = (doc, path) => {
  const max = int(get(doc, `${path}.max`));
  return clamp(max - int(get(doc, `${path}.value`)), 0, max);
};

export const MECH_FIELDS = {
  hp: {
    app: (m) => int(m.hpCurrent),
    foundry: (a) => int(get(a, 'system.hp.value')),
    toFoundry: (v) => ({ 'system.hp.value': v }),
    toApp: (v) => ({ hpCurrent: v }),
  },
  repairs: {
    app: (m) => int(m.repairCurrent),
    foundry: (a) => int(get(a, 'system.repairs.value')),
    toFoundry: (v) => ({ 'system.repairs.value': v }),
    toApp: (v) => ({ repairCurrent: v }),
  },
  structure: {
    app: (m) => clamp(int(m.structureFilled), 0, APP_BOXES),
    foundry: (a) => clamp(lost(a, 'system.structure'), 0, APP_BOXES),
    toFoundry: (v, a) => {
      const max = int(get(a, 'system.structure.max'));
      return { 'system.structure.value': clamp(max - v, 0, max) };
    },
    toApp: (v) => ({ structureFilled: v }),
  },
  reactor: {
    app: (m) => clamp(int(m.reactorFilled), 0, APP_BOXES),
    foundry: (a) => clamp(lost(a, 'system.stress'), 0, APP_BOXES),
    toFoundry: (v, a) => {
      const max = int(get(a, 'system.stress.max'));
      return { 'system.stress.value': clamp(max - v, 0, max) };
    },
    toApp: (v) => ({ reactorFilled: v }),
  },
  overcharge: {
    app: (m) => clamp(int(m.overcharge), 0, 3),
    foundry: (a) => clamp(int(get(a, 'system.overcharge')), 0, 3),
    toFoundry: (v) => ({ 'system.overcharge': v }),
    toApp: (v) => ({ overcharge: v }),
  },
  core: {
    app: (m) => (m.corePower === false ? 0 : 1),
    foundry: (a) => (int(get(a, 'system.core_energy')) > 0 ? 1 : 0),
    toFoundry: (v) => ({ 'system.core_energy': v }),
    toApp: (v) => ({ corePower: v === 1 }),
  },
};

// ----- Злиття одного поля -----

export function decide(A, F, B, appTime, foundryTime) {
  if (A === F) return { winner: 'same', value: A };
  if (B === undefined) return { winner: 'app', value: A };
  if (F === B) return { winner: 'app', value: A };
  if (A === B) return { winner: 'foundry', value: F };
  // Обидві сторони змінились, кожна по-своєму.
  return foundryTime > appTime ? { winner: 'foundry', value: F, conflict: true } : { winner: 'app', value: A, conflict: true };
}

const timeOf = (doc) => int(get(doc, '_stats.modifiedTime'));

// Зводить набір полів одного документа (актора). Повертає:
//   update — оновлення для doc.update (значення + нова база в прапорці), або null
//   patch  — що відправити в апку
//   baseAfterPush — що дописати в базу, коли апка прийме patch
//   conflicts — назви полів, де змінились обидві сторони
export function mergeFields(fields, appObj, doc, appTime) {
  const base = get(doc, `flags.${MODULE}.base`) || {};
  const update = {};
  const patch = {};
  const newBase = {};
  const baseAfterPush = {};
  const conflicts = [];
  for (const [key, f] of Object.entries(fields)) {
    const A = f.app(appObj);
    const F = f.foundry(doc);
    const d = decide(A, F, base[key], appTime, timeOf(doc));
    if (d.conflict) conflicts.push(key);
    if (d.winner === 'same') {
      if (base[key] !== A) newBase[key] = A;
    } else if (d.winner === 'app') {
      Object.assign(update, f.toFoundry(d.value, doc));
      newBase[key] = d.value;
    } else {
      Object.assign(patch, f.toApp(d.value));
      baseAfterPush[key] = d.value;
    }
  }
  for (const [k, v] of Object.entries(newBase)) update[`flags.${MODULE}.base.${k}`] = v;
  return { update: Object.keys(update).length ? update : null, patch, baseAfterPush, conflicts };
}

// Лімітні системи й зброя меха: предмет у Foundry ↔ запис у mech.limited за назвою.
// Повертає оновлення предметів, патч для апки ({ [назва]: { current } }) і бази.
export function mergeLimited(appMech, items, appTime) {
  const byName = new Map((appMech.limited || []).map((l) => [norm(l.name), l]));
  const itemUpdates = [];
  const patch = {};
  const baseAfterPush = []; // [{ item, value }]
  const conflicts = [];
  for (const item of items) {
    const max = int(get(item, 'system.uses.max'));
    if (max <= 0) continue;
    const name = norm(item.name);
    const l = byName.get(name);
    if (!l) continue;
    const A = clamp(int(l.current), 0, max);
    const F = clamp(int(get(item, 'system.uses.value')), 0, max);
    const B = get(item, `flags.${MODULE}.base`);
    const d = decide(A, F, B, appTime, timeOf(item));
    if (d.conflict) conflicts.push(item.name);
    // Максимум рахує Foundry (тег LIMITED + ENG + бонуси) — апка його лише показує.
    const maxPatch = int(l.max) !== max ? { max } : null;
    if (d.winner === 'same') {
      if (B !== A) itemUpdates.push({ _id: item.id, [`flags.${MODULE}.base`]: A });
      if (maxPatch) patch[name] = maxPatch;
    } else if (d.winner === 'app') {
      itemUpdates.push({ _id: item.id, 'system.uses.value': d.value, [`flags.${MODULE}.base`]: d.value });
      if (maxPatch) patch[name] = maxPatch;
    } else {
      patch[name] = { ...(maxPatch || {}), current: d.value };
      baseAfterPush.push({ item, value: d.value });
    }
  }
  return { itemUpdates, patch, baseAfterPush, conflicts };
}

// Максимуми ХП і ремкомплектів: Foundry рахує їх з повного лоадауту, тож іде лише в апку.
export function mechMaxPatch(appMech, actor) {
  const out = {};
  const hpMax = int(get(actor, 'system.hp.max'));
  const repMax = int(get(actor, 'system.repairs.max'));
  if (hpMax > 0 && hpMax !== int(appMech.hpMax)) out.hpMax = hpMax;
  if (repMax >= 0 && get(actor, 'system.repairs.max') != null && repMax !== int(appMech.repairMax)) out.repairMax = repMax;
  return out;
}

// Те, що веде лише апка: позивний, рівень, портрет і арт меха.
export function pilotIdentityUpdate(p, actor) {
  const u = {};
  if (p.callsign && get(actor, 'system.callsign') !== p.callsign) u['system.callsign'] = p.callsign;
  if (int(get(actor, 'system.level')) !== int(p.ll)) u['system.level'] = int(p.ll);
  if (p.player && get(actor, 'system.player_name') !== p.player) u['system.player_name'] = p.player;
  Object.assign(u, artUpdate(p.portrait, actor));
  return u;
}

export function artUpdate(path, actor) {
  if (!path) return {};
  const u = {};
  if (actor.img !== path) u.img = path;
  if (get(actor, 'prototypeToken.texture.src') !== path) u['prototypeToken.texture.src'] = path;
  return u;
}

// ----- Автозв'язування -----

// Актор пілота без зв'язку ↔ пілот апки за позивним (або іменем актора = позивний / ім'я).
export function findAppPilotFor(actor, appPilots, taken) {
  const callsign = norm(get(actor, 'system.callsign'));
  const name = norm(actor.name);
  return appPilots.find((p) => !taken.has(p.id) && (
    (callsign && norm(p.callsign) === callsign) || norm(p.callsign) === name || norm(p.name) === name
  ));
}

// Мех без зв'язку ↔ мех апки за назвою, серед мехів того пілота, до якого мех належить у Foundry.
export function findAppMechFor(actor, appPilot, taken) {
  const name = norm(actor.name);
  return (appPilot?.mechs || []).find((m) => !taken.has(m.id) && norm(m.name) === name);
}
