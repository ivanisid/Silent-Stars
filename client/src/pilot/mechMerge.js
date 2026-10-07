// Повторний імпорт меха з COMP/CON без скидання стану (чиста логіка, без залежностей —
// тестується простим `node`, див. mechMerge.test.mjs).
//
// Файл COMP/CON описує збірку (фрейм, зброя, системи), але не знає, скільки ХП лишилось, яка
// структура, що зламано й скільки зарядів витрачено — це стан, який веде апка. Тому при
// повторному імпорті збірка береться з файлу, а стан лишається з апки.
//
// Правило проти «очищення» збірки: зламану систему або лімітну з витраченими зарядами не
// можна позбутись, просто завантаживши файл без неї. Така система лишається в меха з
// позначкою `retained`, доки її не полагодять / не поповнять повністю — тоді вона зникає сама.

const limited = (it) => !!it && it.max != null;
const norm = (s) => String(s || '').trim().toLowerCase();

// Зламана або лімітна з витраченими зарядами.
export const isSpent = (it) => !!it && (!!it.destroyed || (limited(it) && it.current < it.max));

// Той самий предмет у старій і новій збірці: за lid, якщо він є в обох, інакше за назвою й
// типом. Однакові предмети (дві однакові системи) розбираються по черзі — кожен старий запис
// відповідає не більше ніж одному новому.
function take(pool, it) {
  const byLid = it.lid ? pool.find((p) => !p.used && p.item.lid && p.item.lid === it.lid) : null;
  const found = byLid || pool.find((p) => !p.used && !(it.lid && p.item.lid) &&
    p.item.type === it.type && norm(p.item.name) === norm(it.name));
  if (found) found.used = true;
  return found ? found.item : null;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, fallback) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fallback);

export function mergeMechState(old, inc) {
  const pool = (old.items || []).map((item) => ({ item, used: false }));

  const items = (inc.items || []).map((it) => {
    const o = take(pool, it);
    if (!o) return it;
    // Зламане в апці лишається зламаним, навіть якщо файл каже інакше (ремонт — в апці).
    const out = { ...it, destroyed: !!(o.destroyed || it.destroyed) };
    if (limited(it)) out.current = clamp(limited(o) ? o.current : it.max, 0, it.max);
    return out;
  });

  // Зникли з файлу: зламані й витрачені лишаються.
  const dropped = pool.filter((p) => !p.used && isSpent(p.item)).map((p) => ({ ...p.item, retained: true }));
  for (const it of dropped) {
    // Зброя — в кінець групи зброї, система — в кінець списку (як при ручному додаванні).
    const at = it.type === 'weapon' ? items.map((x) => x.type === 'weapon').lastIndexOf(true) + 1 : items.length;
    items.splice(at, 0, it);
  }

  return {
    ...old,
    ...inc,
    id: old.id,
    ccId: inc.ccId || old.ccId || '',
    hpCurrent: clamp(num(old.hpCurrent, inc.hpCurrent), 0, inc.hpMax),
    repairCurrent: clamp(num(old.repairCurrent, inc.repairCurrent), 0, inc.repairMax),
    structureFilled: num(old.structureFilled, inc.structureFilled),
    reactorFilled: num(old.reactorFilled, inc.reactorFilled),
    overcharge: num(old.overcharge, inc.overcharge),
    corePower: old.corePower ?? inc.corePower,
    items,
  };
}

// Залишені системи, які вже полагоджені / поповнені повністю, зникають.
export function pruneRetained(items) {
  if (!items?.some((it) => it.retained && !isSpent(it))) return items;
  return items.filter((it) => !(it.retained && !isSpent(it)));
}

// По всьому стану пілота. Той самий об'єкт, якщо прибирати нічого. onRemoved(mech, item) —
// для запису в журнал.
export function pruneRetainedState(state, onRemoved) {
  if (!state?.mechs) return state; // useReducer стартує з null, поки профіль не завантажено
  let changed = false;
  const mechs = (state.mechs || []).map((m) => {
    const items = pruneRetained(m.items);
    if (items === m.items) return m;
    changed = true;
    if (onRemoved) (m.items || []).filter((it) => !items.includes(it)).forEach((it) => onRemoved(m, it));
    return { ...m, items };
  });
  return changed ? { ...state, mechs } : state;
}
